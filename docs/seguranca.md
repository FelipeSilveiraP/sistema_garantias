# Auditoria de segurança — Sistema de Garantias

**Data:** 2026-11-15 · **Versão auditada:** 1.3.3 → corrigida na **1.4.0** · **Banco:** v6 → **v7**

> Escrito para quem não é da área de TI. "Atacante" aqui quer dizer qualquer pessoa ou
> programa tentando fazer o sistema fazer algo que não deveria: alguém mexendo no computador
> da loja, um arquivo de planilha montado de propósito, um programa malicioso no Windows.

## 1. Resumo em 5 linhas

1. O sistema já era bem protegido no essencial: só aceita conexões do próprio computador, toda
   rota exige uma senha secreta que muda a cada abertura, todo SQL usa parâmetros, PIN e e-mails
   ficam cifrados.
2. Foram encontrados e corrigidos **21 pontos fracos** (tabela da seção 4). Os mais importantes:
   chutar PINs em paralelo passava do limite de 5 tentativas, o "Esqueci o PIN" podia mandar
   e-mails sem limite, e uma requisição gigante podia travar o servidor.
3. As bibliotecas Java estavam desatualizadas (**82 vulnerabilidades conhecidas → 0** que se apliquem).
   O Electron estava fora de suporte (33 → **44**).
4. Agora o GitHub roda os testes e as varreduras de segurança sozinho a cada envio e toda
   segunda-feira (`.github/workflows/testes.yml`), com o notebook desligado.
5. Fica um risco médio para depois: as **atualizações pelo Google Drive não são assinadas** (seção 6).

## 2. Ferramentas usadas (e por quê)

| Ferramenta | O que faz | Por que essa | Onde roda |
|---|---|---|---|
| **Testes JUnit + MockMvc** escritos nesta auditoria | Ataca o sistema de verdade: SQL injection, XSS, força bruta, planilha maliciosa | É a prova de que a correção funciona e continua funcionando | Nuvem + CI |
| **SpotBugs + Find Security Bugs** 1.14.0 | Lê o código Java compilado procurando padrões perigosos (SQL, XXE, criptografia) | Projeto da OWASP, o padrão para Java há mais de 10 anos | Nuvem + CI (`mvn -P seguranca`) |
| **Semgrep** 1.185.0 | Procura padrões no código-fonte (Java, TypeScript) | Usado pelo mercado; deixa transformar as regras do `AGENTS.md` em testes (`.semgrep/regras-projeto.yml`) | Nuvem (regras do projeto) + CI (regras do projeto + OWASP Top 10) |
| **OSV-Scanner** 2.7.0 (Google) | Compara cada biblioteca usada com a base pública de vulnerabilidades (osv.dev) | Base aberta que junta GitHub, NVD e outras; não precisa de cadastro | Nuvem (base offline) + CI |
| **npm audit** | O mesmo para os pacotes do Node/Electron | Já vem com o Node | Nuvem + CI |
| **CodeQL** (GitHub) | Análise de segurança do próprio GitHub, gratuita para repositório público | Encontra caminhos de dados (da tela até o banco) que regras simples não pegam | Só no CI (aba *Security*) |
| **OWASP Top 10 / ASVS** | Lista de verificação: injeção, controle de acesso, criptografia, configuração... | É a referência mundial; guiou a revisão campo a campo | Revisão manual |

**Não usadas, e por quê:**
- **Skills de segurança da Trail of Bits** (`github.com/trailofbits/skills`): é o pacote de
  skills de segurança mais conhecido para o Claude Code, de uma empresa de auditoria séria. Não
  foi instalado aqui porque esta sessão na nuvem só acessa este repositório, e porque instalar
  skills de terceiros carrega instruções externas no assistente (a Snyk já apontou risco de
  "injeção de instruções" nesse tipo de instalação). Se quiser usar: no seu Claude Code,
  `/plugin marketplace add trailofbits/skills`, leia o que cada plugin faz antes de ativar.
- **OWASP Dependency-Check**: precisa de uma chave da NVD (base do governo dos EUA) e leva
  muito tempo sem ela. O OSV-Scanner cobre o mesmo, mais rápido.

## 3. Mapa do que foi auditado

**Rede.** O backend escuta só em `127.0.0.1` (o próprio computador; ninguém da rede ou da
internet chega nele) — `application.properties`, conferido por teste. Toda rota, inclusive
caminhos que não existem e a página de erro, exige o cabeçalho `X-FinDesk-Token` (48 letras
aleatórias criadas a cada abertura pelo Electron, comparadas em tempo constante). O teste
`todasAsRotasExigemOToken` percorre **todas** as rotas automaticamente.

