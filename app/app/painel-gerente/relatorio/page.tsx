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
import { fusoDaEmpresa } from "@/lib/turbocrm/painel";
import { periodoDoPedido } from "@/lib/turbocrm/periodos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Relatório da equipe" };

export default async function RelatorioPage({ searchParams }: { searchParams: Promise<{ periodo?: string; de?: string; ate?: string }> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/inbox");
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) redirect("/app/inicio");
  const pedido = await searchParams;
  // Intervalo inválido no endereço cai no mês, em vez de quebrar a tela.
  const p = periodoDoPedido(pedido, fusoDaEmpresa(org.timezone)) ?? periodoDoPedido({ periodo: "mes" }, fusoDaEmpresa(org.timezone));
  return <RelatorioEmApresentacao periodo={p!.periodo} intervalo={p!.intervalo} nomeDaLoja={org.name} />;
}
