package com.chaveiro.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class ApiTest {

    private static final String TOKEN = "token-teste-unitario";

    @Autowired
    private MockMvc mvc;

    @Test
    void deveNegarSemTokenEComTokenInvalido() throws Exception {
        mvc.perform(get("/api/status")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/garantias").header("X-FinDesk-Token", "errado")).andExpect(status().isUnauthorized());
    }

    @Test
    void deveResponderStatusComTokenValido() throws Exception {
        mvc.perform(get("/api/status").header("X-FinDesk-Token", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"));
    }

    @Test
    void deveResponder400ParaJsonMalformado() throws Exception {
        mvc.perform(post("/api/garantias").header("X-FinDesk-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"placa\": "))
                .andExpect(status().isBadRequest());
    }

    @Test
    void cadastraPesquisaEMarcaCupomPelaApi() throws Exception {
        String hoje = LocalDate.now().toString();
        String corpo = "{\"dataServico\":\"" + hoje + "\",\"placa\":\"api-1234\",\"semPlaca\":false,"
                + "\"modelo\":\"gol\",\"servico\":\"chave codificada\",\"valor\":150.00,\"tecnico\":\"felipe\"}";
        String criado = mvc.perform(post("/api/garantias").header("X-FinDesk-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.placa").value("API1234"))
                .andReturn().getResponse().getContentAsString();
        String id = criado.replaceAll(".*\"id\":(\\d+).*", "$1");

        // mesma placa, mesmo dia, mesmo servico: 409 pedindo confirmacao
        mvc.perform(post("/api/garantias").header("X-FinDesk-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.tipo").value("possivel_duplicata"));

        mvc.perform(put("/api/garantias/" + id + "/cupom").header("X-FinDesk-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"LANCADO\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cupomStatus").value("LANCADO"));

        mvc.perform(get("/api/estatisticas").param("de", hoje).param("ate", hoje).header("X-FinDesk-Token", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantidade").isNumber());
        mvc.perform(get("/api/listas/tecnicos").header("X-FinDesk-Token", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].nome").exists());
        mvc.perform(get("/api/listas/inexistente").header("X-FinDesk-Token", TOKEN)).andExpect(status().isNotFound());
    }

    @Test
    void placaInvalidaVolta400ComOCampo() throws Exception {
        String corpo = "{\"dataServico\":\"" + LocalDate.now() + "\",\"placa\":\"X\",\"modelo\":\"gol\","
                + "\"servico\":\"chave\",\"tecnico\":\"felipe\"}";
        mvc.perform(post("/api/garantias").header("X-FinDesk-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos.placa").exists());
    }
}
