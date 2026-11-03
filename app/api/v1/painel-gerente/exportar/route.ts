/**
 * GET /api/v1/painel-gerente/exportar?indicador=…&periodo=hoje|semana|mes —
 * baixa a lista por trás de um número do painel do gerente, como planilha (CSV
 * que o Excel abre direto: `;` como separador e BOM para os acentos).
 *
 * Indicadores: `vendas`, `perdas`, `leads` (recebidos no período), `abertos`
 * (negócios em aberto agora), `followups` (vencendo hoje ou atrasados) e
 * `vendedores` (o resumo de cada atendente). Só gestor; só a empresa da sessão;
 * como o painel, conta só atendentes (papel `agent`).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { FUSO_PADRAO, fusoValido } from "@/lib/tempo/fusos";
import { pessoasPorId } from "@/lib/turbocrm/feed";
import { periodoDoPedido } from "@/lib/turbocrm/periodos";
import { planilha, reais } from "@/lib/turbocrm/planilha";

export const dynamic = "force-dynamic";

const INDICADORES = ["vendas", "perdas", "leads", "abertos", "followups", "vendedores"] as const;
type Indicador = (typeof INDICADORES)[number];

const NOME_DO_ARQUIVO: Record<Indicador, string> = {
  vendas: "vendas",
  perdas: "negocios-perdidos",
  leads: "leads-recebidos",
  abertos: "negocios-em-aberto",
  followups: "follow-ups",
  vendedores: "resumo-por-vendedor",
};

interface LinhaDeNegocio {
  title: string;
  value_cents: number | null;
  created_at: string;
  closed_at: string | null;
  last_activity_at: string | null;
  owner_user_id: string | null;
  lost_reason: string | null;
  contacts: { name: string | null; phone_number: string | null } | null;
  crm_stages: { name: string } | null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "painel_gerente" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;

  const url = new URL(req.url);
  const indicador = url.searchParams.get("indicador") as Indicador | null;
  if (!indicador || !INDICADORES.includes(indicador)) {
    return fail("validation_failed", "Indicador desconhecido.", 422, { requestId });
  }
  const fuso = authz.org.timezone && fusoValido(authz.org.timezone) ? authz.org.timezone : FUSO_PADRAO;
  const pp = periodoDoPedido(url.searchParams, fuso);
  if (!pp) return fail("validation_failed", "Escolha um intervalo válido, de até um ano.", 422, { requestId });
  const { periodo, janelas: j } = pp;

  const admin = createAdminClient();
  const { data: membros } = await admin
    .from("user_organizations")
    .select("user_id")
    .eq("organization_id", orgId)
    .is("revoked_at", null)
    .eq("role", "agent");
  const atendentes = ((membros ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
  const pessoas = await pessoasPorId(atendentes);
  const nome = (id: string | null) => (id ? (pessoas.get(id)?.nome ?? "—") : "Sem responsável");
  const quando = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: fuso, dateStyle: "short", timeStyle: "short" }) : "";
  const dias = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : "");

  let cabecalho: string[] = [];
  let linhas: Array<Array<string | number>> = [];

  const negocios = () =>
    admin
      .from("crm_leads")
      .select(
        "title, value_cents, created_at, closed_at, last_activity_at, owner_user_id, lost_reason, contacts(name, phone_number), crm_stages!crm_leads_stage_id_fkey(name)",
      )
      .eq("organization_id", orgId)
      .in("owner_user_id", atendentes.length ? atendentes : ["00000000-0000-0000-0000-000000000000"])
      .limit(5000);

  if (indicador === "vendas" || indicador === "perdas") {
    const { data, error } = await negocios()
      .eq("status", indicador === "vendas" ? "won" : "lost")
      .gte("closed_at", j.de.toISOString())
      .lt("closed_at", j.ate.toISOString())
      .order("closed_at", { ascending: false });
    if (error) return fail("internal_error", "Não consegui montar a planilha.", 500, { requestId });
    const rows = (data ?? []) as unknown as LinhaDeNegocio[];
    cabecalho =
      indicador === "vendas"
        ? ["Data", "Cliente", "Telefone", "Negócio", "Vendedor", "Valor (R$)"]
        : ["Data", "Cliente", "Telefone", "Negócio", "Vendedor", "Motivo da perda", "Valor (R$)"];
    linhas = rows.map((r) => {
      const base = [quando(r.closed_at), r.contacts?.name ?? "", r.contacts?.phone_number ?? "", r.title, nome(r.owner_user_id)];
      return indicador === "vendas" ? [...base, reais(r.value_cents)] : [...base, r.lost_reason ?? "", reais(r.value_cents)];
    });
  } else if (indicador === "leads") {
    const { data, error } = await negocios()
      .gte("created_at", j.de.toISOString())
      .lt("created_at", j.ate.toISOString())
      .order("created_at", { ascending: false });
    if (error) return fail("internal_error", "Não consegui montar a planilha.", 500, { requestId });
    cabecalho = ["Recebido em", "Cliente", "Telefone", "Negócio", "Etapa atual", "Vendedor", "Valor (R$)"];
    linhas = ((data ?? []) as unknown as LinhaDeNegocio[]).map((r) => [
      quando(r.created_at),
      r.contacts?.name ?? "",
      r.contacts?.phone_number ?? "",
      r.title,
      r.crm_stages?.name ?? "",
      nome(r.owner_user_id),
      reais(r.value_cents),
    ]);
  } else if (indicador === "abertos") {
    const { data, error } = await negocios().eq("status", "open").order("last_activity_at", { ascending: true, nullsFirst: true });
    if (error) return fail("internal_error", "Não consegui montar a planilha.", 500, { requestId });
    cabecalho = ["Etapa", "Cliente", "Telefone", "Negócio", "Vendedor", "Dias sem movimento", "Valor (R$)"];
    linhas = ((data ?? []) as unknown as LinhaDeNegocio[]).map((r) => [
      r.crm_stages?.name ?? "",
      r.contacts?.name ?? "",
      r.contacts?.phone_number ?? "",
      r.title,
      nome(r.owner_user_id),
      dias(r.last_activity_at ?? r.created_at),
      reais(r.value_cents),
    ]);
  } else if (indicador === "followups") {
    const { data, error } = await admin
      .from("crm_tasks")
      .select("title, due_date, status, assigned_to, contacts(name, phone_number)")
      .eq("organization_id", orgId)
      .in("status", ["pending", "in_progress"])
      .lt("due_date", j.diaAte.toISOString())
      .in("assigned_to", atendentes.length ? atendentes : ["00000000-0000-0000-0000-000000000000"])
      .order("due_date", { ascending: true })
      .limit(5000);
    if (error) return fail("internal_error", "Não consegui montar a planilha.", 500, { requestId });
    cabecalho = ["Vence em", "Situação", "Tarefa", "Cliente", "Telefone", "Responsável"];
    const hojeDe = j.diaDe.getTime();
    linhas = (
      (data ?? []) as unknown as Array<{
        title: string;
        due_date: string;
        assigned_to: string | null;
        contacts: { name: string | null; phone_number: string | null } | null;
      }>
    ).map((t) => [
      quando(t.due_date),
      new Date(t.due_date).getTime() < hojeDe ? "Atrasado" : "Hoje",
      t.title,
      t.contacts?.name ?? "",
      t.contacts?.phone_number ?? "",
      nome(t.assigned_to),
    ]);
  } else {
    const { data, error } = await admin.rpc("fn_turbocrm_painel_gerente", {
      p_org: orgId,
      p_de: j.de.toISOString(),
      p_ate: j.ate.toISOString(),
      p_dia_de: j.diaDe.toISOString(),
      p_dia_ate: j.diaAte.toISOString(),
      p_mes: j.mes,
      p_mes_de: j.mesDe.toISOString(),
      p_mes_ate: j.mesAte.toISOString(),
      p_tz: fuso,
    });
    if (error || !data) return fail("internal_error", "Não consegui montar a planilha.", 500, { requestId });
    const vs = (data as { vendedores: Array<Record<string, number | string | null>> }).vendedores;
    cabecalho = [
      "Vendedor",
      "Atendimentos",
      "Mensagens enviadas",
      "Leads recebidos",
      "Vendas",
      "Valor vendido (R$)",
      "Perdidos",
      "Conversão (%)",
      "Carteira",
      "Negócios em aberto",
      "Parados +48h",
      "Follow-ups hoje",
      "Follow-ups atrasados",
      "Vendas no mês",
      "Meta de vendas (mês)",
      "Meta de valor (R$)",
    ];
    linhas = vs.map((v) => {
      const vendas = Number(v.vendas ?? 0);
      const fechados = vendas + Number(v.perdidos ?? 0);
      return [
        nome(String(v.user_id)),
        Number(v.atendimentos ?? 0),
        Number(v.mensagens ?? 0),
        Number(v.leads_recebidos ?? 0),
        vendas,
        reais(Number(v.valor_cents ?? 0)),
        Number(v.perdidos ?? 0),
        fechados ? Math.round((vendas / fechados) * 100) : "",
        Number(v.carteira ?? 0),
        Number(v.leads_abertos ?? 0),
        Number(v.leads_parados ?? 0),
        Number(v.followups_hoje ?? 0),
        Number(v.followups_atrasados ?? 0),
        Number(v.vendas_mes ?? 0),
        v.meta_vendas ?? "",
        v.meta_valor_cents == null ? "" : reais(Number(v.meta_valor_cents)),
      ];
    });
  }

  void audit({
    action: "painel.exportado",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "painel_gerente",
    resourceId: orgId,
    metadata: { indicador, periodo, linhas: linhas.length },
    requestId,
  });

  const dia = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: fuso });
  const fimInclusivo = new Date(j.ate.getTime() - 1);
  const arquivo = `${NOME_DO_ARQUIVO[indicador]}-${dia(j.de)}-a-${dia(fimInclusivo)}.csv`;
  return new Response(planilha(cabecalho, linhas), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${arquivo}"`,
      "Cache-Control": "private, no-store",
      "X-Request-Id": requestId,
    },
  });
}
