package com.chaveiro.service;

import com.chaveiro.database.ConnectionFactory;
import java.io.File;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Backup "quebra-galho" no Google Drive (pedido do usuario, 2026-11-12): toda vez
 * que o sistema abre, grava uma planilha Excel com os DADOS (sem as notas
 * fiscais) na pasta do Google Drive para computador, que sincroniza sozinho.
 *
 * Pasta: findesk.backup-drive.pasta (FINDESK_PASTA_DRIVE) ou, so no banco
 * OPERACIONAL, deteccao automatica de "Meu Drive"/"My Drive" (unidade virtual
 * G:\ etc.). Com banco de teste (FINDESK_DB_PATH) e sem pasta explicita, nao
 * faz nada: teste nunca escreve no Drive real.
 */
@Service
public class BackupDriveService {

    private static final Logger log = LoggerFactory.getLogger(BackupDriveService.class);

    static final String SUBPASTA = "Chaveiro Universal - Backup";
    static final String PREFIXO = "Garantias - dados ";
    static final int MANTER = 30;

    public record Situacao(String estado, String mensagem, String arquivo, String quando) {}

    private final ConnectionFactory conexao;
    private final String pastaConfigurada;
    private final boolean bancoOperacional;
    private volatile Situacao situacao = new Situacao("aguardando", "Backup ainda não executado.", null, null);

    public BackupDriveService(ConnectionFactory conexao,
                              @Value("${findesk.backup-drive.pasta:}") String pastaConfigurada,
                              @Value("${findesk.db.path:}") String caminhoBancoSobrescrito) {
        this.conexao = conexao;
        this.pastaConfigurada = pastaConfigurada == null ? "" : pastaConfigurada.trim();
        this.bancoOperacional = caminhoBancoSobrescrito == null || caminhoBancoSobrescrito.isBlank();
    }

    public Situacao getSituacao() {
        return situacao;
    }

    /** Roda em segundo plano para nao atrasar a abertura do sistema. */
    public void exportarEmSegundoPlano() {
        Thread t = new Thread(this::exportar, "backup-google-drive");
        t.setDaemon(true);
        t.start();
    }

