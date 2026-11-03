"use client";

/**
 * TurboCRM — a janela "Metas do mês": quantidade e valor da loja e de cada
 * vendedor. Grava só as linhas que mudaram, uma chamada por linha.
 */
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/hooks/i18n/useT";
import { useSalvarMeta, type PainelDoGerente } from "@/hooks/turbocrm/usePainelGerente";

interface Linha {
  user_id: string | null;
  nome: string;
  vendas: string;
  valor: string;
  original: string;
}

const paraTexto = (n: number | null) => (n === null || n === undefined ? "" : String(n));
const centsParaReais = (c: number | null) => (c === null || c === undefined ? "" : String(Math.round(c / 100)));

function numero(texto: string): number | null {
  const limpo = texto.replace(/\D/g, "");
  return limpo ? Number(limpo) : null;
}

export function EditarMetas({ painel, aoFechar }: { painel: PainelDoGerente; aoFechar: () => void }) {
  const t = useT();
  const salvar = useSalvarMeta();
  const [ocupado, setOcupado] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>(() => {
    const loja = {
      user_id: null,
      nome: t("Loja (meta geral)"),
      vendas: paraTexto(painel.loja.meta_vendas),
      valor: centsParaReais(painel.loja.meta_valor_cents),
    };
    const vendedores = painel.vendedores.map((v) => ({
      user_id: v.user_id,
      nome: v.pessoa.nome,
      vendas: paraTexto(v.meta_vendas),
      valor: centsParaReais(v.meta_valor_cents),
    }));
    return [loja, ...vendedores].map((l) => ({ ...l, original: `${l.vendas}|${l.valor}` }));
  });

  const [ano, mes] = [painel.mes.slice(0, 4), painel.mes.slice(5, 7)];
  const nomeDoMes = new Date(Number(ano), Number(mes) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  function mudar(i: number, campo: "vendas" | "valor", valor: string) {
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor.replace(/[^\d]/g, "") } : l)));
  }

  async function gravar() {
    const mudadas = linhas.filter((l) => `${l.vendas}|${l.valor}` !== l.original);
    if (mudadas.length === 0) return aoFechar();
    setOcupado(true);
    try {
      for (const l of mudadas) {
        const valor = numero(l.valor);
        await salvar.mutateAsync({
          user_id: l.user_id,
          alvo_vendas: numero(l.vendas),
          alvo_valor_cents: valor === null ? null : valor * 100,
        });
      }
      toast.success(t("Metas salvas."));
      aoFechar();
    } catch {
      // O toast do erro já saiu pelo hook.
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Metas do mês")}</DialogTitle>
          <DialogDescription className="capitalize">{nomeDoMes}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-[1fr_6rem_8rem] items-center gap-x-3 gap-y-2 text-sm">
            <span className="text-xs font-medium text-text-muted">{t("Quem")}</span>
            <span className="text-xs font-medium text-text-muted">{t("Vendas")}</span>
            <span className="text-xs font-medium text-text-muted">{t("Valor (R$)")}</span>
            {linhas.map((l, i) => (
              <div key={l.user_id ?? "loja"} className="contents">
                <span className={i === 0 ? "font-semibold" : "truncate"}>{l.nome}</span>
                <input
                  inputMode="numeric"
                  value={l.vendas}
                  onChange={(e) => mudar(i, "vendas", e.target.value)}
                  placeholder="—"
                  aria-label={`${t("Meta de vendas")} · ${l.nome}`}
                  className="tcrm-campo-publicar h-10 rounded-xl border px-3 text-right tabular-nums outline-hidden"
                />
                <input
                  inputMode="numeric"
                  value={l.valor}
                  onChange={(e) => mudar(i, "valor", e.target.value)}
                  placeholder="—"
                  aria-label={`${t("Meta de valor em reais")} · ${l.nome}`}
                  className="tcrm-campo-publicar h-10 rounded-xl border px-3 text-right tabular-nums outline-hidden"
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-text-muted">{t("Deixe em branco para ficar sem meta. O valor é em reais inteiros (ex.: 150000).")}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={aoFechar} disabled={ocupado}>
            {t("Cancelar")}
          </Button>
          <Button onClick={() => void gravar()} disabled={ocupado}>
            {ocupado ? t("Salvando…") : t("Salvar metas")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
