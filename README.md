# Sistema de Garantias — Chaveiro Universal

Aplicativo desktop para Windows que substitui a planilha Excel/VBA `GARANTIAS-AAAA.xlsm`, usada no Chaveiro Universal para registrar as garantias dos serviços (troca de carcaça, pilha, botão, gaiola, cilindro e outros). Funciona **100% sem internet**, com a mesma interface neobrutalista de alto contraste do **Sistema de Contas a Pagar**, do qual é projeto irmão: mesma arquitetura, mesmo banco SQLite, mesmo backup no Google Drive e mesma atualização pelo Drive.

> **Status (novembro/2026):** versão **1.0.0**. Primeira entrega: cadastro, pesquisa e edição de garantias, gráficos, tabela de preços, listas editáveis, importação da planilha antiga e instalador próprio. A automação do cupom fiscal (SAT web) vem depois; a estrutura já está pronta.

---

## Funcionalidades

O Menu Principal tem **3 botões** (atalhos `1`, `2` e `3`) e mostra o resumo do dia. Uma barra de navegação global aparece em todas as telas internas.

| Botão | O que faz |
|---|---|
| **Cadastrar Garantia** | Formulário simples numa página só, com as regras do VBA: placa de 7 letras e números **ou** "carro sem placa" com o CPF do cliente; modelo (lista ou digitado); serviço da tabela de preços, que mostra só as quantidades que ele pede (carcaça, botão, pilha ou itens, de 1 a 5); "OUTRO" com descrição; valor **sugerido pela tabela de preços**; técnico; observação. Alerta de **garantia repetida** (mesma placa, mesmo dia, mesmo serviço). |
| **Pesquisar Garantia** | Como o Controle do Contas a Pagar: pesquisa livre (placa, CPF, modelo, serviço, técnico, data ou valor), filtros (este mês, este ano, todas, sem cupom), tabela com selos arredondados e área de edição ("Alterar um campo"), situação do **cupom fiscal**, impressão do comprovante e da lista, exclusão. Tem o botão **IMPORTAR PLANILHA ANTIGA**. |
| **Estatística e Atualizações** | Leva a dois botões: **Gráficos** (garantias e valor do período, garantias por mês, serviços mais feitos, por técnico e modelos mais atendidos) e **Atualizar Preços** (tabela de preços editável com reajuste em %, novo serviço ou peça, e as listas de técnicos e modelos). |

Rotinas automáticas (iguais às do Contas a Pagar):
- **ao ligar o computador**, o sistema abre sozinho (o e-mail não abre aqui, porque o Contas a Pagar já abre);
- **a cada abertura**, grava uma planilha Excel com os dados na pasta do Google Drive (`Meu Drive\Chaveiro Universal - Backup\Garantias - dados AAAA-MM-DD.xlsx`);
- **atualizações** chegam pelo Google Drive (`Meu Drive\Chaveiro Universal - Atualizacoes Garantias`): o Menu mostra "Nova versão" com o botão ATUALIZAR.

## Regras de negócio (vindas do VBA)

- Placa sem traço nem espaço, com 7 letras e números; sem placa, o CPF (11 números) identifica o cliente.
- Técnicos, serviços e modelos começam iguais aos do VBA e agora são editáveis no sistema (antes eram fixos no código).
- PILHA (R$ 12) e BOTÃO (R$ 15) são **peças** da tabela de preços: somam ao valor do serviço e dividem o valor no cupom fiscal, como o robô do SAT fazia.
- Não há "virada de ano": é um banco só; as garantias de todos os anos ficam juntas e a pesquisa filtra por data.
- **Planilha antiga:** as 12 abas de meses (colunas DATA, PLACA, MODELO, SERVIÇO, CPF, VALOR, TÉCNICO, OBSERVAÇÃO) entram pela entidade de legado `legado_garantias` e viram garantias com origem "Planilha". Importar o mesmo arquivo de novo não duplica.
- **Cupom fiscal:** o SAT agora é o sistema web da RM Software. A automação fica para depois; cada garantia já guarda o código do produto no cupom e a situação (pendente, lançado, sem cupom).

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Desktop | Electron 33 |
| Interface | HTML + **TypeScript puro** (sem React/Vue/Angular) + Tailwind CSS 3 (gerado localmente) |
| Build do frontend | esbuild (com code splitting) + `tsc` em modo estrito |
| Backend | Java 21 + Spring Boot 3.3 (API REST local) |
| Banco de dados | SQLite 3 em modo WAL, JDBC puro com consultas parametrizadas |
| Testes | JUnit 5 + MockMvc; smoke tests em Electron; testes de frontend em Node |
| Instalador | electron-builder (NSIS) com Java embutido |

