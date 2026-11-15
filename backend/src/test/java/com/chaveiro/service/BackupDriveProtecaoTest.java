package com.chaveiro.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.chaveiro.database.ConnectionFactory;
import com.chaveiro.database.DatabaseInitializer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * REGRA: o backup no Google Drive nunca apaga arquivos do usuario; so as planilhas
 * que ele mesmo gerou ("Garantias - dados AAAA-MM-DD.xlsx", direto na subpasta).
 * A subpasta e compartilhada com o Contas a Pagar.
 */
class BackupDriveProtecaoTest {

    @TempDir
    Path tmp;

    private ConnectionFactory conexao;
    private Path drive;
    private Path subpasta;

    @BeforeEach
    void preparar() throws Exception {
        conexao = new ConnectionFactory(tmp.resolve("dados").resolve("garantias.db").toString());
        new DatabaseInitializer(conexao).inicializar();
        drive = Files.createDirectories(tmp.resolve("Meu Drive"));
        subpasta = Files.createDirectories(drive.resolve(BackupDriveService.SUBPASTA));
    }

    private BackupDriveService servico() {
        return new BackupDriveService(conexao, drive.toString(), conexao.getCaminhoBanco().toString());
    }

    private List<String> doSistema() throws Exception {
        try (Stream<Path> s = Files.list(subpasta)) {
            // so arquivos comuns: a pasta e o atalho com nome de planilha ficam de fora (e nunca sao apagados)
            return s.filter(p -> Files.isRegularFile(p, java.nio.file.LinkOption.NOFOLLOW_LINKS))
                    .map(p -> p.getFileName().toString())
                    .filter(n -> n.matches("Garantias - dados \\d{4}-\\d{2}-\\d{2}\\.xlsx")).sorted().toList();
        }
    }

    @Test
    void soApagaAsPlanilhasDoProprioSistemaEMantem30() throws Exception {
        // arquivos que NAO sao do sistema (do usuario e do Contas a Pagar)
        Map<Path, String> alheios = new LinkedHashMap<>();
        alheios.put(subpasta.resolve("contrato.pdf"), "pdf importante");
        alheios.put(subpasta.resolve("Contas a Pagar - dados 2026-01-01.xlsx"), "contas a pagar");
        alheios.put(subpasta.resolve("Garantias - dados copia.xlsx"), "copia manual");
        alheios.put(subpasta.resolve("Garantias - dados 2026-01-01 (1).xlsx"), "copia do drive");
        alheios.put(subpasta.resolve("Garantias - dados 2000-01-01.xlsx.bak"), "bak");
        alheios.put(subpasta.resolve("planilha qualquer.xlsx"), "outra");
        alheios.put(drive.resolve("Garantias - dados 2000-01-01.xlsx"), "na raiz do Drive");
        Path pastaDoUsuario = Files.createDirectories(subpasta.resolve("Pasta do usuario"));
        alheios.put(pastaDoUsuario.resolve("Garantias - dados 2000-01-02.xlsx"), "dentro de outra pasta");
        // uma PASTA com o nome exato de uma planilha antiga: nao pode ser apagada
        Path pastaComNomeDePlanilha = Files.createDirectories(subpasta.resolve("Garantias - dados 2000-01-03.xlsx"));
        for (var a : alheios.entrySet()) {
            Files.writeString(a.getKey(), a.getValue());
        }
        // atalho (link) com nome de planilha do sistema apontando para um arquivo importante
        Path importante = Files.writeString(tmp.resolve("importante.txt"), "nao apagar");
        Path link = subpasta.resolve("Garantias - dados 2000-01-04.xlsx");
        boolean temLink;
        try {
            Files.createSymbolicLink(link, importante);
            temLink = true;
        } catch (UnsupportedOperationException | java.io.IOException | SecurityException semPermissao) {
            temLink = false; // Windows sem permissao de criar link: o resto do teste vale
        }
        // 35 planilhas do sistema (dias antigos)
        LocalDate dia = LocalDate.of(2025, 1, 1);
        for (int i = 0; i < 35; i++) {
            Files.writeString(subpasta.resolve(BackupDriveService.PREFIXO + dia.plusDays(i) + ".xlsx"), "sistema");
        }

        BackupDriveService.Situacao r = servico().exportar();
        assertThat(r.estado()).isEqualTo("ok");

        // so sobram 30 do sistema (a de hoje + as 29 mais novas)
        List<String> restantes = doSistema();
        assertThat(restantes).hasSize(30).contains(BackupDriveService.PREFIXO + LocalDate.now() + ".xlsx");
        assertThat(restantes).doesNotContain(BackupDriveService.PREFIXO + "2025-01-01.xlsx");
        // os alheios continuam intactos (mesmo conteudo)
        for (var a : alheios.entrySet()) {
            assertThat(a.getKey()).as(a.getKey().toString()).exists();
            assertThat(Files.readString(a.getKey())).isEqualTo(a.getValue());
        }
        assertThat(pastaComNomeDePlanilha).isDirectory();
        assertThat(pastaDoUsuario).isDirectory();
        assertThat(Files.readString(importante)).isEqualTo("nao apagar");
        if (temLink) {
            assertThat(Files.isSymbolicLink(link)).isTrue();
        }
        // rodar de novo no mesmo dia nao apaga mais nada alem do necessario
        servico().exportar();
        assertThat(doSistema()).hasSize(30);
        for (var a : alheios.keySet()) {
            assertThat(a).exists();
        }
    }

    @Test
    void naoSobrescrevePastaOuAtalhoComONomeDaPlanilhaDoDia() throws Exception {
        Path hoje = Files.createDirectories(subpasta.resolve(BackupDriveService.PREFIXO + LocalDate.now() + ".xlsx"));
        Files.writeString(hoje.resolve("dentro.txt"), "do usuario");
        BackupDriveService.Situacao r = servico().exportar();
        assertThat(r.estado()).isEqualTo("erro");
        assertThat(Files.readString(hoje.resolve("dentro.txt"))).isEqualTo("do usuario");
    }

    @Test
    void reconheceSoONomeExatoDasPlanilhasDoSistema() throws Exception {
        for (String nome : new String[] {"Garantias - dados 2026-01-01 (1).xlsx", "Garantias - dados copia.xlsx",
                "Contas a Pagar - dados 2026-01-01.xlsx", "garantias - dados 2026-01-01.xlsx", "Garantias - dados 2026-01-01.xlsx.tmp",
                "Garantias - dados 2026-1-1.xlsx", "XGarantias - dados 2026-01-01.xlsx"}) {
            Path p = Files.writeString(subpasta.resolve(nome), "x");
            assertThat(BackupDriveService.geradoPeloSistema(p)).as(nome).isFalse();
        }
        Path certo = Files.writeString(subpasta.resolve("Garantias - dados 2026-01-01.xlsx"), "x");
        assertThat(BackupDriveService.geradoPeloSistema(certo)).isTrue();
    }
}
