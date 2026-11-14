# Estado atual

> Máximo 30 linhas. **Reescreva** este arquivo a cada entrega (sem histórico — decisões vão em `decisoes.md`).

**Atualizado em:** 2026-11-14 — branch `main`

## Situação
- Projeto irmão do Sistema de Contas a Pagar, criado a partir da mesma base (Electron + TS puro + Spring Boot 3.3/Java 21 + SQLite WAL), para substituir a planilha `GARANTIAS-AAAA.xlsm`.
- Versão **1.0.0**: Menu com 3 botões; Cadastrar Garantia; Pesquisar Garantia (pesquisa, filtros, edição, cupom, impressão, importar planilha antiga); Estatística e Atualizações → Gráficos e Atualizar Preços (tabela de preços, reajuste, técnicos e modelos).
- Esquema SQLite **v1**: `garantias`, `servicos` (tabela de preços), `tecnicos`, `modelos`, `legado_garantias`, `manutencao`, `auditoria_operacoes` + gatilhos de segurança.
- Planilha real (cópia de 2026) importada com sucesso em teste: 32 garantias.
- Emblema: chave amarela sem fundo (`instalador/gerar-icone.py`).
- **Testes (2026-11-14), todos verdes:** JUnit 25 · máscaras 65 · filtros 22 · automações 26 · smoke 34 · smoke-boot 2 ciclos · persistência 11.

## Próximos passos
- Automação do cupom fiscal no SAT web da RM Software (`app.rmsoftware.dev.br`): a estrutura está pronta (`codigo_cupom`, `cupom_status`, `cupom_lancado_em`, rota `PUT /api/garantias/{id}/cupom`).
- Adaptar do Contas a Pagar os testes `smoke-real`, `smoke-dev` (regressão do bug de foco), CRUD real, hambúrguer e layout.
- Agrupar nos gráficos os nomes de serviço da planilha antiga (ex.: "01 TROCA DE CARCAÇA" e "TROCA CARCAÇA").

## Pendências do usuário
- Preencher os preços dos serviços em ATUALIZAR PREÇOS (começam em R$ 0,00; só PILHA e BOTÃO vieram do VBA).
- Importar a planilha real da loja por PESQUISAR GARANTIA → IMPORTAR PLANILHA ANTIGA.
- Drive: criar e compartilhar a pasta `Chaveiro Universal - Atualizacoes Garantias` (mesmo passo a passo do Contas a Pagar) antes de publicar atualizações.
