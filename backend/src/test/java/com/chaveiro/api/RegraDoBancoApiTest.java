package com.chaveiro.api;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.chaveiro.database.ConnectionFactory;
import java.sql.Connection;
import java.sql.Statement;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** Gatilho do banco recusou: a tela recebe 409 com o motivo, nao "erro interno". */
@SpringBootTest
@AutoConfigureMockMvc
class RegraDoBancoApiTest {

    private static final String TOKEN = "token-teste-unitario";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ConnectionFactory conexao;

    @Test
    void garantiaComNfceEmitidaNaoExcluiENaoDesmarcaOCupom() throws Exception {
        String corpo = "{\"dataServico\":\"" + LocalDate.now() + "\",\"placa\":\"NFC1E23\",\"semPlaca\":false,"
                + "\"modelo\":\"gol\",\"servico\":\"troca bolacha\",\"valor\":80.00,\"tecnico\":\"felipe\"}";
        String criado = mvc.perform(post("/api/garantias").header("X-FinDesk-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = criado.replaceAll(".*\"id\":(\\d+).*", "$1");
        try (Connection c = conexao.getConnection(); Statement st = c.createStatement()) {
            st.execute("UPDATE garantias SET cupom_status = 'LANCADO', cupom_lancado_em = '" + LocalDate.now()
                    + "', cupom_nfce = '777', cupom_chave = 'CHAVE' WHERE id_garantia = " + id);
        }
        mvc.perform(delete("/api/garantias/" + id).header("X-FinDesk-Token", TOKEN))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.erro").value(containsString("NFC-e emitida no RM")));
        mvc.perform(put("/api/garantias/" + id + "/cupom").header("X-FinDesk-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"NAO_LANCADO\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.erro").value(containsString("NFC-e emitida no RM")));
    }
}
