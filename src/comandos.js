// Os comandos do fengshui. Cada um recebe a raiz do projeto e um objeto de sistema (real ou falso nos testes)
// e devolve { codigo, texto } — o bin só imprime.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { medirProjeto, lerTexto } from './medir.js';
import { gerarAchados, TETO_INSTRUCOES } from './achados.js';
import { textoTerminal, paginaHtml } from './relatorio.js';
import { temComando, instalarGraphify, gerarGrafo, grafoDesatualizado, raizGit, processosAntigos } from './sistema.js';

const MODELOS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'modelos');
const MARCA_HOOK = '# fengshui: atualiza o grafo do código depois de merge/pull';

/** Apps do projeto; num projeto sem apps/, a própria raiz é o "app". */
export function appsOuRaiz(medicao) {
  if (medicao.apps.length) return medicao.apps;
  return [{ nome: path.basename(medicao.raiz), pasta: medicao.raiz, relativo: '.', grafo: null, temGraphifyIgnore: fs.existsSync(path.join(medicao.raiz, '.graphifyignore')) }];
}

export function diagnostico(raiz, sis, { html = '', teto } = {}) {
  const medicao = medirProjeto(raiz);
  const limite = teto ?? medicao.config.teto ?? TETO_INSTRUCOES;
  const achados = gerarAchados(medicao, { teto: limite, grafoMudou: (app) => grafoDesatualizado(sis, app) });
  let texto = textoTerminal(medicao, achados);
  if (html) {
    fs.writeFileSync(html, paginaHtml(medicao, achados, { titulo: `Dieta de Contexto · ${path.basename(path.resolve(raiz))}` }), 'utf8');
    texto += `\n\nRelatório salvo em ${html}`;
  }
  return { codigo: achados.some((a) => a.gravidade === 'alto') ? 1 : 0, texto, achados, medicao };
}

/** O que o init faria, sem fazer nada: lista de { descricao, aplicar() }. */
export function planoInit(raiz, sis) {
  const medicao = medirProjeto(raiz);
  const acoes = [];
  if (!temComando(sis, 'graphify')) {
    acoes.push({ descricao: 'Instalar o graphify (pacote Python graphifyy; grafo do código só com parser, sem LLM)',
      aplicar: () => { const via = instalarGraphify(sis); if (!via) throw new Error('não consegui instalar o graphify (instale uv ou Python e rode de novo)'); return `instalado via ${via}`; } });
  }
  for (const app of appsOuRaiz(medicao)) {
    const destino = path.join(app.pasta, '.graphifyignore');
    if (!fs.existsSync(destino)) acoes.push({ descricao: `Criar ${rel(raiz, destino)} (só código de produção no grafo)`, aplicar: () => copiarModelo('graphifyignore', destino) });
  }
  for (const repo of reposDoProjeto(raiz, medicao, sis)) {
    const gi = path.join(repo, '.gitignore');
    if (!/^\/?graphify-out\/?\s*$/m.test(lerTexto(gi) ?? '')) {
      acoes.push({ descricao: `Pôr graphify-out/ no ${rel(raiz, gi)} (o grafo é gerado na máquina, não vai para o git)`, aplicar: () => acrescentar(gi, '\n# fengshui: grafo do código gerado localmente\ngraphify-out/\n') });
    }
    const hook = path.join(repo, '.git', 'hooks', 'post-merge');
    if (fs.existsSync(path.join(repo, '.git', 'hooks')) && !(lerTexto(hook) ?? '').includes(MARCA_HOOK)) {
      acoes.push({ descricao: `${fs.existsSync(hook) ? 'Acrescentar ao' : 'Criar o'} hook ${rel(raiz, hook)} (grafo atualizado sozinho depois de merge/pull)`,
        // LF sempre: com CRLF (checkout no Windows) o sh do git quebra no hook.
        aplicar: () => { acrescentar(hook, ((fs.existsSync(hook) ? '\n' : '#!/bin/sh\n') + lerTexto(path.join(MODELOS, 'post-merge'))).replace(/\r\n/g, '\n')); try { fs.chmodSync(hook, 0o755); } catch { /* Windows */ } } });
    }
  }
  const ref = path.join(raiz, 'docs', 'referencia', 'README.md');
  if (!fs.existsSync(ref)) acoes.push({ descricao: 'Criar docs/referencia/README.md (onde vai o detalhe lido sob demanda)', aplicar: () => copiarModelo('referencia-README.md', ref) });
  if (!fs.existsSync(path.join(raiz, 'CLAUDE.md'))) acoes.push({ descricao: 'Criar CLAUDE.md no formato núcleo + índice', aplicar: () => copiarModelo('CLAUDE.md', path.join(raiz, 'CLAUDE.md')) });
  return acoes;
}

