package com.chaveiro.repository;

import com.chaveiro.database.ConnectionFactory;
import com.chaveiro.model.Veiculo;
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

/** Catalogo de veiculos (marcas + modelos). A garantia aponta para ele com ON DELETE SET NULL. */
@Repository
public class VeiculoRepository {

    private static final Logger log = LoggerFactory.getLogger(VeiculoRepository.class);
    private static final String SELECT = "SELECT v.id_veiculo, v.id_marca, m.nome AS marca, v.modelo, v.ativo,"
            + " (SELECT COUNT(*) FROM garantias g WHERE g.id_veiculo = v.id_veiculo) AS garantias"
            + " FROM veiculos v JOIN marcas m ON m.id_marca = v.id_marca";

    private final ConnectionFactory conexao;

    public VeiculoRepository(ConnectionFactory conexao) {
        this.conexao = conexao;
    }

    public List<Veiculo> listar() throws SQLException {
        try (Connection conn = conexao.getConnection();
             PreparedStatement stmt = conn.prepareStatement(SELECT + " ORDER BY m.nome, v.modelo");
             ResultSet rs = stmt.executeQuery()) {
            List<Veiculo> lista = new ArrayList<>();
            while (rs.next()) {
                lista.add(mapear(rs));
            }
            return lista;
        }
    }

    public Optional<Veiculo> buscarPorId(long id) throws SQLException {
        try (Connection conn = conexao.getConnection();
             PreparedStatement stmt = conn.prepareStatement(SELECT + " WHERE v.id_veiculo = ?")) {
            stmt.setLong(1, id);
            try (ResultSet rs = stmt.executeQuery()) {
                return rs.next() ? Optional.of(mapear(rs)) : Optional.empty();
            }
        }
    }

    public List<String> marcas() throws SQLException {
        try (Connection conn = conexao.getConnection();
             PreparedStatement stmt = conn.prepareStatement("SELECT nome FROM marcas ORDER BY nome");
             ResultSet rs = stmt.executeQuery()) {
            List<String> lista = new ArrayList<>();
            while (rs.next()) {
                lista.add(rs.getString(1));
            }
            return lista;
        }
    }

    /** Ja existe esse modelo nessa marca (fora o proprio registro)? */
    public boolean existe(String marca, String modelo, Long ignorarId) throws SQLException {
        try (Connection conn = conexao.getConnection();
             PreparedStatement stmt = conn.prepareStatement("SELECT 1 FROM veiculos v JOIN marcas m ON m.id_marca = v.id_marca"
                     + " WHERE m.nome = ? COLLATE NOCASE AND v.modelo = ? COLLATE NOCASE AND v.id_veiculo <> ?")) {
            stmt.setString(1, marca);
            stmt.setString(2, modelo);
            stmt.setLong(3, ignorarId == null ? -1 : ignorarId);
            try (ResultSet rs = stmt.executeQuery()) {
                return rs.next();
            }
        }
    }

    /** Marca nova e criada na mesma transacao do veiculo (ou tudo, ou nada). */
    private static long marca(Connection conn, String nome) throws SQLException {
        try (PreparedStatement ins = conn.prepareStatement("INSERT OR IGNORE INTO marcas (nome) VALUES (?)")) {
            ins.setString(1, nome);
            ins.executeUpdate();
        }
        try (PreparedStatement sel = conn.prepareStatement("SELECT id_marca FROM marcas WHERE nome = ? COLLATE NOCASE")) {
            sel.setString(1, nome);
            try (ResultSet rs = sel.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        }
    }

    public long inserir(String marca, String modelo) throws SQLException {
        return conexao.emTransacao(conn -> {
            long idMarca = marca(conn, marca);
            try (PreparedStatement stmt = conn.prepareStatement("INSERT INTO veiculos (id_marca, modelo) VALUES (?, ?)",
                    Statement.RETURN_GENERATED_KEYS)) {
                stmt.setLong(1, idMarca);
                stmt.setString(2, modelo);
                stmt.executeUpdate();
                try (ResultSet chaves = stmt.getGeneratedKeys()) {
                    chaves.next();
                    long id = chaves.getLong(1);
                    log.info("veiculo cadastrado (id={})", id);
                    return id;
                }
            }
        });
    }

    public boolean atualizar(long id, String marca, String modelo, boolean ativo) throws SQLException {
        return conexao.emTransacao(conn -> {
            long idMarca = marca(conn, marca);
            try (PreparedStatement stmt = conn.prepareStatement(
                    "UPDATE veiculos SET id_marca = ?, modelo = ?, ativo = ? WHERE id_veiculo = ?")) {
                stmt.setLong(1, idMarca);
                stmt.setString(2, modelo);
                stmt.setInt(3, ativo ? 1 : 0);
                stmt.setLong(4, id);
                return stmt.executeUpdate() > 0;
            }
        });
    }

    /** As garantias desse veiculo ficam com o nome gravado (id_veiculo vira NULL, como no Contas a Pagar). */
    public boolean excluir(long id) throws SQLException {
        return conexao.emTransacao(conn -> {
            try (PreparedStatement stmt = conn.prepareStatement("DELETE FROM veiculos WHERE id_veiculo = ?")) {
                stmt.setLong(1, id);
                return stmt.executeUpdate() > 0;
            }
        });
    }

    private static Veiculo mapear(ResultSet rs) throws SQLException {
        return new Veiculo(rs.getLong("id_veiculo"), rs.getLong("id_marca"), rs.getString("marca"), rs.getString("modelo"),
                rs.getInt("ativo") == 1, rs.getInt("garantias"));
    }
}
