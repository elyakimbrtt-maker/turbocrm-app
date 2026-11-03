/**
 * /app/inicio — a página Início do TurboCRM: ranking de vendas do mês e o feed
 * interno da equipe. É para onde `/app` leva quem pertence a uma empresa.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { FUSO_PADRAO, fusoValido } from "@/lib/tempo/fusos";
import { CabecalhoDaPagina } from "@/components/turbocrm/CabecalhoDaPagina";
import { PaginaInicial } from "@/components/turbocrm/inicio/PaginaInicial";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Início" };

export default async function InicioPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/inbox");

  const primeiroNome = (user.full_name ?? "").trim().split(/\s+/)[0] || null;
  // A hora da loja, não a do servidor (a VPS roda em UTC).
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: org.timezone && fusoValido(org.timezone) ? org.timezone : FUSO_PADRAO,
    }).format(new Date()),
  );
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="flex flex-col gap-2">
      <div className="mx-auto w-full max-w-6xl">
        <CabecalhoDaPagina
          titulo={primeiroNome ? `${saudacao}, ${primeiroNome}` : saudacao}
          descricao="O que está acontecendo na loja hoje."
          secao="Equipe"
        />
      </div>
      <PaginaInicial />
    </div>
  );
}
