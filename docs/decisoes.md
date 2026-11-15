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

