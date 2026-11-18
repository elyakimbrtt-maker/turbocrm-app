"use client";
import { Button } from "@/components/ui/button";
import { DownloadSimple } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { rotuloDoMembro } from "@/lib/users/rotulo-do-atendente";
import { csvDosLeads, type LeadExportavel } from "@/lib/turbocrm/exportar-leads";
import type { Stage } from "@/lib/kanban/types";

/** TurboCRM: exporta os cards que estão na tela (o filtro do quadro manda). Só gerente+. */
export function ExportarLeadsDoFunil({
  leads,
  stages,
  nomeDoFunil,
}: {
  leads: LeadExportavel[];
  stages: Stage[];
  nomeDoFunil: string;
}) {
  const t = useT();
  const { data: membros } = useAssignableMembers(true);

  function exportar() {
    const etapas = new Map(stages.map((s) => [s.id, s.name]));
    const donos = new Map((membros ?? []).map((m) => [m.user_id, rotuloDoMembro(m, t)]));
    const csv = csvDosLeads(
      leads,
      (id) => etapas.get(id) ?? "",
      (id) => (id ? (donos.get(id) ?? "") : t("Sem responsável")),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nomeDoFunil} - ${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1"
      onClick={exportar}
      disabled={leads.length === 0}
      data-testid="funil-exportar"
      title={t("Baixa uma planilha com os cards que estão na tela (use o filtro de Responsável antes)")}
    >
      <DownloadSimple size={14} aria-hidden />
      {t("Exportar")} ({leads.length})
    </Button>
  );
}
