package com.chaveiro.repository;

import com.chaveiro.database.ConnectionFactory;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Repository;

/** Dados do cupom fiscal automatico (PDV do RM Software): produtos, identificador da venda e NFC-e. */
@Repository
public class CupomRepository {

    /** Produto da garantia com o que o cupom precisa: nome no RM e se e peca (preco fixo). */
    public record LinhaCupom(String descricao, int quantidade, long precoCentavos, boolean peca, String nomeRm) {
    }

    /** Situacao do cupom e valor da garantia. */
    public record SituacaoCupom(String status, long valorCentavos, String origem, String vendaUuid) {
    }

    private final ConnectionFactory conexao;

    public CupomRepository(ConnectionFactory conexao) {
        this.conexao = conexao;
    }

    public Optional<SituacaoCupom> situacao(long idGarantia) throws SQLException {
        String sql = "SELECT cupom_status, valor_centavos, origem, cupom_venda_uuid FROM garantias WHERE id_garantia = ?";
        try (Connection conn = conexao.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setLong(1, idGarantia);
            try (ResultSet rs = stmt.executeQuery()) {
                return rs.next()
                        ? Optional.of(new SituacaoCupom(rs.getString(1), rs.getLong(2), rs.getString(3), rs.getString(4)))
                        : Optional.empty();
            }
        }
    }

    public List<LinhaCupom> linhas(long idGarantia) throws SQLException {
        String sql = "SELECT i.descricao, i.quantidade, i.preco_centavos, COALESCE(s.peca, 0), s.nome_rm"
                + " FROM garantia_itens i LEFT JOIN servicos s ON s.id_servico = i.id_servico"
                + " WHERE i.id_garantia = ? ORDER BY i.ordem";
        try (Connection conn = conexao.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setLong(1, idGarantia);
            try (ResultSet rs = stmt.executeQuery()) {
                List<LinhaCupom> lista = new ArrayList<>();
                while (rs.next()) {
                    lista.add(new LinhaCupom(rs.getString(1), rs.getInt(2), rs.getLong(3), rs.getInt(4) == 1, rs.getString(5)));
                }
                return lista;
            }
        }
    }

    /** Grava o identificador da venda so na primeira vez; devolve o que ficou gravado. */
    public String garantirVendaUuid(long idGarantia, String novo) throws SQLException {
        return conexao.emTransacao(conn -> {
            try (PreparedStatement stmt = conn.prepareStatement(
                    "UPDATE garantias SET cupom_venda_uuid = ? WHERE id_garantia = ? AND cupom_venda_uuid IS NULL")) {
                stmt.setString(1, novo);
                stmt.setLong(2, idGarantia);
                stmt.executeUpdate();
            }
            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT cupom_venda_uuid FROM garantias WHERE id_garantia = ?")) {
                stmt.setLong(1, idGarantia);
                try (ResultSet rs = stmt.executeQuery()) {
                    return rs.next() ? rs.getString(1) : null;
                }
            }
        });
    }

    public boolean registrarEmitido(long idGarantia, String nfce, String chave, String quando) throws SQLException {
        String sql = "UPDATE garantias SET cupom_status = 'LANCADO', cupom_lancado_em = ?, cupom_nfce = ?, cupom_chave = ?"
                + " WHERE id_garantia = ?";
        return conexao.emTransacao(conn -> {
            try (PreparedStatement stmt = conn.prepareStatement(sql)) {
                stmt.setString(1, quando);
                stmt.setString(2, nfce);
                stmt.setString(3, chave);
                stmt.setLong(4, idGarantia);
                return stmt.executeUpdate() > 0;
            }
        });
    }
}
