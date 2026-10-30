// Acesso ao sistema (git, graphify, processos), concentrado aqui para os testes trocarem por um falso.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function rodar(comando, args, { cwd, timeout = 600000 } = {}) {
  // Sem shell: os comandos usados (git, graphify, uv, pipx, python, powershell, ps) são executáveis, e o shell
  // do Windows quebraria as aspas dos argumentos com espaço.
  const r = spawnSync(comando, args, { cwd, encoding: 'utf8', timeout, windowsHide: true });
  return { codigo: r.status ?? (r.error ? -1 : 0), saida: (r.stdout ?? '').trim(), erro: (r.stderr ?? '').trim() };
}

export const sistemaReal = {
  rodar,
  existe: (p) => fs.existsSync(p),
  plataforma: process.platform,
};

export function temComando(sis, comando) {
  return sis.rodar(comando, ['--help'], { timeout: 30000 }).codigo === 0;
}

/** Raiz do repositório git que contém a pasta ('' fora de git). */
export function raizGit(sis, pasta) {
  const r = sis.rodar('git', ['-C', pasta, 'rev-parse', '--show-toplevel']);
  return r.codigo === 0 ? path.resolve(r.saida) : '';
}

/** O código do app mudou desde o commit do grafo? Sem commit no grafo ou fora de git: sim (refaz). */
export function grafoDesatualizado(sis, app) {
  if (!app.grafo || !app.grafo.commit) return true;
  const repo = raizGit(sis, app.pasta);
  if (!repo) return true;
  const existe = sis.rodar('git', ['-C', repo, 'cat-file', '-e', `${app.grafo.commit}^{commit}`]);
  if (existe.codigo !== 0) return true;
  const caminho = path.relative(repo, app.pasta) || '.';
  const d = sis.rodar('git', ['-C', repo, 'diff', '--quiet', app.grafo.commit, 'HEAD', '--', caminho]);
  return d.codigo !== 0;
}

/** Instala o graphify (pacote Python graphifyy): uv, depois pipx, depois pip --user. Devolve o meio usado ou ''. */
export function instalarGraphify(sis) {
  const tentativas = [
    ['uv', ['tool', 'install', 'graphifyy']],
    ['pipx', ['install', 'graphifyy']],
    ['python', ['-m', 'pip', 'install', '--user', 'graphifyy']],
  ];
  for (const [cmd, args] of tentativas) {
    if (!temComando(sis, cmd) && cmd !== 'python') continue;
    if (sis.rodar(cmd, args).codigo === 0) return cmd;
  }
  return '';
}

/** Refaz o grafo de um app do zero (sem graph.json, o update não preserva nós de pastas que passaram a ser ignoradas). */
export function gerarGrafo(sis, app) {
  try { fs.rmSync(path.join(app.pasta, 'graphify-out', 'graph.json'), { force: true }); } catch { /* sem grafo anterior */ }
  return sis.rodar('graphify', ['update', '.', '--force'], { cwd: app.pasta });
}

/** Processos de teste/servidor de desenvolvimento rodando há mais de N horas (órfãos típicos de agentes). */
export function processosAntigos(sis, horas = 3) {
  const padrao = /(vitest|jest|next dev|next-server|vite\b|webpack serve|nodemon|playwright)/i;
  if (sis.plataforma === 'win32') {
    const r = sis.rodar('powershell', ['-NoProfile', '-Command',
      'Get-CimInstance Win32_Process | Where-Object { $_.CommandLine } | ForEach-Object { "$($_.ProcessId)`t$([int]((Get-Date) - $_.CreationDate).TotalMinutes)`t$($_.CommandLine)" }']);
    return linhasProcessos(r.saida, padrao, horas);
  }
  const r = sis.rodar('ps', ['-eo', 'pid=,etimes=,args=']);
  return r.saida.split('\n').map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), minutos: Math.floor(Number(m[2]) / 60), comando: m[3] }))
    .filter((p) => padrao.test(p.comando) && p.minutos >= horas * 60);
}

export function linhasProcessos(texto, padrao, horas) {
  return (texto ?? '').split('\n').map((l) => l.split('\t')).filter((c) => c.length >= 3)
    .map(([pid, min, ...cmd]) => ({ pid: Number(pid), minutos: Number(min), comando: cmd.join('\t').trim() }))
    .filter((p) => padrao.test(p.comando) && p.minutos >= horas * 60 && !/fengshui/.test(p.comando));
}
