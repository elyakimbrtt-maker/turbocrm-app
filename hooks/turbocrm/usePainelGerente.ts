"use client";

/** TurboCRM — os dados do painel do gerente e a edição das metas do mês. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import { consultaDoPeriodo, type Intervalo, type Periodo } from "@/lib/turbocrm/periodos";

import type { PessoaDoFeed } from "./useFeed";

export interface IndicadoresDoVendedor {
  user_id: string;
  pessoa: PessoaDoFeed;
  atendimentos: number;
  mensagens: number;
  leads_recebidos: number;
  vendas: number;
  valor_cents: number;
  perdidos: number;
  leads_abertos: number;
  valor_aberto_cents: number;
  leads_parados: number;
  followups_hoje: number;
  followups_atrasados: number;
  followups_feitos_hoje: number;
  carteira: number;
  vendas_mes: number;
  valor_mes_cents: number;
  meta_vendas: number | null;
  meta_valor_cents: number | null;
}

export interface PainelDoGerente {
  periodo: Periodo;
  fuso: string;
  mes: string;
  loja: {
    meta_vendas: number | null;
    meta_valor_cents: number | null;
    vendas_mes: number;
    valor_mes_cents: number;
    leads_sem_dono: number;
  };
  serie: Array<{ dia: string; vendas: number; valor_cents: number }>;
  vendedores: IndicadoresDoVendedor[];
  /** A partir de quantos leads parados o atendente é destacado, e o funil do link. */
  alerta_parados: { limite: number; funil_id: string | null };
}

export function usePainelGerente(periodo: Periodo, intervalo?: Intervalo | null) {
  const consulta = consultaDoPeriodo(periodo, intervalo);
  return useQuery({
    queryKey: ["turbocrm", "painel-gerente", consulta],
    queryFn: async () => (await apiClient.get<{ data: PainelDoGerente }>(`/api/v1/painel-gerente?${consulta}`)).data,
    refetchInterval: 60_000,
    placeholderData: (anterior) => anterior,
  });
}

export function useSalvarMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meta: { user_id: string | null; alvo_vendas: number | null; alvo_valor_cents: number | null }) =>
      apiClient.put("/api/v1/painel-gerente/metas", meta),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["turbocrm", "painel-gerente"] }),
    onError: showApiError,
  });
}

/** Grava a partir de quantos leads parados o painel e o Início avisam. */
export function useSalvarLimiteDeParados() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (limite: number) => apiClient.put("/api/v1/painel-gerente/limite-parados", { limite }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["turbocrm", "painel-gerente"] });
      void qc.invalidateQueries({ queryKey: ["turbocrm", "meus-parados"] });
    },
    onError: showApiError,
  });
}
