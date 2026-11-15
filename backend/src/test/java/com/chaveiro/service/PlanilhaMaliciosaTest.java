package com.chaveiro.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.chaveiro.database.ConnectionFactory;
import com.chaveiro.database.DatabaseInitializer;
import com.chaveiro.repository.GarantiaRepository;
import com.chaveiro.repository.LegadoRepository;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Planilhas montadas para atacar a importacao: arquivo que nao e planilha, "zip bomb",
 * XXE (ler arquivo do computador), "billion laughs", macros, formulas, celulas e
 * numeros gigantes e nome de arquivo com caminho.
 */
class PlanilhaMaliciosaTest {

    @TempDir
    Path pasta;

    private ConnectionFactory conexao;
    private LegadoService legado;

    private static final String NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    private static final String WORKBOOK = "<workbook xmlns=\"" + NS + "\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">"
            + "<sheets><sheet name=\"JANEIRO\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>";
    private static final String RELS = "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
            + "<Relationship Id=\"rId1\" Target=\"worksheets/sheet1.xml\"/></Relationships>";

    @BeforeEach
    void preparar() {
        conexao = new ConnectionFactory(pasta.resolve("garantias.db").toString());
        new DatabaseInitializer(conexao).inicializar();
        legado = new LegadoService(new LegadoRepository(conexao), new GarantiaRepository(conexao));
    }

    private static byte[] zip(Map<String, byte[]> partes) throws IOException {
        ByteArrayOutputStream saida = new ByteArrayOutputStream();
        try (ZipOutputStream z = new ZipOutputStream(saida)) {
            for (var p : partes.entrySet()) {
                z.putNextEntry(new ZipEntry(p.getKey()));
                z.write(p.getValue());
                z.closeEntry();
            }
        }
        return saida.toByteArray();
    }

    private static byte[] b(String texto) {
        return texto.getBytes(StandardCharsets.UTF_8);
    }

    /** Planilha minima com a aba JANEIRO e as linhas dadas (XML de <row>). */
    private static Map<String, byte[]> planilha(String linhas) {
        Map<String, byte[]> p = new LinkedHashMap<>();
        p.put("[Content_Types].xml", b("<Types/>"));
        p.put("xl/workbook.xml", b(WORKBOOK));
        p.put("xl/_rels/workbook.xml.rels", b(RELS));
        p.put("xl/worksheets/sheet1.xml", b("<worksheet xmlns=\"" + NS + "\"><sheetData>"
                + "<row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>DATA</t></is></c></row>" + linhas + "</sheetData></worksheet>"));
        return p;
    }

    private static String celula(String ref, String texto) {
        return "<c r=\"" + ref + "\" t=\"inlineStr\"><is><t>" + texto + "</t></is></c>";
    }

    private void recusada(byte[] arquivo) {
        assertThatThrownBy(() -> legado.importar("GARANTIAS-2026.xlsm", arquivo)).isInstanceOf(DadosInvalidosException.class);
    }

    private String banco(String consulta) throws Exception {
        try (Connection c = conexao.getConnection(); Statement st = c.createStatement(); ResultSet rs = st.executeQuery(consulta)) {
            StringBuilder tudo = new StringBuilder();
            while (rs.next()) {
                for (int i = 1; i <= rs.getMetaData().getColumnCount(); i++) {
                    tudo.append(rs.getString(i)).append('|');
                }
            }
            return tudo.toString();
        }
    }

    @Test
    void arquivoQueNaoEZipERecusadoPeloConteudoNaoPeloNome() {
        recusada(b("MZ\u0090 executavel renomeado para .xlsm"));
        recusada(b("<html><script>alert(1)</script></html>"));
        recusada(new byte[] {'P', 'K', 3}); // curto demais
        recusada(new byte[] {'P', 'K', 3, 4, 0, 0, 0, 0}); // comeca como zip, mas esta quebrado
        recusada(new byte[LeitorXlsx.LIMITE_BYTES + 1]);
    }

