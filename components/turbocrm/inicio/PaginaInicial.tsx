"use client";

/**
 * TurboCRM — a página Início: o ranking do mês e o feed da equipe.
 *
 * No computador, duas colunas: o feed à esquerda e o ranking preso à direita.
 * No celular, o ranking vem primeiro (é o que motiva) e o feed embaixo.
 */
import { useEffect, useRef } from "react";

import { useT } from "@/hooks/i18n/useT";
import { useFeed } from "@/hooks/turbocrm/useFeed";
import { Confetti } from "@/lib/ui/icons";

import { AvisoDosMeusParados } from "./AvisoDosMeusParados";
import { NovaPublicacao } from "./NovaPublicacao";
import { PublicacaoDoFeed } from "./PublicacaoDoFeed";
import { RankingDeVendas } from "./RankingDeVendas";

export function PaginaInicial() {
  const t = useT();
  const feed = useFeed();
  const fim = useRef<HTMLDivElement>(null);
  const posts = feed.data?.pages.flatMap((p) => p.data) ?? [];

  // Rolagem infinita: ao chegar perto do fim, busca a página seguinte.
  useEffect(() => {
    const alvo = fim.current;
    if (!alvo) return;
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting && feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
      },
      { rootMargin: "400px" },
    );
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [feed]);

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="lg:order-2">
        <div className="lg:sticky lg:top-20">
          <RankingDeVendas />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:order-1">
        <AvisoDosMeusParados />
        <NovaPublicacao />

        {feed.isLoading ? (
          [0, 1, 2].map((i) => <div key={i} className="tcrm-cartao-inicio h-40 animate-pulse rounded-[1.75rem] border" aria-hidden />)
        ) : posts.length === 0 ? (
          <div className="tcrm-cartao-inicio flex flex-col items-center gap-2 rounded-[1.75rem] border px-6 py-12 text-center">
            <Confetti size={36} className="text-accent" aria-hidden />
            <p className="font-semibold">{t("O feed da equipe começa aqui")}</p>
            <p className="max-w-sm text-sm text-text-muted">
              {t("Publique a primeira novidade. Toda venda fechada também aparece aqui sozinha, para todo mundo comemorar.")}
            </p>
          </div>
        ) : (
          posts.map((p, i) => <PublicacaoDoFeed key={p.id} post={p} indice={i} />)
        )}

        <div ref={fim} />
        {feed.isFetchingNextPage && <p className="text-center text-xs text-text-muted">{t("Carregando mais…")}</p>}
      </div>
    </div>
  );
}
