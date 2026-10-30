#!/usr/bin/env node
// 风水 fengshui — Dieta de Contexto: organiza o projeto para os agentes de IA gastarem menos tokens.
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { sistemaReal } from '../src/sistema.js';
import { diagnostico, init, grafos, preparar } from '../src/comandos.js';

const AJUDA = `风水 fengshui — Dieta de Contexto

Uso: fengshui <comando> [opções]   (ou: npx @i9up/fengshui <comando>)

  diagnostico   mede o contexto fixo (o que todo agente carrega a cada turno) e aponta o que enxugar
                  --html <arquivo>   salva também o relatório com gráfico
                  --teto <tokens>    teto por arquivo de instruções (padrão 5000)
  init          instala o graphify e cria a estrutura (.graphifyignore, .gitignore, hook pós-merge,
                docs/referencia, CLAUDE.md núcleo + índice). Mostra o plano e pergunta; nunca sobrescreve.
                  --sim              não pergunta
  grafos        refaz o grafo do código dos apps que mudaram (só parser, sem LLM) e o grafo geral
                  --todos            refaz todos
  preparar      o dia a dia: alinha os repositórios limpos, atualiza grafos, lista processos esquecidos
                  --horas <n>        idade mínima dos processos listados (padrão 3)

Opção comum: --pasta <dir>  (padrão: a pasta atual)`;

function opcao(args, nome, padrao = '') {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : padrao;
}

async function principal(args) {
  const comando = args[0] ?? 'ajuda';
  const raiz = path.resolve(opcao(args, '--pasta', process.cwd()));
  switch (comando) {
    case 'diagnostico':
    case 'diagnóstico':
      return diagnostico(raiz, sistemaReal, { html: opcao(args, '--html'), teto: opcao(args, '--teto') ? Number(opcao(args, '--teto')) : undefined });
    case 'init': {
      const rl = readline.createInterface({ input: stdin, output: stdout });
      try { return await init(raiz, sistemaReal, { sim: args.includes('--sim'), perguntar: (q) => rl.question(q) }); }
      finally { rl.close(); }
    }
    case 'grafos':
      return grafos(raiz, sistemaReal, { todos: args.includes('--todos') });
    case 'preparar':
      return preparar(raiz, sistemaReal, { horas: Number(opcao(args, '--horas', '3')) });
    default:
      return { codigo: comando === 'ajuda' || comando === '--help' || comando === '-h' ? 0 : 1, texto: AJUDA };
  }
}

const r = await principal(process.argv.slice(2));
console.log(r.texto);
process.exitCode = r.codigo;
