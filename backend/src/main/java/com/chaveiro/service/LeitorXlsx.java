package com.chaveiro.service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * Leitor minimo de .xlsx/.xlsm (zip de XMLs), sem biblioteca externa: devolve, por
 * aba, as linhas com o valor bruto de cada coluna (A, B, ...). Numeros saem como no
 * arquivo (datas sao o numero de serie do Excel). Protegido contra XXE e "zip bomb".
 */
public final class LeitorXlsx {

    public static final int LIMITE_BYTES = 30 * 1024 * 1024;
    private static final long LIMITE_DESCOMPACTADO = 200L * 1024 * 1024;

    /** Uma linha da aba: numero (1 = cabecalho) e celulas por coluna ("A" -> valor). */
    public record Linha(int numero, Map<String, String> celulas) {
    }

    private LeitorXlsx() {
    }

    public static Map<String, List<Linha>> ler(byte[] arquivo) throws IOException {
        if (arquivo.length > LIMITE_BYTES) {
            throw new IOException("arquivo maior que o limite");
        }
        Map<String, byte[]> partes = descompactar(arquivo);
        if (!partes.containsKey("xl/workbook.xml")) {
            throw new IOException("nao e uma planilha do Excel (.xlsx/.xlsm)");
        }
        try {
            List<String> compartilhados = textosCompartilhados(partes.get("xl/sharedStrings.xml"));
            Map<String, String> alvos = relacoes(partes.get("xl/_rels/workbook.xml.rels"));
            Map<String, List<Linha>> abas = new LinkedHashMap<>();
            NodeList sheets = xml(partes.get("xl/workbook.xml")).getElementsByTagNameNS("*", "sheet");
            for (int i = 0; i < sheets.getLength(); i++) {
                Element sheet = (Element) sheets.item(i);
                String nome = sheet.getAttribute("name");
                String rid = sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
                String alvo = alvos.get(rid);
                if (alvo == null) {
                    continue;
                }
                String caminho = alvo.startsWith("/") ? alvo.substring(1) : "xl/" + alvo;
                byte[] conteudo = partes.get(caminho);
                if (conteudo != null) {
                    abas.put(nome, linhas(conteudo, compartilhados));
                }
            }
            return abas;
        } catch (IOException erro) {
            throw erro;
        } catch (Exception erro) {
            throw new IOException("planilha ilegivel: " + erro.getMessage(), erro);
        }
    }

    /** Numero de serie do Excel (sistema 1900) -> data ISO; null se nao for numero. */
    public static String dataDeSerie(String valor) {
        try {
            double serie = Double.parseDouble(valor);
            if (serie < 1 || serie > 2958465) {
                return null;
            }
            return java.time.LocalDate.of(1899, 12, 30).plusDays((long) Math.floor(serie)).toString();
        } catch (NumberFormatException | NullPointerException erro) {
            return null;
        }
    }

    private static Map<String, byte[]> descompactar(byte[] arquivo) throws IOException {
        Map<String, byte[]> partes = new HashMap<>();
        long total = 0;
        byte[] buffer = new byte[8192];
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(arquivo))) {
            ZipEntry entrada;
            while ((entrada = zip.getNextEntry()) != null) {
                String nome = entrada.getName();
                boolean interessa = nome.equals("xl/workbook.xml") || nome.equals("xl/sharedStrings.xml")
                        || nome.equals("xl/_rels/workbook.xml.rels") || nome.startsWith("xl/worksheets/");
                ByteArrayOutputStream saida = new ByteArrayOutputStream();
                int lidos;
                while ((lidos = zip.read(buffer)) > 0) {
                    total += lidos;
                    if (total > LIMITE_DESCOMPACTADO) {
                        throw new IOException("planilha grande demais depois de descompactada");
                    }
                    if (interessa) {
                        saida.write(buffer, 0, lidos);
                    }
                }
                if (interessa) {
                    partes.put(nome, saida.toByteArray());
                }
            }
        } catch (IllegalArgumentException erro) {
            throw new IOException("arquivo compactado invalido", erro);
        }
        return partes;
    }

    private static Document xml(byte[] conteudo) throws Exception {
        DocumentBuilderFactory fabrica = DocumentBuilderFactory.newInstance();
        fabrica.setNamespaceAware(true);
        fabrica.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        fabrica.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        fabrica.setExpandEntityReferences(false);
        DocumentBuilder construtor = fabrica.newDocumentBuilder();
        return construtor.parse(new ByteArrayInputStream(conteudo));
    }

    private static List<String> textosCompartilhados(byte[] conteudo) throws Exception {
        List<String> textos = new ArrayList<>();
        if (conteudo == null) {
            return textos;
        }
        NodeList itens = xml(conteudo).getElementsByTagNameNS("*", "si");
        for (int i = 0; i < itens.getLength(); i++) {
            NodeList partes = ((Element) itens.item(i)).getElementsByTagNameNS("*", "t");
            StringBuilder texto = new StringBuilder();
            for (int j = 0; j < partes.getLength(); j++) {
                texto.append(partes.item(j).getTextContent());
            }
            textos.add(texto.toString());
        }
        return textos;
    }

    private static Map<String, String> relacoes(byte[] conteudo) throws Exception {
        Map<String, String> mapa = new HashMap<>();
        if (conteudo == null) {
            return mapa;
        }
        NodeList rels = xml(conteudo).getElementsByTagNameNS("*", "Relationship");
        for (int i = 0; i < rels.getLength(); i++) {
            Element r = (Element) rels.item(i);
            mapa.put(r.getAttribute("Id"), r.getAttribute("Target"));
        }
        return mapa;
    }

    private static List<Linha> linhas(byte[] conteudo, List<String> compartilhados) throws Exception {
        List<Linha> linhas = new ArrayList<>();
        NodeList rows = xml(conteudo).getElementsByTagNameNS("*", "row");
        for (int i = 0; i < rows.getLength(); i++) {
            Element row = (Element) rows.item(i);
            int numero = Integer.parseInt(row.getAttribute("r"));
            Map<String, String> celulas = new LinkedHashMap<>();
            NodeList cs = row.getElementsByTagNameNS("*", "c");
            for (int j = 0; j < cs.getLength(); j++) {
                Element c = (Element) cs.item(j);
                String coluna = c.getAttribute("r").replaceAll("\\d", "");
                String tipo = c.getAttribute("t");
                String valor;
                if ("inlineStr".equals(tipo)) {
                    valor = c.getTextContent();
                } else {
                    NodeList v = c.getElementsByTagNameNS("*", "v");
                    if (v.getLength() == 0) {
                        continue;
                    }
                    valor = v.item(0).getTextContent();
                    if ("s".equals(tipo)) {
                        int indice = Integer.parseInt(valor);
                        valor = indice < compartilhados.size() ? compartilhados.get(indice) : "";
                    }
                }
                if (valor != null && !valor.isBlank()) {
                    celulas.put(coluna, valor.trim());
                }
            }
            if (!celulas.isEmpty()) {
                linhas.add(new Linha(numero, celulas));
            }
        }
        return linhas;
    }
}
