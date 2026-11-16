# Instalação, atualização e manutenção

Guia para instalar o **Sistema de Garantias — Chaveiro Universal** no computador da loja. Não precisa de internet nem de Java instalado: tudo vai dentro do instalador.

## Gerar o instalador (computador de desenvolvimento)

Requisitos: JDK 21, Maven 3.9+ e Node.js 20+.

```bash
npm install
npm run instalador
```

O comando faz tudo em sequência:
1. compila a interface;
2. roda os testes do backend e gera o `.jar`;
3. cria um Java mínimo com o `jlink`, de cerca de 50 MB;
4. monta o instalador.

Resultado: `release/Garantias - Chaveiro Universal - Instalador <versão>.exe`, com cerca de 143 MB.

## Baixar o instalador pelo GitHub (o jeito mais fácil)

A cada envio para a `main`, o GitHub gera o instalador num Windows dele (`.github/workflows/instalador.yml`) e publica em **Releases**. Na loja:

1. Abra https://github.com/FelipeSilveiraP/sistema_garantias.
2. À direita, clique em **Releases** (ou no nome da versão, ex.: "Garantias 1.4.0").
3. Em **Assets**, clique em `Garantias - Chaveiro Universal - Instalador X.Y.Z.exe` para baixar.
4. Siga "Instalar" abaixo.

## Instalar (computador da loja)

1. Baixe o instalador pelo GitHub (acima) ou copie por pen drive, rede ou como preferir.
2. Dê dois cliques. A instalação é automática, para o usuário do Windows, **sem pedir senha de administrador**, e o sistema abre sozinho ao terminar.
3. Atalhos criados: **"Garantias"** na Área de Trabalho e no Menu Iniciar.

O Windows pode mostrar o aviso "O Windows protegeu o computador", porque o instalador não tem assinatura digital paga. Clique em **Mais informações › Executar assim mesmo**.

## Atualizar para uma versão nova — automático pelo GitHub (recomendado)

1. No seu computador, faça e teste as mudanças e envie para a `main` (`git push origin main`).
2. O GitHub gera o instalador sozinho, com a **versão aumentada automaticamente** (ex.: 1.4.2 → 1.4.3), e publica em **Releases** (~15 min).
3. Na loja, ao abrir o sistema, o Menu mostra **"Nova versão X disponível"** com o botão **ATUALIZAR**.
4. Clique em ATUALIZAR: o sistema baixa o instalador do GitHub, **confere a impressão digital SHA-256** (arquivo incompleto ou alterado é recusado e nada é instalado), fecha, instala e abre de novo.

**Os registros nunca se perdem:** o banco fica em `%LOCALAPPDATA%\ChaveiroUniversal\Garantias`, fora da pasta do programa; o instalador não apaga dados; ao abrir a versão nova o sistema faz um **backup do banco antes** de qualquer mudança de estrutura, e as mudanças só acrescentam (teste `AtualizacaoSemPerdaTest`, que confere linha por linha). Sem internet, o sistema funciona normal e procura a atualização na pasta do Google Drive (abaixo).

## Atualizar para uma versão nova — pelo Google Drive (sem internet no GitHub)

No computador de desenvolvimento:

1. Faça e teste as mudanças. Depois suba a versão em `package.json` (ex.: `1.3.0` → `1.4.0`). Sem versão maior, a loja não oferece a atualização.
2. `npm run instalador`
3. `npm run publicar -- "o que mudou nesta versão"`

O `publicar` copia o instalador e um `versao.json` para `Meu Drive\Chaveiro Universal - Atualizacoes Garantias`. Esse arquivo leva a versão, as novidades e a impressão digital SHA-256 do instalador. A pasta precisa estar no **Drive da conta da firma**, o mesmo logado no computador da loja. Se este computador usa outra conta, compartilhe essa pasta com a conta da firma ou envie os dois arquivos para ela pelo drive.google.com.

Na loja, depois que o Drive sincroniza:

4. Ao abrir, o Menu mostra **"Nova versão X disponível"** com o botão **ATUALIZAR**.
5. Clique em ATUALIZAR. O sistema fecha, o instalador roda sozinho e o sistema abre de novo já atualizado.

**Ligação entre os Drives (uma vez):** na conta da firma, crie em Meu Drive a pasta `Chaveiro Universal - Atualizacoes Garantias` e compartilhe com o e-mail do desenvolvedor como **Editor**. No computador de desenvolvimento, em drive.google.com › Compartilhados comigo, clique com o botão direito na pasta e escolha Organizar › Adicionar atalho › Meu Drive. Na loja, no Explorador de Arquivos, clique com o botão direito na pasta e escolha **Disponível off-line**: o instalador fica baixado antes de você clicar em ATUALIZAR.

O sistema só oferece a atualização quando a versão é maior que a instalada **e** o instalador está completo, ou seja, quando o SHA-256 confere. Por isso um arquivo ainda sincronizando pela metade nunca é instalado. Os dados não são tocados, e o backup pré-migração continua automático.

## Atualizar para uma versão nova — manualmente

1. Feche o sistema.
2. Rode o instalador da versão nova. Ele substitui o programa e **não toca nos dados**.
3. Ao abrir, o sistema faz sozinho um **backup do banco** antes de aplicar qualquer mudança de estrutura (migração). As migrações só acrescentam, nunca apagam dados.

## Não abre sozinho com o Windows

**O Sistema de Garantias não abre sozinho quando o computador liga** (pedido do usuário, 2026-11-16). O instalador não cadastra o sistema na inicialização do Windows e **apaga** o cadastro que as versões até a 1.4.5 gravavam; o sistema também confere e apaga esse cadastro toda vez que abre. Para usar, abra pelo atalho **"Garantias"** na Área de Trabalho ou no Menu Iniciar. (Quem abre sozinho com o Windows é o Contas a Pagar.)

## Onde ficam os dados

| O quê | Onde |
|---|---|
| Banco de dados | `%LOCALAPPDATA%\ChaveiroUniversal\Garantias\garantias.db` |
| Backups automáticos (diário e antes de cada migração; mantém os 8 últimos) | `%LOCALAPPDATA%\ChaveiroUniversal\Garantias\backups\` |
| Logs (`app.log` e `backend.log`, com rotação de 5 MB e limite de 50 MB) | `%LOCALAPPDATA%\ChaveiroUniversal\Garantias\logs\` |
| Notas fiscais baixadas | `Downloads\Chaveiro Universal - Notas Fiscais\` |
| Relatórios impressos (PDF) | `Downloads\Chaveiro Universal - Relatórios\` |

Para abrir a pasta: tecla **Windows + R**, digite `%LOCALAPPDATA%\ChaveiroUniversal\Garantias` e aperte Enter.

**Cópia de segurança extra:** de tempos em tempos, copie a pasta `backups` para um pen drive. Não copie o arquivo `.db` com o sistema aberto: use os arquivos da pasta `backups`, que são cópias consistentes.

## Desinstalar

Configurações do Windows › Aplicativos › "Garantias - Chaveiro Universal" › Desinstalar. **Os dados e os backups continuam** em `%LOCALAPPDATA%\ChaveiroUniversal\`. Para apagá-los também, exclua essa pasta manualmente.

## Se algo der errado

- **"O sistema encontrou um problema e precisa ser fechado":** abra de novo pelo atalho. Se repetir, envie a pasta `logs`. Os logs não contêm senhas nem o código de acesso interno.
- **Tela de carregamento com erro:** use **Tentar novamente**. Se persistir, reinicie o computador e envie a pasta `logs`.