export async function init(raiz, sis, { sim = false, perguntar } = {}) {
  const acoes = planoInit(raiz, sis);
  if (!acoes.length) return { codigo: 0, texto: '✔ Nada a instalar: o projeto já tem a estrutura da Dieta de Contexto.' };
  const lista = acoes.map((a, i) => `  ${i + 1}. ${a.descricao}`).join('\n');
  if (!sim) {
    const ok = await perguntar(`O fengshui vai:\n${lista}\nNada existente é sobrescrito. Continuar? (s/N) `);
    if (!/^s(im)?$/i.test((ok ?? '').trim())) return { codigo: 0, texto: 'Nada foi feito.' };
  }
  const feitos = [];
  for (const a of acoes) {
    try { const extra = a.aplicar(); feitos.push(`  ✔ ${a.descricao}${typeof extra === 'string' ? ` (${extra})` : ''}`); }
    catch (e) { feitos.push(`  ✖ ${a.descricao}: ${e.message}`); }
  }
  return { codigo: feitos.some((f) => f.includes('✖')) ? 1 : 0, texto: `${feitos.join('\n')}\n\nPróximo passo: fengshui grafos (e fengshui diagnostico para ver o que enxugar).` };
}

/** Refaz os grafos (só os desatualizados, ou todos) e junta o geral quando há mais de um app. */
export function grafos(raiz, sis, { todos = false } = {}) {
  if (!temComando(sis, 'graphify')) return { codigo: 1, texto: 'graphify não encontrado: rode fengshui init.' };
  const medicao = medirProjeto(raiz);
  const apps = appsOuRaiz(medicao);
  const l = [];
  let falhas = 0;
  for (const app of apps) {
    if (!todos && app.grafo && !grafoDesatualizado(sis, app)) { l.push(`  · ${app.relativo}: em dia`); continue; }
    const r = gerarGrafo(sis, app);
    if (r.codigo !== 0) { falhas++; l.push(`  ✖ ${app.relativo}: ${r.erro || r.saida}`.slice(0, 300)); continue; }
    const m = /Rebuilt:\s*([\d,.]+) nodes/.exec(r.saida);
    l.push(`  ✔ ${app.relativo}: ${m ? m[1] + ' nós' : 'atualizado'}`);
  }
  if (apps.length > 1) {
    const jsons = apps.map((a) => path.join(a.pasta, 'graphify-out', 'graph.json')).filter((f) => fs.existsSync(f));
    const saida = path.join(raiz, 'graphify-out', 'monorepo-graph.json');
    fs.mkdirSync(path.dirname(saida), { recursive: true });
    const r = sis.rodar('graphify', ['merge-graphs', ...jsons, '--out', saida]);
    l.push(r.codigo === 0 ? `  ✔ grafo geral: ${rel(raiz, saida)}` : `  ✖ grafo geral: ${r.erro || r.saida}`);
    if (r.codigo !== 0) falhas++;
  }
  return { codigo: falhas ? 1 : 0, texto: `Grafos:\n${l.join('\n')}` };
}

/** O dia a dia: alinha os repositórios limpos com o remoto, atualiza grafos, lista processos órfãos e resume o diagnóstico. */
export function preparar(raiz, sis, { horas = 3 } = {}) {
  const medicao = medirProjeto(raiz);
  const l = ['Repositórios:'];
  for (const repo of reposDoProjeto(raiz, medicao, sis)) {
    const nome = rel(raiz, repo) || '.';
    const branch = sis.rodar('git', ['-C', repo, 'branch', '--show-current']).saida;
    const sujo = sis.rodar('git', ['-C', repo, 'status', '--porcelain', '--untracked-files=no']).saida;
    if (sujo) { l.push(`  ⚠ ${nome} (${branch || 'sem branch'}): tem alteração sem commit; não mexi.`); continue; }
    if (sis.rodar('git', ['-C', repo, 'fetch', '-q']).codigo !== 0) { l.push(`  ⚠ ${nome}: sem acesso ao remoto.`); continue; }
    const r = sis.rodar('git', ['-C', repo, 'pull', '-q', '--ff-only']);
    l.push(r.codigo === 0 ? `  ✔ ${nome} (${branch}): em dia com o remoto.` : `  ⚠ ${nome} (${branch}): não dá fast-forward; resolva à mão.`);
  }
  l.push('', grafos(raiz, sis).texto);
  const orfaos = processosAntigos(sis, horas);
  l.push('', orfaos.length ? `Processos de teste/servidor rodando há mais de ${horas} h (confira e encerre se forem sobras):` : `✔ Nenhum processo de teste/servidor esquecido há mais de ${horas} h.`);
  for (const p of orfaos) l.push(`  PID ${p.pid} · ${Math.round(p.minutos / 60)} h · ${p.comando.slice(0, 140)}`);
  const d = diagnostico(raiz, sis);
  l.push('', d.achados.length ? `${d.achados.length} achado(s) no diagnóstico: rode fengshui diagnostico para ver.` : '✔ Diagnóstico sem achados.');
  return { codigo: 0, texto: l.join('\n') };
}

/** A raiz e os apps que são repositórios git próprios (clones independentes dentro do projeto). */
export function reposDoProjeto(raiz, medicao, sis) {
  const repos = new Set();
  const r0 = raizGit(sis, raiz);
  if (r0) repos.add(r0);
  for (const app of medicao.apps) {
    const r = raizGit(sis, app.pasta);
    if (r) repos.add(r);
  }
  return [...repos];
}

function rel(raiz, p) { return path.relative(raiz, p).replace(/\\/g, '/'); }
function copiarModelo(nome, destino) { fs.mkdirSync(path.dirname(destino), { recursive: true }); fs.copyFileSync(path.join(MODELOS, nome), destino); }
function acrescentar(arquivo, texto) { fs.mkdirSync(path.dirname(arquivo), { recursive: true }); fs.appendFileSync(arquivo, texto, 'utf8'); }
