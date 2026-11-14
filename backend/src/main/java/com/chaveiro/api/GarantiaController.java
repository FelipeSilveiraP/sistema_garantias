package com.chaveiro.api;

import com.chaveiro.model.Garantia;
import com.chaveiro.service.GarantiaService;
import com.chaveiro.service.UsuarioService;
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
                                  int qtdItens, BigDecimal valor, String tecnico, String observacao, Boolean forcar,
                                  String criadoPor, Long idVeiculo) {
        Garantia paraModelo() {
            return new Garantia(null, dataServico, placa, semPlaca, cpf, modelo, idServico, servico, qtdCarcaca,
                    qtdBotao, qtdPilha, qtdItens, valor, tecnico, observacao, null, null, null, "SISTEMA", criadoPor, idVeiculo);
        }
    }

    public record CupomRequest(String status) {
    }

    private final GarantiaService service;
    private final UsuarioService usuarios;

    public GarantiaController(GarantiaService service, UsuarioService usuarios) {
        this.service = service;
        this.usuarios = usuarios;
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
    public ResponseEntity<Garantia> cadastrar(@RequestBody GarantiaRequest requisicao,
            @org.springframework.web.bind.annotation.RequestHeader(value = UsuarioController.SESSAO, required = false) String sessao) {
        // "cadastrada por": o perfil da SESSAO (PIN conferido), nao o que a tela mandar
        Garantia g = requisicao.paraModelo();
        String perfil = usuarios.nomeDaSessao(sessao);
        if (perfil != null) {
            g = new Garantia(g.id(), g.dataServico(), g.placa(), g.semPlaca(), g.cpf(), g.modelo(), g.idServico(), g.servico(),
                    g.qtdCarcaca(), g.qtdBotao(), g.qtdPilha(), g.qtdItens(), g.valor(), g.tecnico(), g.observacao(),
                    g.codigoCupom(), g.cupomStatus(), g.cupomLancadoEm(), g.origem(), perfil, g.idVeiculo());
        }
        Garantia criada = service.cadastrar(g, Boolean.TRUE.equals(requisicao.forcar()));
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
