# Estado atual

> Máximo 30 linhas. **Reescreva** este arquivo a cada entrega (sem histórico — decisões vão em `decisoes.md`).

**Atualizado em:** 2026-11-23 — **1.4.x** na `main`; instalador gerado pelo GitHub em **Releases** a cada envio (versão automática); o sistema se atualiza sozinho pelo GitHub (botão ATUALIZAR)

## Situação
- Projeto irmão do Sistema de Contas a Pagar (Electron + TS puro + Spring Boot 3.5/Java 21 + SQLite WAL), substitui a planilha `GARANTIAS-AAAA.xlsm`.
- **1.4.0 = auditoria de segurança** (relatório para leigos em `docs/seguranca.md`): limite real de 5 PINs (antes, em paralelo, passava), bloqueio que dobra, "Esqueci o PIN" com limite de e-mails, tamanho máximo das requisições, foto e planilha conferidas pelo conteúdo, limites contra zip bomb, backup do Drive que só apaga as próprias planilhas, banco **v7** (limites de tamanho + auditoria de itens, contas e configurações).
- **CI no GitHub** (`.github/workflows/testes.yml`): testes no Windows + segurança (npm audit, OSV-Scanner, SpotBugs/FindSecBugs, Semgrep) + CodeQL; a cada envio e toda segunda.
- **CUPOM FISCAL AUTOMÁTICO NO RM (2026-11-17, banco v8):** ao salvar a garantia o cupom sai sozinho no PDV do RM (produto pelo NOME NO RM, dinheiro, NFC-e, impressão na DARUMA); problema = pop-up para fazer à mão. Login só na página do RM, uma vez. Ver `decisoes.md`.
- **Não abre sozinho com o Windows** (desde a 1.4.6): o instalador e o próprio sistema apagam o cadastro de inicialização das versões antigas.

- **O QUE MUDOU (2026-11-23):** depois de cada atualização o Menu mostra o que foi feito (lista dos commits feat/fix). Cupom do RM funcionando na loja (confirmado pelo usuário).

- **Banco v10 (2026-11-23):** revisão de gatilhos, auditoria completa e transações do PIN (ver `decisoes.md`).

## Próximos passos
- **Sincronizar com o RM (pedido 2026-11-23):** clientes e produtos nos dois sentidos — aguardando as respostas do usuário (ver conversa).
- Instalar na loja a 1ª versão baixada de Releases (depois disso as próximas chegam pelo botão ATUALIZAR).
- Assinar o `versao.json` das atualizações pelo Drive (risco médio, `docs/seguranca.md` §6).
- electron-builder 25 → 26 (só ferramentas de build) com teste do instalador no Windows.
- **Cupom do RM (2026-11-19):** o modo quiosque saía em folha A4 (padrão do Electron); agora usa a folha da impressora, igual ao Chrome. Falta conferir: PDF do sistema × PDF do Chrome da mesma venda (`docs/desenvolvimento-no-pc.md`) e um cupom na DARUMA da loja; mostrar o nº da NFC-e na Pesquisa.

## Pendências do usuário
- **Cupom no RM:** mandar a lista NOME NO RM de cada serviço/peça (só TROCA CARCAÇA vem preenchida); na 1ª abertura da versão nova, entrar no RM na janela que abrir (e-mail e senha, uma vez); conferir no RM se a NFC-e 262 (venda 279, contingência) ficou autorizada.
- Não compartilhar a pasta `Chaveiro Universal - Atualizacoes` do Drive; ativar verificação em duas etapas na conta Google da loja.
- Em CONTAS: gravar a senha de app do Google do e-mail da loja (sem ela, "Esqueci meu PIN" não funciona) e cadastrar as contas dos técnicos.
- Guardar uma cópia do arquivo `chave-garantias.key` (pasta de dados): sem ele, logins e e-mails cifrados ficam ilegíveis.
- Preencher os preços em ATUALIZAR PREÇOS e importar a planilha real por PESQUISAR GARANTIA → IMPORTAR PLANILHA ANTIGA.
