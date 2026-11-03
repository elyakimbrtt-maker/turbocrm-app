"use client";

/**
 * Cabeçalho de página do TurboCRM (Figma "Título da área"): título grande com
 * uma contagem ao lado, uma frase curta embaixo e, à direita, o caminho
 * "Seção › Página".
 */
import type { ReactNode } from "react";

import { useT } from "@/hooks/i18n/useT";
import { CaretRight, Headset } from "@/lib/ui/icons";

/**
 * O ícone da seção vai por NOME, e não como componente: a página que usa este
 * cabeçalho é Server Component, e função não atravessa para o cliente.
 */
const ICONES_DA_SECAO = { headset: Headset } as const;

export function CabecalhoDaPagina({
  titulo,
  descricao,
  contagem,
  secao,
  iconeDaSecao,
}: {
  titulo: string;
  descricao?: string;
  contagem?: ReactNode;
  secao?: string;
  iconeDaSecao?: keyof typeof ICONES_DA_SECAO;
}) {
  const t = useT();
  const IconeDaSecao = iconeDaSecao ? ICONES_DA_SECAO[iconeDaSecao] : null;
  return (
    <div className="tcrm-cabecalho-da-pagina flex flex-wrap items-end justify-between gap-x-6 gap-y-2 pb-4">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="text-[2rem] leading-tight font-bold tracking-tight">{t(titulo)}</h1>
          {contagem ? (
            <span className="rounded-full border border-border px-2.5 py-1 text-xs text-text-muted tabular-nums">
              {contagem}
            </span>
          ) : null}
        </div>
        {descricao ? <p className="mt-1 text-sm text-text-muted">{t(descricao)}</p> : null}
      </div>
      {secao ? (
        <nav aria-label={t("Você está em")} className="hidden items-center gap-2 pb-1 text-xs text-text-muted md:flex">
          {IconeDaSecao ? <IconeDaSecao size={15} aria-hidden /> : null}
          <span>{t(secao)}</span>
          <CaretRight size={12} aria-hidden />
          <span className="text-text">{t(titulo)}</span>
        </nav>
      ) : null}
    </div>
  );
}