    @Test
    void zipBombEPartesGigantesSaoRecusadas() throws Exception {
        // 90 MB de espacos comprimem para ~90 KB: passa do limite total descompactado
        Map<String, byte[]> bomba = planilha("");
        bomba.put("xl/vbaProject.bin", new byte[(int) LeitorXlsx.LIMITE_DESCOMPACTADO + 1024]);
        byte[] arquivo = zip(bomba);
        assertThat(arquivo.length).isLessThan(1024 * 1024);
        recusada(arquivo);
        // uma aba de 13 MB (acima do limite por parte)
        Map<String, byte[]> abaGrande = planilha("");
        byte[] xml = new byte[LeitorXlsx.LIMITE_PARTE + 1];
        java.util.Arrays.fill(xml, (byte) ' ');
        abaGrande.put("xl/worksheets/sheet2.xml", xml);
        recusada(zip(abaGrande));
        // milhares de partes pequenas
        Map<String, byte[]> muitas = planilha("");
        for (int i = 0; i <= LeitorXlsx.LIMITE_ENTRADAS_ZIP; i++) {
            muitas.put("lixo/" + i, new byte[1]);
        }
        recusada(zip(muitas));
    }

    @Test
    void xxeNaoLeArquivosDoComputador() throws Exception {
        Path segredo = pasta.resolve("segredo.txt");
        Files.writeString(segredo, "SENHA-SECRETA-DO-PC");
        String entidade = "<!DOCTYPE x [<!ENTITY e SYSTEM \"" + segredo.toUri() + "\">]>";
        Map<String, byte[]> p = planilha("");
        p.put("xl/worksheets/sheet1.xml", b("<?xml version=\"1.0\"?>" + entidade + "<worksheet xmlns=\"" + NS + "\"><sheetData>"
                + "<row r=\"2\">" + celula("A2", "15/01/2026") + celula("H2", "&e;") + "</row></sheetData></worksheet>"));
        recusada(zip(p));
        // tambem no workbook e nos textos compartilhados
        Map<String, byte[]> w = planilha("");
        w.put("xl/workbook.xml", b("<?xml version=\"1.0\"?>" + entidade + WORKBOOK));
        recusada(zip(w));
        Map<String, byte[]> s = planilha("");
        s.put("xl/sharedStrings.xml", b("<?xml version=\"1.0\"?>" + entidade + "<sst xmlns=\"" + NS + "\"><si><t>&e;</t></si></sst>"));
        recusada(zip(s));
        assertThat(banco("SELECT COUNT(*) FROM legado_garantias WHERE observacao LIKE '%SENHA%'")).isEqualTo("0|");
    }

    @Test
    void billionLaughsERecusado() throws Exception {
        StringBuilder dtd = new StringBuilder("<!DOCTYPE l [<!ENTITY l0 \"ha\">");
        for (int i = 1; i <= 10; i++) {
            dtd.append("<!ENTITY l").append(i).append(" \"").append(("&l" + (i - 1) + ";").repeat(10)).append("\">");
        }
        dtd.append("]>");
        Map<String, byte[]> p = planilha("");
        p.put("xl/sharedStrings.xml", b(dtd + "<sst xmlns=\"" + NS + "\"><si><t>&l10;</t></si></sst>"));
        long inicio = System.nanoTime();
        recusada(zip(p));
        assertThat((System.nanoTime() - inicio) / 1_000_000).isLessThan(5_000);
    }

