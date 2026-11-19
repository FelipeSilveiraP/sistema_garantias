# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Projeto: **Sistema de Garantias — Chaveiro Universal** — app desktop 100% offline (Electron + TypeScript puro + Spring Boot 3.3/Java 21 + SQLite WAL) que substitui a planilha Excel/VBA `GARANTIAS-AAAA.xlsm`. É o **projeto irmão** do Sistema de Contas a Pagar (`C:\contas_pagar_chaveiro_universal_BACKUP`), com a mesma arquitetura, o mesmo design neobrutalista e a mesma integração com o Google Drive. Código, comentários, commits e UI são em português.

`AGENTS.md` contém as regras permanentes (segurança, banco operacional, git, testes obrigatórios, skills) — siga-o. As skills ficam em `.claude/skills/` (escritas para o Contas a Pagar; as regras gerais valem aqui). No início de uma tarefa leia `docs/estado-atual.md` e consulte `docs/decisoes.md`; ao concluir uma entrega reescreva `estado-atual.md` (máx. 30 linhas) e acrescente as decisões novas em `decisoes.md`.

## Comandos

```bash
npm install                       # deps de frontend/desktop
mvn -f backend/pom.xml package    # gera backend/target/garantias-backend-0.1.0.jar (o Electron executa este jar)
npm run dev                       # typecheck + Tailwind + esbuild, depois abre o Electron
npm run app                       # abre o Electron sem rebuild do frontend
npm run typecheck                 # tsc --noEmit (strict)
npm run build                     # typecheck + build:css + build:ts -> frontend/dist/
```

Testes (obrigatórios antes de concluir uma entrega — ver AGENTS.md §4):

```bash
mvn -f backend/pom.xml test                            # JUnit 5 + MockMvc (inclui a importacao da planilha real, se existir na maquina)
mvn -f backend/pom.xml test -Dtest=GarantiaServiceTest  # uma classe
npx electron desktop/smoke.js            # todas as telas com banco/Downloads temporarios; capturas em docs/responsivo/
npx electron desktop/smoke-boot.js       # tempos de boot + clique/digitacao reais (nao usar a maquina enquanto roda)
node desktop/teste-persistencia.js       # cold start: dados sobrevivem ao reinicio do backend
npm run test:frontend                    # mascaras + filtros + automacoes (sem Electron)
mvn -f backend/pom.xml -P seguranca -DskipTests package spotbugs:check   # SpotBugs + Find Security Bugs (ver docs/seguranca.md)
npm run instalador                       # instalador Windows com Java embutido (ver docs/instalacao.md)
npm run publicar -- "novidades"          # poe o instalador na pasta de atualizacoes do Google Drive
python instalador/gerar-icone.py         # regera o emblema (chave amarela)
```

## Arquitetura

Igual à do Contas a Pagar (detalhes no `CLAUDE.md` de lá):
- **Electron (`desktop/main.js`)**: porta livre + token por execução, `spawn` do jar, tela de carregamento até o backend ficar pronto, instância única. Navegação validada contra o `Map TELAS` — **tela nova precisa ser registrada em `TELAS`** e ganhar um `case` em `frontend/ts/main.ts`.
- **Frontend (`frontend/`)**: multi-página, `html/<tela>.html` + `ts/telas/<tela>.ts`. Telas: `menu` (3 botões), `cadastrar-garantia`, `pesquisar-garantias`, `estatisticas` (submenu gerado por `submenus-config.ts`), `graficos`, `atualizar-precos`. Diálogos só por `dialogos.ts` (nunca `alert/confirm`; `avisar()` = pop-up de um botão nos tons sucesso/erro/atenção); DOM só por `createElement`/`textContent`.
- **Backend (`backend/`, pacote `com.chaveiro`)**: `api/*Controller` → `service/*Service` → `repository/*Repository` (JDBC puro) → SQLite. Rotas: `/api/garantias` (+ `/{id}/cupom`), `/api/servicos` (+ `/reajuste`), `/api/listas/{tecnicos|modelos}`, `/api/estatisticas`, `/api/legado/importar`, `/api/status`, `/api/backup-drive`.
- **Banco**: `%LOCALAPPDATA%\ChaveiroUniversal\Garantias\garantias.db` (ou `FINDESK_DB_PATH`). Migrações em `database/DatabaseInitializer` (v1 = esquema + listas iniciais do VBA + gatilhos + auditoria; v5 = gatilhos de placa/CPF/data futura + auditoria de técnicos e veículos; v7 = limites de tamanho + auditoria de itens, contas e configurações). `ConnectionFactory.emTransacao` para gravações de várias etapas; transações `IMMEDIATE`.

