// Medição do contexto de um projeto: o que cada agente carrega sempre (instruções, índice da memória, descrições de
// skills e agentes) e o que fica sob demanda. Tokens são estimados por caracteres ÷ 3,5 (aproximação suficiente
// para comparar antes/depois; o modelo real conta diferente).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const CARACTERES_POR_TOKEN = 3.5;
const PASTAS_DE_APPS = ['apps', 'packages', 'services'];
const MARCAS_DE_APP = ['package.json', 'go.mod', 'pyproject.toml', 'Cargo.toml', 'pom.xml'];
const EXTENSOES_DE_APP = ['.dpr', '.dproj', '.csproj', '.sln'];

export function estimarTokens(texto) {
  return Math.round((texto ?? '').length / CARACTERES_POR_TOKEN);
}

export function lerTexto(arquivo) {
  try { return fs.readFileSync(arquivo, 'utf8'); } catch { return null; }
}

/** `description:` do frontmatter YAML (entre aspas ou não); '' quando não há. */
export function lerDescricao(texto) {
  if (!texto || !texto.startsWith('---')) return '';
  const fim = texto.indexOf('\n---', 3);
  const cabecalho = fim > 0 ? texto.slice(3, fim) : '';
  const m = cabecalho.match(/^description:\s*(.*)$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

/** O frontmatter de uma regra do Cursor tem `alwaysApply: true`? */
export function regraSempreAtiva(texto) {
  return /^alwaysApply:\s*true\s*$/m.test((texto ?? '').split('\n---')[0] ?? '');
}

export function hash(texto) {
  return crypto.createHash('sha1').update((texto ?? '').replace(/\r\n/g, '\n').trim()).digest('hex');
}

function listar(pasta, filtro = () => true) {
  try { return fs.readdirSync(pasta, { withFileTypes: true }).filter(filtro); } catch { return []; }
}

function arquivosRecursivos(pasta, ext) {
  const saida = [];
  for (const e of listar(pasta)) {
    const p = path.join(pasta, e.name);
    if (e.isDirectory()) saida.push(...arquivosRecursivos(p, ext));
    else if (!ext || e.name.endsWith(ext)) saida.push(p);
  }
  return saida;
}

/** fengshui.json na raiz (opcional): { "ignorarApps": ["apps/mobile-task015", ...], "teto": 5000 }. */
export function lerConfig(raiz) {
  const texto = lerTexto(path.join(raiz, 'fengshui.json'));
  if (texto === null) return { ignorarApps: [] };
  try {
    const c = JSON.parse(texto);
    return { ...c, ignorarApps: (c.ignorarApps ?? []).map((x) => x.replace(/\\/g, '/').replace(/\/$/, '')) };
  } catch {
    throw new Error('fengshui.json não é um JSON válido');
  }
}

/** Apps do projeto: subpastas de apps/, packages/ ou services/ que têm cara de projeto (menos as ignoradas). */
export function encontrarApps(raiz, ignorar = []) {
  const apps = [];
  for (const pai of PASTAS_DE_APPS) {
    for (const e of listar(path.join(raiz, pai), (d) => d.isDirectory() && !d.name.startsWith('.'))) {
      if (ignorar.includes(`${pai}/${e.name}`)) continue;
      const p = path.join(raiz, pai, e.name);
      const nomes = listar(p).map((d) => d.name);
      if (nomes.some((n) => MARCAS_DE_APP.includes(n) || EXTENSOES_DE_APP.some((x) => n.endsWith(x)) || n === 'CLAUDE.md')) {
        apps.push({ nome: e.name, pasta: p, relativo: `${pai}/${e.name}` });
      }
    }
  }
  return apps;
}

/** Pasta da memória do Claude Code para este projeto (~/.claude/projects/<caminho com - no lugar de : \ />/memory). */
export function pastaMemoria(raiz, home = os.homedir()) {
  const slug = path.resolve(raiz).replace(/[:\\/]/g, '-');
  return path.join(home, '.claude', 'projects', slug, 'memory');
}

function medirArquivo(arquivo, papel, nome) {
  const texto = lerTexto(arquivo);
  if (texto === null) return null;
  return { arquivo: nome ?? arquivo, papel, tokens: estimarTokens(texto), texto };
}

/** Tudo o que é carregado sempre (fixo) e o que existe sob demanda, com o texto para as regras de achados. */
export function medirProjeto(raiz, { home = os.homedir() } = {}) {
  const fixos = [];
  const sobDemanda = [];
  const add = (lista, m) => { if (m) lista.push(m); };
  const config = lerConfig(raiz);

  add(fixos, medirArquivo(path.join(raiz, 'CLAUDE.md'), 'instrucoes-raiz', 'CLAUDE.md'));
  add(fixos, medirArquivo(path.join(raiz, 'AGENTS.md'), 'agents-raiz', 'AGENTS.md'));
  add(fixos, medirArquivo(path.join(pastaMemoria(raiz, home), 'MEMORY.md'), 'memoria', 'memória do Claude (MEMORY.md)'));

  const apps = encontrarApps(raiz, config.ignorarApps).map((app) => ({
    ...app,
    instrucoes: medirArquivo(path.join(app.pasta, 'CLAUDE.md'), 'instrucoes-app'),
    grafo: lerGrafo(app.pasta),
    temGraphifyIgnore: fs.existsSync(path.join(app.pasta, '.graphifyignore')),
  }));

  const claude = path.join(raiz, '.claude');
  const agentes = listar(path.join(claude, 'agents'), (d) => d.isFile() && d.name.endsWith('.md')).map((d) => {
    const texto = lerTexto(path.join(claude, 'agents', d.name));
    return { nome: d.name.replace(/\.md$/, ''), tokens: estimarTokens(texto), descricao: lerDescricao(texto), texto };
  });
  const skills = arquivosRecursivos(path.join(claude, 'skills'), 'SKILL.md').map((f) => {
    const texto = lerTexto(f);
    return { nome: path.basename(path.dirname(f)), arquivo: f, tokens: estimarTokens(texto), descricao: lerDescricao(texto), texto };
  });
  const guias = listar(path.join(claude, 'skills'), (d) => d.isFile() && d.name.endsWith('.md')).map((d) => {
    const texto = lerTexto(path.join(claude, 'skills', d.name));
    return { nome: d.name, tokens: estimarTokens(texto) };
  });
  const comandos = arquivosRecursivos(path.join(claude, 'commands'), '.md').map((f) => {
    const texto = lerTexto(f);
    return { nome: path.relative(path.join(claude, 'commands'), f), tokens: estimarTokens(texto), texto };
  });
  const regrasCursor = listar(path.join(raiz, '.cursor', 'rules'), (d) => d.isFile() && d.name.endsWith('.mdc')).map((d) => {
    const texto = lerTexto(path.join(raiz, '.cursor', 'rules', d.name));
    return { nome: d.name, tokens: estimarTokens(texto), sempre: regraSempreAtiva(texto) };
  });

  for (const r of regrasCursor) if (r.sempre) fixos.push({ arquivo: `.cursor/rules/${r.nome}`, papel: 'regra-cursor', tokens: r.tokens });
  const descricoes = estimarTokens(agentes.map((a) => a.descricao).join('') + skills.map((s) => s.descricao).join(''));
  if (descricoes > 0) fixos.push({ arquivo: 'descrições de agentes e skills', papel: 'descricoes', tokens: descricoes });
  for (const a of agentes) sobDemanda.push({ arquivo: `.claude/agents/${a.nome}.md`, papel: 'agente', tokens: a.tokens });
  for (const g of guias) sobDemanda.push({ arquivo: `.claude/skills/${g.nome}`, papel: 'guia', tokens: g.tokens });

  const hooks = lerHooks(raiz);
  return { raiz, config, fixos, sobDemanda, apps, agentes, skills, guias, comandos, regrasCursor, hooks };
}

/** graphify-out/graph.json do app: nós e o commit em que foi gerado. */
export function lerGrafo(pastaApp) {
  const texto = lerTexto(path.join(pastaApp, 'graphify-out', 'graph.json'));
  if (texto === null) return null;
  try {
    const g = JSON.parse(texto);
    return { nos: Array.isArray(g.nodes) ? g.nodes.length : 0, commit: g.built_at_commit ?? '' };
  } catch {
    return { nos: 0, commit: '', invalido: true };
  }
}

/** Hooks do Claude Code no projeto (settings.json e settings.local.json): [{arquivo, evento, comando}]. */
export function lerHooks(raiz) {
  const saida = [];
  for (const nome of ['settings.json', 'settings.local.json']) {
    const arquivo = path.join(raiz, '.claude', nome);
    const texto = lerTexto(arquivo);
    if (texto === null) continue;
    let j;
    try { j = JSON.parse(texto); } catch { continue; }
    for (const [evento, lista] of Object.entries(j.hooks ?? {})) {
      for (const grupo of lista ?? []) {
        for (const h of grupo.hooks ?? []) saida.push({ arquivo, evento, comando: h.command ?? '' });
      }
    }
  }
  return saida;
}
