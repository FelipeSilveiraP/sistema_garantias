package com.chaveiro.api;

import com.chaveiro.service.DadosInvalidosException;
import com.chaveiro.service.LegadoService;
import java.util.Base64;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Importacao da planilha antiga GARANTIAS-AAAA.xlsm para o banco (entidade de legado). */
@RestController
public class LegadoController {

    public record ImportacaoRequest(String nomeArquivo, String conteudoBase64) {
    }

    private final LegadoService service;

    public LegadoController(LegadoService service) {
        this.service = service;
    }

    @PostMapping("/api/legado/importar")
    public LegadoService.Resultado importar(@RequestBody ImportacaoRequest requisicao) {
        byte[] conteudo;
        try {
            String base64 = requisicao.conteudoBase64() == null ? "" : requisicao.conteudoBase64();
            conteudo = Base64.getDecoder().decode(base64);
        } catch (IllegalArgumentException erro) {
            throw new DadosInvalidosException(Map.of("arquivo", "O arquivo está corrompido. Escolha de novo."));
        }
        if (conteudo.length == 0) {
            throw new DadosInvalidosException(Map.of("arquivo", "Escolha a planilha GARANTIAS-AAAA.xlsm."));
        }
        return service.importar(requisicao.nomeArquivo(), conteudo);
    }
}
