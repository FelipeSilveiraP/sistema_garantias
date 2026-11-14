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
