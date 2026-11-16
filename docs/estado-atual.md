# Estado atual

> Máximo 30 linhas. **Reescreva** este arquivo a cada entrega (sem histórico — decisões vão em `decisoes.md`).

**Atualizado em:** 2026-11-16 — **1.4.x** na `main`; instalador gerado pelo GitHub em **Releases** a cada envio (versão automática); o sistema se atualiza sozinho pelo GitHub (botão ATUALIZAR)

## Situação
- Projeto irmão do Sistema de Contas a Pagar (Electron + TS puro + Spring Boot 3.5/Java 21 + SQLite WAL), substitui a planilha `GARANTIAS-AAAA.xlsm`.
- **1.4.0 = auditoria de segurança** (relatório para leigos em `docs/seguranca.md`): limite real de 5 PINs (antes, em paralelo, passava), bloqueio que dobra, "Esqueci o PIN" com limite de e-mails, tamanho máximo das requisições, foto e planilha conferidas pelo conteúdo, limites contra zip bomb, backup do Drive que só apaga as próprias planilhas, banco **v7** (limites de tamanho + auditoria de itens, contas e configurações).
- Dependências atualizadas: Spring Boot 3.5.16 (Tomcat 10.1.59, Jackson 2.21.7), sqlite-jdbc 3.54.1.0, Electron 44.10.1, esbuild 0.28.2.
- **CI no GitHub** (`.github/workflows/testes.yml`): testes no Windows + segurança (npm audit, OSV-Scanner, SpotBugs/FindSecBugs, Semgrep) + CodeQL; a cada envio e toda segunda.
- Versão 1.3.3 (instalada na loja): vários produtos por garantia (banco v6 `garantia_itens`), cadastro na vertical. Versões anteriores: ver `decisoes.md`.
- **Testes na nuvem (2026-11-15):** JUnit 68 (67 ok, 1 pulado: planilha real só existe no PC) · máscaras 74 · filtros 22 · automações 26 · persistência 11/11 · smoke 83/86 no Linux (as 3 falhas de layout são iguais na versão antiga) · smoke-boot só no Windows. **CI no GitHub (Windows): tudo verde** — JUnit, máscaras, smoke, persistência, smoke-boot, segurança e CodeQL.

## Próximos passos
- Instalar na loja a 1ª versão baixada de Releases (depois disso as próximas chegam pelo botão ATUALIZAR).
- Enter = botão de enviar em todos os formulários (`enter-envia.ts`); teste de atualização sem perda (`AtualizacaoSemPerdaTest`).
- Assinar o `versao.json` das atualizações pelo Drive (risco médio, `docs/seguranca.md` §6).
- electron-builder 25 → 26 (só ferramentas de build) com teste do instalador no Windows.
- Automação do cupom fiscal no SAT web da RM Software (estrutura pronta: `codigo_cupom`, `cupom_status`, `PUT /api/garantias/{id}/cupom`).
- Adaptar do Contas a Pagar os testes `smoke-real`, `smoke-dev`, CRUD real, hambúrguer e layout.

## Pendências do usuário
- Não compartilhar a pasta `Chaveiro Universal - Atualizacoes` do Drive; ativar verificação em duas etapas na conta Google da loja.
- Em CONTAS: gravar a senha de app do Google do e-mail da loja (sem ela, "Esqueci meu PIN" não funciona) e cadastrar as contas dos técnicos.
- Guardar uma cópia do arquivo `chave-garantias.key` (pasta de dados): sem ele, logins e e-mails cifrados ficam ilegíveis.
- Preencher os preços em ATUALIZAR PREÇOS e importar a planilha real por PESQUISAR GARANTIA → IMPORTAR PLANILHA ANTIGA.
