import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { appsOuRaiz, diagnostico, planoInit, init, grafos, preparar, reposDoProjeto } from '../src/comandos.js';
import { medirProjeto } from '../src/medir.js';
import { projeto, grande, sistemaFalso } from './ajuda.js';

const comGraphify = (extra = {}) => sistemaFalso({ 'graphify --help': {}, ...extra });

test('appsOuRaiz: os apps, ou a própria raiz num projeto sem apps/', () => {
  const raiz = projeto({ '.graphifyignore': 'x' });
  const r = appsOuRaiz(medirProjeto(raiz));
  assert.equal(r.length, 1);
  assert.equal(r[0].relativo, '.');
  assert.equal(r[0].temGraphifyIgnore, true);
  assert.equal(appsOuRaiz(medirProjeto(projeto({ 'apps/a/package.json': '{}' })))[0].relativo, 'apps/a');
});

test('diagnóstico: código 1 com achado alto, HTML salvo, teto do fengshui.json e da opção', () => {
  const raiz = projeto({ 'CLAUDE.md': grande(6000), 'fengshui.json': '{"teto":7000}' });
  assert.equal(diagnostico(raiz, sistemaFalso()).codigo, 0);
  const html = path.join(raiz, 'r.html');
  const d = diagnostico(raiz, sistemaFalso(), { html, teto: 5000 });
  assert.equal(d.codigo, 1);
  assert.match(d.texto, /Relatório salvo em/);
  assert.match(fs.readFileSync(html, 'utf8'), /Dieta de Contexto/);
  assert.equal(diagnostico(projeto({ 'CLAUDE.md': grande(6000) }), sistemaFalso()).codigo, 1);
});

test('plano do init num projeto cru: graphify, ignore, .gitignore, hook, referência e CLAUDE.md', () => {
  const raiz = projeto();
  fs.mkdirSync(path.join(raiz, '.git', 'hooks'), { recursive: true });
  const s = sistemaFalso({ 'git -C': { saida: raiz } });
  const descricoes = planoInit(raiz, s).map((a) => a.descricao);
  assert.equal(descricoes.length, 6);
  assert.match(descricoes[0], /Instalar o graphify/);
  assert.match(descricoes.join('\n'), /Criar o hook \.git\/hooks\/post-merge/);
});

test('init com --sim aplica tudo, não sobrescreve e na segunda vez não há nada a fazer', async () => {
  const raiz = projeto({ 'CLAUDE.md': 'meu', '.gitignore': 'node_modules/\n', '.git/hooks/post-merge': '#!/bin/sh\necho antigo\n' });
  const s = comGraphify({ 'git -C': { saida: raiz } });
  const r = await init(raiz, s, { sim: true });
  assert.equal(r.codigo, 0, r.texto);
  assert.equal(fs.readFileSync(path.join(raiz, 'CLAUDE.md'), 'utf8'), 'meu');
  assert.match(fs.readFileSync(path.join(raiz, '.gitignore'), 'utf8'), /^graphify-out\/$/m);
  const hook = fs.readFileSync(path.join(raiz, '.git', 'hooks', 'post-merge'), 'utf8');
  assert.match(hook, /echo antigo[\s\S]*fengshui grafos/);
  assert.doesNotMatch(hook.slice(hook.indexOf('# fengshui')), /\r/);
  assert.ok(fs.existsSync(path.join(raiz, '.graphifyignore')));
  assert.ok(fs.existsSync(path.join(raiz, 'docs', 'referencia', 'README.md')));
  assert.match((await init(raiz, s, { sim: true })).texto, /Nada a instalar/);
});

test('init pergunta: "não" não faz nada; "s" aplica; falha de instalação aparece no resultado', async () => {
  const raiz = projeto();
  const s = sistemaFalso();
  let pergunta = '';
  const nao = await init(raiz, s, { perguntar: async (q) => { pergunta = q; return 'n'; } });
  assert.equal(nao.texto, 'Nada foi feito.');
  assert.match(pergunta, /Nada existente é sobrescrito/);
  const sem = await init(raiz, s, { perguntar: async () => undefined });
  assert.equal(sem.texto, 'Nada foi feito.');
  const sim = await init(raiz, s, { perguntar: async () => 'sim' });
  assert.equal(sim.codigo, 1);
  assert.match(sim.texto, /✖ Instalar o graphify.*não consegui instalar/);
  assert.match(sim.texto, /✔ Criar CLAUDE\.md/);
  const ok = await init(projeto(), sistemaFalso({ 'uv --help': {}, 'uv tool': {} }), { sim: true });
  assert.match(ok.texto, /instalado via uv/);
});