## Arquitetura

```
 Electron (desktop/main.js) ── porta livre + token por execução ──┐
   └─ janelas HTML/TS (frontend/)                                   │
        └─ fetch 127.0.0.1:<porta> + X-FinDesk-Token ──▶ Spring Boot (backend/)
                                                              └─ SQLite WAL
              %LOCALAPPDATA%\\ChaveiroUniversal\\Garantias\\garantias.db
```

## Como executar

Pré-requisitos: Node.js 20+, Java 21 e Maven.

```bash
npm install
mvn -f backend/pom.xml package
npm run dev
```

## Testes

```bash
mvn -f backend/pom.xml test           # regras do VBA, importação do legado, gatilhos, backup, API
npm run test:frontend                 # máscaras, filtros e automações
npx electron desktop/smoke.js         # todas as telas (banco temporário)
npx electron desktop/smoke-boot.js    # abertura + clique e digitação reais
node desktop/teste-persistencia.js    # dados sobrevivem ao reinício
```

## Estrutura de pastas

```
├── backend/              # Spring Boot: api/, service/, repository/, database/, model/
├── desktop/              # Electron (main.js, preload.js, automacoes.js) e testes de desktop
├── frontend/             # html/, ts/ (telas e módulos comuns), css/, assets/ (emblema)
├── instalador/           # empacotar.js, publicar.js, gerar-jre.js, emblema (chave amarela)
└── docs/                 # estado-atual.md, decisoes.md, plano-telas.md, instalacao.md
```

## API REST local

| Rota | Uso |
|---|---|
| `GET/POST /api/garantias`, `GET/PUT/DELETE /api/garantias/{id}` | garantias |
| `PUT /api/garantias/{id}/cupom` | situação do cupom fiscal |
| `GET/POST /api/servicos`, `PUT /api/servicos/{id}`, `POST /api/servicos/reajuste` | tabela de preços |
| `GET/POST /api/listas/{tecnicos\|modelos}`, `PUT/DELETE /api/listas/{lista}/{id}` | listas editáveis |
| `GET /api/estatisticas?de=&ate=` | gráficos |
| `POST /api/legado/importar` | planilha antiga |
| `GET /api/status`, `GET /api/backup-drive` | situação do sistema |

## Segurança e dados

- **Offline:** fontes e CSS locais; nenhuma chamada à internet. Backup e atualização usam só a pasta local do Google Drive.
- **API isolada:** só em `127.0.0.1`, com token aleatório novo a cada execução, nunca gravado em log. CSP em todas as páginas e `contextIsolation` ligado no Electron.
- **Integridade do banco:**
  - transações `IMMEDIATE`; gravações de várias etapas são atômicas (a importação da planilha inteira, o reajuste de preços);
  - `CHECK` da regra da placa/CPF, chaves estrangeiras ativas e migrações versionadas que só acrescentam;
  - gatilhos: serviço em uso não pode ser excluído (só desativado) e cupom "lançado" exige a data;
  - **auditoria automática** (`auditoria_operacoes`): toda inclusão, alteração e exclusão de garantias e toda mudança de preço ficam registradas com o antes e o depois, e não podem ser alteradas nem apagadas.
- **Backups:** `VACUUM INTO` diário e antes de cada migração (os 8 últimos), além da planilha diária no Google Drive.
- **Separado do Contas a Pagar:** outra pasta de instalação (`AppData\\Local\\Programs\\garantias-chaveiro-universal`), outro banco, outro atalho, outro item de inicialização e outra pasta de atualizações.

## Status

| Marco | Situação |
|---|---|
| Base (Electron + Spring Boot + SQLite) herdada do Contas a Pagar | Concluída |
| Cadastrar, Pesquisar, Gráficos, Atualizar Preços | Concluídos (1.0.0) |
| Entidade de legado + importação da planilha antiga | Concluída (1.0.0) |
| Emblema (chave amarela), instalador e Drive | Concluídos (1.0.0) |
| Automação do cupom fiscal no SAT web (RM Software) | Pendente (estrutura pronta) |

## Licença

O código-fonte é público exclusivamente para auditoria técnica, avaliação em processos seletivos e estudo. É vedada a exploração comercial. Consulte [LICENSE.md](LICENSE.md) para os termos completos.
