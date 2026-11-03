"use client";

/**
 * TurboCRM — a bolinha de cor de uma etapa, que abre a paleta.
 *
 * A cor é gravada no clique (o mesmo `aplicar` dos outros campos da linha), sem
 * botão de salvar: escolher cor é uma decisão de um gesto só.
 */
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/hooks/i18n/useT";
import { CORES_DAS_ETAPAS, corDaEtapa } from "@/lib/turbocrm/cores-das-etapas";
import { cn } from "@/lib/utils";

export function SeletorDeCorDaEtapa({
  etapa,
  desabilitado,
  aoEscolher,
}: {
  etapa: { name: string; color?: string | null; is_won?: boolean; is_lost?: boolean };
  desabilitado?: boolean;
  aoEscolher: (cor: string | null) => void;
}) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const atual = corDaEtapa(etapa);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={desabilitado}
          aria-label={`${t("Cor da etapa")} ${etapa.name}`}
          className="tcrm-bolinha-de-cor h-6 w-6 shrink-0 rounded-full border border-border transition-transform hover:scale-110 disabled:opacity-50"
          style={atual ? { backgroundColor: atual } : undefined}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <p className="mb-2 text-xs font-medium text-text-muted">{t("Cor da etapa")}</p>
        <div className="grid grid-cols-6 gap-2">
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
      </PopoverContent>
    </Popover>
  );
}
