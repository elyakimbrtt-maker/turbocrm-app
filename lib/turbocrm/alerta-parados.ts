/**
 * TurboCRM — o aviso de "muitos leads parados" de um atendente.
 *
 * "Parado" é a MESMA régua do painel do gerente (`fn_turbocrm_painel_gerente`):
 * negócio em aberto sem atividade há mais de 48 h (`last_activity_at`, ou o
 * nascimento quando nunca houve). O limite é da empresa, em
 * `organizations.settings`, e vale para todos os atendentes; ausente = 5.
 *
 * Módulo puro: a tela, a rota do painel e a do Início leem daqui.
 */

/** Chave do limite em `organizations.settings`. */
export const CHAVE_DO_LIMITE_DE_PARADOS = "turbocrm_limite_parados";
export const LIMITE_PADRAO_DE_PARADOS = 5;
export const LIMITE_MIN_DE_PARADOS = 1;
export const LIMITE_MAX_DE_PARADOS = 500;
/** Horas sem atividade para o negócio contar como parado (igual ao painel). */
export const HORAS_PARA_PARADO = 48;

/** O limite gravado na empresa, ou o padrão quando falta ou está torto. */
export function limiteDeParados(settings: unknown): number {
  const v =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)[CHAVE_DO_LIMITE_DE_PARADOS]
      : undefined;
  return typeof v === "number" && Number.isInteger(v) && v >= LIMITE_MIN_DE_PARADOS && v <= LIMITE_MAX_DE_PARADOS
    ? v
    : LIMITE_PADRAO_DE_PARADOS;
}

/** Quem chegou ao limite (>=), do mais parado para o menos. */
export function atendentesAcimaDoLimite<T extends { leads_parados: number }>(vendedores: readonly T[], limite: number): T[] {
  return vendedores.filter((v) => Number(v.leads_parados ?? 0) >= limite).sort((a, b) => b.leads_parados - a.leads_parados);
}

/** O funil já filtrado no atendente; sem funil conhecido, a lista de funis. */
export function linkDosParados(funilId: string | null, userId: string): string {
  return funilId ? `/app/pipelines/${funilId}?owner=${encodeURIComponent(userId)}` : "/app/kanban";
}

/** O instante antes do qual a última atividade torna o negócio parado. */
export function corteDeParado(agora: Date = new Date()): string {
  return new Date(agora.getTime() - HORAS_PARA_PARADO * 3_600_000).toISOString();
}
