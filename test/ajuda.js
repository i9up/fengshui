// Utilitários dos testes: projeto temporário e sistema falso (git/graphify/processos sob controle).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function projeto(arquivos = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'fengshui-'));
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    const p = path.join(raiz, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, conteudo, 'utf8');
  }
  return raiz;
}

export const grande = (tokens) => 'x'.repeat(Math.round(tokens * 3.5));

/** Sistema falso: `respostas` mapeia "comando arg0 arg1..." (prefixo) → { codigo, saida, erro } ou função. */
export function sistemaFalso(respostas = {}, plataforma = 'linux') {
  const chamadas = [];
  return {
    chamadas,
    plataforma,
    existe: (p) => fs.existsSync(p),
    rodar(cmd, args = [], opts = {}) {
      const linha = [cmd, ...args].join(' ');
      chamadas.push({ linha, opts });
      const chave = Object.keys(respostas).filter((k) => linha.startsWith(k)).sort((a, b) => b.length - a.length)[0];
      const r = chave === undefined ? { codigo: 1, saida: '', erro: 'sem resposta' } : respostas[chave];
      const v = typeof r === 'function' ? r(linha, opts) : r;
      return { codigo: 0, saida: '', erro: '', ...v };
    },
  };
}
