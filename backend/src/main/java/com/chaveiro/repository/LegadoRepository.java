package com.chaveiro.repository;

import com.chaveiro.database.ConnectionFactory;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Repository;

/** Entidade de legado: cada linha da planilha antiga, como estava (arquivo + aba + linha). */
@Repository
public class LegadoRepository {

    private final ConnectionFactory conexao;

    public LegadoRepository(ConnectionFactory conexao) {
        this.conexao = conexao;
    }

    public <T> T emTransacao(ConnectionFactory.TrabalhoSql<T> trabalho) throws SQLException {
        return conexao.emTransacao(trabalho);
    }

    /** Grava a linha bruta; vazio se ela ja tinha sido importada antes (mesmo arquivo/aba/linha). */
    public Optional<Long> inserirLinha(Connection conn, String arquivo, String aba, int linha, Map<String, String> c)
            throws SQLException {
        String sql = "INSERT OR IGNORE INTO legado_garantias (arquivo_origem, aba_origem, linha_origem, data, placa,"
                + " modelo, servico, cpf, valor, tecnico, observacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        try (PreparedStatement stmt = conn.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            stmt.setString(1, arquivo);
            stmt.setString(2, aba);
            stmt.setInt(3, linha);
            int p = 4;
            for (String coluna : new String[] {"A", "B", "C", "D", "E", "F", "G", "H"}) {
                stmt.setString(p++, c.get(coluna));
            }
            if (stmt.executeUpdate() == 0) {
                return Optional.empty();
            }
            try (ResultSet chaves = stmt.getGeneratedKeys()) {
                return chaves.next() ? Optional.of(chaves.getLong(1)) : Optional.empty();
            }
        }
    }

    public void marcarMigrada(Connection conn, long idLegado, long idGarantia) throws SQLException {
        try (PreparedStatement stmt = conn.prepareStatement(
                "UPDATE legado_garantias SET id_garantia_migrada = ? WHERE id_legado = ?")) {
            stmt.setLong(1, idGarantia);
            stmt.setLong(2, idLegado);
            stmt.executeUpdate();
        }
    }
}
