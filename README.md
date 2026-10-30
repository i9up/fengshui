# 风水 fengshui — Dieta de Contexto

> *Feng shui* (风水, "vento e água", fala-se **fâng-shuêi**) é a arte chinesa de arrumar o espaço para a energia
> fluir. Aqui o espaço é o seu projeto, e a energia são os tokens dos agentes de IA (Claude, Cursor, Codex):
> cada coisa no lugar certo, o que é usado sempre à mão, o resto guardado mas fácil de achar.

[![npm](https://img.shields.io/npm/v/@i9up/fengshui)](https://www.npmjs.com/package/@i9up/fengshui) — Node 20+, sem dependências.

```bash
npx @i9up/fengshui diagnostico      # mede o que os agentes carregam a cada turno e diz o que enxugar
npx @i9up/fengshui init             # instala o graphify e a estrutura (pergunta antes; nunca sobrescreve)
npx @i9up/fengshui grafos           # atualiza o mapa do código (só parser, sem LLM, sem custo)
npx @i9up/fengshui preparar         # o dia a dia: repositórios em dia, grafos, processos esquecidos
```

## Por que

Num projeto real (Pontoix: ERP, PDV e APIs fiscais, 9 apps), os agentes rodavam **130 a 180 turnos** por tarefa e
reliam **18 a 34 milhões de tokens** de contexto em cada uma. O vilão não era o código: eram os arquivos de instrução
lidos em toda sessão e **relidos a cada turno**.

| O que todo agente carregava | Antes | Depois |
|---|---|---|
| Instruções gerais (Claude) | ~5.300 tokens | ~1.700 |
| Instruções gerais (Cursor/Codex) | ~3.000 | ~1.600 |
| Índice da memória | ~2.300 | ~1.400 |
| Instruções da API do ERP/PDV | ~27.200 | ~3.700 |
| Instruções da API fiscal | ~16.900 | ~4.600 |

Uma tarefa na API do ERP/PDV passou de **~35 mil para ~6,8 mil tokens fixos por turno (−80%)**. Em 150 turnos,
de ~5,2 milhões para ~1 milhão relidos.

## A Dieta de Contexto, em 4 regras

1. **Contexto fixo × turnos.** Um arquivo de instruções grande custa pouco uma vez e muito em 150 turnos. É ali
   que está a conta: meça antes de mexer.
2. **Índice, não enciclopédia.** O arquivo lido sempre (`CLAUDE.md`, `AGENTS.md`) fica só com o núcleo que vale
   em toda tarefa e um índice "assunto → arquivo". O detalhe vai para `docs/referencia/` (do projeto) e
   `<app>/docs/contexto/funcionalidades.md` (de cada app) e só entra quando a tarefa pede.
3. **Mapa antes de busca.** Um grafo do código barato e atualizado (graphify, só parser) poupa a fase de explorar
   pastas, onde os turnos se multiplicam. Pergunte com **nomes do código** (`TNFSeController Emitir`), não com
   frases: frase casa palavra solta e devolve lixo.
4. **Limite não é falha.** Agente que bateu no limite de uso não é relançado nem trocado por outro também
   esgotado: espera o horário de volta. (No Pontoix isso virou um disjuntor no despachante de tarefas.)

## O que cada comando faz

**`diagnostico`** — mede o contexto fixo (instruções da raiz e de cada app, índice da memória do Claude, regras do
Cursor sempre ativas, descrições de agentes e skills) e aponta:
- arquivo lido sempre acima do teto (padrão 5.000 tokens): deixe só o núcleo e um índice;
- skills e comandos com o mesmo conteúdo (a descrição repetida entra em toda sessão);
- hook que marca o grafo a cada edição (alimentava extração com LLM; não precisa mais);
- app sem grafo, com grafo desatualizado ou sem `.graphifyignore`;
- regra do Cursor sempre ativa e grande.

`--html relatorio.html` gera a página com gráfico; `--teto 4000` muda o teto.

**`init`** — mostra o plano e pergunta (`--sim` pula a pergunta). Cria só o que falta:
- instala o graphify (pacote Python `graphifyy`, via uv, pipx ou pip);
- `.graphifyignore` em cada app (testes, docs, scripts e saídas de mutação fora do grafo);
- `graphify-out/` no `.gitignore` (o grafo é gerado na máquina, não vai para o git);
- hook `post-merge` do git que atualiza o grafo sozinho, em segundo plano;
- `docs/referencia/README.md` e, se não houver, um `CLAUDE.md` no formato núcleo + índice.

**`grafos`** — refaz o grafo só dos apps que mudaram desde o último (`--todos` refaz todos) e junta o grafo geral
em `graphify-out/monorepo-graph.json` quando há mais de um app.

**`preparar`** — alinha com o remoto os repositórios **limpos** (alteração sem commit nunca é tocada), atualiza os
grafos, lista processos de teste/servidor esquecidos há horas (só lista; encerrar é com você) e resume o diagnóstico.

## Configuração (opcional)

`fengshui.json` na raiz:

```json
{ "teto": 5000, "ignorarApps": ["apps/clone-antigo"] }
```

Apps são as subpastas de `apps/`, `packages/` e `services/` com cara de projeto (`package.json`, `go.mod`,
`.dpr`, `.csproj`, `CLAUDE.md`…). Sem essas pastas, a raiz é o app.

## Requisitos

Node 20+, git e Python (para o graphify; o `init` instala). Funciona no Windows, macOS e Linux.

---

Metodologia nascida no Pontoix (i9up), outubro de 2026. Licença MIT.
