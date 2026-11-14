# Plano de telas — Sistema de Garantias

Mesmo design neobrutalista do Contas a Pagar (barra global, bordas pretas, sombras duras, selos arredondados, diálogos próprios).

| Tela | Arquivos | Conteúdo |
|---|---|---|
| Menu | `menu.html` / `telas/menu.ts` | Emblema, resumo do dia e 3 cartões: CADASTRAR GARANTIA (amarelo), PESQUISAR GARANTIA (azul), ESTATÍSTICA E ATUALIZAÇÕES (verde). Atalhos 1/2/3. Aviso do backup no Drive e oferta de atualização. |
| Cadastrar Garantia | `cadastrar-garantia.*` | Data, técnico, placa (+ "sem placa"), CPF, modelo (lista ou digitado), serviço (tabela de preços + OUTRO), quantidades conforme o serviço, valor sugerido, observação. LIMPAR e SALVAR (F10). |
| Pesquisar Garantia | `pesquisar-garantias.*` | Pesquisa livre, filtros (mês, ano, todas, sem cupom), tabela com colunas extras (CPF, observação), área de edição (alterar um campo, cupom, imprimir, excluir), imprimir lista, importar planilha antiga. |
| Estatística e Atualizações | `estatisticas.html` + `submenus-config.ts` | Submenu com GRÁFICOS e ATUALIZAR PREÇOS. |
| Gráficos | `graficos.*` | Período (mês, 3 meses, ano), garantias e valor, cupom pendente, garantias por mês, serviços, técnicos e modelos. Imprimir. |
| Atualizar Preços | `atualizar-precos.*` | Tabela de preços (preço, código no cupom, ativo, salvar por linha), reajuste em %, novo serviço/peça, listas de técnicos e modelos. |
