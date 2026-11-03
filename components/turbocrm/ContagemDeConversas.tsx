"use client";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { useConversationCounts } from "@/hooks/inbox/useConversationCounts";
import { useT } from "@/hooks/i18n/useT";

/**
 * "N conversas" do cabeçalho do Inbox — o total que a pessoa alcança (o mesmo
 * número da aba Todas; atendente em carteira própria vê o do seu escopo).
 */
export function ContagemDeConversas() {
  const t = useT();
  const { activeOrg } = useAuth();
  const { data } = useConversationCounts(activeOrg?.orgId ?? null);
  const total = data?.all ?? 0;
  return <>{total === 1 ? t("1 conversa") : `${total} ${t("conversas")}`}</>;
}
