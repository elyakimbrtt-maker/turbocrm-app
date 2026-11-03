"use client";
import Link from "next/link";
import type { MouseEvent } from "react";

import { useT } from "@/hooks/i18n/useT";
import { ArrowRight, WhatsappLogo } from "@/lib/ui/icons";
import type { Lead } from "@/lib/types/leads";
import { cn } from "@/lib/utils";
import { AbrirConversaDoLead, temAlvoParaAbrir } from "./AbrirConversaDoLead";

/**
 * A última mensagem do negócio, com atalho para o inbox.
 *
 * ─── Por que atalho e não um composer aqui dentro ───────────────────────────
 *
 * Responder de dentro do quadro exigiria trazer o composer inteiro — anexos,
 * templates, notas internas, gravação de áudio — para uma segunda tela. Duas
 * cópias do mesmo campo divergem: a correção entra numa e não na outra, e o
 * atendente aprende que "no Kanban não funciona igual". O inbox já é o lugar
 * onde se conversa; o que faltava era chegar nele sem procurar.
 *
 * ─── O que a prévia resolve ─────────────────────────────────────────────────
 *
 * Sem ela o atalho é uma aposta: clicar para descobrir se vale a pena. Com a
 * última mensagem à vista, o vendedor decide olhando o quadro — que é para o
 * que o quadro serve.
 *
 * ─── Ausência é estado normal, não erro ─────────────────────────────────────
 *
 * Negócio criado à mão ou por webhook não tem contato; contato pode não ter
 * conversa. Nesses casos o slot não aparece — e NÃO aparece um "sem mensagens"
 * cinza, que ocuparia a mesma linha em metade dos cards para não dizer nada.
 *
 * ─── Sem conversa, mas com contato: a AÇÃO no lugar da prévia ────────────────
 *
 * O lead do webhook chega com telefone e sem thread (issue #1993). Para ele a
 * linha não some: vira o botão "Abrir conversa", que usa a rota já existente e
 * leva para a Inbox. `conversa === undefined` continua mudo — é "ainda não
 * carregou", e prometer ação sobre um dado que pode existir seria mentir.
 */
export function ConversaSlot({
  conversa,
  contactId,
  phone,
}: {
  conversa: Lead["conversa"];
  contactId?: string | null;
  phone?: string | null;
}) {
  const t = useT();
  if (conversa === undefined) return null;
  if (conversa === null) {
    // A guarda de alvo fica AQUI, antes de montar: montar o botão sem contato
    // nem telefone desenharia (e custaria router + query client) uma linha que
    // não tem o que dizer.
    return temAlvoParaAbrir(contactId, phone) ? (
      <AbrirConversaDoLead contactId={contactId} phone={phone} />
    ) : null;
  }

  const preview = conversa.preview?.trim();
  const temNaoLidas = conversa.unread > 0;

  return (
    <Link
      href={`/app/inbox?id=${conversa.id}`}
      // O card inteiro é arrastável e clicável (abre o dossiê). Sem parar a
      // propagação, o clique no atalho também abriria o dossiê por baixo — dois
      // destinos para um gesto.
      onClick={(e: MouseEvent) => e.stopPropagation()}
      onPointerDown={(e: MouseEvent) => e.stopPropagation()}
      // TurboCRM: mesmo botão em pílula do "Abrir conversa" — quem bate o olho
      // reconhece a porta para o WhatsApp nos dois estados do card.
      className={cn(
        "tcrm-acao-conversa group/conversa mt-2 flex h-10 items-center gap-2.5 rounded-full border pl-1 pr-3 text-[12px]",
        temNaoLidas && "tcrm-acao-conversa-nova",
      )}
      title={t("Abrir esta conversa no Inbox")}
    >
      <span className="tcrm-acao-conversa-icone flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
        <WhatsappLogo size={18} weight="fill" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate">
        {preview || <span className="italic text-text-muted">{t("conversa sem mensagens")}</span>}
      </span>
      {temNaoLidas ? (
        // O número, não um ponto: "3 sem ler" e "12 sem ler" pedem urgências
        // diferentes, e um ponto colapsa as duas.
        <span
          className="tcrm-acao-conversa-contador ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums"
          aria-label={`${conversa.unread} ${t("sem ler")}`}
        >
          {conversa.unread}
        </span>
      ) : (
        <ArrowRight
          size={15}
          weight="bold"
          className="shrink-0 opacity-60 transition-transform group-hover/conversa:translate-x-0.5 group-hover/conversa:opacity-100"
          aria-hidden
        />
      )}
    </Link>
  );
}
