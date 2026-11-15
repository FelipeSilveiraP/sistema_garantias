package com.chaveiro.service;

import com.chaveiro.model.ItemLista;
import com.chaveiro.model.Servico;
import com.chaveiro.repository.ListaRepository;
import com.chaveiro.repository.ListaRepository.Lista;
import com.chaveiro.repository.ServicoRepository;
import java.math.BigDecimal;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * ATUALIZAR PRECOS: tabela de servicos com preco (e reajuste em %) e as listas
 * editaveis de tecnicos e modelos (no VBA eram fixas no codigo).
 */
@Service
public class CadastrosService {

    private static final Logger log = LoggerFactory.getLogger(CadastrosService.class);

    private final ServicoRepository servicos;
    private final ListaRepository listas;

    public CadastrosService(ServicoRepository servicos, ListaRepository listas) {
        this.servicos = servicos;
        this.listas = listas;
    }

    // ---------- servicos e precos ----------

    public List<Servico> listarServicos() {
        try {
            return servicos.listar();
        } catch (SQLException erro) {
            throw new IllegalStateException("falha ao consultar os serviços", erro);
        }
    }

    public Servico cadastrarServico(Servico dados) {
        Servico s = validarServico(dados, null);
        try {
            if (servicos.buscarPorNome(s.nome()).isPresent()) {
                throw new DadosInvalidosException(Map.of("nome", "Já existe um serviço com esse nome."));
            }
            return servicos.inserir(s);
        } catch (SQLException erro) {
            throw new IllegalStateException("falha ao salvar o serviço", erro);
        }
    }

    public Servico atualizarServico(long id, Servico dados) {
        Servico s = validarServico(dados, id);
        try {
            var mesmoNome = servicos.buscarPorNome(s.nome());
            if (mesmoNome.isPresent() && mesmoNome.get().id() != id) {
                throw new DadosInvalidosException(Map.of("nome", "Já existe um serviço com esse nome."));
            }
            if (!servicos.atualizar(id, s)) {
                throw new RecursoNaoEncontradoException("servico");
            }
            return servicos.buscarPorId(id).orElseThrow();
        } catch (SQLException erro) {
            throw new IllegalStateException("falha ao atualizar o serviço", erro);
        }
    }

    public void excluirServico(long id) {
        try {
            if (!servicos.excluir(id)) {
                throw new RecursoNaoEncontradoException("servico");
            }
        } catch (SQLException erro) {
            if (erro.getMessage() != null && erro.getMessage().contains("SERVICO_EM_USO")) {
                throw new ConflitoIntegridadeException("produto usado em garantias: desative em vez de excluir");
            }
            throw new IllegalStateException("falha ao excluir o produto", erro);
        }
    }

    /** Soma um valor em R$ a todos os precos ativos (de -R$ 1.000 a +R$ 10.000), numa unica transacao. */
    public int reajustarValor(BigDecimal valor, boolean incluirPecas) {
        if (valor == null || valor.signum() == 0 || valor.compareTo(new BigDecimal("-1000")) < 0
                || valor.compareTo(new BigDecimal("10000")) > 0 || valor.scale() > 2 && valor.stripTrailingZeros().scale() > 2) {
            throw new DadosInvalidosException(Map.of("valor", "Informe um valor em R$ diferente de zero (ex.: 5,00 ou -2,50)."));
        }
        long centavos = valor.movePointRight(2).longValueExact();
        try {
            return servicos.reajustarValor(centavos, incluirPecas);
        } catch (SQLException erro) {
            throw new IllegalStateException("falha ao reajustar os preços", erro);
        }
    }

    /** Reajusta todos os precos ativos em % (de -50% a +200%), numa unica transacao. */
    public int reajustar(BigDecimal percentual, boolean incluirPecas) {
        if (percentual == null || percentual.compareTo(new BigDecimal("-50")) < 0
                || percentual.compareTo(new BigDecimal("200")) > 0 || percentual.signum() == 0) {
            throw new DadosInvalidosException(Map.of("percentual", "Informe um reajuste entre -50% e 200% (diferente de zero)."));
        }
        try {
            return servicos.reajustar(percentual, incluirPecas);
        } catch (SQLException erro) {
            throw new IllegalStateException("falha ao reajustar os preços", erro);
        }
    }

    private static Servico validarServico(Servico d, Long id) {
        Map<String, String> erros = new LinkedHashMap<>();
        String nome = d.nome() == null ? "" : d.nome().trim().toUpperCase(Locale.ROOT);
        if (nome.length() < 2 || nome.length() > 80) {
            erros.put("nome", "Informe o nome (de 2 a 80 caracteres).");
        }
        BigDecimal preco = d.preco() == null ? BigDecimal.ZERO : d.preco();
        if (preco.signum() < 0 || preco.scale() > 2 || preco.compareTo(new BigDecimal("100000")) >= 0) {
            erros.put("preco", "Preço inválido. Exemplo: 150,00.");
        }
        String codigo = d.codigoCupom() == null || d.codigoCupom().isBlank() ? null : d.codigoCupom().trim();
        if (codigo != null && codigo.length() > 30) {
            erros.put("codigoCupom", "Código do cupom com até 30 caracteres.");
        }
        if (!erros.isEmpty()) {
            throw new DadosInvalidosException(erros);
        }
        return new Servico(id, nome, preco, codigo, d.pedeCarcaca(), d.pedeBotao(), d.pedePilha(), d.pedeItens(),
                d.peca(), d.ativo());
    }

    // ---------- tecnicos e modelos ----------

    public List<ItemLista> listar(Lista lista) {
        try {
            return listas.listar(lista);
        } catch (SQLException erro) {
            throw new IllegalStateException("falha ao consultar a lista", erro);
        }
    }

    public ItemLista incluir(Lista lista, String nome) {
        String n = validarNome(nome);
        try {
            if (listas.existe(lista, n)) {
                throw new DadosInvalidosException(Map.of("nome", "Esse nome já está na lista."));
            }
            ItemLista item = listas.inserir(lista, n);
            log.info("{}: incluido \"{}\"", lista, n);
            return item;
        } catch (SQLException erro) {
            throw new IllegalStateException("falha ao salvar na lista", erro);
        }
    }

    public void alterar(Lista lista, long id, String nome, boolean ativo) {
        String n = validarNome(nome);
        try {
            boolean repetido = listas.listar(lista).stream()
                    .anyMatch(i -> i.id() != id && i.nome().equalsIgnoreCase(n));
            if (repetido) {
                throw new DadosInvalidosException(Map.of("nome", "Esse nome já está na lista."));
            }
            if (!listas.atualizar(lista, id, n, ativo)) {
                throw new RecursoNaoEncontradoException("item");
            }
        } catch (SQLException erro) {
            throw new IllegalStateException("falha ao alterar a lista", erro);
        }
    }

    /** Garantias antigas guardam o nome como texto: excluir da lista nao apaga a historia. */
    public void excluir(Lista lista, long id) {
        try {
            if (!listas.excluir(lista, id)) {
                throw new RecursoNaoEncontradoException("item");
            }
        } catch (SQLException erro) {
            throw new IllegalStateException("falha ao excluir da lista", erro);
        }
    }

    private static String validarNome(String nome) {
        String n = nome == null ? "" : nome.trim().replaceAll("\\s+", " ").toUpperCase(Locale.ROOT);
        if (n.isEmpty() || n.length() > 60) {
            throw new DadosInvalidosException(Map.of("nome", "Informe o nome (até 60 caracteres)."));
        }
        return n;
    }
}
