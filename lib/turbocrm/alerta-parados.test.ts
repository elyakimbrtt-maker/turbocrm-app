import { describe, expect, it } from "vitest";

import {
  atendentesAcimaDoLimite,
  CHAVE_DO_LIMITE_DE_PARADOS,
  corteDeParado,
  limiteDeParados,
  linkDosParados,
  LIMITE_PADRAO_DE_PARADOS,
} from "./alerta-parados";

describe("limiteDeParados", () => {
  it("usa o padrão quando a empresa não definiu", () => {
    expect(limiteDeParados({})).toBe(LIMITE_PADRAO_DE_PARADOS);
    expect(limiteDeParados(null)).toBe(LIMITE_PADRAO_DE_PARADOS);
  });
  it("lê o limite gravado", () => {
    expect(limiteDeParados({ [CHAVE_DO_LIMITE_DE_PARADOS]: 8 })).toBe(8);
  });
  it("recusa valor torto e volta ao padrão", () => {
    for (const v of [0, -3, 2.5, "8", 9999]) {
      expect(limiteDeParados({ [CHAVE_DO_LIMITE_DE_PARADOS]: v })).toBe(LIMITE_PADRAO_DE_PARADOS);
    }
  });
});

describe("atendentesAcimaDoLimite", () => {
  it("pega quem chegou ao limite, do mais parado para o menos", () => {
    const vs = [
      { id: "a", leads_parados: 4 },
      { id: "b", leads_parados: 9 },
      { id: "c", leads_parados: 5 },
    ];
    expect(atendentesAcimaDoLimite(vs, 5).map((v) => v.id)).toEqual(["b", "c"]);
  });
});

describe("linkDosParados", () => {
  it("abre o funil filtrado no atendente", () => {
    expect(linkDosParados("f1", "u1")).toBe("/app/pipelines/f1?owner=u1");
    expect(linkDosParados(null, "u1")).toBe("/app/kanban");
  });
});

describe("corteDeParado", () => {
  it("fica 48 h antes de agora", () => {
    expect(corteDeParado(new Date("2026-11-04T12:00:00Z"))).toBe("2026-11-02T12:00:00.000Z");
  });
});
