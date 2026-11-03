/**
 * TurboCRM — "hoje", "esta semana" e "este mês" no fuso da LOJA.
 *
 * A VPS roda em UTC: meia-noite do servidor é 21h em Cametá. Os limites saem
 * como instantes UTC calculados a partir da parede do fuso da empresa.
 */

/** Quanto o fuso está à frente (ou atrás) de UTC naquele instante, em ms. */
function deslocamento(instante: Date, fuso: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const comoUtc = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

/** O instante UTC da meia-noite de (ano, mês, dia) na parede do fuso. */
export function meiaNoite(ano: number, mes1: number, dia: number, fuso: string): Date {
  const chute = new Date(Date.UTC(ano, mes1 - 1, dia));
  return new Date(chute.getTime() - deslocamento(chute, fuso));
}

/** Ano, mês (1–12), dia e dia da semana (0 = domingo) de agora, na parede do fuso. */
export function hojeNoFuso(agora: Date, fuso: string) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(agora);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const semana = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(v("weekday"));
  return { ano: Number(v("year")), mes: Number(v("month")), dia: Number(v("day")), semana };
}

export type Periodo = "hoje" | "semana" | "mes";

export interface Janelas {
  de: Date;
  ate: Date;
  diaDe: Date;
  diaAte: Date;
  mesDe: Date;
  mesAte: Date;
  /** `AAAA-MM-01`, a chave das metas. */
  mes: string;
}

export function janelas(periodo: Periodo, fuso: string, agora = new Date()): Janelas {
  const h = hojeNoFuso(agora, fuso);
  const diaDe = meiaNoite(h.ano, h.mes, h.dia, fuso);
  const diaAte = meiaNoite(h.ano, h.mes, h.dia + 1, fuso);
  const mesDe = meiaNoite(h.ano, h.mes, 1, fuso);
  const mesAte = meiaNoite(h.ano, h.mes + 1, 1, fuso);
  // Semana começa na segunda, como o varejo conta.
  const voltar = (h.semana + 6) % 7;
  const semanaDe = meiaNoite(h.ano, h.mes, h.dia - voltar, fuso);
  const de = periodo === "hoje" ? diaDe : periodo === "semana" ? semanaDe : mesDe;
  const ate = periodo === "mes" ? mesAte : diaAte;
  return { de, ate, diaDe, diaAte, mesDe, mesAte, mes: `${h.ano}-${String(h.mes).padStart(2, "0")}-01` };
}