**SQL injection.** Todo valor vai por `?` (PreparedStatement). Onde o SQL é montado com texto,
são só nomes fixos do código (tabela de um `enum`, lista de colunas). Não há `ORDER BY`/`LIKE`
dinâmico: a pesquisa filtra na tela. O teste `sqlInjectionEmTodosOsCamposDeTextoViraSoTexto`
manda 8 ataques em **todos** os campos de texto e confere que tudo vira só texto no banco.

**XSS (código na tela).** A tela usa só `createElement` + `textContent`. Os 3 `innerHTML` que
existem montam menus com textos e ícones fixos do código (sem nenhum dado digitado).

## 4. Campos e rotas: risco e correção

Risco: **Alto** = dava para burlar uma proteção; **Médio** = abuso possível com acesso ao
computador; **Baixo** = defesa extra.

| Campo / rota | O que poderia acontecer | Risco | Correção | Teste |
|---|---|---|---|---|
| PIN (`POST /api/sessao`) | Mandar dezenas de PINs **ao mesmo tempo** passava todos pela conferência do bloqueio antes de a 5ª falha gravar (o limite de 5 virava ilimitado) | Alto | Tentativas uma de cada vez (`synchronized`) | `pinsErradosAoMesmoTempoNaoPassamDoLimiteDe5` (40 em paralelo → só 5 conferidas) |
| PIN | Bloqueio fixo de 5 min: 4 números (10 mil PINs) caíam em ~7 dias chutando | Médio | Bloqueio que dobra a cada vez no mesmo dia (5, 10, 20, 40 min... até 24 h) | `cadaBloqueioDoDiaDobraOTempo` |
| PIN gigante | Texto de 1 milhão de letras no PIN ia inteiro para o cálculo do hash | Baixo | Só os 20 primeiros caracteres são usados | `pinGiganteNaoTravaOServidor` |
| Trocar o próprio PIN | Quem achasse uma sessão aberta podia chutar o "PIN atual" sem limite | Médio | Conta como PIN errado; na 5ª bloqueia e derruba a sessão | `quemAchaASessaoAbertaNaoDescobreOPinChutando` |
| Esqueci o PIN (`/api/sessao/esqueci-pin`) | Sem limite: dava para disparar centenas de e-mails (para a pessoa e para a loja) e gerar códigos novos sem parar | Alto | 1 código por minuto e 5 por hora por conta; 20 por hora no sistema todo (resposta 429 com aviso na tela) | `esqueciOPinTemLimiteContraEnvioEmMassa` |
| Código de 6 números (`/redefinir-pin`) | Comparação com `equals` e, em paralelo, várias tentativas passavam do limite de 5 | Médio | `synchronized` + comparação em tempo constante + só aceita 6 números | `codigoDoEmailNaoPodeSerAdivinhado` |
| E-mail (login, contas, e-mail da loja, destino do teste) | Quebra de linha ou `,` `;` `<>` no e-mail poderia acrescentar destinatários escondidos (injeção de cabeçalho) | Médio | E-mail sem espaço, controle, `,;<>"`, até 120 letras | `quebraDeLinhaNoEmailOuNoNomeNaoInjetaCabecalho`, `emailComQuebraDeLinha...` |
| Nome da conta | Vai no texto do e-mail; quebras de linha | Baixo | Caracteres de controle viram espaço | idem |
| Senha de app do Gmail | Aceitava 16 caracteres quaisquer | Baixo | Só 16 letras (formato do Google) | idem |
| FOTO (`u_foto`, `inputFoto`) | O servidor conferia só 1–2 bytes do começo; base64 gigante era decodificado antes de medir | Médio | Tela: só PNG/JPEG/WEBP até 15 MB, refeita em 256 px (tira dados escondidos). Servidor: assinatura completa (magic bytes) de PNG/JPEG, 1 MB, medido antes de decodificar. Banco: gatilho `FOTO_GRANDE` | `fotoSoEntraSeForPngOuJpegDeVerdade` |
| Planilha (`inputPlanilha`, `/api/legado/importar`) — tipo | Conferia só o nome `.xlsm` | Médio | Confere o começo do arquivo (`PK\3\4`, zip) | `arquivoQueNaoEZipERecusadoPeloConteudoNaoPeloNome` |
| Planilha — "zip bomb" / gigante | Limite de 200 MB descompactados com o backend em 256 MB de memória: podia derrubar | Médio | 80 MB no total, 12 MB por parte, 5 mil partes, 200 mil linhas; 30 MB na tela | `zipBombEPartesGigantesSaoRecusadas` |
| Planilha — XXE / "billion laughs" | Já protegido (DOCTYPE proibido) | — | Reforçado (entidades e DTD externos desligados) | `xxeNaoLeArquivosDoComputador`, `billionLaughsERecusado` |
| Planilha — macros e fórmulas | Macros (`vbaProject.bin`) nunca são lidas; fórmula vale só o resultado já calculado; texto `=cmd...` entra como texto e o backup grava como texto | — | (já estava certo; agora testado) | `macrosSaoIgnoradasEFormulasViramSoTexto` |
| Planilha — dados | Célula de 32 mil letras ia inteira para o banco; valor `1E999999999` travava o servidor montando um número de 1 bilhão de dígitos | Médio | Célula até 1000 letras; garantia com os limites do cadastro (120/60/500); valor fora de 0–99.999,99 vira 0 | `celulasENumerosGigantesNaoTravamNemPassamDoLimite` |
| Planilha — nome do arquivo | Ia para o banco com pasta e caracteres de controle | Baixo | Só o nome, sem controle, até 120 letras | `nomeDoArquivoVaiSemPastaNemCaracteresDeControle` |
| Todas as rotas — tamanho | Sem limite: um JSON de 1 GB acabava com a memória antes de qualquer validação | Médio | Filtro `LimiteCorpoFilter`: 2 MB (42 MB só na planilha), conferido antes de ler | `requisicaoGrandeDemaisERecusadaAntesDeLer` |
| Parâmetros (`/api/garantias/{id}`, estatísticas) | Texto no lugar de número/data dava erro 500 e enchia o log | Baixo | Responde 400 | `respostasTemCabecalhosDeSegurancaEParametroErradoDa400` |
| "Cadastrada por" (`POST /api/garantias`) | Sem sessão, valia o nome que a tela mandasse | Baixo | Só o perfil da sessão (PIN conferido) | `cadastradaPorVemDaSessaoENaoDoQueATelaManda` |
| Primeira conta (`/api/perfis/primeiro-admin`) | Dois pedidos ao mesmo tempo podiam criar dois "primeiros" admins | Baixo | `synchronized` | `segundoAdminNaoPodeSerCriadoPelaRotaDaPrimeiraAbertura` |
| Campos da garantia (placa, CPF, modelo, serviço, técnico, observação, produto OUTRO) | Já validados (placa/CPF em 3 camadas); caracteres de controle passavam | Baixo | Removidos; limites de tamanho também no banco (v7) | `sqlInjection...`, `bancoRecusaTextoEnormeEFotoGrandeMesmoPorFora` |
| Backup no Google Drive | Apagava pelo começo do nome: um arquivo do usuário "Garantias - dados copia.xlsx" podia sumir | Médio | **REGRA: só apaga as planilhas que o próprio sistema gerou** (nome exato `Garantias - dados AAAA-MM-DD.xlsx`, arquivo comum, direto na subpasta); nunca pasta, atalho ou recursivo; não sobrescreve pasta/atalho | `BackupDriveProtecaoTest` (arquivos do usuário e do Contas a Pagar intactos, sobram 30) |
| Publicar atualização (`instalador/publicar.js`) | Mesmo cuidado na pasta de atualizações | Baixo | Só apaga `Garantias - Chaveiro Universal - Instalador X.Y.Z.exe` (arquivo comum) | revisão |

