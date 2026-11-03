import { describe, expect, it } from "vitest";

import { planilha, reais } from "./planilha";

describe("planilha", () => {
  it("usa ; e BOM, e neutraliza fórmula no começo da célula", () => {
    const csv = planilha(["Cliente", "Valor"], [["=HYPERLINK(\"x\")", reais(1050000)]]);
    expect(csv.startsWith("﻿Cliente;Valor\r\n")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")";10500,00`);
  });
  it("aspas em texto com ; e quebra de linha", () => {
    expect(planilha(["a"], [["um;dois"]])).toContain('"um;dois"');
  });
});
