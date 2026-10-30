import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { estimarTokens, lerDescricao, regraSempreAtiva, encontrarApps, pastaMemoria, medirProjeto, lerGrafo, lerHooks, lerConfig, lerTexto, hash } from '../src/medir.js';
import { projeto, grande } from './ajuda.js';

test('estima tokens por caracteres ÷ 3,5 e aceita texto vazio', () => {
  assert.equal(estimarTokens('x'.repeat(35)), 10);
  assert.equal(estimarTokens(''), 0);
  assert.equal(estimarTokens(null), 0);
});

test('lê a description do frontmatter, com e sem aspas', () => {
  assert.equal(lerDescricao('---\nname: a\ndescription: "Faz X"\n---\ncorpo'), 'Faz X');
  assert.equal(lerDescricao("---\ndescription: 'Faz Y'\n---"), 'Faz Y');
  assert.equal(lerDescricao('---\nname: a\n---\n'), '');
  assert.equal(lerDescricao('sem frontmatter'), '');
  assert.equal(lerDescricao('---\ndescription: sem fim'), '');
  assert.equal(lerDescricao(null), '');
});

test('reconhece regra do Cursor sempre ativa só no frontmatter', () => {
  assert.equal(regraSempreAtiva('---\nalwaysApply: true\n---\nx'), true);
  assert.equal(regraSempreAtiva('---\nalwaysApply: false\n---\nalwaysApply: true'), false);
  assert.equal(regraSempreAtiva(null), false);
});

test('hash ignora CRLF e espaços nas pontas', () => {
  assert.equal(hash('a\r\nb '), hash('a\nb'));
});

test('encontra apps em apps/, packages/ e services/, ignora pastas sem cara de projeto e as ignoradas', () => {
  const raiz = projeto({
    'apps/web/package.json': '{}', 'apps/api/Api.dpr': 'x', 'apps/docs/LEIAME.txt': 'x', 'apps/.oculto/package.json': '{}',
    'packages/lib/go.mod': 'x', 'services/s1/CLAUDE.md': 'x', 'apps/velho/package.json': '{}',
  });
  const nomes = encontrarApps(raiz, ['apps/velho']).map((a) => a.relativo).sort();
  assert.deepEqual(nomes, ['apps/api', 'apps/web', 'packages/lib', 'services/s1']);
  assert.deepEqual(encontrarApps(projeto()), []);
});

test('pasta da memória segue o slug do Claude Code', () => {
  const p = pastaMemoria('C:\\repo\\proj', '/home/x');
  assert.equal(p, path.join('/home/x', '.claude', 'projects', path.resolve('C:\\repo\\proj').replace(/[:\\/]/g, '-'), 'memory'));
});

test('lê o fengshui.json e recusa JSON inválido', () => {
  assert.deepEqual(lerConfig(projeto()).ignorarApps, []);
  const c = lerConfig(projeto({ 'fengshui.json': '{"ignorarApps":["apps\\\\x\\\\"],"teto":3000}' }));
  assert.deepEqual(c.ignorarApps, ['apps/x']);
  assert.equal(c.teto, 3000);
  assert.deepEqual(lerConfig(projeto({ 'fengshui.json': '{"teto":1}' })).ignorarApps, []);
  assert.throws(() => lerConfig(projeto({ 'fengshui.json': '{x' })), /não é um JSON válido/);
});

test('lê o grafo (nós e commit), grafo inválido e ausente', () => {
  const raiz = projeto({ 'g/graphify-out/graph.json': '{"nodes":[1,2,3],"built_at_commit":"abc"}', 'h/graphify-out/graph.json': '{x', 'k/graphify-out/graph.json': '{}' });
  assert.deepEqual(lerGrafo(path.join(raiz, 'g')), { nos: 3, commit: 'abc' });
  assert.equal(lerGrafo(path.join(raiz, 'h')).invalido, true);
  assert.deepEqual(lerGrafo(path.join(raiz, 'k')), { nos: 0, commit: '' });
  assert.equal(lerGrafo(path.join(raiz, 'nada')), null);
});

test('lê os hooks do settings e do settings.local, pulando JSON inválido', () => {
  const raiz = projeto({
    '.claude/settings.json': JSON.stringify({ hooks: { PostToolUse: [{ hooks: [{ command: 'echo .needs_update' }, {}] }], Stop: [{}] } }),
    '.claude/settings.local.json': '{x',
  });
  const h = lerHooks(raiz);
  assert.equal(h.length, 2);
  assert.equal(h[0].evento, 'PostToolUse');
  assert.equal(h[1].comando, '');
  assert.deepEqual(lerHooks(projeto({ '.claude/settings.json': '{}' })), []);
});

test('mede o projeto: fixos, apps, agentes, skills, guias, comandos e regras', () => {
  const home = projeto();
  const raiz = projeto({
    'CLAUDE.md': grande(100), 'AGENTS.md': grande(50),
    'apps/web/package.json': '{}', 'apps/web/CLAUDE.md': grande(20), 'apps/web/.graphifyignore': 'x',
    'apps/web/graphify-out/graph.json': '{"nodes":[1],"built_at_commit":"c1"}',
    '.claude/agents/dev.md': '---\ndescription: Dev\n---\ncorpo',
    '.claude/skills/s1/SKILL.md': '---\ndescription: Skill um\n---\ncorpo',
    '.claude/skills/guia.md': 'guia',
    '.claude/commands/x/y.md': 'cmd',
    '.cursor/rules/a.mdc': '---\nalwaysApply: true\n---\nr', '.cursor/rules/b.mdc': '---\nglobs: x\n---\nr',
  });
  fs.mkdirSync(pastaMemoria(raiz, home), { recursive: true });
  fs.writeFileSync(path.join(pastaMemoria(raiz, home), 'MEMORY.md'), grande(10));
  const m = medirProjeto(raiz, { home });
  assert.deepEqual(m.fixos.map((f) => f.papel), ['instrucoes-raiz', 'agents-raiz', 'memoria', 'regra-cursor', 'descricoes']);
  assert.equal(m.fixos[0].tokens, 100);
  assert.equal(m.apps[0].instrucoes.tokens, 20);
  assert.equal(m.apps[0].temGraphifyIgnore, true);
  assert.deepEqual(m.apps[0].grafo, { nos: 1, commit: 'c1' });
  assert.equal(m.agentes[0].descricao, 'Dev');
  assert.equal(m.skills[0].nome, 's1');
  assert.equal(m.guias[0].nome, 'guia.md');
  assert.equal(m.comandos[0].nome, path.join('x', 'y.md'));
  assert.equal(m.regrasCursor.filter((r) => r.sempre).length, 1);
  assert.ok(m.sobDemanda.some((s) => s.papel === 'agente') && m.sobDemanda.some((s) => s.papel === 'guia'));
});

test('projeto vazio: nada fixo além do que existe e lerTexto devolve null', () => {
  const m = medirProjeto(projeto(), { home: projeto() });
  assert.deepEqual(m.fixos, []);
  assert.equal(lerTexto('/nao/existe'), null);
});