**Já estava correto (sem mudança):** token e rede (seção 3); CORS só para a própria janela;
Electron com `contextIsolation`, sem `nodeIntegration`, sem abrir janelas novas nem navegar
para fora, telas só da lista `TELAS`; abrir arquivos só nas pastas do sistema; PIN com PBKDF2
(210 mil rodadas) + chave fora do banco; login/e-mail/senha de app cifrados (AES-256-GCM);
diálogos só por `dialogos.ts`; reajuste, cupom, contas e importação já em transação única.

## 5. Banco de dados (migração v7, só acrescenta)

- **Gatilhos de tamanho** (`TEXTO_LONGO`): modelo/serviço 120, técnico/"cadastrada por" 60,
  observação 500, placa/CPF 20, código do cupom 200; células do legado 1000; foto 1 MB (`FOTO_GRANDE`).
- **Auditoria nova** (antes/depois, somente-leitura): produtos da garantia (`garantia_itens`),
  contas (só nome, admin, ativo, foto e "PIN trocado" — **nunca** PIN, login ou e-mail),
  configurações (só o nome da chave — **nunca** a senha de app) e inclusão/exclusão de serviços.
- **Transações:** importação, reajuste, garantia + produtos, cupom e contas já gravavam numa
  transação só (`ConnectionFactory.emTransacao`). Confirmado.

