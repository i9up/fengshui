// Saída do diagnóstico: texto para o terminal e uma página HTML independente (sem CDN, sem fontes externas).
import { contextoFixoDoApp } from './achados.js';

const fmt = (n) => Number(n).toLocaleString('pt-BR');
const SIMBOLO = { alto: '✖', medio: '▲', info: '•' };

export function resumo(medicao) {
  const fixoRaiz = medicao.fixos.reduce((s, f) => s + f.tokens, 0);
  const apps = medicao.apps.map((a) => ({ nome: a.relativo, instrucoes: a.instrucoes?.tokens ?? 0, sessao: contextoFixoDoApp(medicao, a), grafo: a.grafo?.nos ?? null }));
  const pior = apps.reduce((m, a) => (a.sessao > (m?.sessao ?? -1) ? a : m), null);
  return { fixoRaiz, apps, pior, agentes: medicao.agentes.length, skills: medicao.skills.length, guias: medicao.guias.length, comandos: medicao.comandos.length, regras: medicao.regrasCursor.length };
}

export function textoTerminal(medicao, achados) {
  const r = resumo(medicao);
  const l = [];
  l.push('风水  fengshui — diagnóstico da Dieta de Contexto', '');
  l.push('Contexto fixo (lido em toda sessão e relido a cada turno):');
  for (const f of medicao.fixos) l.push(`  ${String('~' + fmt(f.tokens)).padStart(9)}  ${f.arquivo}`);
  if (r.apps.length) {
    l.push('', 'Por app (instruções do app · sessão inteira num app · nós do grafo):');
    for (const a of r.apps) l.push(`  ${a.nome.padEnd(28)} ${String('~' + fmt(a.instrucoes)).padStart(8)}  ${String('~' + fmt(a.sessao)).padStart(8)}  ${a.grafo === null ? 'sem grafo' : fmt(a.grafo) + ' nós'}`);
  }
  l.push('', `Sob demanda: ${r.agentes} agentes, ${r.skills} skills, ${r.guias} guias, ${r.comandos} comandos, ${r.regras} regras do Cursor.`, '');
  if (!achados.length) l.push('✔ Nada a ajustar. O projeto está em dia com a Dieta de Contexto.');
  else {
    l.push(`${achados.length} achado(s):`);
    for (const a of achados) l.push(`  ${SIMBOLO[a.gravidade]} ${a.titulo}`, `      → ${a.oQueFazer}`);
  }
  return l.join('\n');
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Página HTML com a tabela, um gráfico de barras em escala (SVG) e os achados. `antes` opcional: outra medição para comparar. */
export function paginaHtml(medicao, achados, { titulo = 'Dieta de Contexto', antes = null } = {}) {
  const r = resumo(medicao);
  const linhas = [
    ...medicao.fixos.map((f) => ({ nome: f.arquivo.replace(/\\/g, '/').split('/').slice(-2).join('/'), agora: f.tokens })),
    ...medicao.apps.filter((a) => a.instrucoes).map((a) => ({ nome: `${a.relativo}/CLAUDE.md`, agora: a.instrucoes.tokens })),
  ];
  if (antes) {
    const mapa = new Map(antes.map((x) => [x.nome, x.tokens]));
    for (const x of linhas) x.antes = mapa.get(x.nome);
  }
  const max = Math.max(1000, ...linhas.map((x) => Math.max(x.agora, x.antes ?? 0)));
  const passo = max > 20000 ? 10000 : max > 5000 ? 2000 : 1000;
  const teto = Math.ceil(max / passo) * passo;
  const x0 = 260, larg = 600, alt = antes ? 52 : 34;
  const svg = [];
  for (let t = 0; t <= teto; t += passo) {
    const x = x0 + (t / teto) * larg;
    svg.push(`<line x1="${x}" x2="${x}" y1="8" y2="${16 + linhas.length * alt}" stroke="var(--linha)"/>`,
      `<text x="${x}" y="${32 + linhas.length * alt}" text-anchor="middle" class="eixo">${t === 0 ? '0' : fmt(t / 1000) + ' mil'}</text>`);
  }
  linhas.forEach((x, i) => {
    const y = 16 + i * alt;
    svg.push(`<text x="${x0 - 12}" y="${y + 17}" text-anchor="end" class="rot">${esc(x.nome)}</text>`);
    let yy = y + 4;
    if (antes && x.antes) {
      svg.push(`<rect x="${x0}" y="${yy}" width="${(x.antes / teto) * larg}" height="16" rx="3" fill="var(--antes)"/>`,
        `<text x="${x0 + (x.antes / teto) * larg + 6}" y="${yy + 12}" class="val">${fmt(x.antes)}</text>`);
      yy += 20;
    }
    svg.push(`<rect x="${x0}" y="${yy}" width="${(x.agora / teto) * larg}" height="16" rx="3" fill="var(--agora)"/>`,
      `<text x="${x0 + (x.agora / teto) * larg + 6}" y="${yy + 12}" class="val forte">${fmt(x.agora)}</text>`);
  });
  const altura = 44 + linhas.length * alt;
  const itens = achados.map((a) => `<li class="${a.gravidade}"><strong>${esc(a.titulo)}</strong><span>${esc(a.oQueFazer)}</span></li>`).join('');
  const pior = r.pior ? `<p class="destaque">Sessão num app (pior caso, <code>${esc(r.pior.nome)}</code>): <b>~${fmt(r.pior.sessao)} tokens</b> relidos a cada turno.</p>` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><style>
:root{--bg:#F5F7FA;--fg:#141A22;--mudo:#5A6473;--linha:#DCE2EA;--antes:#B7C1CE;--agora:#0B7A63;--alto:#B9470E;--medio:#9A6B00}
@media (prefers-color-scheme:dark){:root{--bg:#0E1217;--fg:#E5EAF1;--mudo:#98A3B2;--linha:#26303B;--antes:#3B4654;--agora:#3DD6AC;--alto:#F49A5E;--medio:#E8C15A;color-scheme:dark}}
body{background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,"Segoe UI",sans-serif;margin:0}
main{max-width:960px;margin:0 auto;padding:40px max(16px,env(safe-area-inset-left))}
h1{font-size:2rem;margin:0 0 4px}h2{margin:36px 0 10px}.mudo{color:var(--mudo)}
.caixa{overflow-x:auto;border:1px solid var(--linha);border-radius:12px;padding:16px}
svg{display:block;width:100%;min-width:560px;height:auto}.rot{fill:var(--fg);font-size:13px}.eixo,.val{fill:var(--mudo);font:12px ui-monospace,Consolas,monospace}.forte{fill:var(--agora);font-weight:600}
ul{list-style:none;padding:0;display:grid;gap:10px}li{border-left:4px solid var(--medio);padding:6px 12px;display:grid;gap:2px}li.alto{border-color:var(--alto)}li span{color:var(--mudo)}
.destaque{font-size:1.1rem}code{font-family:ui-monospace,Consolas,monospace}
</style></head><body><main>
<p class="mudo">风水 fengshui · ${new Date().toLocaleDateString('pt-BR')}</p><h1>${esc(titulo)}</h1>
<p class="mudo">O que os agentes de IA carregam antes de fazer qualquer coisa. Tokens aproximados (caracteres ÷ 3,5).</p>
${pior}
<h2>Contexto fixo por arquivo</h2>
<div class="caixa"><svg viewBox="0 0 900 ${altura}" role="img" aria-label="Tokens por arquivo">${svg.join('')}</svg></div>
<h2>${achados.length ? achados.length + ' achado(s)' : 'Nada a ajustar'}</h2>
<ul>${itens}</ul>
<p class="mudo">Sob demanda: ${r.agentes} agentes, ${r.skills} skills, ${r.guias} guias, ${r.comandos} comandos, ${r.regras} regras do Cursor.</p>
</main></body></html>`;
}
