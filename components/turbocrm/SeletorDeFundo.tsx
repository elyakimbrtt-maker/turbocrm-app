"use client";

/**
 * TurboCRM — o papel de parede atrás do sistema, escolhido por quem usa.
 *
 * É preferência de cada pessoa neste navegador (como o tema claro/escuro): fica
 * no `localStorage` e no atributo `data-fundo` do `<html>`, que o script de
 * tema de `app/layout.tsx` já grava antes da primeira pintura — sem piscar o
 * fundo errado ao abrir. O CSS (`.tcrm-casca` em `app/turbocrm.css`) só mostra
 * a imagem no tema escuro: as imagens são escuras, e no claro virariam manchas.
 */
import { useEffect, useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

export const CHAVE_DO_FUNDO = "turbocrm-fundo";

const FUNDOS = [
  { id: "luz", nome: "Luz vermelha", miniatura: "/turbocrm/fundos/luz.webp" },
  { id: "onda", nome: "Onda", miniatura: "/turbocrm/fundos/onda.webp" },
  { id: "nenhum", nome: "Sem papel de parede", miniatura: null },
] as const;

type IdDoFundo = (typeof FUNDOS)[number]["id"];

export function SeletorDeFundo() {
  const t = useT();
  const [atual, setAtual] = useState<IdDoFundo>("luz");

  useEffect(() => {
    const lido = document.documentElement.getAttribute("data-fundo");
    if (FUNDOS.some((f) => f.id === lido)) setAtual(lido as IdDoFundo);
  }, []);

  function escolher(id: IdDoFundo) {
    setAtual(id);
    document.documentElement.setAttribute("data-fundo", id);
    try {
      window.localStorage.setItem(CHAVE_DO_FUNDO, id);
    } catch {
      // Navegador sem armazenamento: vale só até recarregar.
    }
  }

  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label={t("Papel de parede")}>
      {FUNDOS.map((f) => (
        <button
          key={f.id}
          type="button"
          role="radio"
          aria-checked={atual === f.id}
          aria-label={t(f.nome)}
          title={t(f.nome)}
          onClick={(e) => {
            // Dentro do menu da conta: escolher não deve fechar o menu.
            e.preventDefault();
            escolher(f.id);
          }}
          className={cn(
            "h-8 w-12 overflow-hidden rounded-md border border-border bg-cover bg-center transition-transform hover:scale-105",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            atual === f.id && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
            !f.miniatura && "flex items-center justify-center bg-surface text-[10px] text-text-muted",
          )}
          style={f.miniatura ? { backgroundImage: `url(${f.miniatura})` } : undefined}
        >
          {f.miniatura ? null : "—"}
        </button>
      ))}
    </div>
  );
}