## 6. Riscos que ficam (honestamente)

- **DDoS (derrubar o sistema com excesso de acessos):** para um app desktop offline o risco
  real é praticamente **zero**. O servidor só aceita conexões do próprio computador, então
  ninguém da internet consegue nem tentar. Quem conseguiria seria um programa já instalado no
  Windows da loja — e esse programa, se for malicioso, já tem acesso aos arquivos de qualquer
  jeito. Os limites de tamanho e de tentativas acima evitam que um erro ou abuso local trave o sistema.
- **Atualização pelo Google Drive sem assinatura (Médio):** o sistema confere o SHA-256 do
  instalador, mas o SHA-256 está no mesmo `versao.json` da pasta. Quem conseguir **escrever** na
  pasta `Chaveiro Universal - Atualizacoes` (por exemplo, se ela for compartilhada com alguém
  ou a conta Google for invadida) pode publicar um instalador falso, que o sistema ofereceria
  em ATUALIZAR. Proteção hoje: **não compartilhe essa pasta com ninguém e use verificação em
  duas etapas no Google**. Correção definitiva sugerida: assinar o `versao.json` com uma chave
  que só o computador de desenvolvimento tem (a chave pública vai dentro do instalador).
- **Ferramentas de build do instalador** (`electron-builder` 25 e pacotes como `tar`): o
  `npm audit` aponta falhas ao **extrair arquivos baixados**. Elas rodam só no computador de
  quem gera o instalador, nunca na loja. Atualizar para o `electron-builder` 26 muda a
  configuração do instalador e precisa ser testado no Windows — fica para uma entrega própria.
- **Spring MVC** (2 alertas, CVE-2026-47884 e CVE-2026-47890): em recursos que o sistema não
  usa (XsltView e streaming SSE); só têm correção no Spring 7. Aceitos até 2027-03-01 em
  `osv-scanner.toml` (depois disso o CI volta a cobrar).
- **"E-mail não encontrado"** no Esqueci o PIN confirma se um e-mail tem conta. Mantido de
  propósito (ajuda quem errou a digitação); o limite de pedidos impede testar em massa.
- Quem tem acesso ao Windows da loja com o sistema aberto e uma sessão de admin pode fazer
  tudo o que o admin faz: **bloqueie o Windows (tecla Windows + L) ao sair do balcão.**

## 7. Placar dos testes (2026-11-15, na nuvem)

| Teste | Resultado |
|---|---|
| `mvn -f backend/pom.xml test` (JUnit + MockMvc) | **68 testes: 67 passaram, 1 pulado** (importação da planilha REAL da loja: o arquivo só existe no seu computador) |
| `npm run typecheck` / `npm run build` | passou / passou |
| `npm run test:frontend` | máscaras **74/74**, filtros **22/22**, automações **26/26** |
| `npx electron desktop/smoke.js` (Linux, tela virtual) | **83/86** — as 3 falhas (menu lateral em 480/760 px e a seta da observação) acontecem **igual na versão antiga** (diferença de fonte/layout do Linux); no Windows o CI confere |
| `node desktop/teste-persistencia.js` | **11/11** |
| `npx electron desktop/smoke-boot.js` | **não deu para rodar na nuvem**: clica e digita de verdade pelo PowerShell do Windows. Roda no CI (Windows) |
| Semgrep (regras do projeto) | **0 achados** (os 7 iniciais revisados: falsos positivos marcados com o motivo) |
| SpotBugs + Find Security Bugs | **0 achados** pendentes (45 revisados um a um: `backend/spotbugs-excluir.xml`) |
| OSV-Scanner (Java) | **82 → 0** que se apliquem (2 aceitos, seção 6) |
| `npm audit --omit=dev` (o que vai para a loja) | **0** |

Como rodar a análise estática no seu computador:

```bash
mvn -f backend/pom.xml -P seguranca -DskipTests package spotbugs:check
```