    public Situacao exportar() {
        Optional<Path> raiz = pastaDestino();
        if (raiz.isEmpty()) {
            situacao = bancoOperacional
                    ? new Situacao("erro", "Pasta do Google Drive não encontrada. Abra o Google Drive no computador e confira se \"Meu Drive\" aparece no Explorador de Arquivos.", null, agora())
                    : new Situacao("desligado", "Backup no Drive desligado (banco de teste).", null, agora());
            if (bancoOperacional) {
                log.warn("backup no Google Drive nao feito: pasta do Drive nao encontrada");
            }
            return situacao;
        }
        situacao = new Situacao("executando", "Enviando backup para o Google Drive...", null, agora());
        try {
            Path pasta = raiz.get().resolve(SUBPASTA);
            Files.createDirectories(pasta);
            Path destino = pasta.resolve(PREFIXO + LocalDate.now() + ".xlsx");
            Path temporario = pasta.resolve(destino.getFileName() + ".tmp");
            Files.write(temporario, PlanilhaXlsx.gerar(abas()));
            // troca atomica: o Drive nunca sincroniza um arquivo pela metade
            Files.move(temporario, destino, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            manterUltimos(pasta);
            situacao = new Situacao("ok", "Backup enviado para o Google Drive.", destino.toString(), agora());
            log.info("backup de dados gravado no Google Drive: {}", destino);
        } catch (IOException | SQLException | RuntimeException erro) {
            situacao = new Situacao("erro", "Não foi possível gravar o backup no Google Drive.", null, agora());
            log.warn("falha no backup para o Google Drive", erro);
        }
        return situacao;
    }

    Optional<Path> pastaDestino() {
        if (!pastaConfigurada.isEmpty()) {
            return Optional.of(Path.of(pastaConfigurada));
        }
        if (!bancoOperacional) {
            return Optional.empty();
        }
        List<Path> candidatas = new ArrayList<>();
        for (File unidade : File.listRoots()) {
            candidatas.add(unidade.toPath().resolve("Meu Drive"));
            candidatas.add(unidade.toPath().resolve("My Drive"));
        }
        // modo "espelhar arquivos" do Drive para computador
        Path usuario = Path.of(System.getProperty("user.home"));
        candidatas.add(usuario.resolve("Meu Drive"));
        candidatas.add(usuario.resolve("My Drive"));
        candidatas.add(usuario.resolve("Google Drive").resolve("Meu Drive"));
        candidatas.add(usuario.resolve("Google Drive").resolve("My Drive"));
        return candidatas.stream().filter(Files::isDirectory).findFirst();
    }

    /** Uma aba por tabela (garantias, precos, tecnicos e modelos). */
    List<PlanilhaXlsx.Aba> abas() throws SQLException {
        List<PlanilhaXlsx.Aba> abas = new ArrayList<>();
        abas.add(aba("Garantias", """
                SELECT id_garantia AS "Código", strftime('%d/%m/%Y', data_servico) AS "Data",
                       COALESCE(placa, 'SEM PLACA') AS "Placa", cpf AS "CPF", modelo AS "Modelo",
                       servico AS "Serviço", qtd_carcaca AS "Carcaças", qtd_botao AS "Botões", qtd_pilha AS "Pilhas",
                       qtd_itens AS "Itens", valor_centavos / 100.0 AS "Valor (R$)", tecnico AS "Técnico",
                       observacao AS "Observação", cupom_status AS "Cupom fiscal", origem AS "Origem",
                       criado_em AS "Cadastrada em"
                FROM garantias ORDER BY data_servico, id_garantia"""));
        abas.add(aba("Serviços e preços", """
                SELECT id_servico AS "Código", nome AS "Serviço / peça", preco_centavos / 100.0 AS "Preço (R$)",
                       codigo_cupom AS "Código no cupom", CASE peca WHEN 1 THEN 'Peça' ELSE 'Serviço' END AS "Tipo",
                       CASE ativo WHEN 1 THEN 'Sim' ELSE 'Não' END AS "Ativo"
                FROM servicos ORDER BY peca, nome"""));
        abas.add(aba("Técnicos", """
                SELECT id_tecnico AS "Código", nome AS "Técnico", CASE ativo WHEN 1 THEN 'Sim' ELSE 'Não' END AS "Ativo"
                FROM tecnicos ORDER BY nome"""));
        abas.add(aba("Modelos", """
                SELECT id_modelo AS "Código", nome AS "Modelo", CASE ativo WHEN 1 THEN 'Sim' ELSE 'Não' END AS "Ativo"
                FROM modelos ORDER BY nome"""));
        return abas;
    }

    private PlanilhaXlsx.Aba aba(String nome, String sql) throws SQLException {
        try (Connection conn = conexao.getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {
            ResultSetMetaData meta = rs.getMetaData();
            List<String> cabecalho = new ArrayList<>();
            for (int i = 1; i <= meta.getColumnCount(); i++) {
                cabecalho.add(meta.getColumnLabel(i));
            }
            List<List<Object>> linhas = new ArrayList<>();
            while (rs.next()) {
                List<Object> linha = new ArrayList<>();
                for (int i = 1; i <= meta.getColumnCount(); i++) {
                    Object v = rs.getObject(i);
                    if (v instanceof Double d) {
                        v = BigDecimal.valueOf(d).setScale(2, java.math.RoundingMode.HALF_UP);
                    } else if (v != null && meta.getColumnType(i) == Types.VARCHAR && !(v instanceof String)) {
                        v = v.toString();
                    }
                    linha.add(v);
                }
                linhas.add(linha);
            }
            return new PlanilhaXlsx.Aba(nome, cabecalho, linhas);
        }
    }

    /** Mantem so as 30 planilhas mais recentes (uma por dia de uso). */
    private void manterUltimos(Path pasta) throws IOException {
        try (Stream<Path> arquivos = Files.list(pasta)) {
            List<Path> antigos = arquivos
                    .filter(p -> p.getFileName().toString().startsWith(PREFIXO) && p.toString().endsWith(".xlsx"))
                    .sorted(Comparator.comparing((Path p) -> p.getFileName().toString()).reversed())
                    .skip(MANTER)
                    .toList();
            for (Path antigo : antigos) {
                Files.deleteIfExists(antigo);
            }
        }
    }

    private static String agora() {
        return LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
    }
}
