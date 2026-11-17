package com.chaveiro.repository;

import com.chaveiro.database.ConnectionFactory;
import com.chaveiro.model.Servico;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Repository;

/** Tabela de precos (servicos e pecas). Toda mudanca de preco fica na auditoria (gatilho). */
@Repository
public class ServicoRepository {

    private static final Logger log = LoggerFactory.getLogger(ServicoRepository.class);

    private static final String COLUNAS = "id_servico, nome, preco_centavos, codigo_cupom, nome_rm, pede_carcaca, pede_botao,"
            + " pede_pilha, pede_itens, peca, ativo";

    private final ConnectionFactory conexao;

    public ServicoRepository(ConnectionFactory conexao) {
        this.conexao = conexao;
    }

    public List<Servico> listar() throws SQLException {
        String sql = "SELECT " + COLUNAS + " FROM servicos ORDER BY peca, nome";
        try (Connection conn = conexao.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql);
             ResultSet rs = stmt.executeQuery()) {
            List<Servico> lista = new ArrayList<>();
            while (rs.next()) {
                lista.add(mapear(rs));
            }
            return lista;
        }
    }

    public Optional<Servico> buscarPorId(long id) throws SQLException {
        try (Connection conn = conexao.getConnection();
             PreparedStatement stmt = conn.prepareStatement("SELECT " + COLUNAS + " FROM servicos WHERE id_servico = ?")) {
            stmt.setLong(1, id);
            try (ResultSet rs = stmt.executeQuery()) {
                return rs.next() ? Optional.of(mapear(rs)) : Optional.empty();
            }
        }
    }

    public Optional<Servico> buscarPorNome(String nome) throws SQLException {
        try (Connection conn = conexao.getConnection();
             PreparedStatement stmt = conn.prepareStatement("SELECT " + COLUNAS + " FROM servicos WHERE nome = ? COLLATE NOCASE")) {
            stmt.setString(1, nome);
            try (ResultSet rs = stmt.executeQuery()) {
                return rs.next() ? Optional.of(mapear(rs)) : Optional.empty();
            }
        }
    }

    public Servico inserir(Servico s) throws SQLException {
        String sql = "INSERT INTO servicos (nome, preco_centavos, codigo_cupom, pede_carcaca, pede_botao, pede_pilha,"
                + " pede_itens, peca, ativo, nome_rm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        return conexao.emTransacao(conn -> {
            try (PreparedStatement stmt = conn.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
                preencher(stmt, s);
                stmt.executeUpdate();
                try (ResultSet chaves = stmt.getGeneratedKeys()) {
                    chaves.next();
                    long id = chaves.getLong(1);
                    log.info("servico cadastrado (id={})", id);
                    return new Servico(id, s.nome(), s.preco(), s.codigoCupom(), s.nomeRm(), s.pedeCarcaca(), s.pedeBotao(),
                            s.pedePilha(), s.pedeItens(), s.peca(), s.ativo());
                }
            }
        });
    }

    public boolean atualizar(long id, Servico s) throws SQLException {
        String sql = "UPDATE servicos SET nome = ?, preco_centavos = ?, codigo_cupom = ?, pede_carcaca = ?,"
                + " pede_botao = ?, pede_pilha = ?, pede_itens = ?, peca = ?, ativo = ?, nome_rm = ? WHERE id_servico = ?";
        return conexao.emTransacao(conn -> {
            try (PreparedStatement stmt = conn.prepareStatement(sql)) {
                preencher(stmt, s);
                stmt.setLong(11, id);
                return stmt.executeUpdate() > 0;
            }
        });
    }

    /**
     * Reajuste de todos os precos (ou so dos servicos) em percentual, numa unica
     * transacao: ou todos mudam, ou nenhum. Arredonda para centavos.
     */
    public int reajustar(BigDecimal percentual, boolean incluirPecas) throws SQLException {
        String sql = "UPDATE servicos SET preco_centavos = CAST(ROUND(preco_centavos * (1 + ? / 100.0)) AS INTEGER)"
                + " WHERE ativo = 1" + (incluirPecas ? "" : " AND peca = 0");
        return conexao.emTransacao(conn -> {
            try (PreparedStatement stmt = conn.prepareStatement(sql)) {
                stmt.setBigDecimal(1, percentual);
                int linhas = stmt.executeUpdate();
                log.info("reajuste de precos: {}% em {} item(ns)", percentual, linhas);
                return linhas;
            }
        });
    }

    /**
     * Reajuste de todos os precos (ou so dos servicos) somando um valor fixo em centavos
     * (negativo baixa; o preco nunca fica abaixo de zero), numa unica transacao.
     */
    public int reajustarValor(long centavos, boolean incluirPecas) throws SQLException {
        String sql = "UPDATE servicos SET preco_centavos = MAX(0, preco_centavos + ?)"
                + " WHERE ativo = 1" + (incluirPecas ? "" : " AND peca = 0");
        return conexao.emTransacao(conn -> {
            try (PreparedStatement stmt = conn.prepareStatement(sql)) {
                stmt.setLong(1, centavos);
                int linhas = stmt.executeUpdate();
                log.info("reajuste de precos: {} centavos em {} item(ns)", centavos, linhas);
                return linhas;
            }
        });
    }

    /** Produto em uso por alguma garantia: o gatilho SERVICO_EM_USO recusa (desative em vez de excluir). */
    public boolean excluir(long id) throws SQLException {
        return conexao.emTransacao(conn -> {
            try (PreparedStatement stmt = conn.prepareStatement("DELETE FROM servicos WHERE id_servico = ?")) {
                stmt.setLong(1, id);
                return stmt.executeUpdate() > 0;
            }
        });
    }

    private static void preencher(PreparedStatement stmt, Servico s) throws SQLException {
        stmt.setString(1, s.nome());
        stmt.setLong(2, GarantiaRepository.centavos(s.preco()));
        stmt.setString(3, s.codigoCupom());
        stmt.setInt(4, s.pedeCarcaca() ? 1 : 0);
        stmt.setInt(5, s.pedeBotao() ? 1 : 0);
        stmt.setInt(6, s.pedePilha() ? 1 : 0);
        stmt.setInt(7, s.pedeItens() ? 1 : 0);
        stmt.setInt(8, s.peca() ? 1 : 0);
        stmt.setInt(9, s.ativo() ? 1 : 0);
        stmt.setString(10, s.nomeRm());
    }

    private static Servico mapear(ResultSet rs) throws SQLException {
        return new Servico(rs.getLong("id_servico"), rs.getString("nome"),
                BigDecimal.valueOf(rs.getLong("preco_centavos"), 2), rs.getString("codigo_cupom"),
                rs.getString("nome_rm"), rs.getInt("pede_carcaca") == 1, rs.getInt("pede_botao") == 1, rs.getInt("pede_pilha") == 1,
                rs.getInt("pede_itens") == 1, rs.getInt("peca") == 1, rs.getInt("ativo") == 1);
    }
}
