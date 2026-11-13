/**
 * GET/POST /api/v1/cron/instagram-token-refresh — renova o token de longa
 * duração do canal Instagram direto antes de ele vencer.
 *
 * O token da Instagram API vale 60 dias e só renova depois de 24 h de idade.
 * A rodada é diária e renova quem vence nos próximos 20 dias
 * (`renovarTokensDoInstagram`): sobram vários dias de tentativa antes da queda.
 *
 * Sem renovação o canal continua RECEBENDO (o webhook não depende do token),
 * mas para de responder — o atendente escreve e nada sai. Por isso a falha
 * abre aviso na Central (dentro de `renovarTokensDoInstagram`), com o motivo e
 * o caminho de volta (reconectar).
 *
 * Rodada que não renovou nem falhou nada não audita (`cron-audita-so-quando-ha-efeito`).
 */
import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { renovarTokensDoInstagram } from "@/lib/channels/instagram/conexao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function executar(req: NextRequest): Promise<Response> {
  if (!autorizaCron(req)) {
    return NextResponse.json({ error: { code: "unauthenticated", message: "cron secret inválido" } }, { status: 401 });
  }
  const admin = createAdminClient();
  const resumo = await renovarTokensDoInstagram(admin, new Date());

  if (resumo.renovadas > 0 || resumo.falhas > 0) {
    await audit({
      action: "channel.instagram_token_renovado",
      metadata: { examinadas: resumo.examinadas, renovadas: resumo.renovadas, falhas: resumo.falhas },
    });
  }

  return NextResponse.json({
    data: { examinadas: resumo.examinadas, renovadas: resumo.renovadas, falhas: resumo.falhas },
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  return executar(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return executar(req);
}
