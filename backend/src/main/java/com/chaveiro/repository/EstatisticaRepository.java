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
                    porMes, porProduto(conn, de, ate), grupo(conn, "tecnico", de, ate),
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

    // ---------- SERVICOS MAIS FEITOS: por produto, nao pelo texto da garantia ----------

    /** Tira acento, junta espacos e passa para maiusculas ("Troca  carcaça" -> "TROCA CARCACA"). */
    static String chave(String texto) {
        return java.text.Normalizer.normalize(texto == null ? "" : texto, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").replaceAll("\\s+", " ").trim().toUpperCase(java.util.Locale.ROOT);
    }

    private static final java.util.regex.Pattern QTD_UN = java.util.regex.Pattern.compile("\\(\\s*\\d+\\s*UN[A-Z.]*\\s*\\)", java.util.regex.Pattern.CASE_INSENSITIVE);
    private static final java.util.regex.Pattern QTD_INICIO = java.util.regex.Pattern.compile("^\\d+\\s*[Xx]?\\s+");

    /**
     * Produtos de um texto de servico antigo (planilha do VBA ou versao antiga do sistema):
     * "TROCA CARCACA+BOTAO" = TROCA CARCACA e BOTAO; "TROCA CARCACA (1 UN)" e "01 CHAVE
     * COMPLETA KD" sem a quantidade. Cada parte vira o nome do produto da tabela de precos
     * quando bate (sem ligar para acento/maiuscula); senao fica o texto limpo.
     */
    static List<String> produtosDoTexto(String servico, Map<String, String> nomesDaTabela) {
        List<String> produtos = new ArrayList<>();
        for (String parte : (servico == null ? "" : servico).split("\\+")) {
            String limpo = QTD_INICIO.matcher(QTD_UN.matcher(parte).replaceAll("").trim()).replaceAll("")
                    .replaceAll("\\s+", " ").trim();
            if (limpo.length() < 2) {
                continue;
            }
            String nome = nomesDaTabela.getOrDefault(chave(limpo), limpo.toUpperCase(java.util.Locale.ROOT));
            if (!produtos.contains(nome)) {
                produtos.add(nome);
            }
        }
        return produtos;
    }

    /**
     * Cada garantia conta 1 vez em cada produto que tem: pelos produtos gravados na garantia
     * (garantia_itens, com o nome ATUAL da tabela de precos) ou, nas garantias antigas sem
     * produtos gravados, pelo texto do servico separado em produtos. Os 8 mais feitos.
     */
    private static List<Grupo> porProduto(Connection conn, String de, String ate) throws SQLException {
        Map<String, String> tabela = new java.util.HashMap<>();
        try (PreparedStatement stmt = conn.prepareStatement("SELECT nome FROM servicos");
             ResultSet rs = stmt.executeQuery()) {
            while (rs.next()) {
                tabela.put(chave(rs.getString(1)), rs.getString(1));
            }
        }
        Map<Long, List<String>> porGarantia = new LinkedHashMap<>();
        try (PreparedStatement stmt = conn.prepareStatement(
                "SELECT i.id_garantia, s.nome, i.descricao FROM garantia_itens i JOIN garantias g ON g.id_garantia = i.id_garantia"
                        + " LEFT JOIN servicos s ON s.id_servico = i.id_servico"
                        + " WHERE g.data_servico BETWEEN ? AND ? ORDER BY i.id_garantia, i.ordem")) {
            stmt.setString(1, de);
            stmt.setString(2, ate);
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    String nome = rs.getString(2) != null ? rs.getString(2)
                            : tabela.getOrDefault(chave(rs.getString(3)), rs.getString(3).trim().toUpperCase(java.util.Locale.ROOT));
                    List<String> lista = porGarantia.computeIfAbsent(rs.getLong(1), k -> new ArrayList<>());
                    if (!lista.contains(nome)) {
                        lista.add(nome);
                    }
                }
            }
        }
        Map<String, long[]> contagem = new LinkedHashMap<>();
        try (PreparedStatement stmt = conn.prepareStatement(
                "SELECT id_garantia, servico, valor_centavos FROM garantias WHERE data_servico BETWEEN ? AND ?")) {
            stmt.setString(1, de);
            stmt.setString(2, ate);
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    List<String> produtos = porGarantia.getOrDefault(rs.getLong(1), produtosDoTexto(rs.getString(2), tabela));
                    long valor = rs.getLong(3);
                    for (String p : produtos) {
                        long[] c = contagem.computeIfAbsent(p, k -> new long[2]);
                        c[0]++;
                        c[1] += valor / produtos.size(); // valor da garantia dividido entre os produtos dela
                    }
                }
            }
        }
        return contagem.entrySet().stream()
                .sorted((a, b) -> a.getValue()[0] != b.getValue()[0] ? Long.compare(b.getValue()[0], a.getValue()[0])
                        : Long.compare(b.getValue()[1], a.getValue()[1]))
                .limit(8)
                .map(e -> new Grupo(e.getKey(), e.getValue()[0], e.getValue()[1]))
                .toList();
    }
}
