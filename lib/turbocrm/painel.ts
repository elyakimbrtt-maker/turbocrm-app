/**
 * TurboCRM — os números do painel do gerente (servidor), num lugar só: a tela,
 * a planilha e o resumo da IA leem daqui, então os três nunca divergem.
 *
 * Quem chama já conferiu o papel (gestor) e passa a empresa da SESSÃO.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { FUSO_PADRAO, fusoValido } from "@/lib/tempo/fusos";
import { pessoasPorId, type Pessoa } from "@/lib/turbocrm/feed";
import type { Janelas, Periodo } from "@/lib/turbocrm/periodos";

export interface NumerosDoPainel {
  periodo: Periodo;
  fuso: string;
  mes: string;
  de: string;
  ate: string;
  loja: {
    meta_vendas: number | null;
    meta_valor_cents: number | null;
    vendas_mes: number;
    valor_mes_cents: number;
    leads_sem_dono: number;
  };
  serie: Array<{ dia: string; vendas: number; valor_cents: number }>;
  vendedores: VendedorDoPainel[];
}

/** Uma linha da função do banco (contagens numéricas) com quem é a pessoa. */
export interface VendedorDoPainel {
  user_id: string;
  pessoa: Pessoa;
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

export function fusoDaEmpresa(timezone: string | null | undefined): string {
  return timezone && fusoValido(timezone) ? timezone : FUSO_PADRAO;
}

export async function numerosDoPainel(
  orgId: string,
  periodo: Periodo,
  fuso: string,
  j: Janelas,
): Promise<{ ok: true; numeros: NumerosDoPainel; janelas: Janelas } | { ok: false }> {
  const { data, error } = await createAdminClient().rpc("fn_turbocrm_painel_gerente", {
    p_org: orgId,
    p_de: j.de.toISOString(),
    p_ate: j.ate.toISOString(),
    p_dia_de: j.diaDe.toISOString(),
    p_dia_ate: j.diaAte.toISOString(),
    p_mes: j.mes,
    p_mes_de: j.mesDe.toISOString(),
    p_mes_ate: j.mesAte.toISOString(),
    p_tz: fuso,
  });
  if (error || !data) return { ok: false };

  const corpo = data as {
    loja: NumerosDoPainel["loja"];
    serie: NumerosDoPainel["serie"];
    vendedores: Array<Omit<VendedorDoPainel, "pessoa">>;
  };
  const pessoas = await pessoasPorId(corpo.vendedores.map((v) => v.user_id));
  return {
    ok: true,
    janelas: j,
    numeros: {
      periodo,
      fuso,
      mes: j.mes,
      de: j.de.toISOString(),
      ate: j.ate.toISOString(),
      loja: corpo.loja,
      serie: corpo.serie,
      vendedores: corpo.vendedores.map((v) => ({
        ...v,
        pessoa: pessoas.get(v.user_id) ?? { user_id: v.user_id, nome: "Alguém da equipe", avatar_url: null },
      })),
    },
  };
}
