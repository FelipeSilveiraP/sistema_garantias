# Decisões

Registro das decisões de negócio e de arquitetura do Sistema de Garantias. Mais nova embaixo. As decisões de base (Electron, token por execução, SQLite WAL, migrações aditivas, diálogos próprios, backup `VACUUM INTO`, Drive) vêm do Sistema de Contas a Pagar e continuam valendo.

## Criação do projeto (2026-11-14)

- **2026-11-14 — Projeto irmão do Contas a Pagar, em pasta e repositório próprios.** A base foi copiada (só arquivos versionados) e o que era de contas saiu. Identidade separada para nada colidir: pacote `garantias-chaveiro-universal` (pasta de instalação), appId `br.com.chaveirouniversal.garantias`, banco `%LOCALAPPDATA%\ChaveiroUniversal\Garantias\garantias.db`, item de inicialização "Garantias - Chaveiro Universal", pasta de atualizações própria no Drive e backup com prefixo "Garantias - dados".
- **2026-11-14 — Menu com 3 botões (pedido do usuário):** CADASTRAR GARANTIA, PESQUISAR GARANTIA e ESTATÍSTICA E ATUALIZAÇÕES (submenu com GRÁFICOS e ATUALIZAR PREÇOS).
- **2026-11-14 — Regras do VBA (`frmControleGarantias` V17.1) no backend:** placa de 7 letras/números ou "sem placa" com CPF de 11 dígitos (também um `CHECK` no banco); quantidades de 1 a 5 conforme o serviço; "OUTRO" com descrição; valor 0 permitido. Novo: garantia repetida (mesma placa/CPF, mesmo dia, mesmo serviço) pede confirmação.
- **2026-11-14 — ATUALIZAR PREÇOS = tabela de serviços com preço (escolha do usuário).** O preço sugere o valor no cadastro; reajuste em % numa transação só; mudanças de preço vão para a auditoria. PILHA (R$ 12) e BOTÃO (R$ 15), constantes do VBA, viraram peças da tabela. Os demais preços começam em 0.
- **2026-11-14 — Técnicos, serviços e modelos editáveis (escolha do usuário).** Começam com as listas do VBA. As garantias guardam o nome como texto, então excluir ou desativar da lista não altera o histórico. Serviço em uso não pode ser excluído (gatilho); a tela só desativa.
- **2026-11-14 — Cupom fiscal: estrutura pronta, automação depois (pedido do usuário).** O SAT agora é o sistema web da RM Software. O robô de teclado do VBA (upLIFE em `D:\`) não foi portado. Cada garantia guarda `codigo_cupom` (do serviço), `cupom_status` (NAO_LANCADO, LANCADO, DISPENSADO) e `cupom_lancado_em`; a Pesquisa marca a situação à mão.
- **2026-11-14 — Entidade de legado + importação da planilha:** `legado_garantias` guarda cada linha como estava (arquivo + aba + linha, `UNIQUE`), e cada linha com data válida vira garantia com `origem = LEGADO` (fora da regra de placa). Leitor de `.xlsx/.xlsm` sem biblioteca (`LeitorXlsx`, protegido contra XXE e "zip bomb"). Tudo numa transação.
- **2026-11-14 — Sem "virada de ano":** o VBA criava um arquivo por ano; aqui é um banco só e a pesquisa filtra por data.
- **2026-11-14 — No início automático, o Garantias não abre o e-mail** (`abrirEmailAoLigar: false`): o Contas a Pagar já abre, e abriria duas vezes.
- **2026-11-14 — Emblema: chave amarela, sem fundo, na diagonal** (mesmo estilo do cadeado do Contas a Pagar: formas retas e contorno preto).
- **2026-11-14 — Selos arredondados e área de edição sem topo amarelo desde o início** (decisões de 2026-11-13 no Contas a Pagar).

## Perfis, Menu novo e Controle (2026-11-14, versão 1.1.0)

- **"Quem está usando?" antes do Menu (como na Netflix):** o app abre em `perfis` com uma bolinha por técnico ativo (iniciais, cor fixa por técnico); o perfil fica na sessão da janela e vai em cada garantia (`criado_por`, migração v2). Sem perfil, Menu e Cadastrar voltam para os perfis. A bolinha aparece na barra e no menu lateral, e clicar nela troca o perfil.
- **Menu:** topo em faixa (borda fina, sem sombra) com o título no centro; 3 botões quadrados: Cadastrar (amarelo), Pesquisar (vermelho) e ATUALIZAÇÃO E ESTATÍSTICA (verde). Na barra, Menu Principal ficou azul, porque o vermelho agora é de Pesquisar.
- **Veículos (migração v3), relações nos moldes do Contas a Pagar:** `marcas` e `veiculos` (UNIQUE marca+modelo, FK RESTRICT para a marca), já com 249 modelos de 28 marcas do mercado brasileiro. A garantia guarda o texto ("MARCA MODELO") e as FKs `id_veiculo` e `id_tecnico` com ON DELETE SET NULL, como a conta guarda a empresa. As garantias existentes foram ligadas pelo nome. Modelos da lista antiga só viraram marca "OUTRAS" se tinham sido incluídos depois do VBA.
- **Cadastro:** técnico e modelo em caixa de seleção (modelos por marca; o técnico já vem com o perfil); CPF embaçado, travado e com cursor de bloqueio até marcar "Carro sem placa", que virou um botão grande.
- **CONTROLE** (dentro de Atualização e Estatística) → TÉCNICOS, VEÍCULOS e TABELA DE VALORES, cada um com Cadastrar e Todos (tabela com pesquisa, filtros, ativar/desativar, excluir e "Alterar um campo"). Produto usado em garantia não é excluído (409: desative). Atualizar Preços ficou só com a tabela de preços e o reajuste.

## Contas com PIN e controle de usuários (2026-11-14, versão 1.2.0)

- **Contas de usuário separadas dos técnicos (escolha do usuário), com PIN de 4 a 6 números (escolha do usuário).** A tela "Quem está usando?" mostra uma bolinha por conta ativa (foto ou iniciais); clicar pede o PIN. Na primeira abertura, o sistema pede a conta do administrador, que é a primeira conta criada. "Cadastrada por" passa a vir da sessão aberta com o PIN, conferida no servidor, e não do que a tela manda.
- **Só o administrador controla as contas:** cadastra, edita nome, foto, login e e-mail, cria PIN novo para qualquer conta (o que também desbloqueia), torna admin, desativa e exclui. Também vê os acessos e configura o Gmail. O servidor confere a sessão de admin em cada rota (403 para os outros). Os demais só veem "Minha conta" e trocam o próprio PIN sabendo o atual. Gatilhos impedem ficar sem nenhum admin ativo; ninguém exclui a própria conta. Desativar ou excluir encerra a sessão.
- **Criptografia (pedido do usuário: login e senha criptografados):** PIN como PBKDF2-HMAC-SHA256 (210 mil iterações, sal por conta) sobre um HMAC do PIN com a chave secreta ("pimenta"). Login, e-mail e senha de app do Gmail em AES-256-GCM. O login também tem índice HMAC para a busca. A chave mestra fica em `chave-garantias.key`, ao lado do banco e fora dele, dos backups `VACUUM INTO` e da planilha do Drive. **Se esse arquivo se perder, logins e e-mails ficam ilegíveis**: ele precisa ir junto num backup manual da pasta de dados.
- **Acessos:** cada conta guarda o número de acessos e o último acesso; `acessos_usuario` registra entradas, PINs errados, bloqueios e trocas de PIN. É somente-inclusão e fica mesmo se a conta for excluída. 5 PINs errados bloqueiam a conta por 5 minutos.
- **Esqueci o PIN pelo e-mail (Gmail da loja, escolha do usuário):** código de 6 números, guardado só como HMAC, que vale 15 minutos e 5 tentativas; enviado por SMTP `smtp.gmail.com:587` com STARTTLS e a "senha de app" do Google, gravada cifrada pelo admin em CONTAS. É a única parte do sistema que usa a internet, e só nesse envio. Nova dependência: `spring-boot-starter-mail`.
- **CONTAS fica num ícone da barra** (e no topo do Menu, que não tem barra), sem botão grande no Menu.

## Validações próprias, pop-ups e chave 3D (2026-11-15, versão 1.3.0)

- **Placa e CPF validados pelo próprio sistema, sem API externa (pedido do usuário), em 3 camadas com a mesma regra:** placa antiga (ABC1234) ou Mercosul (ABC1D23); CPF com 11 números, não todos iguais e os 2 dígitos verificadores (módulo 11). A tela avisa enquanto a pessoa digita (a cada tecla, o que já está errado; ao sair do campo, o que falta) e marca o campo de vermelho; o servidor recusa com 400 e o campo; o banco recusa por gatilho.
- **Migração v5 (só gatilhos):** `trg_garantia_{placa,cpf,data_servico}_{insert,update}` recusam placa fora do padrão (`PLACA_INVALIDA`), CPF com dígito errado (`CPF_INVALIDO`, cálculo em SQL) e data depois de amanhã (`DATA_FUTURA`, a mesma folga de 1 dia do servidor por causa do fuso). No UPDATE só disparam quando o campo muda, e linhas `origem = LEGADO` ficam como vieram da planilha. Técnicos e veículos passam a ir para `auditoria_operacoes` (insert/update/delete com antes/depois), como garantias e preços.
- **Pop-ups neobrutalistas de um botão (`avisar` em `dialogos.ts`):** "GARANTIA SALVA" (verde, com o resumo), "CONFIRA OS DADOS" (amarelo, com a lista do que está errado; ao fechar, os erros ficam nos campos) e "NÃO FOI POSSÍVEL SALVAR" (vermelho). Mesma caixa das confirmações (alertdialog, foco no OK, Enter/ESC fecham). No cadastro, o resultado de salvar deixou de ser notificação no canto.
- **Serviço "OUTRO":** o campo de texto aparece no lugar da caixa de seleção, com um botão de lista ao lado para voltar aos serviços.
- **Observação recolhida atrás de uma seta:** abre ao passar o mouse e, com clique, fica aberta (também abre com o foco do teclado). Só CSS para o hover.
- **Tela de carregamento: chave 3D em pé girando no próprio eixo (pedido do usuário)** no lugar da chave entrando no cadeado. 9 camadas SVG da mesma forma empilhadas em profundidade (frente e verso amarelos, miolo preto = espessura), `rotateY` em CSS, sombra chapada que estreita no giro. Com "reduzir movimento", fica parada e inclinada.
- **Teste de abertura:** a checagem da chave vem antes da captura de tela; se o sistema abrir antes da checagem, ela é pulada (não reprova), como já acontecia com a de "reduzir movimento".

## Login pelo e-mail (2026-11-15, versão 1.3.1)

- **O login é o e-mail da pessoa (pedido do usuário), e qualquer e-mail válido serve** (Gmail, Hotmail, da empresa...). As telas têm um campo só, "E-MAIL (É O LOGIN)", obrigatório. No banco, `login` e `email` recebem o mesmo valor (cifrados, com o índice HMAC do login); trocar o e-mail em CONTAS troca o login junto. Contas antigas com login que não é e-mail continuam entrando pelo login antigo até o admin trocar o e-mail.
- **Esqueci o PIN: o código vai para o e-mail da conta E para o e-mail da loja** (o Gmail configurado em CONTAS, que envia). A cópia da loja diz de qual conta é o pedido. Se um dos envios falhar, vale o outro; só dá erro se nenhum sair. A tela mostra os dois destinos mascarados.
- **E-mail da loja já na criação do administrador (pedido do usuário):** a primeira conta tem dois campos, SEU E-MAIL (login do admin) e E-MAIL DA LOJA. O da loja vira o e-mail que envia os códigos e recebe a cópia; a senha de app do Google continua sendo gravada em CONTAS (o e-mail já aparece preenchido lá).

## Ajustes de uso (2026-11-15, versão 1.3.2)

- **Testes só quando o usuário mandar:** ele usa a mesma máquina enquanto o agente trabalha (os smokes movem mouse e teclado). Esta versão foi só compilada (typecheck + `mvn compile`).
- **Cadastrar Garantia:** sem "Cadastrando como"; caixas de seleção com seta para baixo (todas as `select.entrada-form`); modelo com OUTRO (DESCREVER), que troca a caixa por um campo de texto com botão de volta à lista (a garantia vai sem `id_veiculo`, só com o texto); observação numa linha grossa abaixo de todos os campos, com uma seta que expande o cadastro para baixo (clique).
- **Barra:** as cores e o hover estavam ligados aos botões do Contas a Pagar (`inserir`, `cadastros`...), por isso não animavam. Agora: Menu Principal todo azul (casinha azul e hover azul, nunca vermelho), Cadastrar amarelo, Pesquisar vermelho, Controle verde; o botão da tela atual tem a faixa inferior na cor do módulo.
- **Um botão só para a conta** (bolinha + nome + seta), na barra e no topo do Menu: MINHA CONTA (tela CONTAS) e SAIR E TROCAR DE CONTA. Encurta a barra, que cortava em algumas telas.
- **ATUALIZAÇÃO E ESTATÍSTICA virou CONTROLE**, com GRÁFICOS (azul) e um botão CONTROLE laranja (nem verde nem azul, pedido do usuário) que leva a TÉCNICOS, VEÍCULOS e TABELA DE VALORES. ATUALIZAR PREÇOS ficou ao lado de CADASTRAR PRODUTO, na Tabela de valores.
- **Reajuste também em R$:** ao lado do número, escolhe-se % ou R$. Em R$ soma o valor a todos os preços ativos (negativo baixa, nenhum fica abaixo de R$ 0,00), numa transação, com auditoria.

## Vários produtos por garantia (2026-11-15, versão 1.3.3)

- **Produtos em linhas com o botão + (pedido do usuário)**, no lugar das combinações prontas do VBA (CARCAÇA+PILHA, CARCAÇA+BOTÃO, CARCAÇA+BOTÃO+PILHA, que foram desativadas na migração v6). Cada linha tem a caixa do produto (com OUTRO, que vira campo de texto), a quantidade (1x a 5x), o + (acrescenta outra linha logo abaixo) e o X (tira a linha). Até 10 produtos. PILHA e BOTÃO agora aparecem na lista.
- **Banco v6: `garantia_itens`** (produto, descrição, quantidade e preço de cada linha, `ON DELETE CASCADE`), gravada na mesma transação da garantia. A garantia continua com o resumo em texto ("TROCA CARCAÇA + 2x PILHA"), as quantidades de carcaça/botão/pilha/itens e o código do cupom com os códigos unidos por "_" (como os combos do VBA: "19_10"). Assim, pesquisa, gráficos, cupom, edição e backup não mudaram.
- **Cadastro na vertical:** um campo embaixo do outro, numa coluna estreita; a tela rola.
- **Seta em todas as caixas de seleção do sistema** (regra global em `select`).
- **Tabela da Pesquisar Garantia com o cabeçalho vermelho** (cor do módulo).


## Auditoria de segurança (2026-11-15, versão 1.4.0, banco v7)

- **Relatório completo em `docs/seguranca.md`** (campo a campo, risco, correção, teste e placar). Ferramentas: SpotBugs + Find Security Bugs (`mvn -P seguranca`), Semgrep com regras do projeto (`.semgrep/regras-projeto.yml`), OSV-Scanner (`osv-scanner.toml`), npm audit e CodeQL, todas no CI (`.github/workflows/testes.yml`, também toda segunda às 6h).
- **PIN, código do e-mail e primeira conta conferidos um de cada vez** (`synchronized` no `UsuarioService`): em paralelo, as tentativas passavam do limite de 5. Bloqueio dobra a cada vez no mesmo dia (5 → 10 → 20... até 24 h); errar o "PIN atual" em MINHA CONTA também conta.
- **"Esqueci o PIN" com limite**: 1 código/minuto e 5/hora por conta, 20/hora no total (HTTP 429, aviso na tela). Impede envio em massa de e-mails pelo Gmail da loja.
- **Tamanho máximo das requisições** (`web/LimiteCorpoFilter`): 2 MB, 42 MB só na importação da planilha; sem tamanho declarado = 411. Também `nosniff` e `no-store` em toda resposta.
- **Planilha antiga**: confere o tipo real (zip), limites contra zip bomb (80 MB total, 12 MB por parte, 5 mil partes, 200 mil linhas), célula até 1000 letras, valor fora de 0–99.999,99 vira 0 (o original fica no legado), nome do arquivo sem pasta.
- **Banco v7 (aditiva)**: gatilhos `TEXTO_LONGO` e `FOTO_GRANDE`; auditoria de `garantia_itens`, contas (sem PIN/login/e-mail), configurações (só a chave) e inclusão/exclusão de serviços.
- **"Cadastrada por" só vem da sessão** (sem sessão fica em branco).
- **Dependências**: Spring Boot 3.3.5 → 3.5.16 (com Tomcat 10.1.59, Jackson 2.21.7, Log4j 2.25.5), sqlite-jdbc 3.54.1.0, Electron 33 → 44.10.1, esbuild 0.28.2. electron-builder 25 fica (só build; ver `docs/seguranca.md` §6).
- **REGRA do backup no Google Drive (pedido do usuário): nunca apaga nem sobrescreve arquivo que o sistema não criou.** Só apaga arquivo comum com o nome exato `Garantias - dados AAAA-MM-DD.xlsx` direto na subpasta `Chaveiro Universal - Backup` (compartilhada com o Contas a Pagar); nunca pasta, atalho ou recursivo; não sobrescreve pasta/atalho com o nome do dia. `instalador/publicar.js` segue a mesma regra na pasta de atualizações. Teste: `BackupDriveProtecaoTest`.
- **Pendente (risco médio)**: assinar o `versao.json` das atualizações pelo Drive (hoje o SHA-256 só prova que o arquivo está completo, não quem publicou). Até lá: não compartilhar a pasta de atualizações.
- **Teste de persistência espera o banco pronto (2026-11-15):** o `/api/status` responde antes das migrações terminarem (`"inicializado": "false"`). O Electron já esperava o `"true"`; o `teste-persistencia.js` não, e às vezes cadastrava antes das tabelas existirem (falha intermitente vista no CI e numa rodada anterior). Agora espera como o app.

## Instalador pelo GitHub (2026-11-16)

- **O GitHub é o backup do código E o lugar de onde a loja baixa o instalador (decisão do usuário).** `.github/workflows/instalador.yml` roda `npm run instalador` num Windows do GitHub a cada envio para a `main` e publica o `.exe` em Releases (tag `vX.Y.Z` do `package.json`; mesma versão = troca o arquivo). O Google Drive (`npm run publicar`) continua como opção de atualização automática.
- **Atualização automática pelo GitHub (2026-11-16, pedido do usuário):** o sistema procura a versão nova nos Releases (`desktop/automacoes.js` `procurarAtualizacaoGithub`); só aceita o instalador com o nome exato, baixado do próprio repositório e com SHA-256 conferido depois do download. Sem internet, usa a pasta do Drive. O CI aumenta a versão sozinho (`X.Y` do package.json + número da execução).
- **Electron 44 baixa o binário no 1º uso** (não no `npm install`): `instalador/empacotar.js` garante o download antes de empacotar (era a causa do `rename electron.exe ENOENT` no CI).
- **Nenhum registro perdido na atualização:** `AtualizacaoSemPerdaTest` monta bancos das versões antigas (v3 a v6), enche as tabelas, roda a abertura da versão nova (backup + migrações) e compara tudo linha por linha e com o backup; foi conferido que ele falha se uma migração apagar um dado.
- **Enter = botão de enviar em todos os formulários** (`frontend/ts/enter-envia.ts`, ligado em todas as telas pelo `main.ts`): dentro de `<form>` envia o formulário (mesmas validações); fora, clica no botão do bloco `data-enter-envia` (APLICAR alteração, APLICAR REAJUSTE, SALVAR da linha de preço). Área de texto grande, Shift/Ctrl+Enter e botões não mudam. Testado com tecla real no smoke.
- **O Garantias NÃO abre sozinho com o Windows (2026-11-16, pedido do usuário).** `instalador.nsh` só apaga o valor `Garantias - Chaveiro Universal` de `HKCU\...\Run` (antes gravava); `configurarInicioComWindows` sempre apaga, mesmo com `configuracoes.json` antigo pedindo `abrirAoLigarComputador: true`. O Contas a Pagar continua abrindo com o Windows.
- **2026-11-16 — Mais leve (pedido do usuário: os sistemas pesavam no PC da loja).** Java do servidor com `-Xms16m -XX:+UseSerialGC -Xss512k -XX:TieredStopAtLevel=1 -XX:ReservedCodeCacheSize=32m -XX:MaxMetaspaceSize=128m` (medido: ~200 MB → ~126 MB por servidor, e pronto mais rápido); teto `-Xmx256m` mantido (planilhas/PDFs); `lazy-initialization` e teto 128m não ganharam nada. `app.disableHardwareAcceleration()`: sem o processo de GPU do Chromium.
- **2026-11-16 — "BEM-VINDO AO SISTEMA DE GARANTIAS" no topo da tela de perfis (pedido do usuário):** faixa amarela fixa (`#perfis-boas-vindas`) acima do título, tanto na criação da primeira conta (título "Vamos começar") quanto nas bolinhas ("Quem está usando?").
- **2026-11-16 — Emblema maior e mais destacado (pedido do usuário):** placa vermelha com a chave amarela encorpada, borda preta grossa, ocupando o ícone inteiro (antes era só o desenho, sem fundo, e sumia no papel de parede em 32/48 px). Garantias = vermelho/chave, Contas a Pagar = azul/cadeado. `instalador/gerar-icone.py`.
- **2026-11-16 — Pesquisar Garantia mostra só 5 garantias (pedido do usuário, a planilha antiga deixou a tabela imensa):** botão EXPANDIR TABELA (flecha para baixo, com quantas faltam) mostra todas e vira RECOLHER TABELA; a pesquisa, os filtros, o contador ("Mostrando 5 de N") e IMPRIMIR LISTA continuam valendo para todas.
- **2026-11-16 — Enter nos pop-ups = continuar/OK (pedido do usuário):** `dialogos.ts` confirma com Enter e põe o foco no botão de continuar; na EXCLUSÃO (tom "perigo") o Enter cancela e o foco fica em CANCELAR (Enter sem querer nunca apaga registro); se a pessoa foi com Tab até CANCELAR, o Enter vale esse botão. PIN e formulários já enviavam com Enter (testes com tecla real).
- **2026-11-16 — Atualização pelo GitHub: o GitHub troca os espaços do nome do instalador por pontos** (`Nome.-.Chaveiro.Universal.-.Instalador.X.Y.Z.exe`); `NOME_INSTALADOR` aceita os dois jeitos. Sem isso o aviso de ATUALIZAR nunca aparecia (as versões até 1.4.12 / 1.3.12 precisam ser instaladas à mão uma vez). Conferido contra o GitHub de verdade (encontra, baixa 185 MB e confere o SHA-256).
- **2026-11-16 — Versão instalada no rodapé do Menu** (`findesk:config` devolve `versao`): serve para conferir se a atualização entrou.
- **2026-11-16 — Versão sempre igual no instalador, no programa e no Release (pedido do usuário):** o GitHub define a versão uma vez (`npm version`), e o instalador, o `package.json` dentro do programa (rodapé do Menu) e o Release usam esse mesmo número; o passo "Conferir que instalador e programa tem a mesma versao" do `instalador.yml` lê a versão de dentro do `app.asar` e NÃO publica se for diferente.

## Modelo digitável, barra de carregamento da atualização e pop-ups no meio (2026-11-16)

- **2026-11-16 — Modelo do carro: digita ou escolhe (pedido do usuário).** A caixa de seleção virou uma caixa de digitar (`frontend/ts/caixa-busca.ts`, padrão combobox do WAI-ARIA): enquanto digita, a lista mostra os carros que combinam (todas as palavras, sem ligar para acento), separados por marca; setas + Enter escolhem (o Enter não envia o formulário), ESC fecha só a lista. O que não estiver na lista é salvo como foi escrito (OUTRO), com aviso na própria lista. A caixa antiga fica escondida guardando a escolha, então validação e servidor não mudaram.
- **2026-11-16 — ATUALIZAR com barra de carregamento (pedido do usuário).** A versão nova aparece num pop-up no meio da tela (ATUALIZAR / AGORA NÃO); ao atualizar, um pop-up com barra mostra "Baixando... 45% (83 de 185 MB)", depois "conferindo e instalando". O processo principal manda o andamento (`findesk:progresso-atualizacao`, no máximo ~8 por segundo); ESC/Enter não interrompem; se falhar, pop-up de erro.
- **2026-11-16 — Todo pop-up no meio da tela (pedido do usuário):** os diálogos já eram centralizados; os avisos curtos (notificações) saíram do canto inferior direito e vão para o centro.

## Cupom fiscal automático no RM Software (2026-11-17)

- **2026-11-17 — Cupom automático pela API interna do RM, sem API oficial (escolha do usuário).** Uma venda real gravada no DevTools (HAR "sanitized", sem senha nem token, fora do Git) mostrou a API do PDV (`api.rmsoftware.dev.br`): `GET /v1/produtos?q=` → `POST /v1/pdv/totais` → `POST /v1/pdv/vendas` (`vendaUuid`, pagamento `avista`/meio `01` = dinheiro, `emitir:false`) → `POST /v1/pdv/vendas/{id}/emitir` → `GET .../cupom-dados` (impressão). Risco aceito: se o RM mudar a API, o cupom deixa de sair e o pop-up manda fazer à mão.
- **2026-11-17 — Login: "Caminho A" (escolha do usuário).** Uma janela escondida abre o PDV do RM numa sessão própria (`persist:rm`). E-mail e senha são digitados só na página do RM, uma vez; o sistema nunca lê, guarda ou registra login nem senha. O RM autentica por cabeçalho `Authorization` (não por cookie): o sistema copia o que a própria página do RM manda, só na memória, e os pedidos do cupom rodam dentro da página do RM (mesma origem). O login salvo no Chrome não pode ser aproveitado (o Chrome tranca os dados de propósito); o Caminho B (extensão no Chrome) foi recusado por ter mais peças.
- **2026-11-17 — Sem botão "conectar" (pedido do usuário).** Ao abrir, o sistema conecta sozinho; problema = pop-up (ENTRE NO RM / RM FORA DO AR). Ao salvar a garantia o cupom sai em segundo plano; se falhar, reconecta e tenta mais UMA vez; se falhar de novo, pop-up FAÇA O CUPOM NO RM com produtos e valores, e a garantia fica NÃO LANÇADO. Login pedido no meio não gera 2ª tentativa (a janela do RM abre para alguém entrar).
- **2026-11-17 — Produto pela PALAVRA, nunca pelo código (pedido do usuário).** Cada serviço/peça ganhou **NOME NO RM** (banco v8 `servicos.nome_rm`; telas ATUALIZAR PREÇOS, produtos e cadastro de produto, no lugar do "código no cupom"). A busca compara sem acento, caixa ou espaço duplo e exige exatamente 1 produto ativo; senão, cupom manual. TROCA CARCAÇA já vem com `CARCAÇA CANIVETE` (o da venda real). Os códigos antigos (`codigo_cupom`) ficam no banco sem uso.
- **2026-11-17 — Valores do cupom = regra do SAT do VBA** (`CupomService.dividir`): peças com o preço da tabela, o resto do valor da garantia vai para os serviços na proporção do preço de tabela; só peças = valor dividido entre elas; centavo que sobra vai para uma linha onde a conta fecha; sem valor, produto sem NOME NO RM, OUTRO ou conta que não fecha = cupom manual. O RM confere o total (`/pdv/totais`) antes de finalizar.
- **2026-11-17 — Nunca duas NFC-e da mesma garantia.** `cupom_venda_uuid` (criado uma vez, `UNIQUE`) vai como `vendaUuid`; a 2ª tentativa reaproveita a venda já criada e só chama `/emitir`; garantia LANÇADA não emite de novo; um cupom por vez (fila). NFC-e registrada em `cupom_nfce`/`cupom_chave` + LANÇADO com data.
- **2026-11-17 — Impressão direto na DARUMA, sem janela de impressora:** cupom montado pelo sistema com os dados do próprio RM (`desktop/cupom-impressao.js`, QR Code com `qrcode-generator` 1.4.4, sem dependências), impressora achada pelo nome "DARUMA". Falhou a impressão = pop-up "imprima pelo RM em ÚLTIMAS VENDAS, não emita de novo".
- **2026-11-17 — Testes sem nota de verdade:** `desktop/teste-rm-cupom.js` (RM falso em memória, entra no `test:frontend`) e `desktop/teste-rm-electron.js` (Electron + backend + RM falso em portas locais: login, emissão, PDF no lugar da impressora, RM fora do ar; também no CI). Nos testes com `FINDESK_DB_PATH` o RM fica desligado, a não ser com `FINDESK_RM_APP`.

## ATUALIZAR corrigido, tecnico e valor (2026-11-17)

- **2026-11-17 — ATUALIZAR igual ao Contas a Pagar:** o instalador e aberto direto com `--updated` (o PowerShell escondido nao funcionava: a loja ficou presa numa versao antiga, ainda com o modelo do carro em lista). O sistema so fecha se o instalador abriu. Ensaio obrigatorio pela tela no Windows (`desktop/ensaio-atualizacao-tela.js`) antes de publicar; pulado so na 1a versao, porque a anterior ainda tem o atualizador antigo. A loja instala essa 1a versao a mao, uma vez.
- **2026-11-17 — Cadastro (pedido do usuario):** rotulo "TECNICO QUE REALIZOU O SERVICO"; o VALOR nao e mais preenchido pela tabela de precos e o "TABELA: R$ ..." saiu.

## Tudo em MAIUSCULAS (2026-11-18)

- **2026-11-18 — Todo texto em MAIUSCULAS (pedido do usuario, nos dois sistemas):** o servidor do Garantias ja gravava em maiusculas (placa, modelo, tecnico, servico/produtos, OUTRO, observacao, marcas/veiculos, nomes das contas, planilha antiga). Agora as telas tambem mostram em maiusculas o que se digita (CSS `text-transform: uppercase` nos campos de texto; e-mail e senha ficam como sao).

## 2026-11-18 — Dica ao parar o mouse, tabelas com 5 linhas e NOME NO RM no main
- `frontend/ts/dicas.ts` (igual ao Contas a Pagar): todo botão/link ganha a dica do Windows (`title`); as telas principais têm explicação no main.ts.
- `tabela-recolhivel.ts` (do Contas a Pagar): Todos os técnicos/veículos/produtos, Atualizar preços, usuários e históricos de acesso mostram 5 linhas + EXPANDIR TABELA (Pesquisar garantia já tinha).
- v8 (main): `servicos.nome_rm` + correlação com os produtos do RM. Editável em Cadastrar produto, Todos os produtos e Atualizar preços (o CÓDIGO NO CUPOM continua). O ramo cupom-rm passa a usar a v9 para as colunas do cupom.

## 2026-11-18 — Tabelas com rolagem por dentro, pop-ups grandes e rolagem automática (2 sistemas)
- Tabelas: sem o botão EXPANDIR TABELA. Altura fixa de 5 linhas e rolagem DENTRO da tabela, cabeçalho parado no topo (`tabela-recolhivel.ts`, `.tabela-rolagem`; igual nos dois sistemas). Todas as linhas ficam na página (pesquisa, totais e impressão valem para todas).
- Pop-ups: todos maiores. Confirmações, exclusões e alertas de risco no MEIO da tela; avisos de "deu certo" (notificações) GRANDES no canto INFERIOR DIREITO (substitui a decisão de 2026-11-16 de tudo no meio).
- `rolagem.ts` (igual nos dois): clicar num registro leva a tela até "Alterar um campo" (não à nota fiscal); abrir uma caixa de seleção perto do pé da tela sobe a tela para a lista aparecer inteira.
- `docs/analise-banco.md`: tabelas e colunas usadas e mortas dos dois sistemas; nada apagado sem aprovação.

## 2026-11-19 — Correção da rolagem das caixas de seleção
- O `<body>` (altura 100%) é quem rola nas telas, não a janela. A versão anterior punha um marcador na JANELA: criava uma 2ª rolagem por fora, empurrava a tela e deixava faixa branca embaixo (Cadastrar Garantia, MODELO e PRODUTO). Agora `rolagem.ts` rola só a área que já rola e, no fim da página, põe o espaço extra DENTRO dela (some ao sair do campo). Smoke do Garantias reproduz as fotos do usuário.

## 2026-11-19 — Programa reabre sozinho depois da atualização
- Na loja o programa não reabria após atualizar. Causas possíveis: (1) o jeito padrão do NSIS abre pelo atalho do Menu Iniciar via Explorer (`ExecShellAsUser`), que pode falhar calado; (2) o programa novo abria enquanto o antigo ainda fechava e, sem a "instância única", fechava sozinho.
- Agora: `instalador.nsh` (customInstall, só em atualização) abre o exe DIRETO com `--reabrir-depois-da-atualizacao`; com essa marca o programa tenta a instância única a cada 0,5 s por até 40 s em vez de desistir (`desktop/main.js`). Se o atalho também abrir, um dos dois fica e o outro sai quieto.
- Ensaio do GitHub: além do processo, exige a JANELA aberta e ainda aberta 15 s depois.

## 2026-11-19 — Atualizar preços: salvar uma linha não apaga as outras
- Antes o SALVAR de uma linha recarregava a tabela inteira e apagava o que estava digitado (e não salvo) nas outras. Agora troca só a linha salva (com o que o servidor devolveu). Mudar só o NOME NO RM também liga o SALVAR. O REAJUSTE geral avisa quantas linhas digitadas e não salvas vai descartar.

## 2026-11-19 — Cupom fiscal automático no RM entra na versão oficial (main)
- Pedido do usuário: o ramo `cupom-rm` foi juntado à `main` e publicado pelo ATUALIZAR. Banco v9 (`cupom_venda_uuid`, `cupom_nfce`, `cupom_chave`) por cima da v8 (NOME NO RM).
- Chave de segurança: `"cupomAutomaticoRm": false` no `configuracoes.json` (pasta de dados) desliga a automação sem versão nova; aí o cupom volta a ser feito à mão e marcado LANÇADO em Pesquisar Garantia.
- Primeira vez na loja: ao abrir, a janela do RM aparece; a pessoa entra com e-mail e senha NA PÁGINA DO RM, uma vez (o sistema não lê nem guarda). Produtos sem NOME NO RM (ex.: TROCA CILINDRO IGNIÇÃO) dão o pop-up FAÇA O CUPOM NO RM até alguém preencher em Atualizar preços.

## 2026-11-19 — Segurança do cupom automático: PARAR TUDO e freio
- Painel do cupom (canto de baixo, à esquerda, em todas as telas, `painel-cupom.ts`): enquanto sai cupom mostra a garantia e a fila, com o botão vermelho PARAR TUDO (para na hora, sem perguntar). Parado, mostra CUPOM AUTOMÁTICO PARADO e LIGAR DE NOVO (pede confirmação: conferir ÚLTIMAS VENDAS no RM antes).
- Parado = nenhum cupom novo sai; os da fila ficam NÃO LANÇADO (um aviso só lista as garantias); salvar garantia parado avisa para fazer à mão. Só o cupom que já estava sendo enviado ao RM pode terminar.
- FREIO automático: 3 NFC-e em 5 minutos → o 4º não sai e o cupom automático para até alguém religar (contagem zera ao religar).
- O estado fica no `configuracoes.json` (`cupomAutomaticoRm`): continua parado depois de fechar e abrir; parado ao abrir nem conecta no RM.

## 2026-11-19 — Cupom: pop-up da automação com CANCELAR; o sistema não imprime mais
- Na loja o cupom montado pelo sistema (HTML impresso pelo Windows na DARUMA) saiu devagar e com cara diferente do cupom do RM. Pedido do usuário: por enquanto o sistema NÃO imprime; só pede ao RM para emitir a NFC-e. A impressão é pelo RM (ÚLTIMAS VENDAS); o aviso CUPOM FISCAL EMITIDO diz o número. O código de impressão ficou atrás de `imprimirPeloSistema` (desligado).
- O cupom só começa DEPOIS do OK no GARANTIA SALVA. Aparece o pop-up CUPOM FISCAL AUTOMÁTICO (meio da tela) com a garantia, as etapas (conectando, produtos, total, venda, emitindo) e CANCELAR, que para tudo (o atual e a fila) enquanto a nota não foi mandada ao RM; depois disso o botão vira "NOTA JÁ ENVIADA AO RM". Cancelar não desliga os próximos (para isso existe o parado/LIGAR DE NOVO).

## 2026-11-19 — REGRA PERMANENTE: nunca gerar nem imprimir documento fiscal
- Ordem do usuário: os nossos sistemas só mandam a requisição ao sistema fiscal (RM): produto, quantidade, valor, pagamento. Emitir, desenhar e imprimir é do RM. Apagados `desktop/cupom-impressao.js`, a impressão silenciosa na DARUMA, o PDF de teste e a dependência `qrcode-generator`. Um teste (`teste-rm-cupom.js`) garante que o gerador não volta e que `rm.js` não imprime. Regra também no CLAUDE.md e no AGENTS.md dos dois sistemas.

## 2026-11-19 — Cupom impresso PELO RM (botão CUPOM de ÚLTIMAS VENDAS)
- Lido o programa da página do RM (app.rmsoftware.dev.br liberado no ambiente): no PDV, ÚLTIMAS VENDAS tem para cada venda o botão "Cupom" (`aria-label="Cupom: item N — venda #<vendaNumero>"`), que pede `/cupom-dados`, monta o cupom na página do RM e chama `window.print()` (a janela de impressão de sempre).
- Depois de emitir, `rm.js` (`imprimirPeloRm`) faz isso na janela do RM: abre ÚLTIMAS VENDAS, acha a venda pelo número (`vendaNumero` devolvido pelo `/emitir`), mostra a janela do RM e aperta CUPOM. O RM abre a janela de impressão; a pessoa escolhe a DARUMA e imprime. Ao fechar a impressão (`afterprint`) a janela do RM some e o PDV recarrega. Nada é desenhado nem impresso em silêncio pelo nosso sistema. Se o botão não aparecer em 20 s: aviso "CUPOM EMITIDO — IMPRIMA PELO RM".
- O pop-up da automação ganhou a etapa "Imprimindo pelo RM (escolha a DARUMA e clique IMPRIMIR)".

## 2026-11-19 — Cupom sai SOZINHO na DARUMA (o cupom é o do RM)
- Pedido do usuário: salvou a garantia, o cupom sai sem tela do RM e sem clicar em imprimir. Na janela ESCONDIDA do RM o sistema abre ÚLTIMAS VENDAS, aperta CUPOM da venda; o RM monta o cupom dele e chama `window.print()`; o sistema troca essa chamada por um aviso (o cupom do RM fica na página) e manda a página do RM para a DARUMA com `webContents.print({ silent: true })`, margens nenhuma, escala 100. Depois recarrega o PDV. A janela do RM nunca aparece (só para o login).
- Sem DARUMA no Windows, botão do RM ausente ou falha: aviso "CUPOM EMITIDO — IMPRIMA PELO RM" (nunca emitir de novo). Regra fiscal reescrita: nunca montar cupom; imprimir só o que o RM montou.

## 2026-11-19 — Correção: quem imprime é o RM + navegador; o sistema só aperta os botões
- A 1.4.35 mandava a página do RM para a DARUMA pelo próprio sistema (impressão silenciosa). O usuário recusou: "é você que está imprimindo". Agora (`imprimirPeloRm`): na janela escondida do RM aperta CUPOM em ÚLTIMAS VENDAS; o RM chama a impressão do navegador, que abre a janela "Imprimir"; o sistema aperta IMPRIMIR nela (Enter, via WScript.Shell `AppActivate('Imprimir'|'Print')` + `SendKeys('~')`). Impressora = a padrão do Windows (deixar a DARUMA como padrão, como o próprio RM orienta).
- Removidos `webContents.print`, `printToPDF` e a escolha de impressora do código. `teste-rm-cupom.js` falha se voltarem. Regra fiscal reescrita nos dois sistemas.

## 2026-11-19 — Janela de impressão abre na Daruma DR700 e o IMPRIMIR é apertado de verdade
- Foto da loja: a impressão do navegador (prévia do Chromium, DENTRO da janela do RM) abria com outra impressora e ficava parada: o sistema procurava uma janela chamada "Imprimir", que não existe.
- Agora: `impressora-navegador.js` grava nas preferências do navegador da janela do RM (`<dados>/Partitions/rm/Preferences`, `printing.print_preview_sticky_settings`) a **Daruma DR700** como última impressora usada, margens Nenhuma e sem cabeçalho/rodapé — o mesmo que o operador faz uma vez no Chrome. A janela do RM tem título fixo "RM SOFTWARE - SISTEMA DE GARANTIAS"; durante a impressão ela aparece, o sistema a traz para a frente, espera 3 s e aperta Enter (Imprimir) uma vez; depois some. Nome da impressora trocável por `FINDESK_IMPRESSORA_CUPOM`.

## 2026-11-19 — Impressão automática DESLIGADA (até decidir)
- Na loja o "apertar IMPRIMIR" simulando o teclado (PowerShell AppActivate/SendKeys) abriu janelas do Windows e não imprimiu: a impressora PADRÃO do Windows é a Brother DCP-1610NW (pausada), e a janela de impressão abriu nela. Simular teclado pode apertar Enter na janela errada: código removido.
- Agora o RM só emite; aviso "CUPOM FISCAL EMITIDO — IMPRIMA PELO RM" (ÚLTIMAS VENDAS, botão CUPOM). O fluxo de apertar o CUPOM do RM continua no código, mas só roda com `apertarImprimir` (testes).

## 2026-11-19 — Modo quiosque com o cupom DO RM (autorizado pelo usuário)
- "Pode fazer esse modo quiosque, mas tem que usar o cupom dos caras." Na janela escondida do RM: ÚLTIMAS VENDAS → CUPOM da venda; o RM busca `/cupom-dados`, monta o cupom dele e chama `window.print()`; essa chamada vira um aviso (o cupom do RM fica na página) e a página do RM vai para a **Daruma DR700** com `webContents.print({ silent: true, deviceName })` (margens nenhuma, escala 100). Nenhuma janela aparece; nada de teclado simulado. Teste: o PDF de teste tem o texto do cupom do RM falso.

## 2026-11-19 — Técnico que realizou o serviço ≠ conta logada
- Bug: o cadastro preenchia o TÉCNICO com o nome de quem entrou e a caixa filtrava a lista por esse texto (só aparecia ele). Contas (quem usa o sistema) e técnicos (quem fez o serviço) são pessoas diferentes. Agora o técnico começa VAZIO para qualquer conta e a lista mostra TODOS os técnicos ativos; caixa com um item já escolhido mostra a lista inteira ao abrir (`caixa-busca.ts`, vale para modelo e produto). "Cadastrada por" continua vindo da sessão.
- Pesquisar Garantia: nenhuma trava por conta (conferido no código e no smoke com conta comum).

## 2026-11-19 — Login vencido no RM não derruba mais o cupom
- Na loja o RM pediu para entrar de novo no meio de uma garantia e o cupom foi para "faça à mão". Agora (`rm.js`): o cupom ESPERA (até 5 min), a janela do RM abre para alguém entrar e o pop-up da automação mostra "O RM pediu para ENTRAR DE NOVO"; entrou, o cupom CONTINUA SOZINHO (CANCELAR e PARAR TUDO valem durante a espera). Só depois de 5 min sem login vira "faça o cupom no RM". Teste com RM falso (login vencido no meio).

## 2026-11-19 — "Entrar de novo" falso: o RM renova o acesso sozinho
- Lido no programa do RM: o acesso fica em `localStorage` (`rm.access`/`rm.refresh`); ao vencer, a página recebe 401 em `/v1/auth/me`, chama `/v1/auth/refresh` e repete. O nosso `rm.js` tratava o PRIMEIRO 401 como "login" e pedia para entrar de novo mesmo com o login válido. Agora o 401 só vira login se o `/auth/me` não voltar 200 em 8 s (ou se a página for para /login).
- Manter a sessão: com o sistema parado (nenhum cupom saindo) a janela escondida reabre o PDV do RM a cada 10 min, e a própria página renova o acesso. Se o RM pedir login nessa hora, pop-up "ENTRE NO RM".
- O sistema continua sem guardar e-mail nem senha do RM (decisão do usuário de 2026-11-17).

## 2026-11-19 — Impressora do cupom configurável (PC de desenvolvimento = Salvar como PDF)
- `configuracoes.json` ganhou `impressoraCupom` (padrão "Daruma DR700"). No PC de desenvolvimento, sem Daruma, usa-se "Microsoft Print to PDF" (o "Salvar como PDF" do Windows): o fluxo é o mesmo (cupom do RM → impressora escolhida), só muda o destino. Só o nome exato é aceito (nunca cai na Brother nem em outra). `docs/desenvolvimento-no-pc.md` explica como instalar e rodar.
- Impressão = sempre o modo quiosque (o navegador manda a página do RM, com o cupom do RM, para a impressora escolhida). Apertar IMPRIMIR numa janela do Windows não é feito (exigiria simular teclado, proibido).

## 2026-11-19 — Cupom do modo quiosque saía em folha A4 (causa do cupom "diferente" na Daruma)
- Lido o programa do RM (`app.rmsoftware.dev.br/assets/index-*.js`, componente do cupom `cupom-print-root`): o CSS de impressão do RM declara só `@page { margin: 0; }` e, de propósito, NÃO declara tamanho ("a página É a folha" do driver: bobina de 80 mm na Daruma); a largura do cupom é a da `.cupom` (72 mm, 9 px, negrito). No Chrome a janela de impressão usa a folha da impressora.
- Lido o código do Electron 44 (`electron_api_web_contents.cc`): `webContents.print` sem `usePrinterDefaultPageSize` manda folha **A4 (210 × 297 mm)** para qualquer impressora. Era isso que deixava o cupom automático com outro formato e devagar/falhado na térmica. O DPI já é o da impressora (igual ao Chrome).
- Correção: `opcoesImpressaoCupom()` em `impressora-navegador.js` = as escolhas da janela do Chrome (margens Nenhuma, escala 100, sem fundo, sem cabeçalho) + `usePrinterDefaultPageSize: true`; nunca `pageSize` nem `dpi`. Teste em `teste-rm-cupom.js`.
- As linhas que faltaram na loja ("Não permite aproveitamento de crédito de ICMS", "Valor dos produtos") são FIXAS no cupom do RM (sem condição); faltavam no gerador antigo do próprio sistema (`cupom-impressao.js`, apagado em 2026-11-19). Se faltarem de novo, a loja está numa versão antiga: ATUALIZAR.
- Checagem no Windows (não automatizável na nuvem: precisa de login real no RM e de impressora): `docs/desenvolvimento-no-pc.md` → "Conferir o cupom".
