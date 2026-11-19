// Despacho por tela com carregamento sob demanda: cada pagina importa somente
// o modulo que utiliza (chunks ESM gerados pelo esbuild --splitting).
import { iniciarDiagnostico } from "./diagnostico";
import { iniciarNotificacoes } from "./notificacoes";
import { ligarEnterEnvia } from "./enter-envia";
import { ligarDicas } from "./dicas";
import { ligarRolagemAutomatica } from "./rolagem";

iniciarDiagnostico();
// Enter em qualquer campo = botao de enviar/concluir daquele formulario
ligarEnterEnvia();
// regioes vivas das notificacoes existem desde o carregamento (e mostram o aviso deixado pela tela anterior)
iniciarNotificacoes();
// rolagem automatica: clique no registro leva ao editor; caixa de selecao abre inteira
ligarRolagemAutomatica();
// dica do Windows ao parar o mouse em cima de qualquer botao
ligarDicas({
  "CADASTRAR GARANTIA": "Cadastrar garantia: registrar um serviço com garantia (sai o cupom fiscal)",
  "PESQUISAR GARANTIA": "Pesquisar garantia: procurar, ver, editar e imprimir as garantias",
  "PESQUISAR GARANTIAS": "Pesquisar garantia: procurar, ver, editar e imprimir as garantias",
  CONTROLE: "Controle: técnicos, veículos, tabela de valores e gráficos",
  "ESTATÍSTICAS": "Controle: técnicos, veículos, tabela de valores e gráficos",
  "GRÁFICOS": "Gráficos das garantias",
  "TÉCNICOS": "Técnicos: cadastrar e ver os técnicos",
  "VEÍCULOS": "Veículos: cadastrar e ver as marcas e modelos",
  "TABELA DE VALORES": "Tabela de valores: produtos, preços e nome no RM",
  "MENU PRINCIPAL": "Voltar para o Menu Principal",
  VOLTAR: "Voltar para a tela anterior",
  APLICAR: "Salvar a alteração deste campo",
  DESFAZER: "Voltar o campo ao valor gravado",
});

const tela = document.body.dataset.tela ?? "menu";

async function iniciar(): Promise<void> {
  switch (tela) {
    case "menu": {
      const { iniciarMenu } = await import("./telas/menu");
      iniciarMenu();
      return;
    }
    case "carregando": {
      const { iniciarCarregando } = await import("./telas/carregando");
      iniciarCarregando();
      return;
    }
    case "perfis": {
      const { iniciarPerfis } = await import("./telas/perfis");
      iniciarPerfis();
      return;
    }
    case "form-tecnico":
    case "form-veiculo":
    case "form-produto": {
      const { iniciarFormCadastro } = await import("./telas/form-cadastro");
      iniciarFormCadastro(tela);
      return;
    }
    case "todos-tecnicos":
    case "todos-veiculos":
    case "todos-produtos": {
      const { iniciarTodosCadastro } = await import("./telas/todos-cadastro");
      iniciarTodosCadastro(tela);
      return;
    }
    case "contas": {
      const { iniciarContas } = await import("./telas/contas");
      iniciarContas();
      return;
    }
    case "cadastrar-garantia": {
      const { iniciarCadastrarGarantia } = await import("./telas/cadastrar-garantia");
      iniciarCadastrarGarantia();
      return;
    }
    case "pesquisar-garantias": {
      const { iniciarPesquisarGarantias } = await import("./telas/pesquisar-garantias");
      iniciarPesquisarGarantias();
      return;
    }
    case "graficos": {
      const { iniciarGraficos } = await import("./telas/graficos");
      iniciarGraficos();
      return;
    }
    case "atualizar-precos": {
      const { iniciarAtualizarPrecos } = await import("./telas/atualizar-precos");
      iniciarAtualizarPrecos();
      return;
    }
    default: {
      const { iniciarSubmenu } = await import("./telas/submenu");
      const { SUBMENUS } = await import("./submenus-config");
      const config = (SUBMENUS as Record<string, Parameters<typeof iniciarSubmenu>[1]>)[tela];
      if (config) {
        iniciarSubmenu(tela as Parameters<typeof iniciarSubmenu>[0], config);
      } else {
        console.error("[Garantias] tela desconhecida:", tela);
      }
    }
  }
}

void iniciar().then(() => {
  // Sinal de prontidao: componentes da tela ja inicializados.
  document.body.dataset.pronto = "true";
  // pop-ups do cupom fiscal no RM (menos na tela de carregamento)
  if (tela !== "carregando") void import("./avisos-rm").then(({ iniciarAvisosRm }) => iniciarAvisosRm());
  // painel do cupom fiscal: PARAR TUDO enquanto sai cupom; LIGAR DE NOVO quando parado
  if (tela !== "carregando") void import("./painel-cupom").then(({ iniciarPainelCupom }) => iniciarPainelCupom());
});
