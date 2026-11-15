package com.chaveiro.service;

import com.chaveiro.model.Garantia;
import com.chaveiro.model.Servico;
import com.chaveiro.repository.GarantiaRepository;
import com.chaveiro.repository.ServicoRepository;
import com.chaveiro.repository.VeiculoRepository;
import com.chaveiro.model.Veiculo;
import java.math.BigDecimal;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Regras do cadastro de garantias (frmControleGarantias V17.1 do VBA):
 * - placa com 7 letras/numeros (sem traco/espaco) OU "sem placa" com CPF de 11 digitos;
 * - modelo, servico e tecnico obrigatorios; "OUTRO" exige a descricao do servico;
 * - quantidades de 1 a 5 conforme o servico (carcaca, botao, pilha ou itens);
 * - valor em reais (0 permitido, como no VBA).
 */
@Service
public class GarantiaService {

    private static final Logger log = LoggerFactory.getLogger(GarantiaService.class);
    private static final Set<String> STATUS_CUPOM = Set.of("NAO_LANCADO", "LANCADO", "DISPENSADO");

    private final GarantiaRepository repository;
    private final ServicoRepository servicos;
    private final VeiculoRepository veiculos;

    public GarantiaService(GarantiaRepository repository, ServicoRepository servicos, VeiculoRepository veiculos) {
        this.repository = repository;
        this.servicos = servicos;
        this.veiculos = veiculos;
    }

    public List<Garantia> listar() {
        try {
            return repository.listar();
        } catch (SQLException erro) {
            log.error("falha ao listar garantias", erro);
            throw new IllegalStateException("falha ao consultar as garantias", erro);
        }
    }

    public Garantia buscarPorId(long id) {
        try {
            return repository.buscarPorId(id).orElseThrow(() -> new RecursoNaoEncontradoException("garantia"));
        } catch (SQLException erro) {
            log.error("falha ao buscar garantia id={}", id, erro);
            throw new IllegalStateException("falha ao consultar a garantia", erro);
        }
    }

    public Garantia cadastrar(Garantia dados, boolean forcar) {
        Garantia g = normalizarEValidar(dados);
        try {
            if (!forcar) {
                var parecida = repository.buscarParecida(g);
                if (parecida.isPresent()) {
                    throw new PossivelDuplicataException(parecida.get());
                }
            }
            return repository.inserir(g);
        } catch (SQLException erro) {
            log.error("falha ao cadastrar garantia", erro);
            throw new IllegalStateException("falha ao salvar a garantia", erro);
        }
    }

    /** Produto escrito na tela: da tabela (idServico) ou OUTRO (descricao). */
    public record ItemEntrada(Long idServico, String descricao, Integer quantidade) {
    }

