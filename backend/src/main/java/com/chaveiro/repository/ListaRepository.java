package com.chaveiro.repository;

import com.chaveiro.database.ConnectionFactory;
import com.chaveiro.model.ItemLista;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Repository;

/**
 * Listas editaveis: tecnicos e modelos de carro. O nome da tabela vem SO desta
 * lista fechada (nunca do usuario), por isso pode entrar no SQL.
 */
@Repository
public class ListaRepository {

    public enum Lista { TECNICOS, MODELOS }

    private static final Map<Lista, String[]> TABELAS = Map.of(
            Lista.TECNICOS, new String[] {"tecnicos", "id_tecnico"},
            Lista.MODELOS, new String[] {"modelos", "id_modelo"});

    private final ConnectionFactory conexao;

    public ListaRepository(ConnectionFactory conexao) {
        this.conexao = conexao;
    }

    public List<ItemLista> listar(Lista lista) throws SQLException {
        String[] t = TABELAS.get(lista);
        String sql = "SELECT " + t[1] + " AS id, nome, ativo FROM " + t[0] + " ORDER BY nome COLLATE NOCASE";
        try (Connection conn = conexao.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql);
             ResultSet rs = stmt.executeQuery()) {
            List<ItemLista> itens = new ArrayList<>();
            while (rs.next()) {
                itens.add(new ItemLista(rs.getLong("id"), rs.getString("nome"), rs.getInt("ativo") == 1));
            }
            return itens;
        }
    }

    public boolean existe(Lista lista, String nome) throws SQLException {
        String[] t = TABELAS.get(lista);
        try (Connection conn = conexao.getConnection();
             PreparedStatement stmt = conn.prepareStatement("SELECT 1 FROM " + t[0] + " WHERE nome = ? COLLATE NOCASE")) {
            stmt.setString(1, nome);
            try (ResultSet rs = stmt.executeQuery()) {
                return rs.next();
            }
        }
    }

    public ItemLista inserir(Lista lista, String nome) throws SQLException {
        String[] t = TABELAS.get(lista);
        return conexao.emTransacao(conn -> {
            try (PreparedStatement stmt = conn.prepareStatement("INSERT INTO " + t[0] + " (nome) VALUES (?)",
                    Statement.RETURN_GENERATED_KEYS)) {
                stmt.setString(1, nome);
                stmt.executeUpdate();
                try (ResultSet chaves = stmt.getGeneratedKeys()) {
                    chaves.next();
                    return new ItemLista(chaves.getLong(1), nome, true);
                }
            }
        });
    }

    public boolean atualizar(Lista lista, long id, String nome, boolean ativo) throws SQLException {
        String[] t = TABELAS.get(lista);
        return conexao.emTransacao(conn -> {
            try (PreparedStatement stmt = conn.prepareStatement(
                    "UPDATE " + t[0] + " SET nome = ?, ativo = ? WHERE " + t[1] + " = ?")) {
                stmt.setString(1, nome);
                stmt.setInt(2, ativo ? 1 : 0);
                stmt.setLong(3, id);
                return stmt.executeUpdate() > 0;
            }
        });
    }

    public boolean excluir(Lista lista, long id) throws SQLException {
        String[] t = TABELAS.get(lista);
        return conexao.emTransacao(conn -> {
            try (PreparedStatement stmt = conn.prepareStatement("DELETE FROM " + t[0] + " WHERE " + t[1] + " = ?")) {
                stmt.setLong(1, id);
                return stmt.executeUpdate() > 0;
            }
        });
    }
}
