package com.chaveiro.api;

import com.chaveiro.repository.EstatisticaRepository;
import com.chaveiro.service.DadosInvalidosException;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** GRAFICOS: totais e rankings do periodo (de/ate em aaaa-mm-dd). */
@RestController
public class EstatisticaController {

    private final EstatisticaRepository repository;

    public EstatisticaController(EstatisticaRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/api/estatisticas")
    public EstatisticaRepository.Resumo resumo(@RequestParam LocalDate de, @RequestParam LocalDate ate) {
        if (ate.isBefore(de)) {
            throw new DadosInvalidosException(Map.of("periodo", "Período inválido."));
        }
        try {
            return repository.resumo(de.toString(), ate.toString());
        } catch (SQLException erro) {
            throw new IllegalStateException("falha ao calcular as estatisticas", erro);
        }
    }
}
