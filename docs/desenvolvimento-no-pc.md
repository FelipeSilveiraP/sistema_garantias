# Desenvolver no computador pessoal (sem a Daruma)

## Preparar (uma vez)
1. Instale: **Node 20+**, **Java 21 (JDK)**, **Maven**, **Git**.
2. `git clone https://github.com/FelipeSilveiraP/sistema_garantias.git` e entre na pasta.
3. `npm install`
4. `mvn -f backend/pom.xml package -DskipTests` (gera `backend/target/garantias-backend-0.1.0.jar`)
5. `npm run dev` (compila a tela e abre o sistema). O banco do desenvolvimento fica em `%LOCALAPPDATA%\ChaveiroUniversal\Garantias`; para um banco só de teste, defina antes `FINDESK_DB_PATH=C:\teste\garantias.db`.

## Impressora: "Salvar como PDF" no lugar da Daruma
O cupom é sempre o do RM; só muda a impressora de destino. Abra `%LOCALAPPDATA%\ChaveiroUniversal\Garantias\configuracoes.json` e deixe:

```json
{ "impressoraCupom": "Microsoft Print to PDF" }
```

O Windows pede o nome do arquivo PDF a cada cupom (é o "Salvar como PDF"). Para voltar à loja, troque por `"Daruma DR700"` (padrão). **Nunca** deixe `Microsoft Print to PDF` no computador da loja.

## RM
- Na primeira abertura a janela do RM aparece: entre com o e-mail e a senha do RM (o sistema não guarda a senha).
- Para NÃO emitir nota de verdade durante o desenvolvimento use `"cupomAutomaticoRm": false` no mesmo arquivo (o cupom volta a ser feito à mão) ou o botão PARAR TUDO. Com o RM ligado, cada garantia emite uma NFC-e de verdade.

## Testes
`npm run test:frontend`, `npx electron desktop/teste-rm-electron.js` (RM falso, sem nota de verdade), `npx electron desktop/smoke.js`, `mvn -f backend/pom.xml test`.

## Conferir o cupom (sistema = Chrome, mesma venda)
Gera NFC-e de verdade: combine antes a venda de teste.
1. Com `"impressoraCupom": "Microsoft Print to PDF"`, salve a garantia de teste; o Windows pede o nome: `sistema.pdf`.
2. No Chrome, entre no RM → PDV → ÚLTIMAS VENDAS → botão CUPOM da MESMA venda → destino "Microsoft Print to PDF", margens Nenhuma, sem cabeçalhos e rodapés → `chrome.pdf`.
3. Abra os dois lado a lado: mesmo tamanho de folha (Propriedades do PDF), mesma largura do cupom (72 mm, no canto esquerdo), mesmas linhas (inclusive "Não permite aproveitamento de crédito de ICMS", "Valor dos produtos", QR Code e protocolo). Na loja, a folha é a bobina da Daruma nos dois.
