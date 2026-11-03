"use client";

/**
 * TurboCRM — o relatório do período em formato de apresentação: slides 16:9
 * prontos para mostrar na TV da loja ou salvar em PDF ("Baixar PDF" usa a
 * impressão do navegador; o CSS de impressão põe um slide por página, deitado).
 *
 * O "Resumo com IA" é opcional: pede ao servidor um texto do Gemini escrito só
 * a partir dos números agregados, e vira o último slide.
 */
import { useState } from "react";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { usePainelGerente } from "@/hooks/turbocrm/usePainelGerente";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { formatValorDoNegocio } from "@/lib/money";
import type { Intervalo, Periodo } from "@/lib/turbocrm/periodos";
import { ArrowLeft, FilePdf, Lightning } from "@/lib/ui/icons";

const dinheiro = (c: number | null | undefined) => formatValorDoNegocio(Number(c ?? 0), "BRL", { semCentavos: true });

function Slide({ children, escuro = false }: { children: React.ReactNode; escuro?: boolean }) {
  return <section className={escuro ? "tcrm-slide tcrm-slide-escuro" : "tcrm-slide"}>{children}</section>;
}

export function RelatorioEmApresentacao({
  periodo,
  intervalo,
  nomeDaLoja,
}: {
  periodo: Periodo;
  intervalo: Intervalo | null;
  nomeDaLoja: string;
}) {
  const t = useT();
  const { data, isLoading } = usePainelGerente(periodo, intervalo);
  const [resumo, setResumo] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  const dataBR = (iso: string) => iso.split("-").reverse().join("/");
  const nomeDoPeriodo =
    periodo === "hoje"
      ? t("Hoje")
      : periodo === "semana"
        ? t("Esta semana")
        : periodo === "personalizado" && intervalo
          ? `${dataBR(intervalo.de)} ${t("a")} ${dataBR(intervalo.ate)}`
          : t("Este mês");
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  async function gerarResumo() {
    setGerando(true);
    try {
      const r = await apiClient.post<{ data: { texto: string } }>("/api/v1/painel-gerente/resumo-ia", {
        periodo,
        ...(periodo === "personalizado" && intervalo ? intervalo : {}),
      });
      setResumo(r.data.texto);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("Não consegui gerar o resumo agora."));
    } finally {
      setGerando(false);
    }
  }

  if (isLoading || !data) return <p className="p-6 text-sm text-text-muted">{t("Montando o relatório…")}</p>;

  const vs = [...data.vendedores].sort((a, b) => b.vendas - a.vendas || b.valor_cents - a.valor_cents);
  const soma = (k: keyof (typeof vs)[number]) => vs.reduce((acc, v) => acc + Number(v[k] ?? 0), 0);
  const vendas = soma("vendas");
  const perdidos = soma("perdidos");
  const conversao = vendas + perdidos ? Math.round((vendas / (vendas + perdidos)) * 100) : null;
  const pctMeta = data.loja.meta_vendas ? Math.round((data.loja.vendas_mes / data.loja.meta_vendas) * 100) : null;

  return (
    <div className="tcrm-relatorio mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="tcrm-nao-imprimir flex flex-wrap items-center gap-2">
        <a href="/app/painel-gerente" className="tcrm-botao-baixar flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium">
          <ArrowLeft size={16} aria-hidden /> {t("Voltar ao painel")}
        </a>
        <span className="text-sm text-text-muted">{nomeDoPeriodo}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => void gerarResumo()}
          disabled={gerando}
          className="tcrm-botao-baixar flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium disabled:opacity-60"
        >
          <Lightning size={16} weight="fill" aria-hidden /> {gerando ? t("Escrevendo o resumo…") : resumo ? t("Gerar outro resumo") : t("Resumo com IA")}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="tcrm-botao flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white"
          data-variant="primary"
        >
          <FilePdf size={16} weight="fill" aria-hidden /> {t("Baixar PDF")}
        </button>
      </div>
      <p className="tcrm-nao-imprimir -mt-3 text-xs text-text-muted">
        {t("No “Baixar PDF”, escolha “Salvar como PDF” como destino e deixe a orientação em paisagem.")}
      </p>

      <Slide escuro>
        <p className="tcrm-slide-rotulo">{nomeDaLoja}</p>
        <h1 className="tcrm-slide-titulo-grande">{t("Resultado da equipe")}</h1>
        <p className="tcrm-slide-sub">
          {nomeDoPeriodo} · {hoje}
        </p>
      </Slide>

      <Slide>
        <p className="tcrm-slide-rotulo">{t("A loja")}</p>
        <h2 className="tcrm-slide-titulo">{t("Como estamos")}</h2>
        <div className="tcrm-slide-grade4">
          <div className="tcrm-slide-numero">
            <span>{data.loja.vendas_mes}</span>
            <small>{data.loja.meta_vendas ? `${t("vendas no mês, de")} ${data.loja.meta_vendas} (${pctMeta}%)` : t("vendas no mês")}</small>
          </div>
          <div className="tcrm-slide-numero">
            <span>{dinheiro(data.loja.valor_mes_cents)}</span>
            <small>{data.loja.meta_valor_cents ? `${t("vendidos, de")} ${dinheiro(data.loja.meta_valor_cents)}` : t("vendidos no mês")}</small>
          </div>
          <div className="tcrm-slide-numero">
            <span>{soma("leads_recebidos")}</span>
            <small>{t("leads recebidos")} ({nomeDoPeriodo.toLowerCase()})</small>
          </div>
          <div className="tcrm-slide-numero">
            <span>{conversao === null ? "—" : `${conversao}%`}</span>
            <small>{t("de conversão")} ({vendas} {t("ganhos")} · {perdidos} {t("perdidos")})</small>
          </div>
        </div>
      </Slide>

      <Slide>
        <p className="tcrm-slide-rotulo">{t("Vendedores")}</p>
        <h2 className="tcrm-slide-titulo">{t("Quem fez o quê")}</h2>
        {vs.length === 0 ? (
          <p className="tcrm-slide-sub">{t("Ainda não há atendentes na equipe.")}</p>
        ) : (
          <table className="tcrm-slide-tabela">
            <thead>
              <tr>
                <th>#</th>
                <th>{t("Vendedor")}</th>
                <th>{t("Atendimentos")}</th>
                <th>{t("Leads")}</th>
                <th>{t("Vendas")}</th>
                <th>{t("Valor")}</th>
                <th>{t("Meta do mês")}</th>
              </tr>
            </thead>
            <tbody>
              {vs.slice(0, 10).map((v, i) => (
                <tr key={v.user_id}>
                  <td>{i + 1}</td>
                  <td>{v.pessoa.nome}</td>
                  <td>{v.atendimentos}</td>
                  <td>{v.leads_recebidos}</td>
                  <td>{v.vendas}</td>
                  <td>{dinheiro(v.valor_cents)}</td>
                  <td>{v.meta_vendas ? `${v.vendas_mes}/${v.meta_vendas}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Slide>

      <Slide>
        <p className="tcrm-slide-rotulo">{t("Atenção")}</p>
        <h2 className="tcrm-slide-titulo">{t("O que precisa de cuidado")}</h2>
        <div className="tcrm-slide-grade3">
          <div className="tcrm-slide-numero tcrm-slide-alerta">
            <span>{soma("followups_atrasados")}</span>
            <small>{t("follow-ups atrasados")}</small>
          </div>
          <div className="tcrm-slide-numero">
            <span>{soma("followups_hoje")}</span>
            <small>{t("follow-ups para hoje")}</small>
          </div>
          <div className="tcrm-slide-numero tcrm-slide-alerta">
            <span>{soma("leads_parados")}</span>
            <small>{t("negócios parados há mais de 48 h")}</small>
          </div>
        </div>
        {data.loja.leads_sem_dono > 0 && (
          <p className="tcrm-slide-sub">
            {data.loja.leads_sem_dono} {t("leads estão sem responsável — distribua antes de esfriarem.")}
          </p>
        )}
      </Slide>

      {resumo && (
        <Slide escuro>
          <p className="tcrm-slide-rotulo">{t("Resumo do período")}</p>
          <div className="tcrm-slide-texto">{resumo}</div>
          <p className="tcrm-slide-rodape">{t("Texto gerado por IA a partir dos números do painel. Revise antes de apresentar.")}</p>
        </Slide>
      )}
    </div>
  );
}
