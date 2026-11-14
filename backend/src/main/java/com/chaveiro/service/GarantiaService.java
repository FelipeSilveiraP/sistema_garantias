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

    static boolean placaValida(String placa) {
        return placa.matches("[A-Z0-9]{7}");
    }

    static String soDigitos(String texto) {
        return texto == null ? "" : texto.replaceAll("\\D", "");
    }

    private static String textoOuNulo(String texto) {
        return texto == null || texto.isBlank() ? null : texto.trim();
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
            }
        } else {
            placa = limparPlaca(d.placa());
            if (!placaValida(placa)) {
                erros.put("placa", "Placa inválida: use 7 letras e números (ex.: ABC1D23).");
            }
            String c = soDigitos(d.cpf());
            cpf = c.isEmpty() ? null : c;
            if (cpf != null && cpf.length() != 11) {
                erros.put("cpf", "CPF deve ter 11 números (ou deixe em branco).");
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
                : d.modelo() == null ? "" : d.modelo().trim().toUpperCase(Locale.ROOT);
        if (d.idVeiculo() != null && veiculo == null) {
            erros.put("modelo", "Veículo não encontrado. Escolha outro.");
        } else if (modelo.isEmpty() || modelo.length() > 120) {
            erros.put("modelo", "Escolha o modelo do carro.");
        }
        String tecnico = d.tecnico() == null ? "" : d.tecnico().trim().toUpperCase(Locale.ROOT);
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
            nomeServico = d.servico() == null ? "" : d.servico().trim().toUpperCase(Locale.ROOT);
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