test('grafos: sem graphify, só os desatualizados, todos, falha e grafo geral', () => {
  assert.match(grafos(projeto(), sistemaFalso()).texto, /graphify não encontrado/);
  const raiz = projeto({
    'apps/a/package.json': '{}', 'apps/a/graphify-out/graph.json': '{"nodes":[1],"built_at_commit":"c"}',
    'apps/b/package.json': '{}',
  });
  const s = comGraphify({ 'graphify update': { saida: 'Rebuilt: 1,234 nodes' }, 'graphify merge-graphs': {}, 'git -C': (linha) => (/rev-parse/.test(linha) ? { saida: raiz } : { codigo: 0 }) });
  const r = grafos(raiz, s);
  assert.match(r.texto, /apps\/a: em dia/);
  assert.match(r.texto, /✔ apps\/b: 1,234 nós/);
  assert.match(r.texto, /grafo geral: graphify-out\/monorepo-graph\.json/);
  assert.equal(r.codigo, 0);
  const todos = grafos(raiz, s, { todos: true });
  assert.doesNotMatch(todos.texto, /em dia/);
  const falha = comGraphify({ 'graphify update': { codigo: 1, erro: 'quebrou' }, 'graphify merge-graphs': { codigo: 1, saida: 'sem grafos' } });
  const rf = grafos(raiz, falha, { todos: true });
  assert.equal(rf.codigo, 1);
  assert.match(rf.texto, /✖ apps\/a: quebrou/);
  assert.match(rf.texto, /✖ grafo geral: sem grafos/);
  const semNos = grafos(projeto(), comGraphify({ 'graphify update': { saida: 'ok' } }));
  assert.match(semNos.texto, /: atualizado/);
});

test('repos do projeto: a raiz e os apps que são repositórios próprios, sem repetir', () => {
  const raiz = projeto({ 'apps/a/package.json': '{}', 'apps/b/package.json': '{}' });
  const s = sistemaFalso({ [`git -C ${raiz} `]: { saida: raiz }, [`git -C ${path.join(raiz, 'apps', 'a')} `]: { saida: path.join(raiz, 'apps', 'a') } });
  const repos = reposDoProjeto(raiz, medirProjeto(raiz), s);
  assert.deepEqual(repos.sort(), [path.resolve(raiz), path.resolve(raiz, 'apps', 'a')].sort());
  assert.deepEqual(reposDoProjeto(raiz, medirProjeto(raiz), sistemaFalso()), []);
});

test('preparar: repo sujo não é mexido, sem remoto, sem fast-forward, em dia, órfãos e diagnóstico', () => {
  const cenarios = [
    [{ 'git -C': (l) => (/status/.test(l) ? { saida: ' M x' } : /show-toplevel/.test(l) ? { saida: '/r' } : { saida: 'develop' }) }, /tem alteração sem commit; não mexi/],
    [{ 'git -C': (l) => (/fetch/.test(l) ? { codigo: 1 } : /show-toplevel/.test(l) ? { saida: '/r' } : { saida: '' }) }, /sem acesso ao remoto/],
    [{ 'git -C': (l) => (/pull/.test(l) ? { codigo: 1 } : /show-toplevel/.test(l) ? { saida: '/r' } : { saida: '' }) }, /não dá fast-forward/],
    [{ 'git -C': (l) => (/show-toplevel/.test(l) ? { saida: '/r' } : /branch/.test(l) ? { saida: 'develop' } : { saida: '' }) }, /\(develop\): em dia com o remoto/],
  ];
  for (const [resp, esperado] of cenarios) {
    const t = preparar(projeto(), sistemaFalso({ ...resp, ps: { saida: '' } })).texto;
    assert.match(t, esperado);
    assert.match(t, /Nenhum processo de teste\/servidor esquecido/);
  }
  const orf = preparar(projeto({ 'CLAUDE.md': grande(9000) }), sistemaFalso({ ps: { saida: '7 36000 node vitest run' } }), { horas: 2 }).texto;
  assert.match(orf, /há mais de 2 h[\s\S]*PID 7 · 10 h · node vitest run/);
  assert.match(orf, /achado\(s\) no diagnóstico/);
  assert.match(preparar(projeto(), comGraphify({ ps: { saida: '' }, 'graphify update': { saida: 'Rebuilt: 1 nodes' } })).texto, /Diagnóstico sem achados|achado/);
});
