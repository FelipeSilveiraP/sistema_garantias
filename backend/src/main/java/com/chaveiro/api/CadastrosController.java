package com.chaveiro.api;

import com.chaveiro.model.ItemLista;
import com.chaveiro.model.Servico;
import com.chaveiro.repository.ListaRepository.Lista;
import com.chaveiro.service.CadastrosService;
import com.chaveiro.service.RecursoNaoEncontradoException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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

/** ATUALIZAR PRECOS: tabela de servicos/pecas e as listas de tecnicos e modelos. */
@RestController
@RequestMapping("/api")
public class CadastrosController {

    public record ReajusteRequest(BigDecimal percentual, boolean incluirPecas) {
    }

    public record ItemRequest(String nome, Boolean ativo) {
    }

    private final CadastrosService service;

    public CadastrosController(CadastrosService service) {
        this.service = service;
    }

    @GetMapping("/servicos")
    public List<Servico> servicos() {
        return service.listarServicos();
    }

    @PostMapping("/servicos")
    public ResponseEntity<Servico> cadastrarServico(@RequestBody Servico dados) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.cadastrarServico(dados));
    }

    @PutMapping("/servicos/{id}")
    public Servico atualizarServico(@PathVariable long id, @RequestBody Servico dados) {
        return service.atualizarServico(id, dados);
    }

    @PostMapping("/servicos/reajuste")
    public Map<String, Integer> reajustar(@RequestBody ReajusteRequest requisicao) {
        return Map.of("atualizados", service.reajustar(requisicao.percentual(), requisicao.incluirPecas()));
    }

    @GetMapping("/listas/{lista}")
    public List<ItemLista> listar(@PathVariable String lista) {
        return service.listar(lista(lista));
    }

    @PostMapping("/listas/{lista}")
    public ResponseEntity<ItemLista> incluir(@PathVariable String lista, @RequestBody ItemRequest requisicao) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.incluir(lista(lista), requisicao.nome()));
    }

    @PutMapping("/listas/{lista}/{id}")
    public ResponseEntity<Void> alterar(@PathVariable String lista, @PathVariable long id,
                                        @RequestBody ItemRequest requisicao) {
        service.alterar(lista(lista), id, requisicao.nome(), !Boolean.FALSE.equals(requisicao.ativo()));
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/listas/{lista}/{id}")
    public ResponseEntity<Void> excluir(@PathVariable String lista, @PathVariable long id) {
        service.excluir(lista(lista), id);
        return ResponseEntity.noContent().build();
    }

    private static Lista lista(String nome) {
        try {
            return Lista.valueOf(nome.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException erro) {
            throw new RecursoNaoEncontradoException("lista");
        }
    }
}
