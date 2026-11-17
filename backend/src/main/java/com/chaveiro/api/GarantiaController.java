package com.chaveiro.api;

import com.chaveiro.model.Garantia;
import com.chaveiro.service.CupomService;
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
                                  String criadoPor, Long idVeiculo,
                                  /** varios produtos (botao + no cadastro); quando vem, substitui idServico/servico */
                                  List<GarantiaService.ItemEntrada> itens) {
        Garantia paraModelo() {
            return new Garantia(null, dataServico, placa, semPlaca, cpf, modelo, idServico, servico, qtdCarcaca,
                    qtdBotao, qtdPilha, qtdItens, valor, tecnico, observacao, null, null, null, "SISTEMA", criadoPor, idVeiculo);
        }
    }

    public record CupomRequest(String status) {
    }

    /** NFC-e emitida no RM (numero e chave de acesso). */
    public record EmitidoRequest(String nfce, String chave) {
    }

    private final GarantiaService service;
    private final UsuarioService usuarios;
    private final CupomService cupons;

    public GarantiaController(GarantiaService service, UsuarioService usuarios, CupomService cupons) {
        this.service = service;
        this.usuarios = usuarios;
        this.cupons = cupons;
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
        // sem sessao valida fica em branco: o nome que a tela mandar nao vale
        String perfil = usuarios.nomeDaSessao(sessao);
        g = new Garantia(g.id(), g.dataServico(), g.placa(), g.semPlaca(), g.cpf(), g.modelo(), g.idServico(), g.servico(),
                g.qtdCarcaca(), g.qtdBotao(), g.qtdPilha(), g.qtdItens(), g.valor(), g.tecnico(), g.observacao(),
                g.codigoCupom(), g.cupomStatus(), g.cupomLancadoEm(), g.origem(), perfil, g.idVeiculo());
        boolean forcar = Boolean.TRUE.equals(requisicao.forcar());
        Garantia criada = requisicao.itens() != null && !requisicao.itens().isEmpty()
                ? service.cadastrarComItens(g, requisicao.itens(), forcar)
                : service.cadastrar(g, forcar);
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

    /** O que o PDV do RM recebe: produtos (pelo nome no RM), quantidades e valores. */
    @GetMapping("/{id}/cupom-rm")
    public CupomService.PedidoCupom pedidoCupom(@PathVariable long id) {
        return cupons.pedido(id);
    }

    @PostMapping("/{id}/cupom-rm/emitido")
    public Garantia cupomEmitido(@PathVariable long id, @RequestBody EmitidoRequest requisicao) {
        cupons.registrarEmitido(id, requisicao.nfce(), requisicao.chave());
        return service.buscarPorId(id);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> excluir(@PathVariable long id) {
        service.excluir(id);
        return ResponseEntity.noContent().build();
    }
}
