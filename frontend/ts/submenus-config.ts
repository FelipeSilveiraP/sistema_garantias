import { Tela } from "./navegacao";

export type TelaSubmenu = "estatisticas" | "controle" | "tecnicos" | "veiculos" | "produtos";

export interface BotaoSubmenu {
  chave: string;
  rotulo: string;
  cor: string;
  selo: string;
  seloTexto: string;
  icone: string;
  traco?: string;
  destino?: Tela;
}

export interface ConfigSubmenu {
  titulo: string;
  botoes: BotaoSubmenu[];
}

const SVG = {
  controle:
    '<path d="M4 6h16M4 12h16M4 18h16"></path><circle cx="9" cy="6" r="2"></circle><circle cx="15" cy="12" r="2"></circle><circle cx="9" cy="18" r="2"></circle>',
  tecnico:
    '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
  carro:
    '<path d="M3 16v-4l2-5h14l2 5v4z"></path><circle cx="7.5" cy="16.5" r="2"></circle><circle cx="16.5" cy="16.5" r="2"></circle><line x1="3" x2="21" y1="12" y2="12"></line>',
  lista:
    '<line x1="8" x2="21" y1="6" y2="6"></line><line x1="8" x2="21" y1="12" y2="12"></line><line x1="8" x2="21" y1="18" y2="18"></line><rect height="2" width="2" x="3" y="5"></rect><rect height="2" width="2" x="3" y="11"></rect><rect height="2" width="2" x="3" y="17"></rect>',
  grafico: '<line x1="3" x2="21" y1="21" y2="21"></line><rect height="8" width="4" x="4" y="12"></rect><rect height="13" width="4" x="10" y="7"></rect><rect height="17" width="4" x="16" y="3"></rect>',
  etiqueta:
    '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"></path><circle cx="8" cy="8" r="1.5"></circle>',
  prancheta:
    '<rect height="16" rx="1" width="13" x="3" y="4"></rect><path d="M7 4V2a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-2"></path><line x1="6" x2="13" y1="9" y2="9"></line><line x1="6" x2="13" y1="13" y2="13"></line><line x1="6" x2="10" y1="17" y2="17"></line>',
  recorrente:
    '<path d="M21 12a9 9 0 0 0-15.5-6.36L3 8"></path><polyline points="3 3 3 8 8 8"></polyline><path d="M3 12a9 9 0 0 0 15.5 6.36L21 16"></path><polyline points="21 21 21 16 16 16"></polyline>',
  pago: '<rect height="14" rx="1" width="20" x="2" y="5"></rect><line x1="2" x2="22" y1="10" y2="10"></line><path d="M6 15l2 2 4-4"></path>',
  envelope: '<rect height="14" rx="1" width="20" x="2" y="5"></rect><path d="M2 7l10 6 10-6"></path>',
  editar:
    '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>',
  pasta: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"></path>',
  quadradoMais:
    '<rect height="18" rx="1" width="18" x="3" y="3"></rect><line x1="12" x2="12" y1="8" y2="16"></line><line x1="8" x2="16" y1="12" y2="12"></line>',
  circuloMais:
    '<circle cx="12" cy="12" r="9"></circle><line x1="12" x2="12" y1="8" y2="16"></line><line x1="8" x2="16" y1="12" y2="12"></line>',
  empresa:
    '<path d="M4 21V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16"></path><path d="M16 9h3a1 1 0 0 1 1 1v11"></path><line x1="3" x2="21" y1="21" y2="21"></line><path d="M8 8h2"></path><path d="M8 12h2"></path><path d="M8 16h2"></path>',
  pagador:
    '<circle cx="10" cy="8" r="4"></circle><path d="M3 20a7 7 0 0 1 14 0"></path><line x1="19" x2="19" y1="8" y2="14"></line><line x1="16" x2="22" y1="11" y2="11"></line>',
  banco:
    '<path d="M3 10h18"></path><path d="M5 10v8"></path><path d="M9 10v8"></path><path d="M15 10v8"></path><path d="M19 10v8"></path><line x1="3" x2="21" y1="21" y2="21"></line><path d="M12 3l9 5H3z"></path>',
};

