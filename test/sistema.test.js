import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { rodar, temComando, raizGit, grafoDesatualizado, instalarGraphify, gerarGrafo, processosAntigos, linhasProcessos, sistemaReal } from '../src/sistema.js';
import { sistemaFalso, projeto } from './ajuda.js';

test('rodar executa de verdade e devolve código, saída e erro', () => {
  const r = rodar(process.execPath, ['-e', 'console.log("oi"); console.error("e"); process.exit(3)']);
  assert.deepEqual([r.codigo, r.saida, r.erro], [3, 'oi', 'e']);
  assert.equal(rodar('comando-que-nao-existe-fengshui', []).codigo, -1);
  assert.equal(sistemaReal.existe(process.execPath), true);
});

test('temComando olha o --help', () => {
  assert.equal(temComando(sistemaFalso({ 'graphify --help': {} }), 'graphify'), true);
  assert.equal(temComando(sistemaFalso(), 'graphify'), false);
});

test('raizGit devolve a raiz ou vazio fora de git', () => {
  assert.equal(raizGit(sistemaFalso({ 'git -C': { saida: '/repo' } }), '/repo/a'), path.resolve('/repo'));
  assert.equal(raizGit(sistemaFalso(), '/x'), '');
});

test('grafo desatualizado: sem grafo, sem commit, fora de git, commit sumido, sem mudança e com mudança', () => {
  const app = { pasta: '/repo/apps/a', grafo: { commit: 'c1' } };
  assert.equal(grafoDesatualizado(sistemaFalso(), { pasta: '/x', grafo: null }), true);
  assert.equal(grafoDesatualizado(sistemaFalso(), { pasta: '/x', grafo: { commit: '' } }), true);
  assert.equal(grafoDesatualizado(sistemaFalso(), app), true);
  const base = { 'git -C /repo/apps/a rev-parse': { saida: '/repo' } };
  assert.equal(grafoDesatualizado(sistemaFalso({ ...base, [`git -C ${path.resolve('/repo')} cat-file`]: { codigo: 1 } }), app), true);
  const ok = { ...base, [`git -C ${path.resolve('/repo')} cat-file`]: {}, [`git -C ${path.resolve('/repo')} diff`]: { codigo: 0 } };
  assert.equal(grafoDesatualizado(sistemaFalso(ok), app), false);
  assert.equal(grafoDesatualizado(sistemaFalso({ ...ok, [`git -C ${path.resolve('/repo')} diff`]: { codigo: 1 } }), app), true);
  // App na raiz do repositório: caminho '.'.
  const raiz = { pasta: '/repo', grafo: { commit: 'c1' } };
  const s = sistemaFalso({ 'git -C /repo rev-parse': { saida: '/repo' }, [`git -C ${path.resolve('/repo')} cat-file`]: {}, [`git -C ${path.resolve('/repo')} diff`]: {} });
  assert.equal(grafoDesatualizado(s, raiz), false);
  assert.ok(s.chamadas.some((c) => c.linha.endsWith('-- .')));
});

test('instala o graphify pelo primeiro meio que funcionar', () => {
  assert.equal(instalarGraphify(sistemaFalso({ 'uv --help': {}, 'uv tool install graphifyy': {} })), 'uv');
  assert.equal(instalarGraphify(sistemaFalso({ 'uv --help': {}, 'uv tool': { codigo: 1 }, 'pipx --help': {}, 'pipx install': {} })), 'pipx');
  assert.equal(instalarGraphify(sistemaFalso({ 'python -m pip': {} })), 'python');
  assert.equal(instalarGraphify(sistemaFalso()), '');
});

test('gerarGrafo apaga o graph.json antes do update (sem grafo anterior não quebra)', () => {
  const raiz = projeto({ 'graphify-out/graph.json': '{}' });
  const s = sistemaFalso({ 'graphify update': { saida: 'Rebuilt: 3 nodes' } });
  assert.equal(gerarGrafo(s, { pasta: raiz }).saida, 'Rebuilt: 3 nodes');
  assert.equal(fs.existsSync(path.join(raiz, 'graphify-out', 'graph.json')), false);
  assert.equal(s.chamadas[0].opts.cwd, raiz);
  assert.equal(gerarGrafo(s, { pasta: path.join(raiz, 'nao-existe') }).codigo, 0);
});

test('processos antigos no Windows (PowerShell) e no Unix (ps)', () => {
  const win = sistemaFalso({ powershell: { saida: '10\t300\tnode vitest run\n11\t30\tnode vitest\n12\t500\tnotepad\n13\t400\tnode fengshui vitest\nlixo' } }, 'win32');
  assert.deepEqual(processosAntigos(win, 3).map((p) => p.pid), [10]);
  const unix = sistemaFalso({ ps: { saida: '  20  18000 node next dev\n 21 60 jest\nlinha ruim' } }, 'linux');
  assert.deepEqual(processosAntigos(unix).map((p) => [p.pid, p.minutos]), [[20, 300]]);
  assert.deepEqual(linhasProcessos(null, /x/, 1), []);
});
