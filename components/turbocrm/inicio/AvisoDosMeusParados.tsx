"use client";

/**
 * TurboCRM — o aviso do Início para o próprio atendente: "você tem N leads
 * parados". Aparece só quando ele chega ao limite da empresa (o mesmo que
 * destaca o atendente no painel do gerente), para ele resolver antes de o
 * gestor precisar cobrar. Um clique abre o funil já filtrado nele.
 */
import { useT } from "@/hooks/i18n/useT";
import { useMeusParados } from "@/hooks/turbocrm/useMeusParados";
import { linkDosParados } from "@/lib/turbocrm/alerta-parados";
import { ArrowRight, Warning } from "@/lib/ui/icons";

export function AvisoDosMeusParados() {
  const t = useT();
  const { data } = useMeusParados();
  if (!data || data.parados < data.limite) return null;
  return (
    <a
      href={linkDosParados(data.funil_id, data.user_id)}
      className="tcrm-alerta-parados tcrm-surgir-suave tcrm-elevar flex items-center gap-3 rounded-[1.5rem] border p-4"
      role="status"
    >
      <span className="tcrm-icone-alerta flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
        <Warning size={22} weight="fill" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">
          {t("Você tem")} <span className="tabular-nums">{data.parados}</span> {t("leads parados")}
        </span>
        <span className="block text-sm text-text-muted">
          {t("Sem atividade há mais de 48 h. Retome a conversa ou mova o card de etapa.")}
        </span>
      </span>
      <span className="hidden items-center gap-1.5 text-sm font-semibold sm:flex">
        {t("Ver meus leads")} <ArrowRight size={16} weight="bold" aria-hidden />
      </span>
    </a>
  );
}
