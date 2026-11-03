/**
 * /app/painel-gerente — o painel do gerente do TurboCRM: a loja no mês e os
 * indicadores de cada vendedor. Só gestor (`manager`+); a API repete a régua.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CabecalhoDaPagina } from "@/components/turbocrm/CabecalhoDaPagina";
import { PainelDoGerente } from "@/components/turbocrm/painel/PainelDoGerente";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Painel do gerente" };

export default async function PainelGerentePage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/inbox");
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) redirect("/app/inicio");

  return (
    <div className="flex flex-col gap-2">
      <div className="mx-auto w-full max-w-6xl">
        <CabecalhoDaPagina
          titulo="Painel do gerente"
          descricao="Como a loja está no mês e o que cada vendedor fez."
          secao="Comercial"
        />
      </div>
      <PainelDoGerente />
    </div>
  );
}
