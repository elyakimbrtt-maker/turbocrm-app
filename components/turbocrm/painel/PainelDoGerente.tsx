"use client";

/**
 * TurboCRM — o painel do gerente: como a loja está no mês e o que cada
 * vendedor fez no período, com o que falta hoje (follow-ups) em destaque.
 *
 * Os números sobem contando ao abrir e as barras crescem, como no painel de
 * referência; tudo some de movimento para quem pediu menos animação.
 */
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { useContagem } from "@/hooks/turbocrm/useContagem";
import { usePainelGerente, type IndicadoresDoVendedor } from "@/hooks/turbocrm/usePainelGerente";
import { formatValorDoNegocio } from "@/lib/money";
import type { Periodo } from "@/lib/turbocrm/periodos";
import {
  Briefcase,
  ChatCircleDots,
  ClockCountdown,
  CurrencyCircleDollar,
  PencilSimple,
  Target,
  Trophy,
  Users,
  Warning,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { EditarMetas } from "./EditarMetas";

type Icone = typeof Target;

const dinheiro = (c: number) => formatValorDoNegocio(c, "BRL", { semCentavos: true });

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? (p.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

function Conta({ valor, formato }: { valor: number; formato?: (n: number) => string }) {
  const n = useContagem(valor);
  return <>{formato ? formato(n) : n.toLocaleString("pt-BR")}</>;
}

/** Barra de progresso da meta: vermelha → âmbar → verde conforme se aproxima. */
function Progresso({ feito, alvo, fino = false }: { feito: number; alvo: number | null; fino?: boolean }) {
  if (!alvo) return null;
  const pct = Math.min(100, Math.round((feito / alvo) * 100));
  const cor = pct >= 100 ? "#22c55e" : pct >= 60 ? "#f5a524" : "var(--color-accent)";
  return (
    <div className={cn("tcrm-trilho w-full overflow-hidden rounded-full", fino ? "h-1.5" : "h-2.5")}>
      <div className="tcrm-barra-progresso h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cor }} />
    </div>
  );
}

function Indicador({
  icone: I,
  rotulo,
  valor,
  formato,
  detalhe,
  alerta,
  indice,
  children,
}: {
  icone: Icone;
  rotulo: string;
  valor: number;
  formato?: (n: number) => string;
  detalhe?: React.ReactNode;
  alerta?: boolean;
  indice: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn("tcrm-cartao-inicio tcrm-surgir-suave tcrm-elevar flex flex-col gap-2 rounded-[1.5rem] border p-4", alerta && "tcrm-indicador-alerta")}
      style={{ ["--i" as string]: indice }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted">{rotulo}</span>
        <span className="tcrm-icone-indicador flex h-8 w-8 items-center justify-center rounded-xl">
          <I size={16} weight="bold" aria-hidden />
        </span>
      </div>
      <span className="text-[1.75rem] font-bold leading-none tracking-tight tabular-nums">
        <Conta valor={valor} formato={formato} />
      </span>
      {detalhe ? <span className="text-xs text-text-muted">{detalhe}</span> : null}
      {children}
    </div>
  );
}

function GraficoDoMes({ serie, mes }: { serie: Array<{ dia: string; vendas: number }>; mes: string }) {
  const t = useT();
  const [ano, m] = [Number(mes.slice(0, 4)), Number(mes.slice(5, 7))];
  const dias = new Date(ano, m, 0).getDate();
  const porDia = new Map(serie.map((s) => [Number(s.dia.slice(8, 10)), s.vendas]));
  const maximo = Math.max(1, ...serie.map((s) => s.vendas));
  const hoje = new Date().getDate();
  return (
    <section className="tcrm-cartao-inicio tcrm-surgir-suave rounded-[1.5rem] border p-5" style={{ ["--i" as string]: 6 }}>
      <h2 className="mb-4 text-sm font-semibold">{t("Vendas por dia no mês")}</h2>
      <div className="flex h-36 items-end gap-[3px]" role="img" aria-label={t("Gráfico de vendas por dia")}>
        {Array.from({ length: dias }, (_, i) => {
          const d = i + 1;
          const v = porDia.get(d) ?? 0;
          return (
            <div key={d} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d}/${m}: ${v}`}>
              <div
                className={cn("tcrm-coluna-grafico w-full rounded-t-md", v === 0 && "tcrm-coluna-vazia", d === hoje && "tcrm-coluna-hoje")}
                style={{ height: v === 0 ? "4px" : `${Math.max(8, (v / maximo) * 100)}%`, ["--i" as string]: i }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-text-subtle tabular-nums">
        <span>1</span>
        <span>{Math.ceil(dias / 2)}</span>
        <span>{dias}</span>
      </div>
    </section>
  );
}

function LinhaDoVendedor({ v, indice }: { v: IndicadoresDoVendedor; indice: number }) {
  const t = useT();
  const fechados = v.vendas + v.perdidos;
  const conversao = fechados > 0 ? Math.round((v.vendas / fechados) * 100) : null;
  const pendentes = v.followups_hoje + v.followups_atrasados;
  return (
    <li
      className="tcrm-cartao-inicio tcrm-surgir-suave rounded-[1.5rem] border p-4"
      style={{ ["--i" as string]: Math.min(indice + 7, 14) }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Avatar className="h-11 w-11">
          {v.pessoa.avatar_url ? <AvatarImage src={v.pessoa.avatar_url} alt="" /> : null}
          <AvatarFallback className="text-sm font-semibold">{iniciais(v.pessoa.nome)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{v.pessoa.nome}</p>
          <p className="text-xs text-text-muted">
            {v.meta_vendas
              ? `${v.vendas_mes} ${t("de")} ${v.meta_vendas} ${t("vendas no mês")}`
              : `${v.vendas_mes} ${v.vendas_mes === 1 ? t("venda no mês") : t("vendas no mês")} · ${t("sem meta")}`}
            {v.meta_valor_cents ? ` · ${dinheiro(v.valor_mes_cents)} ${t("de")} ${dinheiro(v.meta_valor_cents)}` : ""}
          </p>
        </div>
        {pendentes > 0 && (
          <span
            className={cn(
              "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
              v.followups_atrasados > 0 ? "tcrm-selo-atrasado" : "tcrm-selo-hoje",
            )}
          >
            <ClockCountdown size={13} weight="bold" aria-hidden />
            {v.followups_atrasados > 0
              ? `${v.followups_atrasados} ${t("atrasados")}`
              : `${v.followups_hoje} ${t("para hoje")}`}
          </span>
        )}
      </div>
      <div className="mt-3">
        <Progresso feito={v.vendas_mes} alvo={v.meta_vendas} fino />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2.5 text-center sm:grid-cols-6">
        {[
          [t("Atendimentos"), v.atendimentos],
          [t("Leads recebidos"), v.leads_recebidos],
          [t("Vendas"), v.vendas],
          [t("Conversão"), conversao === null ? "—" : `${conversao}%`],
          [t("Carteira"), v.carteira],
          [t("Em aberto"), v.leads_abertos],
        ].map(([rotulo, valor]) => (
          <div key={String(rotulo)} className="tcrm-mini-numero rounded-xl px-2 py-2">
            <dt className="text-[10px] uppercase tracking-wide text-text-subtle">{rotulo}</dt>
            <dd className="text-base font-bold tabular-nums">{valor}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2.5 text-xs text-text-muted">
        {v.mensagens} {t("mensagens enviadas")} · {dinheiro(v.valor_aberto_cents)} {t("em negociação")}
        {v.leads_parados > 0 && (
          <span className="font-medium text-warning-fg"> · {v.leads_parados} {t("parados há mais de 48 h")}</span>
        )}
        {v.followups_feitos_hoje > 0 && <> · {v.followups_feitos_hoje} {t("follow-ups feitos hoje")}</>}
      </p>
    </li>
  );
}

const PERIODOS: Array<{ id: Periodo; rotulo: string }> = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "semana", rotulo: "Semana" },
  { id: "mes", rotulo: "Mês" },
];

export function PainelDoGerente() {
  const t = useT();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [editando, setEditando] = useState(false);
  const { data, isLoading, isError } = usePainelGerente(periodo);

  const soma = useMemo(() => {
    const vs = data?.vendedores ?? [];
    const s = (k: keyof IndicadoresDoVendedor) => vs.reduce((a, v) => a + Number(v[k] ?? 0), 0);
    return {
      atendimentos: s("atendimentos"),
      leads: s("leads_recebidos"),
      abertos: s("leads_abertos"),
      valorAberto: s("valor_aberto_cents"),
      hoje: s("followups_hoje"),
      atrasados: s("followups_atrasados"),
      parados: s("leads_parados"),
    };
  }, [data]);

  const vendedores = useMemo(
    () => [...(data?.vendedores ?? [])].sort((a, b) => b.vendas_mes - a.vendas_mes || b.atendimentos - a.atendimentos),
    [data],
  );

  if (isError) {
    return <p className="rounded-2xl border border-destructive/40 p-4 text-sm text-destructive">{t("Não consegui carregar o painel. Recarregue a página.")}</p>;
  }

  const rotuloPeriodo = periodo === "hoje" ? t("hoje") : periodo === "semana" ? t("nesta semana") : t("no mês");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="tcrm-abas flex rounded-full border p-1" role="tablist" aria-label={t("Período")}>
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={periodo === p.id}
              onClick={() => setPeriodo(p.id)}
              className={cn("tcrm-aba h-9 rounded-full px-4 text-sm font-medium", periodo === p.id && "tcrm-aba-ativa")}
            >
              {t(p.rotulo)}
            </button>
          ))}
        </div>
        <Button variant="outline" className="h-10 gap-2 rounded-full px-4" onClick={() => setEditando(true)}>
          <PencilSimple size={16} aria-hidden /> {t("Metas do mês")}
        </Button>
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="tcrm-cartao-inicio h-32 animate-pulse rounded-[1.5rem] border" aria-hidden />
          ))}
        </div>
      ) : (
        <>
          {/* A loja no mês: a pergunta que o gerente faz primeiro. */}
          <section className="tcrm-cartao-inicio tcrm-faixa-loja tcrm-surgir-suave rounded-[1.75rem] border p-5" aria-label={t("A loja no mês")}>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-text-muted">
                  <Trophy size={16} weight="fill" className="text-[#f5a524]" aria-hidden /> {t("Vendas da loja no mês")}
                </span>
                <span className="text-4xl font-black tracking-tight tabular-nums">
                  <Conta valor={data.loja.vendas_mes} />
                  {data.loja.meta_vendas ? <span className="text-xl font-semibold text-text-muted"> / {data.loja.meta_vendas}</span> : null}
                </span>
                <Progresso feito={data.loja.vendas_mes} alvo={data.loja.meta_vendas} />
                {!data.loja.meta_vendas && (
                  <button type="button" onClick={() => setEditando(true)} className="w-fit text-xs font-medium text-accent hover:underline">
                    {t("Definir a meta da loja")}
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-text-muted">
                  <CurrencyCircleDollar size={16} weight="fill" className="text-[#22c55e]" aria-hidden /> {t("Valor vendido no mês")}
                </span>
                <span className="text-4xl font-black tracking-tight tabular-nums">
                  <Conta valor={data.loja.valor_mes_cents} formato={dinheiro} />
                  {data.loja.meta_valor_cents ? (
                    <span className="text-xl font-semibold text-text-muted"> / {dinheiro(data.loja.meta_valor_cents)}</span>
                  ) : null}
                </span>
                <Progresso feito={data.loja.valor_mes_cents} alvo={data.loja.meta_valor_cents} />
              </div>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador icone={ChatCircleDots} rotulo={t("Atendimentos")} valor={soma.atendimentos} detalhe={rotuloPeriodo} indice={1} />
            <Indicador icone={Users} rotulo={t("Leads recebidos")} valor={soma.leads} detalhe={rotuloPeriodo} indice={2} />
            <Indicador
              icone={ClockCountdown}
              rotulo={t("Follow-ups de hoje")}
              valor={soma.hoje}
              alerta={soma.atrasados > 0}
              detalhe={soma.atrasados > 0 ? `${soma.atrasados} ${t("atrasados")}` : t("nada atrasado")}
              indice={3}
            />
            <Indicador
              icone={Briefcase}
              rotulo={t("Negócios em aberto")}
              valor={soma.abertos}
              detalhe={`${dinheiro(soma.valorAberto)} ${t("em negociação")}`}
              indice={4}
            />
          </div>

          {(data.loja.leads_sem_dono > 0 || soma.parados > 0) && (
            <div className="tcrm-aviso-painel tcrm-surgir-suave flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 text-sm" style={{ ["--i" as string]: 5 }}>
              <Warning size={18} weight="fill" className="shrink-0" aria-hidden />
              {data.loja.leads_sem_dono > 0 && <span>{data.loja.leads_sem_dono} {t("leads sem responsável")}</span>}
              {data.loja.leads_sem_dono > 0 && soma.parados > 0 && <span aria-hidden>·</span>}
              {soma.parados > 0 && <span>{soma.parados} {t("negócios parados há mais de 48 h")}</span>}
            </div>
          )}

          <GraficoDoMes serie={data.serie} mes={data.mes} />

          <section aria-labelledby="titulo-vendedores">
            <h2 id="titulo-vendedores" className="mb-3 flex items-center gap-2 text-base font-bold">
              <Target size={18} aria-hidden /> {t("Vendedores")}
              <span className="text-xs font-normal text-text-muted">· {rotuloPeriodo}</span>
            </h2>
            <ol className="grid gap-3 lg:grid-cols-2">
              {vendedores.map((v, i) => (
                <LinhaDoVendedor key={v.user_id} v={v} indice={i} />
              ))}
            </ol>
          </section>
        </>
      )}

      {editando && data && <EditarMetas painel={data} aoFechar={() => setEditando(false)} />}
    </div>
  );
}