## Regras de domínio (do VBA `frmControleGarantias` V17.1)

- Placa: antiga (ABC1234) ou Mercosul (ABC1D23), sem traço/espaço. **Sem placa** exige CPF válido (11 dígitos + 2 verificadores; a placa fica nula). Regra própria, sem consulta externa, em 3 camadas: tela (`mascaras.ts` `placaValida`/`cpfValido`, avisa enquanto digita), servidor (`GarantiaService`) e banco (gatilhos v5; linhas `LEGADO` ficam como vieram).
- Produtos em linhas (botão +, até 10): cada um da tabela de preços (`servicos`) ou "OUTRO" (descrição), com quantidade de 1 a 5; ficam em `garantia_itens` e a garantia guarda o resumo em texto, as quantidades e o código do cupom unido por "_" (`GarantiaService.cadastrarComItens`). PILHA (R$ 12) e BOTÃO (R$ 15) são **peças**: o preço delas soma ao serviço e divide o valor no cupom fiscal (regra do SAT do VBA).
- Mesma placa (ou CPF) + mesmo dia + mesmo serviço = possível duplicidade: pede confirmação (`forcar`).
- Técnicos, modelos e serviços são editáveis (no VBA eram fixos no código); excluir da lista não altera garantias antigas (o nome fica gravado como texto).
- Cupom fiscal automático no PDV web da RM Software (`app.rmsoftware.dev.br`): ao salvar a garantia, `desktop/rm.js` (janela escondida do RM, login feito só na página do RM) pesquisa cada produto pelo **NOME NO RM** (nunca pelo código), venda em dinheiro e pede ao RM para emitir a NFC-e (o sistema não monta nem imprime: aperta o botão CUPOM do próprio RM em ÚLTIMAS VENDAS, e o RM abre a janela de impressão dele); pop-up da automação com CANCELAR; falhou 2 vezes = pop-up para fazer à mão. Servidor: `CupomService` (pedido + valores pela regra do SAT do VBA) e `/api/garantias/{id}/cupom-rm`. Detalhes em `docs/decisoes.md` (2026-11-17). Teste: `npx electron desktop/teste-rm-electron.js` (RM falso).
- Legado: a planilha antiga entra por **IMPORTAR PLANILHA ANTIGA** (Pesquisar Garantia) → `legado_garantias` (linha como estava) + garantia `origem = LEGADO`. Reimportar o mesmo arquivo não duplica.
- Não existe "virada de ano": é um banco só, filtrado por data.

## REGRA PERMANENTE — documentos fiscais (usuário, 2026-11-19)

**NUNCA gerar, desenhar, montar, formatar ou imprimir nota fiscal, cupom fiscal, DANFE ou qualquer documento fiscal.** Os nossos sistemas só MANDAM A REQUISIÇÃO ao sistema fiscal de fora (ex.: RM Software): produto, quantidade, valor e forma de pagamento. Emitir o documento, desenhar e imprimir é tarefa EXCLUSIVA desse sistema. Nada de HTML de cupom, QR Code próprio, impressão silenciosa na impressora fiscal ou "cópia" do layout. A impressão é sempre a DO SISTEMA DE FORA: o nosso sistema pode, no máximo, apertar o botão de imprimir do próprio sistema de fora (ex.: botão CUPOM em ÚLTIMAS VENDAS do PDV do RM), que monta o cupom e abre a janela de impressão dele — nunca imprimir em silêncio nem montar o cupom. (Motivo: em 2026-11-19 o Garantias imprimiu um cupom desenhado por ele mesmo na DARUMA, diferente e incompleto em relação ao do RM.)
