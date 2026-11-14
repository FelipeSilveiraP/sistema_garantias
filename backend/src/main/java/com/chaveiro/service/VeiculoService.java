package com.chaveiro.service;

import com.chaveiro.model.Veiculo;
import com.chaveiro.repository.VeiculoRepository;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

/** CONTROLE > VEICULOS: cadastro, edicao e exclusao do catalogo de veiculos. */
@Service
public class VeiculoService {

    private final VeiculoRepository repository;

    public VeiculoService(VeiculoRepository repository) {
        this.repository = repository;
    }

    public List<Veiculo> listar() {
        try {
            return repository.listar();
        } catch (SQLException erro) {
            throw new IllegalStateException("falha ao consultar os veiculos", erro);
        }
    }

    public List<String> marcas() {
        try {
            return repository.marcas();
        } catch (SQLException erro) {
            throw new IllegalStateException("falha ao consultar as marcas", erro);
        }
    }

    public Veiculo buscarPorId(long id) {
        try {
            return repository.buscarPorId(id).orElseThrow(() -> new RecursoNaoEncontradoException("veiculo"));
        } catch (SQLException erro) {
            throw new IllegalStateException("falha ao consultar o veiculo", erro);
        }
    }

    public Veiculo cadastrar(String marca, String modelo) {
        String[] v = validar(marca, modelo, null);
        try {
            return buscarPorId(repository.inserir(v[0], v[1]));
        } catch (SQLException erro) {
            throw new IllegalStateException("falha ao salvar o veiculo", erro);
        }
    }

    public Veiculo atualizar(long id, String marca, String modelo, boolean ativo) {
        String[] v = validar(marca, modelo, id);
        try {
            if (!repository.atualizar(id, v[0], v[1], ativo)) {
                throw new RecursoNaoEncontradoException("veiculo");
            }
            return buscarPorId(id);
        } catch (SQLException erro) {
            throw new IllegalStateException("falha ao atualizar o veiculo", erro);
        }
    }

    public void excluir(long id) {
        try {
            if (!repository.excluir(id)) {
                throw new RecursoNaoEncontradoException("veiculo");
            }
        } catch (SQLException erro) {
            throw new IllegalStateException("falha ao excluir o veiculo", erro);
        }
    }

    private String[] validar(String marca, String modelo, Long id) {
        String ma = marca == null ? "" : marca.trim().replaceAll("\\s+", " ").toUpperCase(Locale.ROOT);
        String mo = modelo == null ? "" : modelo.trim().replaceAll("\\s+", " ").toUpperCase(Locale.ROOT);
        Map<String, String> erros = new LinkedHashMap<>();
        if (ma.length() < 2 || ma.length() > 40) {
            erros.put("marca", "Escolha ou digite a marca.");
        }
        if (mo.isEmpty() || mo.length() > 60) {
            erros.put("modelo", "Informe o modelo (até 60 caracteres).");
        }
        if (!erros.isEmpty()) {
            throw new DadosInvalidosException(erros);
        }
        try {
            if (repository.existe(ma, mo, id)) {
                throw new DadosInvalidosException(Map.of("modelo", "Esse modelo já está cadastrado nessa marca."));
            }
        } catch (SQLException erro) {
            throw new IllegalStateException("falha ao consultar o veiculo", erro);
        }
        return new String[] {ma, mo};
    }
}
