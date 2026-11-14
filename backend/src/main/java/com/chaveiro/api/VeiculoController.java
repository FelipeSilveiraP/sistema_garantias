package com.chaveiro.api;

import com.chaveiro.model.Veiculo;
import com.chaveiro.service.VeiculoService;
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

/** CONTROLE > VEICULOS. */
@RestController
@RequestMapping("/api")
public class VeiculoController {

    public record VeiculoRequest(String marca, String modelo, Boolean ativo) {
    }

    private final VeiculoService service;

    public VeiculoController(VeiculoService service) {
        this.service = service;
    }

    @GetMapping("/veiculos")
    public List<Veiculo> listar() {
        return service.listar();
    }

    @GetMapping("/marcas")
    public List<String> marcas() {
        return service.marcas();
    }

    @PostMapping("/veiculos")
    public ResponseEntity<Veiculo> cadastrar(@RequestBody VeiculoRequest r) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.cadastrar(r.marca(), r.modelo()));
    }

    @PutMapping("/veiculos/{id}")
    public Veiculo atualizar(@PathVariable long id, @RequestBody VeiculoRequest r) {
        return service.atualizar(id, r.marca(), r.modelo(), !Boolean.FALSE.equals(r.ativo()));
    }

    @DeleteMapping("/veiculos/{id}")
    public ResponseEntity<Void> excluir(@PathVariable long id) {
        service.excluir(id);
        return ResponseEntity.noContent().build();
    }
}