    /**
     * Cadastro com varios produtos (botao + na tela). Monta o resumo em texto
     * ("TROCA CARCACA + 2x PILHA"), as quantidades de carcaca/botao/pilha/itens e o
     * codigo do cupom (codigos unidos por "_", como os combos do VBA) e grava a
     * garantia com os itens numa transacao so.
     */
    public Garantia cadastrarComItens(Garantia dados, List<ItemEntrada> entrada, boolean forcar) {
        Map<String, String> erros = new LinkedHashMap<>();
        List<com.chaveiro.model.ItemGarantia> itens = new java.util.ArrayList<>();
        List<String> partes = new java.util.ArrayList<>();
        List<String> codigos = new java.util.ArrayList<>();
        int carcaca = 0;
        int botao = 0;
        int pilha = 0;
        int outros = 0;
        Long primeiro = null;
        if (entrada == null || entrada.isEmpty()) {
            erros.put("servico", "Escolha pelo menos um produto.");
        } else if (entrada.size() > 10) {
            erros.put("servico", "No máximo 10 produtos por garantia.");
        } else {
            for (ItemEntrada e : entrada) {
                int q = e.quantidade() == null ? 1 : e.quantidade();
                if (q < 1 || q > 5) {
                    erros.put("servico", "Quantidade de 1 a 5 em cada produto.");
                    break;
                }
                Servico s = null;
                if (e.idServico() != null) {
                    try {
                        s = servicos.buscarPorId(e.idServico()).orElse(null);
                    } catch (SQLException erro) {
                        throw new IllegalStateException("falha ao consultar o produto", erro);
                    }
                    if (s == null) {
                        erros.put("servico", "Produto não encontrado. Escolha outro.");
                        break;
                    }
                }
                String nome = s != null ? s.nome() : e.descricao() == null ? "" : linha(e.descricao()).toUpperCase(Locale.ROOT);
                if (nome.length() < 2 || nome.length() > 120) {
                    erros.put("servico", "Escolha o produto ou descreva o que foi feito em OUTRO.");
                    break;
                }
                long preco = s == null ? 0 : s.preco().movePointRight(2).longValue();
                itens.add(new com.chaveiro.model.ItemGarantia(s == null ? null : s.id(), nome, q, preco));
                partes.add(q > 1 ? q + "x " + nome : nome);
                if (s != null && s.codigoCupom() != null && !s.codigoCupom().isBlank()) {
                    codigos.add(s.codigoCupom());
                }
                if (primeiro == null && s != null) {
                    primeiro = s.id();
                }
                String n = nome.toUpperCase(Locale.ROOT);
                if (s != null && s.peca() && n.contains("PILHA")) {
                    pilha += q;
                } else if (s != null && s.peca() && n.contains("BOT")) {
                    botao += q;
                } else if (s != null && s.pedeCarcaca()) {
                    carcaca += q;
                } else {
                    outros += q;
                }
            }
        }
        String resumo = String.join(" + ", partes);
        if (erros.isEmpty() && resumo.length() > 120) {
            erros.put("servico", "Produtos demais para uma garantia: o resumo passa de 120 letras.");
        }
        // o resto (data, placa, CPF, modelo, tecnico, valor...) passa pela validacao de sempre
        Garantia base = new Garantia(dados.id(), dados.dataServico(), dados.placa(), dados.semPlaca(), dados.cpf(),
                dados.modelo(), null, resumo.isEmpty() ? "XX" : resumo, 0, 0, 0, 0, dados.valor(), dados.tecnico(),
                dados.observacao(), null, null, null, "SISTEMA", dados.criadoPor(), dados.idVeiculo());
        Garantia g;
        try {
            g = normalizarEValidar(base);
        } catch (DadosInvalidosException e) {
            erros.putAll(e.getCampos());
            throw new DadosInvalidosException(erros);
        }
        if (!erros.isEmpty()) {
            throw new DadosInvalidosException(erros);
        }
        Garantia completa = new Garantia(g.id(), g.dataServico(), g.placa(), g.semPlaca(), g.cpf(), g.modelo(), primeiro,
                resumo, Math.min(carcaca, 99), Math.min(botao, 99), Math.min(pilha, 99), Math.min(outros, 99), g.valor(),
                g.tecnico(), g.observacao(), codigos.isEmpty() ? null : String.join("_", codigos), null, null, "SISTEMA",
                g.criadoPor(), g.idVeiculo());
        try {
            if (!forcar) {
                var parecida = repository.buscarParecida(completa);
                if (parecida.isPresent()) {
                    throw new PossivelDuplicataException(parecida.get());
                }
            }
            return repository.inserirComItens(completa, itens);
        } catch (SQLException erro) {
            log.error("falha ao cadastrar garantia com itens", erro);
            throw new IllegalStateException("falha ao salvar a garantia", erro);
        }
    }

    public Garantia atualizar(long id, Garantia dados) {
        Garantia g = normalizarEValidar(dados);
        try {
            if (!repository.atualizar(id, g)) {
                throw new RecursoNaoEncontradoException("garantia");
            }
            return buscarPorId(id);
        } catch (SQLException erro) {
            log.error("falha ao atualizar garantia id={}", id, erro);
            throw new IllegalStateException("falha ao atualizar a garantia", erro);
        }
    }

    public void excluir(long id) {
        try {
            if (!repository.excluir(id)) {
                throw new RecursoNaoEncontradoException("garantia");
            }
        } catch (SQLException erro) {
            log.error("falha ao excluir garantia id={}", id, erro);
            throw new IllegalStateException("falha ao excluir a garantia", erro);
        }
    }

