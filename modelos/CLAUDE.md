# <Nome do projeto>

<Uma ou duas frases: o que é o projeto e para quem.> Este arquivo é lido em **toda** sessão: fica só o que vale
sempre. O resto está no índice abaixo e é lido **só quando o assunto aparecer** (Dieta de Contexto).

## Antes de qualquer ação

1. <Onde está o estado atual do trabalho (um arquivo curto).>
2. **Para achar código, use o grafo** (seção abaixo) antes de listar pastas, fazer grep ou abrir arquivos.

## Regras obrigatórias

- <Branches e PRs.>
- <Testes: o que rodar durante o trabalho (só o que tocou) e no fim (a suíte inteira, uma vez).>
- <O que nunca fazer sem pedir.>

## Índice — leia só quando o assunto aparecer

| Assunto | Arquivo |
|---|---|
| <Armadilhas da tecnologia X> | `docs/referencia/<x>.md` |
| <Infra, deploy, produção> | `docs/referencia/infra.md` |

## Grafo do código (graphify) — consulte antes de abrir arquivos

- Gerar/atualizar (só parser, **sem LLM**): `npx @i9up/fengshui grafos`. Atualiza sozinho depois de merge/pull.
- Na pasta do app: `graphify query "<NomeDoCodigo> <OutroNome>" --budget 1500` (**nomes do código**, não frases) e
  `graphify explain "Simbolo()"` (só as conexões diretas). Abra só os arquivos e linhas apontados.
- `/graphify` com LLM só com pedido explícito (gasta tokens).
