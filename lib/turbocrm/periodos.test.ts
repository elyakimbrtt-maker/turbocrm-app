import { describe, expect, it } from "vitest";

import { janelas, meiaNoite } from "./periodos";

describe("períodos no fuso da loja", () => {
  it("meia-noite em Belém é 03h UTC", () => {
    expect(meiaNoite(2026, 11, 3, "America/Belem").toISOString()).toBe("2026-11-03T03:00:00.000Z");
  });

  it("às 22h de Belém (01h UTC do dia seguinte) ainda é o mesmo dia", () => {
    const j = janelas("hoje", "America/Belem", new Date("2026-11-04T01:00:00Z"));
    expect(j.diaDe.toISOString()).toBe("2026-11-03T03:00:00.000Z");
    expect(j.diaAte.toISOString()).toBe("2026-11-04T03:00:00.000Z");
    expect(j.mes).toBe("2026-11-01");
  });

  it("a semana começa na segunda e o mês vira em dezembro", () => {
    // 2026-11-03 é terça-feira.
    const j = janelas("semana", "America/Belem", new Date("2026-11-03T15:00:00Z"));
    expect(j.de.toISOString()).toBe("2026-11-02T03:00:00.000Z");
    expect(j.mesAte.toISOString()).toBe("2026-12-01T03:00:00.000Z");
  });
});
