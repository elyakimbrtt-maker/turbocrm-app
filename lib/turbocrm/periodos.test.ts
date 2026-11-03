import { describe, expect, it } from "vitest";

import { janelas, janelasDoIntervalo, meiaNoite, periodoDoPedido } from "./periodos";

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

  it("intervalo do calendário: do começo do 1º dia ao fim do último, no fuso da loja", () => {
    const j = janelasDoIntervalo({ de: "2026-10-15", ate: "2026-10-20" }, "America/Belem");
    expect(j?.de.toISOString()).toBe("2026-10-15T03:00:00.000Z");
    expect(j?.ate.toISOString()).toBe("2026-10-21T03:00:00.000Z");
  });

  it("recusa intervalo invertido, malformado ou maior que um ano", () => {
    expect(janelasDoIntervalo({ de: "2026-10-20", ate: "2026-10-15" }, "America/Belem")).toBeNull();
    expect(janelasDoIntervalo({ de: "15/10/2026", ate: "2026-10-20" }, "America/Belem")).toBeNull();
    expect(janelasDoIntervalo({ de: "2024-01-01", ate: "2026-01-01" }, "America/Belem")).toBeNull();
    expect(periodoDoPedido(new URLSearchParams("periodo=personalizado&de=x&ate=y"), "America/Belem")).toBeNull();
  });

  it("um único dia escolhido vale como o dia inteiro", () => {
    const p = periodoDoPedido(new URLSearchParams("periodo=personalizado&de=2026-11-01&ate=2026-11-01"), "America/Belem");
    expect(p?.periodo).toBe("personalizado");
    expect(p?.janelas.de.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(p?.janelas.ate.toISOString()).toBe("2026-11-02T03:00:00.000Z");
  });
});
