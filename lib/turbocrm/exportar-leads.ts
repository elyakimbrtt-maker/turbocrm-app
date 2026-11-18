/**
 * TurboCRM: a planilha dos cards que estão na tela do funil (já filtrados).
 * O gerente filtra "Responsável: Fulano", exporta e manda para o vendedor
 * fazer o disparo no WhatsApp dele. `;` e BOM: o Excel em pt-BR abre direto.
 */
export interface LeadExportavel {
  title: string | null;
  contact_phone?: string | null;
  stage_id: string;
  owner_user_id: string | null;
  source?: string | null;
  tags?: string[] | null;
  created_at: string;
}

function celula(v: string): string {
  // Fórmula vinda de dado do cliente não pode executar no Excel (=, +, -, @).
  const seguro = /^[=+\-@]/.test(v) && !/^\+\d/.test(v) ? `'${v}` : v;
  return /[";\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export function csvDosLeads(
  leads: LeadExportavel[],
  nomeDaEtapa: (stageId: string) => string,
  nomeDoDono: (userId: string | null) => string,
): string {
  const linhas = [["Nome", "Telefone", "Etapa", "Responsável", "Origem", "Tags", "Criado em"]];
  for (const l of leads) {
    linhas.push([
      l.title ?? "",
      l.contact_phone ?? "",
      nomeDaEtapa(l.stage_id),
      nomeDoDono(l.owner_user_id),
      l.source ?? "",
      (l.tags ?? []).join(", "),
      l.created_at.slice(0, 10).split("-").reverse().join("/"),
    ]);
  }
  return "﻿" + linhas.map((c) => c.map(celula).join(";")).join("\r\n");
}