    @Test
    void macrosSaoIgnoradasEFormulasViramSoTexto() throws Exception {
        Map<String, byte[]> p = planilha("<row r=\"2\">" + celula("A2", "15/01/2026") + celula("B2", "ABC1234")
                + celula("C2", "GOL") + celula("D2", "TROCA CARCACA")
                // formula: o leitor usa so o valor ja calculado (<v>), nunca a formula
                + "<c r=\"F2\"><f>WEBSERVICE(\"http://ataque/\")*0+150</f><v>150</v></c>"
                + celula("G2", "FELIPE")
                // "injecao de formula": entra como texto e o backup grava como texto (inlineStr)
                + celula("H2", "=cmd|' /C calc'!A0") + "</row>");
        p.put("xl/vbaProject.bin", b("Sub Auto_Open(): Shell \"calc.exe\": End Sub"));
        LegadoService.Resultado r = legado.importar("GARANTIAS-2026.xlsm", zip(p));
        assertThat(r.importadas()).isEqualTo(1);
        assertThat(banco("SELECT valor_centavos, observacao FROM garantias")).isEqualTo("15000|=CMD|' /C CALC'!A0|");
        byte[] backup = PlanilhaXlsx.gerar(java.util.List.of(new PlanilhaXlsx.Aba("G", java.util.List.of("OBS"),
                java.util.List.of(java.util.List.of("=cmd|' /C calc'!A0")))));
        String aba = new String(LeitorXlsxTeste.parte(backup, "xl/worksheets/sheet1.xml"), StandardCharsets.UTF_8);
        assertThat(aba).contains("t=\"inlineStr\"").doesNotContain("<f>");
    }

    @Test
    void celulasENumerosGigantesNaoTravamNemPassamDoLimite() throws Exception {
        String enorme = "X".repeat(30_000);
        Map<String, byte[]> p = planilha("<row r=\"2\">" + celula("A2", "15/01/2026") + celula("B2", "ABC1234")
                + celula("C2", enorme) + celula("D2", enorme) + celula("F2", "1E999999999") + celula("G2", enorme)
                + celula("H2", enorme) + "</row>");
        long inicio = System.nanoTime();
        assertThat(legado.importar("GARANTIAS-2026.xlsm", zip(p)).importadas()).isEqualTo(1);
        assertThat((System.nanoTime() - inicio) / 1_000_000).isLessThan(5_000);
        assertThat(banco("SELECT length(modelo), length(servico), length(tecnico), length(observacao), valor_centavos FROM garantias"))
                .isEqualTo("120|120|60|500|0|");
        assertThat(banco("SELECT length(observacao) FROM legado_garantias")).isEqualTo("1000|");
        assertThat(LegadoService.valor("1E999999999")).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(LegadoService.valor("150.000,00")).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(LegadoService.valor("-5")).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(LegadoService.valor("R$ 85,50")).isEqualByComparingTo(new BigDecimal("85.50"));
    }

    @Test
    void nomeDoArquivoVaiSemPastaNemCaracteresDeControle() {
        assertThat(LegadoService.nomeSeguro("C:\\Users\\loja\\..\\..\\Windows\\GARANTIAS-2026.xlsm")).isEqualTo("GARANTIAS-2026.xlsm");
        assertThat(LegadoService.nomeSeguro("../../etc/passwd")).isEqualTo("passwd");
        assertThat(LegadoService.nomeSeguro("GARANTIAS\u0000\r\n.xlsm")).isEqualTo("GARANTIAS.xlsm");
        assertThat(LegadoService.nomeSeguro("   ")).isEqualTo("planilha.xlsm");
        assertThat(LegadoService.nomeSeguro("a".repeat(500) + ".xlsm")).hasSize(120).endsWith(".xlsm");
    }

    /** Le uma parte de um .xlsx (para conferir o que o backup grava). */
    static final class LeitorXlsxTeste {
        static byte[] parte(byte[] xlsx, String nome) throws IOException {
            try (var z = new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(xlsx))) {
                ZipEntry e;
                while ((e = z.getNextEntry()) != null) {
                    if (e.getName().equals(nome)) {
                        return z.readAllBytes();
                    }
                }
            }
            throw new IOException("parte nao encontrada: " + nome);
        }
    }
}
