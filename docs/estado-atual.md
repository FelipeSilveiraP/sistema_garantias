# Estado atual

> Máximo 30 linhas. **Reescreva** este arquivo a cada entrega (sem histórico — decisões vão em `decisoes.md`).

**Atualizado em:** 2026-11-15 — 1.3.3 instalada no PC de desenvolvimento; branch `main`, enviada para https://github.com/FelipeSilveiraP/sistema_garantias (público)

## Situação
- Projeto irmão do Sistema de Contas a Pagar, com a mesma base (Electron + TS puro + Spring Boot 3.3/Java 21 + SQLite WAL), para substituir a planilha `GARANTIAS-AAAA.xlsm`.
- Versão **1.3.3** (instalada; JUnit 40 verdes no instalador; testes de tela não rodados, a pedido do usuário): vários produtos por garantia (linhas com +, banco v6 `garantia_itens`), cadastro na vertical, seta em todas as caixas, tabela da Pesquisar vermelha. Versão **1.3.2** (testes de tela não rodados, a pedido do usuário; só os do servidor, dentro do instalador): cadastro com setas nos selects, modelo OUTRO e observação na linha; barra com cores/hover corretos e um botão só para a conta; CONTROLE no lugar de Atualização e Estatística; reajuste em % ou R$. Na 1.3.1: o login é o e-mail (qualquer e-mail válido) e o código de "Esqueci o PIN" vai para o e-mail da conta e para o da loja. Na 1.3.0: placa (antiga ou Mercosul) e CPF (dígitos verificadores) validados pelo próprio sistema na tela (avisa enquanto digita), no servidor e no banco; pop-ups neobrutalistas GARANTIA SALVA / CONFIRA OS DADOS / NÃO FOI POSSÍVEL SALVAR; serviço OUTRO no lugar da caixa, com botão para voltar à lista; observação atrás de uma seta (hover ou clique); chave 3D em pé girando na tela de carregamento. Na 1.2.0: contas com PIN, admin e tela CONTAS. Na 1.1.0: "Quem está usando?", Menu de 3 botões e Controle (Técnicos, Veículos, Tabela de valores).
- Esquema SQLite **v6** (v6: `garantia_itens` e combos desativados; v5: gatilhos de placa/CPF/data futura + auditoria de técnicos e veículos; v4: usuários; v3: marcas/veículos; v2: `criado_por`; v1: esquema, listas do VBA, gatilhos e auditoria). Atualização v4 → v5 testada com um banco criado pela versão anterior.
- Planilha real (cópia de 2026) importada com sucesso em teste: 32 garantias.
- **Testes (2026-11-15), todos verdes:** JUnit 39 · máscaras 74 · filtros 22 · automações 26 · smoke 85 · smoke-boot 2 ciclos (25/25 e 23/23; na 1ª rodada o ciclo 2 reprovou porque a tela de carregamento saiu durante a captura, e o teste foi corrigido) · persistência 11 (a 1ª rodada falhou com erro 500 no cadastro e não se repetiu em 3 rodadas nem no teste de atualização v4 → v5).

## Próximos passos
- Automação do cupom fiscal no SAT web da RM Software (`app.rmsoftware.dev.br`): estrutura pronta (`codigo_cupom`, `cupom_status`, `cupom_lancado_em`, `PUT /api/garantias/{id}/cupom`).
- Adaptar do Contas a Pagar os testes `smoke-real`, `smoke-dev` (regressão do bug de foco), CRUD real, hambúrguer e layout.
- Agrupar nos gráficos os nomes de serviço da planilha antiga (ex.: "01 TROCA DE CARCAÇA" e "TROCA CARCAÇA").

## Pendências do usuário
- Em CONTAS: gravar a senha de app do Google do e-mail da loja (o e-mail já vem da criação do admin) (sem isso, "Esqueci meu PIN" não funciona) e cadastrar as contas dos técnicos.
- Guardar uma cópia do arquivo `chave-garantias.key` (pasta de dados): sem ele, logins e e-mails cifrados ficam ilegíveis.
- Preencher os preços dos serviços em ATUALIZAR PREÇOS (começam em R$ 0,00; só PILHA e BOTÃO vieram do VBA).
- Importar a planilha real da loja por PESQUISAR GARANTIA → IMPORTAR PLANILHA ANTIGA.
- Drive: criar e compartilhar a pasta `Chaveiro Universal - Atualizacoes Garantias` antes de publicar atualizações.