export const SUBMENUS: Record<TelaSubmenu, ConfigSubmenu> = {
  // botao 3 do Menu (CONTROLE): GRAFICOS e o botao CONTROLE (tecnicos, veiculos e tabela)
  estatisticas: {
    titulo: "Controle",
    botoes: [
      {
        chave: "graficos",
        rotulo: "GRÁFICOS",
        cor: "bg-[#38BDF8]",
        selo: "bar_chart",
        seloTexto: "text-[#1c1b1b]",
        icone: SVG.grafico,
        destino: "graficos",
      },
      {
        chave: "controle",
        rotulo: "CONTROLE",
        cor: "bg-[#FF8C00]",
        selo: "tune",
        seloTexto: "text-[#1c1b1b]",
        icone: SVG.controle,
        destino: "controle",
      },
    ],
  },
  controle: {
    titulo: "Controle",
    botoes: [
      {
        chave: "tecnicos",
        rotulo: "TÉCNICOS",
        cor: "bg-[#FFE600]",
        selo: "engineering",
        seloTexto: "text-[#1c1b1b]",
        icone: SVG.tecnico,
        destino: "tecnicos",
      },
      {
        chave: "veiculos",
        rotulo: "VEÍCULOS",
        cor: "bg-[#FF5E89]",
        selo: "directions_car",
        seloTexto: "text-[#1c1b1b]",
        icone: SVG.carro,
        destino: "veiculos",
      },
      {
        chave: "produtos",
        rotulo: "TABELA DE VALORES",
        cor: "bg-[#00FF66]",
        selo: "request_quote",
        seloTexto: "text-[#1c1b1b]",
        icone: SVG.etiqueta,
        destino: "produtos",
      },
    ],
  },
  tecnicos: {
    titulo: "Técnicos",
    botoes: [
      {
        chave: "form-tecnico",
        rotulo: "CADASTRAR TÉCNICO",
        cor: "bg-[#FFE600]",
        selo: "person_add",
        seloTexto: "text-[#1c1b1b]",
        icone: SVG.tecnico,
        destino: "form-tecnico",
      },
      {
        chave: "todos-tecnicos",
        rotulo: "TODOS OS TÉCNICOS",
        cor: "bg-[#38BDF8]",
        selo: "groups",
        seloTexto: "text-[#1c1b1b]",
        icone: SVG.lista,
        destino: "todos-tecnicos",
      },
    ],
  },
  veiculos: {
    titulo: "Veículos",
    botoes: [
      {
        chave: "form-veiculo",
        rotulo: "CADASTRAR VEÍCULO",
        cor: "bg-[#FF5E89]",
        selo: "add_circle",
        seloTexto: "text-[#1c1b1b]",
        icone: SVG.carro,
        destino: "form-veiculo",
      },
      {
        chave: "todos-veiculos",
        rotulo: "TODOS OS VEÍCULOS",
        cor: "bg-[#38BDF8]",
        selo: "directions_car",
        seloTexto: "text-[#1c1b1b]",
        icone: SVG.lista,
        destino: "todos-veiculos",
      },
    ],
  },
  produtos: {
    titulo: "Tabela de valores",
    botoes: [
      {
        chave: "form-produto",
        rotulo: "CADASTRAR PRODUTO",
        cor: "bg-[#00FF66]",
        selo: "add_box",
        seloTexto: "text-[#1c1b1b]",
        icone: SVG.etiqueta,
        destino: "form-produto",
      },
      {
        chave: "atualizar-precos",
        rotulo: "ATUALIZAR PREÇOS",
        cor: "bg-[#FF8C00]",
        selo: "sell",
        seloTexto: "text-[#1c1b1b]",
        icone: SVG.etiqueta,
        destino: "atualizar-precos",
      },
      {
        chave: "todos-produtos",
        rotulo: "TODOS OS PRODUTOS",
        cor: "bg-[#38BDF8]",
        selo: "inventory_2",
        seloTexto: "text-[#1c1b1b]",
        icone: SVG.lista,
        destino: "todos-produtos",
      },
    ],
  },
};
