"use client";

/**
 * TurboCRM — a bolinha de cor de uma etapa, que abre a paleta.
 *
 * A cor é gravada no clique (o mesmo `aplicar` dos outros campos da linha), sem
 * botão de salvar: escolher cor é uma decisão de um gesto só.
 */
import { useEffect, useRef, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/hooks/i18n/useT";
import { CORES_DAS_ETAPAS, corDaEtapa } from "@/lib/turbocrm/cores-das-etapas";
import { cn } from "@/lib/utils";

export function SeletorDeCorDaEtapa({
  etapa,
  desabilitado,
  aoEscolher,
  className,
}: {
  etapa: { name: string; color?: string | null; is_won?: boolean; is_lost?: boolean };
  desabilitado?: boolean;
  aoEscolher: (cor: string | null) => void;
  /** Tamanho/borda da bolinha, para caber no cabeçalho da coluna do quadro. */
  className?: string;
}) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const atual = corDaEtapa(etapa);
  // O seletor livre do navegador dispara a cada movimento do mouse: grava só
  // quando a pessoa para de arrastar, e não uma vez por pixel.
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (espera.current) clearTimeout(espera.current);
  }, []);
  function escolherLivre(cor: string) {
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => aoEscolher(cor), 450);
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={desabilitado}
          aria-label={`${t("Cor da etapa")} ${etapa.name}`}
          title={t("Mudar a cor da etapa")}
          className={cn(
            "tcrm-bolinha-de-cor h-6 w-6 shrink-0 cursor-pointer rounded-full border border-border transition-transform hover:scale-125 disabled:opacity-50",
            !atual && "bg-text-muted/40",
            className,
          )}
          style={atual ? { backgroundColor: atual } : undefined}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <p className="mb-2 text-xs font-medium text-text-muted">{t("Cor da etapa")}</p>
        <div className="grid grid-cols-7 gap-2">
          {CORES_DAS_ETAPAS.map((cor) => (
            <button
              key={cor.hex}
              type="button"
              title={t(cor.nome)}
              aria-label={t(cor.nome)}
              aria-pressed={etapa.color === cor.hex}
              onClick={() => {
                aoEscolher(cor.hex);
                setAberto(false);
              }}
              className={cn(
                "h-7 w-7 rounded-full transition-transform hover:scale-110",
                etapa.color === cor.hex && "ring-2 ring-text ring-offset-2 ring-offset-surface",
              )}
              style={{ backgroundColor: cor.hex }}
            />
          ))}
          <button
            type="button"
            title={t("Sem cor")}
            aria-label={t("Sem cor")}
            onClick={() => {
              aoEscolher(null);
              setAberto(false);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border text-xs text-text-muted hover:scale-110"
          >
            ×
          </button>
        </div>
        {/* Fora da paleta: qualquer cor, pelo seletor do próprio navegador. */}
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-text-muted hover:text-text">
          <input
            type="color"
            defaultValue={atual ?? "#94a3b8"}
            onChange={(e) => escolherLivre(e.target.value)}
            className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
          />
          {t("Outra cor…")}
        </label>
      </PopoverContent>
    </Popover>
  );
}
