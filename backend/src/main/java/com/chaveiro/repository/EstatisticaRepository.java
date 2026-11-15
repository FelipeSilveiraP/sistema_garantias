package com.chaveiro.repository;

import com.chaveiro.database.ConnectionFactory;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Repository;

/** Numeros dos GRAFICOS: totais do periodo, por mes e os maiores por servico, tecnico e modelo. */
@Repository
public class EstatisticaRepository {

    public record Grupo(String nome, long quantidade, long totalCentavos) {
    }

    public record Mes(String mes, long quantidade, long totalCentavos) {
    }

    public record Resumo(long quantidade, long totalCentavos, long semCupom, long semPlaca,
                         List<Mes> porMes, List<Grupo> porServico, List<Grupo> porTecnico, List<Grupo> porModelo) {
    }

    private final ConnectionFactory conexao;

    public EstatisticaRepository(ConnectionFactory conexao) {
        this.conexao = conexao;
    }

    public Resumo resumo(String de, String ate) throws SQLException {
        try (Connection conn = conexao.getConnection()) {
            Map<String, Long> totais = totais(conn, de, ate);
            List<Mes> porMes = new ArrayList<>();
            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT substr(data_servico, 1, 7) AS mes, COUNT(*) AS qtd, SUM(valor_centavos) AS total"
                            + " FROM garantias WHERE data_servico BETWEEN ? AND ? GROUP BY mes ORDER BY mes")) {
                stmt.setString(1, de);
                stmt.setString(2, ate);
                try (ResultSet rs = stmt.executeQuery()) {
                    while (rs.next()) {
                        porMes.add(new Mes(rs.getString("mes"), rs.getLong("qtd"), rs.getLong("total")));
                    }
                }
            }
            return new Resumo(totais.get("qtd"), totais.get("total"), totais.get("semCupom"), totais.get("semPlaca"),
                    porMes, grupo(conn, "servico", de, ate), grupo(conn, "tecnico", de, ate),
                    grupo(conn, "modelo", de, ate));
        }
    }

    private static Map<String, Long> totais(Connection conn, String de, String ate) throws SQLException {
        try (PreparedStatement stmt = conn.prepareStatement(
                "SELECT COUNT(*) AS qtd, COALESCE(SUM(valor_centavos), 0) AS total,"
                        + " COALESCE(SUM(cupom_status = 'NAO_LANCADO' AND origem = 'SISTEMA'), 0) AS sem_cupom,"
                        + " COALESCE(SUM(sem_placa), 0) AS sem_placa"
                        + " FROM garantias WHERE data_servico BETWEEN ? AND ?")) {
            stmt.setString(1, de);
            stmt.setString(2, ate);
            try (ResultSet rs = stmt.executeQuery()) {
                rs.next();
                Map<String, Long> m = new LinkedHashMap<>();
                m.put("qtd", rs.getLong("qtd"));
                m.put("total", rs.getLong("total"));
                m.put("semCupom", rs.getLong("sem_cupom"));
                m.put("semPlaca", rs.getLong("sem_placa"));
                return m;
            }
        }
    }

    /** coluna vem SO das chamadas acima (servico/tecnico/modelo), nunca do usuario. */
    private static List<Grupo> grupo(Connection conn, String coluna, String de, String ate) throws SQLException {
        List<Grupo> lista = new ArrayList<>();
        // nosemgrep: sql-concatenado-com-variavel -- coluna so "servico"/"tecnico"/"modelo" (resumo())
        try (PreparedStatement stmt = conn.prepareStatement(
                "SELECT " + coluna + " AS nome, COUNT(*) AS qtd, SUM(valor_centavos) AS total FROM garantias"
                        + " WHERE data_servico BETWEEN ? AND ? GROUP BY " + coluna + " COLLATE NOCASE"
                        + " ORDER BY qtd DESC, total DESC LIMIT 8")) {
            stmt.setString(1, de);
            stmt.setString(2, ate);
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    lista.add(new Grupo(rs.getString("nome"), rs.getLong("qtd"), rs.getLong("total")));
                }
            }
        }
        return lista;
    }
}
