import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumo, textoTerminal, paginaHtml } from '../src/relatorio.js';

const medicao = {
  fixos: [{ arquivo: 'CLAUDE.md', papel: 'instrucoes-raiz', tokens: 1700 }, { arquivo: 'C:\\x\\memory\\MEMORY.md', papel: 'memoria', tokens: 1400 }],
  apps: [
    { relativo: 'apps/api', instrucoes: { tokens: 3600 }, grafo: { nos: 5208 } },
    { relativo: 'apps/web', instrucoes: null, grafo: null },
  ],
  agentes: [1, 2], skills: [1], guias: [1, 2, 3], comandos: [], regrasCursor: [1],
};

test('resumo soma o fixo e acha o app com a sessão mais cara', () => {
  const r = resumo(medicao);
  assert.equal(r.fixoRaiz, 3100);
  assert.equal(r.pior.nome, 'apps/api');
  assert.equal(r.pior.sessao, 1700 + 1400 + 3600);
  assert.equal(r.apps[1].grafo, null);
  assert.equal(resumo({ ...medicao, apps: [] }).pior, null);
});

test('texto do terminal lista fixos, apps e achados, ou diz que está em dia', () => {
  const t = textoTerminal(medicao, [{ gravidade: 'alto', titulo: 'Grande', oQueFazer: 'Enxugue' }, { gravidade: 'medio', titulo: 'M', oQueFazer: 'F' }]);
  assert.match(t, /~1\.700\s+CLAUDE\.md/);
  assert.match(t, /apps\/api .*5\.208 nós/);
  assert.match(t, /apps\/web .*sem grafo/);
  assert.match(t, /2 achado\(s\):\n  ✖ Grande\n      → Enxugue\n  ▲ M/);
  assert.match(textoTerminal({ ...medicao, apps: [] }, []), /✔ Nada a ajustar/);
});

test('página HTML: escala, rótulos escapados, achados e comparação com antes', () => {
  const h = paginaHtml(medicao, [{ gravidade: 'alto', titulo: '<b>x</b>', oQueFazer: 'y' }], { titulo: 'T & cia' });
  assert.match(h, /<title>T &amp; cia<\/title>/);
  assert.match(h, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(h, /memory\/MEMORY\.md/);
  assert.match(h, /apps\/api\/CLAUDE\.md/);
  assert.match(h, /pior caso, <code>apps\/api<\/code>/);
  assert.doesNotMatch(h, /var\(--antes\)"/);
  const c = paginaHtml(medicao, [], { antes: [{ nome: 'CLAUDE.md', tokens: 5300 }] });
  assert.match(c, /fill="var\(--antes\)"/);
  assert.match(c, />Nada a ajustar</);
  // Escalas: pequena (passo 1 mil) e grande (passo 10 mil).
  const pequeno = paginaHtml({ ...medicao, fixos: [{ arquivo: 'a', papel: 'x', tokens: 10 }], apps: [] }, []);
  assert.match(pequeno, />1 mil</);
  assert.doesNotMatch(pequeno, /pior caso/);
  const grandeH = paginaHtml({ ...medicao, fixos: [{ arquivo: 'a', papel: 'x', tokens: 27000 }] }, []);
  assert.match(grandeH, />30 mil</);
});
