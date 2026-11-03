"use client";

/** TurboCRM — os dados do painel do gerente e a edição das metas do mês. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import type { Periodo } from "@/lib/turbocrm/periodos";

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
}

export function usePainelGerente(periodo: Periodo) {
  return useQuery({
    queryKey: ["turbocrm", "painel-gerente", periodo],
    queryFn: async () => (await apiClient.get<{ data: PainelDoGerente }>(`/api/v1/painel-gerente?periodo=${periodo}`)).data,
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
