import { test } from 'node:test';
import assert from 'node:assert/strict';
import { corpo, semelhanca, encontrarDuplicatas, gerarAchados, contextoFixoDoApp } from '../src/achados.js';

const base = (extra = {}) => ({ fixos: [], apps: [], regrasCursor: [], hooks: [], skills: [], comandos: [], ...extra });

test('corpo tira o frontmatter (e aguenta texto sem fim de frontmatter)', () => {
  assert.equal(corpo('---\na: 1\n---\nlinha'), 'linha');
  assert.equal(corpo('sem frontmatter\n'), 'sem frontmatter');
  assert.equal(corpo('---\nsem fim'), '---\nsem fim');
  assert.equal(corpo(null), '');
});

test('semelhança pela menor lista de linhas; vazio é 0', () => {
  assert.equal(semelhanca('a\nb\nc', 'a\nb\nx'), 2 / 3);
  assert.equal(semelhanca('', 'a'), 0);
});

test('duplicatas: iguais (mesmo corpo) e quase iguais; diferentes ficam de fora', () => {
  const linhas = Array.from({ length: 10 }, (_, i) => `linha ${i}`);
  const itens = [
    { nome: 'skill', texto: '---\nd: 1\n---\n' + linhas.join('\n'), tokens: 10 },
    { nome: 'cmd', texto: '---\nd: 2\n---\n' + linhas.join('\n'), tokens: 12 },
    { nome: 'quase', texto: linhas.slice(0, 9).join('\n') + '\noutra', tokens: 8 },
    { nome: 'outro', texto: 'nada a ver', tokens: 1 },
  ];
  const d = encontrarDuplicatas(itens);
  assert.ok(d.some((p) => p.a === 'skill' && p.b === 'cmd' && p.semelhanca === 1 && p.tokens === 10));
  assert.ok(d.some((p) => p.b === 'quase' && p.semelhanca >= 0.8));
  assert.ok(!d.some((p) => p.a === 'outro' || p.b === 'outro'));
});

test('instrução fixa acima do teto é achado alto, com o excesso em tokens', () => {
  const a = gerarAchados(base({ fixos: [{ arquivo: 'C:/x/CLAUDE.md', papel: 'instrucoes-raiz', tokens: 6000 }, { arquivo: 'm', papel: 'memoria', tokens: 100 }, { arquivo: 'd', papel: 'descricoes', tokens: 9000 }] }));
  assert.equal(a.length, 1);
  assert.equal(a[0].gravidade, 'alto');
  assert.equal(a[0].tokens, 1000);
  assert.match(a[0].titulo, /x\/CLAUDE\.md tem ~6000/);
});

test('apps: instruções acima do teto, sem grafo, desatualizado e sem ignore viram achados agrupados', () => {
  const apps = [
    { relativo: 'apps/a', instrucoes: { tokens: 9000 }, grafo: null, temGraphifyIgnore: false },
    { relativo: 'apps/b', instrucoes: null, grafo: { nos: 1, commit: 'c' }, temGraphifyIgnore: false },
    { relativo: 'apps/c', instrucoes: { tokens: 10 }, grafo: { nos: 1, commit: 'c' }, temGraphifyIgnore: true },
  ];
  const a = gerarAchados(base({ apps }), { teto: 5000, grafoMudou: (app) => app.relativo === 'apps/b' });
  const titulos = a.map((x) => x.titulo);
  assert.equal(a[0].gravidade, 'alto');
  assert.ok(titulos.includes('1 app sem grafo do código: apps/a'));
  assert.ok(titulos.includes('1 grafo desatualizado: apps/b'));
  assert.ok(titulos.includes('2 apps sem .graphifyignore: apps/a, apps/b'));
});

test('sem achados quando tudo está em dia (padrões das opções)', () => {
  assert.deepEqual(gerarAchados(base({ apps: [{ relativo: 'apps/c', instrucoes: null, grafo: { nos: 1, commit: 'c' }, temGraphifyIgnore: true }] })), []);
  const varios = [1, 2].map((i) => ({ relativo: `apps/${i}`, instrucoes: null, grafo: { nos: 1, commit: 'c' }, temGraphifyIgnore: true }));
  assert.match(gerarAchados(base({ apps: varios }), { grafoMudou: () => true })[0].titulo, /^2 grafos desatualizados/);
});

test('regra do Cursor sempre ativa e grande, hook do .needs_update e duplicata', () => {
  const linhas = 'a\nb\nc\nd\ne';
  const a = gerarAchados(base({
    regrasCursor: [{ nome: 'r.mdc', sempre: true, tokens: 1500 }, { nome: 'p.mdc', sempre: true, tokens: 10 }, { nome: 'g.mdc', sempre: false, tokens: 9000 }],
    hooks: [{ evento: 'PostToolUse', comando: "Set-Content graphify-out/.needs_update" }, { evento: 'Stop', comando: 'echo ok' }],
    skills: [{ nome: 's', texto: linhas, tokens: 5 }], comandos: [{ nome: 'c', texto: linhas, tokens: 6 }],
  }));
  assert.equal(a.length, 3);
  assert.ok(a.some((x) => /r\.mdc/.test(x.titulo) && x.tokens === 500));
  assert.ok(a.some((x) => /PostToolUse/.test(x.titulo)));
  assert.ok(a.some((x) => /"s" e "c" têm 100%/.test(x.titulo)));
});

test('ordena por gravidade e depois pelo excesso de tokens', () => {
  const a = gerarAchados(base({
    fixos: [{ arquivo: 'AGENTS.md', papel: 'agents-raiz', tokens: 5500 }, { arquivo: 'CLAUDE.md', papel: 'instrucoes-raiz', tokens: 9000 }],
    hooks: [{ evento: 'X', comando: '.needs_update' }],
  }));
  assert.deepEqual(a.map((x) => x.gravidade), ['alto', 'alto', 'medio']);
  assert.ok(a[0].tokens > a[1].tokens);
});

test('contexto fixo de uma sessão num app soma tudo menos o AGENTS.md', () => {
  const m = base({ fixos: [{ papel: 'instrucoes-raiz', tokens: 100 }, { papel: 'agents-raiz', tokens: 999 }, { papel: 'memoria', tokens: 10 }] });
  assert.equal(contextoFixoDoApp(m, { instrucoes: { tokens: 5 } }), 115);
  assert.equal(contextoFixoDoApp(m, null), 110);
});