    /** Estrutura para a automacao futura do cupom fiscal (SAT web): registra a situacao do cupom. */
    public Garantia marcarCupom(long id, String status) {
        String s = status == null ? "" : status.trim().toUpperCase(Locale.ROOT);
        if (!STATUS_CUPOM.contains(s)) {
            throw new DadosInvalidosException(Map.of("cupomStatus", "Situação do cupom inválida."));
        }
        String quando = "LANCADO".equals(s)
                ? LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")) : null;
        try {
            if (!repository.atualizarCupom(id, s, quando)) {
                throw new RecursoNaoEncontradoException("garantia");
            }
            return buscarPorId(id);
        } catch (SQLException erro) {
            log.error("falha ao marcar cupom da garantia id={}", id, erro);
            throw new IllegalStateException("falha ao atualizar o cupom", erro);
        }
    }

    /** Placa sem traco/espaco, em maiusculas (regra do VBA: IsPlacaValida). */
    static String limparPlaca(String placa) {
        return placa == null ? "" : placa.replace("-", "").replace(" ", "").trim().toUpperCase(Locale.ROOT);
    }

    /** Placa brasileira: antiga (ABC1234) ou Mercosul (ABC1D23), sem consulta externa. */
    static boolean placaValida(String placa) {
        return placa != null && placa.matches("[A-Z]{3}[0-9][A-Z0-9][0-9]{2}");
    }

    /** CPF: 11 numeros, nao todos iguais, e os 2 digitos verificadores (modulo 11) certos. */
    static boolean cpfValido(String cpf) {
        if (cpf == null || !cpf.matches("[0-9]{11}") || cpf.chars().distinct().count() == 1) {
            return false;
        }
        int[] d = cpf.chars().map(c -> c - '0').toArray();
        for (int pos = 9; pos <= 10; pos++) {
            int soma = 0;
            for (int i = 0; i < pos; i++) {
                soma += d[i] * (pos + 1 - i);
            }
            int resto = soma % 11;
            if (d[pos] != (resto < 2 ? 0 : 11 - resto)) {
                return false;
            }
        }
        return true;
    }

    static String soDigitos(String texto) {
        return texto == null ? "" : texto.replaceAll("\\D", "");
    }

    private static String textoOuNulo(String texto) {
        return texto == null || texto.isBlank() ? null : semControle(texto).trim();
    }

    /** Tira caracteres de controle (NUL, ESC...), mas mantem quebra de linha e tab. */
    static String semControle(String texto) {
        return texto.replaceAll("[\\p{Cntrl}&&[^\\n\\r\\t]]", "");
    }

    /** Texto de uma linha so: sem controle nenhum e com os espacos juntados. */
    static String linha(String texto) {
        return texto.replaceAll("\\p{Cntrl}", " ").trim().replaceAll("\\s+", " ");
    }

