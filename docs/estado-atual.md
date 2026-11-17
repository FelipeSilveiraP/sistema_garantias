# Estado atual

> Máximo 30 linhas. **Reescreva** este arquivo a cada entrega (sem histórico — decisões vão em `decisoes.md`).

**Atualizado em:** 2026-11-17 — **1.4.x** na `main`; instalador gerado pelo GitHub em **Releases** a cada envio (versão automática); o sistema se atualiza sozinho pelo GitHub (botão ATUALIZAR)

## Situação
- Projeto irmão do Sistema de Contas a Pagar (Electron + TS puro + Spring Boot 3.5/Java 21 + SQLite WAL), substitui a planilha `GARANTIAS-AAAA.xlsm`.
- **1.4.0 = auditoria de segurança** (relatório para leigos em `docs/seguranca.md`): limite real de 5 PINs (antes, em paralelo, passava), bloqueio que dobra, "Esqueci o PIN" com limite de e-mails, tamanho máximo das requisições, foto e planilha conferidas pelo conteúdo, limites contra zip bomb, backup do Drive que só apaga as próprias planilhas, banco **v7** (limites de tamanho + auditoria de itens, contas e configurações).
- Dependências atualizadas: Spring Boot 3.5.16 (Tomcat 10.1.59, Jackson 2.21.7), sqlite-jdbc 3.54.1.0, Electron 44.10.1, esbuild 0.28.2.
- **CI no GitHub** (`.github/workflows/testes.yml`): testes no Windows + segurança (npm audit, OSV-Scanner, SpotBugs/FindSecBugs, Semgrep) + CodeQL; a cada envio e toda segunda.
- Versão 1.3.3 (instalada na loja): vários produtos por garantia (banco v6 `garantia_itens`), cadastro na vertical. Versões anteriores: ver `decisoes.md`.
- **CUPOM FISCAL AUTOMÁTICO NO RM (2026-11-17, banco v8):** ao salvar a garantia o cupom sai sozinho no PDV do RM (produto pelo NOME NO RM, dinheiro, NFC-e, impressão na DARUMA); problema = pop-up para fazer à mão. Login só na página do RM, uma vez. Ver `decisoes.md`.
- **Testes na nuvem (2026-11-17):** JUnit 79 (78 ok, 1 pulado) · máscaras 74 · filtros 22 · automações 39 · RM falso 6 + ponta a ponta 12/12 · persistência 11/11 · smoke 102/105 no Linux (as 3 falhas de layout são iguais na versão anterior).
- **Não abre sozinho com o Windows** (desde a 1.4.6): o instalador e o próprio sistema apagam o cadastro de inicialização das versões antigas.

## Próximos passos
- Instalar na loja a 1ª versão baixada de Releases (depois disso as próximas chegam pelo botão ATUALIZAR).
- Assinar o `versao.json` das atualizações pelo Drive (risco médio, `docs/seguranca.md` §6).
- electron-builder 25 → 26 (só ferramentas de build) com teste do instalador no Windows.
- Cupom no RM: 1ª emissão real com o usuário na loja; conferir na DARUMA o tamanho do cupom; mostrar o nº da NFC-e na Pesquisa.
- Adaptar do Contas a Pagar os testes `smoke-real`, `smoke-dev`, CRUD real, hambúrguer e layout.

## Pendências do usuário
- **Cupom no RM:** mandar a lista NOME NO RM de cada serviço/peça (só TROCA CARCAÇA vem preenchida); na 1ª abertura da versão nova, entrar no RM na janela que abrir (e-mail e senha, uma vez); conferir no RM se a NFC-e 262 (venda 279, contingência) ficou autorizada.
- Não compartilhar a pasta `Chaveiro Universal - Atualizacoes` do Drive; ativar verificação em duas etapas na conta Google da loja.
- Em CONTAS: gravar a senha de app do Google do e-mail da loja (sem ela, "Esqueci meu PIN" não funciona) e cadastrar as contas dos técnicos.
- Guardar uma cópia do arquivo `chave-garantias.key` (pasta de dados): sem ele, logins e e-mails cifrados ficam ilegíveis.
- Preencher os preços em ATUALIZAR PREÇOS e importar a planilha real por PESQUISAR GARANTIA → IMPORTAR PLANILHA ANTIGA.
