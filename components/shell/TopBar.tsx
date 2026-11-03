"use client";
import Link from "next/link";

import { useT } from "@/hooks/i18n/useT";
import { Question } from "@/lib/ui/icons";
import { AlertsBell } from "./AlertsBell";
import { AvisoDePropostaEmDestaque } from "./AvisoDePropostaEmDestaque";
import { MobileSidebar } from "./MobileSidebar";
import { TenantSwitcher } from "./TenantSwitcher";
import { SearchTrigger } from "./SearchTrigger";

/**
 * TurboCRM (Figma "Barra do espaço de trabalho"): loja à esquerda; busca,
 * sino e ajuda à direita, sem linha embaixo. A conta, o idioma e o tema
 * mudaram para o cartão no pé do menu lateral (`UserMenu variante="cartao"`).
 */
export function TopBar() {
  const t = useT();
  return (
    <header className="tcrm-topo sticky top-[var(--faixas-de-cima,0px)] z-20 flex h-14 items-center justify-between gap-2 px-3 md:gap-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileSidebar />
        <TenantSwitcher />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
        <div className="flex min-w-0 justify-end">
          <SearchTrigger />
        </div>
        <span aria-hidden className="hidden h-6 w-px bg-border md:block" />
        <AlertsBell />
        <AvisoDePropostaEmDestaque />
        <Link
          href="/app/ajuda"
          aria-label={t("Ajuda")}
          title={t("Ajuda")}
          className="tcrm-botao-redondo inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:text-foreground"
        >
          <Question size={18} aria-hidden />
        </Link>
      </div>
    </header>
  );
}
