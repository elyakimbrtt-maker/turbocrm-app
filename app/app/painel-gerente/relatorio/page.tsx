/**
 * /app/painel-gerente/relatorio?periodo=… — o relatório do painel do gerente
 * em formato de apresentação (TurboCRM). Só gestor; a porta é o botão
 * "Relatório em apresentação" do painel.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RelatorioEmApresentacao } from "@/components/turbocrm/painel/RelatorioEmApresentacao";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import type { Periodo } from "@/lib/turbocrm/periodos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Relatório da equipe" };

export default async function RelatorioPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/inbox");
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) redirect("/app/inicio");
  const { periodo: pedido } = await searchParams;
  const periodo: Periodo = pedido === "hoje" || pedido === "semana" ? pedido : "mes";
  return <RelatorioEmApresentacao periodo={periodo} nomeDaLoja={org.name} />;
}
