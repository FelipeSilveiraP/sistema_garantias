package com.chaveiro.api;

import com.chaveiro.model.Garantia;
import com.chaveiro.service.GarantiaService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/garantias")
public class GarantiaController {

    /** Corpo do cadastro/edicao. idServico nulo + servico preenchido = "OUTRO" (texto livre). */
    public record GarantiaRequest(LocalDate dataServico, String placa, boolean semPlaca, String cpf, String modelo,
                                  Long idServico, String servico, int qtdCarcaca, int qtdBotao, int qtdPilha,
                                  int qtdItens, BigDecimal valor, String tecnico, String observacao, Boolean forcar) {
        Garantia paraModelo() {
            return new Garantia(null, dataServico, placa, semPlaca, cpf, modelo, idServico, servico, qtdCarcaca,
                    qtdBotao, qtdPilha, qtdItens, valor, tecnico, observacao, null, null, null, "SISTEMA");
        }
    }

    public record CupomRequest(String status) {
    }

    private final GarantiaService service;

    public GarantiaController(GarantiaService service) {
        this.service = service;
    }

    @GetMapping
    public List<Garantia> listar() {
        return service.listar();
    }

    @GetMapping("/{id}")
    public Garantia buscar(@PathVariable long id) {
        return service.buscarPorId(id);
    }

    @PostMapping
    public ResponseEntity<Garantia> cadastrar(@RequestBody GarantiaRequest requisicao) {
        Garantia criada = service.cadastrar(requisicao.paraModelo(), Boolean.TRUE.equals(requisicao.forcar()));
        return ResponseEntity.status(HttpStatus.CREATED).body(criada);
    }

    @PutMapping("/{id}")
    public Garantia atualizar(@PathVariable long id, @RequestBody GarantiaRequest requisicao) {
        return service.atualizar(id, requisicao.paraModelo());
    }

    /** Estrutura para a automacao do cupom fiscal (SAT web): NAO_LANCADO, LANCADO ou DISPENSADO. */
    @PutMapping("/{id}/cupom")
    public Garantia marcarCupom(@PathVariable long id, @RequestBody CupomRequest requisicao) {
        return service.marcarCupom(id, requisicao.status());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> excluir(@PathVariable long id) {
        service.excluir(id);
        return ResponseEntity.noContent().build();
    }
}
