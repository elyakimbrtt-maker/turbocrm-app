import { describe, it, expect } from "vitest";
import { csvDosLeads } from "./exportar-leads";

describe("csvDosLeads", () => {
  it("monta a planilha com etapa e responsável pelo nome, pronta para o Excel", () => {
    const csv = csvDosLeads(
      [
        {
          title: 'João "Moto"; Silva',
          contact_phone: "+5591999990000",
          stage_id: "s1",
          owner_user_id: "u1",
          source: "meta_ads",
          tags: ["Meta_ads", "Quente"],
          created_at: "2026-11-18T14:01:10Z",
        },
        { title: "=HYPERLINK(1)", stage_id: "s2", owner_user_id: null, created_at: "2026-11-01T00:00:00Z" },
      ],
      (id) => ({ s1: "NOVO LEAD", s2: "EM CONTATO" })[id] ?? "",
      (id) => (id === "u1" ? "Heloísa" : "Sem responsável"),
    );
    const [cab, l1, l2] = csv.replace("﻿", "").split("\r\n");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(cab).toBe("Nome;Telefone;Etapa;Responsável;Origem;Tags;Criado em");
    expect(l1).toBe('"João ""Moto""; Silva";+5591999990000;NOVO LEAD;Heloísa;meta_ads;Meta_ads, Quente;18/11/2026');
    // fórmula vira texto; telefone com + continua telefone
    expect(l2).toBe("'=HYPERLINK(1);;EM CONTATO;Sem responsável;;;01/11/2026");
  });
});
