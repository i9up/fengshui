// Regras do diagnóstico: transformam a medição em achados com gravidade e o que fazer.
// Gravidade: 'alto' (custa em toda sessão), 'medio' (custa às vezes ou atrapalha), 'info'.
import { hash } from './medir.js';

export const TETO_INSTRUCOES = 5000; // tokens: acima disso, o arquivo lido sempre deve virar núcleo + índice
export const TETO_REGRA_CURSOR = 1000;
export const SEMELHANCA_DUPLICATA = 0.8;

/** Corpo sem frontmatter, para comparar skill × comando que mudam só o cabeçalho. */
export function corpo(texto) {
  const t = (texto ?? '').replace(/\r\n/g, '\n');
  if (!t.startsWith('---')) return t.trim();
  const fim = t.indexOf('\n---', 3);
  return fim > 0 ? t.slice(fim + 4).trim() : t.trim();
}

/** Parte das linhas não vazias de A que também está em B (0 a 1), pela menor das duas. */
export function semelhanca(a, b) {
  const la = new Set(corpo(a).split('\n').map((l) => l.trim()).filter(Boolean));
  const lb = new Set(corpo(b).split('\n').map((l) => l.trim()).filter(Boolean));
  if (la.size === 0 || lb.size === 0) return 0;
  let comuns = 0;
  for (const l of la) if (lb.has(l)) comuns++;
  return comuns / Math.min(la.size, lb.size);
}

/** Pares de textos iguais ou quase iguais entre skills e comandos (o mesmo conteúdo em dois lugares). */
export function encontrarDuplicatas(itens) {
  const pares = [];
  for (let i = 0; i < itens.length; i++) {
    for (let j = i + 1; j < itens.length; j++) {
      const a = itens[i], b = itens[j];
      const igual = hash(corpo(a.texto)) === hash(corpo(b.texto));
      const s = igual ? 1 : semelhanca(a.texto, b.texto);
      if (s >= SEMELHANCA_DUPLICATA) pares.push({ a: a.nome, b: b.nome, semelhanca: s, tokens: Math.min(a.tokens, b.tokens) });
    }
  }
  return pares;
}

/**
 * @param medicao resultado de medirProjeto
 * @param opcoes.grafoMudou (app) => boolean — o código do app mudou desde o commit do grafo (vem do git)
 */
export function gerarAchados(medicao, { teto = TETO_INSTRUCOES, grafoMudou = () => false } = {}) {
  const achados = [];
  const add = (gravidade, titulo, oQueFazer, tokens = 0) => achados.push({ gravidade, titulo, oQueFazer, tokens });

  for (const f of medicao.fixos) {
    if (['instrucoes-raiz', 'agents-raiz', 'memoria'].includes(f.papel) && f.tokens > teto) {
      add('alto', `${nomeCurto(f.arquivo)} tem ~${f.tokens} tokens e é lido em toda sessão`,
        'Deixe só o núcleo (o que vale sempre) e um índice "assunto → arquivo"; mova o resto para docs/referencia/.', f.tokens - teto);
    }
  }
  for (const app of medicao.apps) {
    if (app.instrucoes && app.instrucoes.tokens > teto) {
      add('alto', `${app.relativo}/CLAUDE.md tem ~${app.instrucoes.tokens} tokens`,
        `Núcleo no CLAUDE.md; seções de funcionalidade em ${app.relativo}/docs/contexto/funcionalidades.md, com um índice.`,
        app.instrucoes.tokens - teto);
    }
  }
  // Achados por app que se repetem viram uma linha só, com a lista dos apps.
  const semGrafo = medicao.apps.filter((a) => !a.grafo).map((a) => a.relativo);
  const desatualizados = medicao.apps.filter((a) => a.grafo && grafoMudou(a)).map((a) => a.relativo);
  const semIgnore = medicao.apps.filter((a) => !a.temGraphifyIgnore).map((a) => a.relativo);
  if (semGrafo.length) add('medio', `${quantos(semGrafo, 'app sem', 'apps sem')} grafo do código: ${semGrafo.join(', ')}`, 'Rode `fengshui grafos` (graphify, só parser, sem LLM).');
  if (desatualizados.length) add('medio', `${quantos(desatualizados, 'grafo desatualizado', 'grafos desatualizados')}: ${desatualizados.join(', ')}`, 'Rode `fengshui grafos`: refaz só os apps que mudaram.');
  if (semIgnore.length) add('medio', `${quantos(semIgnore, 'app sem', 'apps sem')} .graphifyignore: ${semIgnore.join(', ')}`,
    'Rode `fengshui init`: testes, docs, scripts e saídas de mutação poluem o grafo e a busca.');
  for (const r of medicao.regrasCursor) {
    if (r.sempre && r.tokens > TETO_REGRA_CURSOR) {
      add('medio', `A regra do Cursor ${r.nome} é sempre ativa e tem ~${r.tokens} tokens`,
        'Deixe-a curta ou troque alwaysApply por globs dos arquivos a que ela se aplica.', r.tokens - TETO_REGRA_CURSOR);
    }
  }
  for (const h of medicao.hooks) {
    if (/\.needs_update/.test(h.comando)) {
      add('medio', `Hook ${h.evento} marca o grafo como "precisa atualizar" a cada edição`,
        'Retire-o: o grafo do código se atualiza sem LLM (`fengshui grafos`); o marcador só alimentava a extração com LLM.');
    }
  }
  for (const d of encontrarDuplicatas([...medicao.skills, ...medicao.comandos])) {
    add('medio', `"${d.a}" e "${d.b}" têm ${Math.round(d.semelhanca * 100)}% do mesmo conteúdo`,
      'Mantenha um só (skill ou comando); a descrição repetida entra em toda sessão.', d.tokens);
  }
  const ordem = { alto: 0, medio: 1, info: 2 };
  return achados.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade] || b.tokens - a.tokens);
}

function quantos(lista, um, varios) {
  return `${lista.length} ${lista.length === 1 ? um : varios}`;
}

function nomeCurto(arquivo) {
  const partes = arquivo.replace(/\\/g, '/').split('/');
  return partes.slice(-2).join('/');
}

/** Contexto fixo de uma sessão num app: instruções da raiz + memória + regras sempre ativas + descrições + instruções do app. */
export function contextoFixoDoApp(medicao, app) {
  const base = medicao.fixos.filter((f) => f.papel !== 'agents-raiz').reduce((s, f) => s + f.tokens, 0);
  return base + (app?.instrucoes?.tokens ?? 0);
}
