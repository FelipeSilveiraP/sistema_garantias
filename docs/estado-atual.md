# Estado atual

> Máximo 30 linhas. **Reescreva** este arquivo a cada entrega (sem histórico — decisões vão em `decisoes.md`).

**Atualizado em:** 2026-11-14 — branch `main`

## Situação
- Projeto irmão do Sistema de Contas a Pagar, criado a partir da mesma base (Electron + TS puro + Spring Boot 3.3/Java 21 + SQLite WAL), para substituir a planilha `GARANTIAS-AAAA.xlsm`.
- Versão **1.2.0**: contas com PIN (bolinhas com foto, primeiro admin, bloqueio, esqueci o PIN pelo Gmail), tela CONTAS (ícone na barra) só o admin administra; login/e-mail/PIN criptografados. Na 1.1.0: "Quem está usando?" (bolinhas dos técnicos, como na Netflix) antes do Menu; Menu com 3 botões quadrados (Cadastrar amarelo, Pesquisar vermelho, Atualização e Estatística verde) e topo centralizado; Controle (Técnicos, Veículos, Tabela de valores: cadastrar + todos); cadastro com selects de técnico e veículo e CPF travado até "carro sem placa".
- Esquema SQLite **v4** (v4: `usuarios`, `acessos_usuario`, `codigos_redefinicao`); antes: **v3** (v2: `criado_por`; v3: `marcas` + `veiculos` com 249 modelos de 28 marcas e FKs `id_tecnico`/`id_veiculo` com SET NULL): `garantias`, `servicos` (tabela de preços), `tecnicos`, `modelos`, `legado_garantias`, `manutencao`, `auditoria_operacoes` + gatilhos de segurança.
- Planilha real (cópia de 2026) importada com sucesso em teste: 32 garantias.
- Emblema: chave amarela sem fundo (`instalador/gerar-icone.py`).
- **Testes (2026-11-14), todos verdes:** JUnit 38 · máscaras 65 · filtros 22 · automações 26 · smoke 74 · smoke-boot 2 ciclos (24/24; uma rodada falhou no clique real da bolinha e passou nas duas seguintes) · persistência 11.

## Próximos passos
- Automação do cupom fiscal no SAT web da RM Software (`app.rmsoftware.dev.br`): a estrutura está pronta (`codigo_cupom`, `cupom_status`, `cupom_lancado_em`, rota `PUT /api/garantias/{id}/cupom`).
- Adaptar do Contas a Pagar os testes `smoke-real`, `smoke-dev` (regressão do bug de foco), CRUD real, hambúrguer e layout.
- Agrupar nos gráficos os nomes de serviço da planilha antiga (ex.: "01 TROCA DE CARCAÇA" e "TROCA CARCAÇA").

## Pendências do usuário
- Em CONTAS: gravar o Gmail da loja e a senha de app do Google (sem isso, "Esqueci meu PIN" não funciona) e cadastrar as contas dos técnicos.
- Guardar uma cópia do arquivo `chave-garantias.key` (pasta de dados): sem ele, logins e e-mails cifrados ficam ilegíveis.
- Preencher os preços dos serviços em ATUALIZAR PREÇOS (começam em R$ 0,00; só PILHA e BOTÃO vieram do VBA).
- Importar a planilha real da loja por PESQUISAR GARANTIA → IMPORTAR PLANILHA ANTIGA.
- Drive: criar e compartilhar a pasta `Chaveiro Universal - Atualizacoes Garantias` (mesmo passo a passo do Contas a Pagar) antes de publicar atualizações.
