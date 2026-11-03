"use client";

/**
 * TurboCRM — o ranking de vendas do mês, no topo da página Início.
 *
 * Pódio para os três primeiros (o 1º no meio e mais alto, como num pódio de
 * verdade) e a lista dos demais em cartões. Os números sobem contando ao
 * aparecer — o mesmo gesto do painel de referência. Gestor liga e desliga o
 * ranking para a empresa toda pelo interruptor do cabeçalho.
 */
import { useEffect, useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";
import { useLigarRanking, useRanking, type LinhaDoRanking } from "@/hooks/turbocrm/useFeed";
import { formatValorDoNegocio } from "@/lib/money";
import { Crown, Trophy } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

/** Conta de 0 até o valor em ~900 ms; quem pediu menos movimento vê o número direto. */
function useContagem(alvo: number): number {
  const [valor, setValor] = useState(0);
  const inicio = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValor(alvo);
      return;
    }
    let quadro = 0;
    inicio.current = null;
    const passo = (agora: number) => {
      inicio.current ??= agora;
      const t = Math.min(1, (agora - inicio.current) / 900);
      setValor(Math.round(alvo * (1 - Math.pow(1 - t, 3))));
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [alvo]);
  return valor;
}

function Numero({ alvo }: { alvo: number }) {
  return <>{useContagem(alvo)}</>;
}

function Dinheiro({ cents }: { cents: number }) {
  const v = useContagem(cents);
  return <>{formatValorDoNegocio(v, "BRL", { semCentavos: true })}</>;
}

const ANEL = ["tcrm-anel-ouro", "tcrm-anel-prata", "tcrm-anel-bronze"] as const;

function Degrau({ linha, lugar }: { linha: LinhaDoRanking | undefined; lugar: 0 | 1 | 2 }) {
  const t = useT();
  const altura = lugar === 0 ? "h-28" : lugar === 1 ? "h-20" : "h-14";
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col items-center", lugar === 0 && "order-2", lugar === 1 && "order-1", lugar === 2 && "order-3")}>
      {linha ? (
        <div className="tcrm-surgir-suave mb-2 flex min-w-0 flex-col items-center gap-1.5 px-1 text-center" style={{ ["--i" as string]: lugar }}>
          <div className="relative">
            {lugar === 0 && (
              <Crown size={22} weight="fill" className="tcrm-coroa absolute -top-5 left-1/2 -translate-x-1/2" aria-hidden />
            )}
            <Avatar className={cn("border-2", ANEL[lugar], lugar === 0 ? "h-16 w-16" : "h-12 w-12")}>
              {linha.pessoa.avatar_url ? <AvatarImage src={linha.pessoa.avatar_url} alt="" /> : null}
              <AvatarFallback className="text-sm font-semibold">{iniciais(linha.pessoa.nome)}</AvatarFallback>
            </Avatar>
          </div>
          <span className="w-full truncate text-sm font-semibold">{linha.pessoa.nome}</span>
          <span className="tcrm-pilula-vendas rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums">
            <Numero alvo={linha.vendas} /> {linha.vendas === 1 ? t("venda") : t("vendas")}
          </span>
        </div>
      ) : (
        <div className="mb-2 h-20" />
      )}
      <div className={cn("tcrm-degrau flex w-full items-start justify-center rounded-t-2xl pt-2", altura)}>
        <span className="text-3xl font-black tabular-nums opacity-90">{lugar + 1}</span>
      </div>
    </div>
  );
}

export function RankingDeVendas() {
  const t = useT();
  const { data, isLoading } = useRanking();
  const ligar = useLigarRanking();

  if (isLoading || !data) {
    return <div className="tcrm-cartao-inicio h-72 animate-pulse rounded-[1.75rem] border" aria-hidden />;
  }
  // Desligado: quem não pode religar nem vê o espaço; o gestor vê o interruptor.
  if (!data.ativo && !data.pode_alterar) return null;

  const [mesAno, mesNum] = [data.mes.slice(0, 4), data.mes.slice(5, 7)];
  const nomeDoMes = new Date(Number(mesAno), Number(mesNum) - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
  const resto = data.linhas.slice(3);
  const ninguemVendeu = data.linhas.every((l) => l.vendas === 0);

  return (
    <section className="tcrm-cartao-inicio rounded-[1.75rem] border p-5" aria-labelledby="titulo-ranking">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="tcrm-icone-ranking flex h-9 w-9 items-center justify-center rounded-xl">
            <Trophy size={18} weight="fill" aria-hidden />
          </span>
          <div>
            <h2 id="titulo-ranking" className="text-base font-bold leading-tight">
              {t("Ranking de vendas")}
            </h2>
            <p className="text-xs capitalize text-text-muted">{nomeDoMes}</p>
          </div>
        </div>
        {data.pode_alterar && (
          <label className="flex items-center gap-2 text-xs text-text-muted">
            {data.ativo ? t("Visível para todos") : t("Desligado")}
            <Switch
              checked={data.ativo}
              disabled={ligar.isPending}
              onCheckedChange={(v) => ligar.mutate(v)}
              aria-label={t("Mostrar o ranking para a equipe")}
            />
          </label>
        )}
      </header>

      {!data.ativo ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-text-muted">
          {t("O ranking está desligado: ninguém da equipe o vê. Ligue quando a diretoria quiser usá-lo como incentivo.")}
        </p>
      ) : (
        <>
          <div className="tcrm-palco-do-podio flex items-end gap-2 overflow-hidden rounded-2xl px-3 pt-6">
            <Degrau linha={data.linhas[0]} lugar={0} />
            <Degrau linha={data.linhas[1]} lugar={1} />
            <Degrau linha={data.linhas[2]} lugar={2} />
          </div>
          {ninguemVendeu && (
            <p className="mt-3 text-center text-xs text-text-muted">
              {t("Nenhuma venda fechada neste mês ainda — a primeira leva o topo!")}
            </p>
          )}
          {resto.length > 0 && (
            <ol className="mt-3 flex flex-col gap-2">
              {resto.map((l, i) => (
                <li
                  key={l.pessoa.user_id}
                  className="tcrm-linha-ranking tcrm-surgir-suave flex items-center gap-3 rounded-2xl border px-3 py-2.5"
                  style={{ ["--i" as string]: i + 3 }}
                >
                  <Avatar className="h-9 w-9">
                    {l.pessoa.avatar_url ? <AvatarImage src={l.pessoa.avatar_url} alt="" /> : null}
                    <AvatarFallback className="text-xs font-semibold">{iniciais(l.pessoa.nome)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{l.pessoa.nome}</p>
                    <p className="text-xs text-text-muted tabular-nums">
                      <Numero alvo={l.vendas} /> {l.vendas === 1 ? t("venda") : t("vendas")} ·{" "}
                      <Dinheiro cents={l.valor_cents} />
                    </p>
                  </div>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-xs font-bold tabular-nums">
                    {l.posicao}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