    private Garantia normalizarEValidar(Garantia d) {
        Map<String, String> erros = new LinkedHashMap<>();
        if (d.dataServico() == null) {
            erros.put("dataServico", "Informe a data do serviço.");
        } else if (d.dataServico().isAfter(LocalDate.now().plusDays(1))) {
            erros.put("dataServico", "A data do serviço não pode ser no futuro.");
        }

        String placa = null;
        String cpf = null;
        if (d.semPlaca()) {
            cpf = soDigitos(d.cpf());
            if (cpf.length() != 11) {
                erros.put("cpf", "Sem placa: informe o CPF do cliente (11 números).");
            } else if (!cpfValido(cpf)) {
                erros.put("cpf", "CPF inválido: confira os números (os 2 últimos não batem).");
            }
        } else {
            placa = limparPlaca(d.placa());
            if (!placaValida(placa)) {
                erros.put("placa", "Placa inválida: use o formato ABC1234 (antiga) ou ABC1D23 (Mercosul).");
            }
            String c = soDigitos(d.cpf());
            cpf = c.isEmpty() ? null : c;
            if (cpf != null && !cpfValido(cpf)) {
                erros.put("cpf", "CPF inválido: confira os números (ou deixe em branco).");
            }
        }

        // veiculo do catalogo (caixa de selecao): grava "MARCA MODELO" e a chave estrangeira
        Veiculo veiculo = null;
        if (d.idVeiculo() != null) {
            try {
                veiculo = veiculos.buscarPorId(d.idVeiculo()).orElse(null);
            } catch (SQLException erro) {
                throw new IllegalStateException("falha ao consultar o veiculo", erro);
            }
        }
        String modelo = veiculo != null ? veiculo.descricao()
                : d.modelo() == null ? "" : linha(d.modelo()).toUpperCase(Locale.ROOT);
        if (d.idVeiculo() != null && veiculo == null) {
            erros.put("modelo", "Veículo não encontrado. Escolha outro.");
        } else if (modelo.isEmpty() || modelo.length() > 120) {
            erros.put("modelo", "Escolha o modelo do carro.");
        }
        String tecnico = d.tecnico() == null ? "" : linha(d.tecnico()).toUpperCase(Locale.ROOT);
        if (tecnico.isEmpty() || tecnico.length() > 60) {
            erros.put("tecnico", "Selecione o técnico.");
        }

        // servico: da tabela de precos (com as quantidades que ele pede) ou "OUTRO" (texto livre)
        Servico servico = null;
        String nomeServico;
        int carcaca = 0;
        int botao = 0;
        int pilha = 0;
        int itens = 0;
        if (d.idServico() != null) {
            try {
                servico = servicos.buscarPorId(d.idServico()).filter(s -> !s.peca()).orElse(null);
            } catch (SQLException erro) {
                throw new IllegalStateException("falha ao consultar o serviço", erro);
            }
        }
        if (servico != null) {
            nomeServico = servico.nome();
            carcaca = quantidade(servico.pedeCarcaca(), d.qtdCarcaca(), "qtdCarcaca", erros);
            botao = quantidade(servico.pedeBotao(), d.qtdBotao(), "qtdBotao", erros);
            pilha = quantidade(servico.pedePilha(), d.qtdPilha(), "qtdPilha", erros);
            itens = quantidade(servico.pedeItens(), d.qtdItens(), "qtdItens", erros);
        } else {
            nomeServico = d.servico() == null ? "" : linha(d.servico()).toUpperCase(Locale.ROOT);
            if (d.idServico() != null) {
                erros.put("servico", "Serviço não encontrado. Escolha outro.");
            } else if (nomeServico.length() < 2 || nomeServico.length() > 120) {
                erros.put("servico", "Selecione o serviço ou descreva o serviço em OUTRO.");
            }
        }

        BigDecimal valor = d.valor() == null ? BigDecimal.ZERO : d.valor();
        if (valor.signum() < 0 || valor.scale() > 2 || valor.compareTo(new BigDecimal("100000")) >= 0) {
            erros.put("valor", "Valor inválido. Exemplo: 150,00.");
        }
        String criadoPor = d.criadoPor() == null ? null : d.criadoPor().trim().toUpperCase(Locale.ROOT);
        if (criadoPor != null && (criadoPor.isEmpty() || criadoPor.length() > 60)) {
            erros.put("criadoPor", "Perfil inválido. Escolha o técnico na tela de perfis.");
        }
        String observacao = textoOuNulo(d.observacao());
        if (observacao != null && observacao.length() > 500) {
            erros.put("observacao", "A observação deve ter até 500 caracteres.");
        }

        if (!erros.isEmpty()) {
            log.warn("validacao de garantia recusada: {}", erros.keySet());
            throw new DadosInvalidosException(erros);
        }
        return new Garantia(d.id(), d.dataServico(), placa, d.semPlaca(), cpf, modelo,
                servico == null ? null : servico.id(), nomeServico, carcaca, botao, pilha, itens, valor, tecnico,
                observacao == null ? null : observacao.toUpperCase(Locale.ROOT),
                servico == null ? null : servico.codigoCupom(), null, null, "SISTEMA", criadoPor,
                veiculo == null ? null : veiculo.id());
    }

    /** Quantidade de 1 a 5 quando o servico pede (lista do VBA); 0 quando nao pede. */
    private static int quantidade(boolean pede, int qtd, String campo, Map<String, String> erros) {
        if (!pede) {
            return 0;
        }
        if (qtd < 1 || qtd > 5) {
            erros.put(campo, "Quantidade de 1 a 5.");
        }
        return qtd;
    }
}
