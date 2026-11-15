package com.chaveiro.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.chaveiro.database.ConnectionFactory;
import com.chaveiro.database.DatabaseInitializer;
import com.chaveiro.model.ItemLista;
import com.chaveiro.repository.ListaRepository;
import com.chaveiro.repository.ListaRepository.Lista;
import com.chaveiro.repository.ServicoRepository;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.Statement;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Backup e restauracao consistentes do SQLite e a planilha de dados no Google Drive (dados ficticios). */
class BackupServiceTest {

    @TempDir
    Path pastaTemporaria;

    private ConnectionFactory conexao;
    private CadastrosService cadastros;
    private BackupService backupService;

    @BeforeEach
    void preparar() {
        conexao = new ConnectionFactory(pastaTemporaria.resolve("garantias_teste.db").toString());
        new DatabaseInitializer(conexao).inicializar();
        cadastros = new CadastrosService(new ServicoRepository(conexao), new ListaRepository(conexao));
        backupService = new BackupService(conexao);
    }

    @Test
    void deveCriarBackupConsistenteComDadosFicticios() throws Exception {
        cadastros.incluir(Lista.TECNICOS, "Técnico Backup");

        Path backup = backupService.criarBackup("teste");

        assertThat(backup).exists();
        assertThat(Files.size(backup)).isPositive();
        assertThat(backupService.verificarIntegridade()).isTrue();
    }

    @Test
    void deveRestaurarDadosAposPerdaDoBancoOriginal() throws Exception {
        cadastros.incluir(Lista.TECNICOS, "Técnico Restaurado");
        int antes = cadastros.listar(Lista.TECNICOS).size();
        Path backup = backupService.criarBackup("teste");

        try (Connection conn = conexao.getConnection(); Statement stmt = conn.createStatement()) {
            stmt.execute("DELETE FROM tecnicos");
        }
        assertThat(cadastros.listar(Lista.TECNICOS)).isEmpty();

        backupService.restaurar(backup);

        List<ItemLista> restaurados = cadastros.listar(Lista.TECNICOS);
        assertThat(restaurados).hasSize(antes).extracting(ItemLista::nome).contains("TÉCNICO RESTAURADO");
    }

    @Test
    void deveRecusarRestauracaoDeArquivoInvalido() throws Exception {
        Path invalido = pastaTemporaria.resolve("nao-é-um-backup.db");
        Files.writeString(invalido, "conteudo corrompido");

        assertThatThrownBy(() -> backupService.restaurar(invalido)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void deveCriarApenasUmBackupDiarioPorDia() {
        assertThat(backupService.backupDiarioSeNecessario()).isNotNull();
        assertThat(backupService.backupDiarioSeNecessario()).isNull();
    }

    @Test
    void deveRotacionarBackupsAntigosMantendoOsUltimos() throws Exception {
        for (int i = 0; i < 12; i++) {
            backupService.criarBackup("rotacao");
        }
        backupService.manterApenasUltimos(8);
        try (var arquivos = Files.list(backupService.getDiretorioBackups())) {
            assertThat(arquivos.count()).isLessThanOrEqualTo(8);
        }
    }

    @Test
    void backupGeraPlanilhaExcelComAsGarantiasNaPastaDoDrive() throws Exception {
        try (Connection conn = conexao.getConnection(); Statement stmt = conn.createStatement()) {
            stmt.execute("INSERT INTO garantias (data_servico, placa, modelo, servico, valor_centavos, tecnico)"
                    + " VALUES ('2026-11-10', 'ABC1D23', 'ONIX', 'TROCA <CARCAÇA> & PILHA', 13000, 'FELIPE')");
        }
        Path drive = pastaTemporaria.resolve("Meu Drive");
        BackupDriveService backup = new BackupDriveService(conexao, drive.toString(), "banco-de-teste.db");

        BackupDriveService.Situacao s = backup.exportar();

        assertThat(s.estado()).isEqualTo("ok");
        Path arquivo = Path.of(s.arquivo());
        assertThat(arquivo).exists().hasParent(drive.resolve(BackupDriveService.SUBPASTA));
        assertThat(arquivo.getFileName().toString()).startsWith("Garantias - dados ").endsWith(".xlsx");
        Map<String, String> partes = new HashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(Files.readAllBytes(arquivo)))) {
            for (ZipEntry e; (e = zip.getNextEntry()) != null; ) {
                partes.put(e.getName(), new String(zip.readAllBytes(), StandardCharsets.UTF_8));
            }
        }
        assertThat(partes.get("xl/workbook.xml")).contains("Garantias", "Serviços e preços", "Técnicos", "Modelos");
        assertThat(partes.get("xl/worksheets/sheet1.xml"))
                .contains("TROCA &lt;CARCAÇA&gt; &amp; PILHA", "10/11/2026", "ABC1D23", "<v>130.00</v>");
    }

    @Test
    void comBancoDeTesteESemPastaOBackupFicaDesligado() {
        BackupDriveService backup = new BackupDriveService(conexao, "", "banco-de-teste.db");
        assertThat(backup.exportar().estado()).isEqualTo("desligado");
    }
}
