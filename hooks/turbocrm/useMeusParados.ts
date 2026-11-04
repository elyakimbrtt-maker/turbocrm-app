"use client";

/** TurboCRM — quantos negócios do próprio usuário estão parados (aviso do Início). */
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

export interface MeusParados {
  parados: number;
  limite: number;
  funil_id: string | null;
  user_id: string;
}

export function useMeusParados() {
  return useQuery({
    queryKey: ["turbocrm", "meus-parados"],
    queryFn: async () => (await apiClient.get<{ data: MeusParados }>("/api/v1/inicio/meus-parados")).data,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
}
