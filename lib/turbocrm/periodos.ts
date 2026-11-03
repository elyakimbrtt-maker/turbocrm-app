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

export type Periodo = "hoje" | "semana" | "mes" | "personalizado";

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

/** Um intervalo escolhido no calendário: `AAAA-MM-DD`, ambos inclusive. */
export interface Intervalo {
  de: string;
  ate: string;
}

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Teto do intervalo: um ano. Mais que isso pesa no banco e não cabe no gráfico. */
export const MAX_DIAS_DO_INTERVALO = 366;

/**
 * As janelas de um intervalo do calendário, no fuso da loja: do começo do dia
 * `de` até o fim do dia `ate`. Follow-ups continuam sendo de HOJE e as metas do
 * MÊS ATUAL — é o que o gerente cobra no dia, qualquer que seja o filtro.
 * `null` quando as datas são inválidas, invertidas ou passam de um ano.
 */
export function janelasDoIntervalo(intervalo: Intervalo, fuso: string, agora = new Date()): Janelas | null {
  const a = DATA.exec(intervalo.de);
  const b = DATA.exec(intervalo.ate);
  if (!a || !b) return null;
  const de = meiaNoite(Number(a[1]), Number(a[2]), Number(a[3]), fuso);
  const ate = meiaNoite(Number(b[1]), Number(b[2]), Number(b[3]) + 1, fuso);
  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime()) || ate <= de) return null;
  if ((ate.getTime() - de.getTime()) / 86_400_000 > MAX_DIAS_DO_INTERVALO + 1) return null;
  const base = janelas("mes", fuso, agora);
  return { ...base, de, ate };
}

/**
 * Lê `periodo` (e `de`/`ate` quando personalizado) de um pedido. Intervalo
 * inválido devolve `null` — a rota responde 422 em vez de cair num período que
 * a pessoa não escolheu.
 */
export function periodoDoPedido(
  params: URLSearchParams | { periodo?: string | null; de?: string | null; ate?: string | null },
  fuso: string,
): { periodo: Periodo; janelas: Janelas; intervalo: Intervalo | null } | null {
  const ler = (k: "periodo" | "de" | "ate") =>
    params instanceof URLSearchParams ? params.get(k) : (params[k] ?? null);
  const pedido = ler("periodo");
  if (pedido === "personalizado") {
    const intervalo = { de: ler("de") ?? "", ate: ler("ate") ?? "" };
    const j = janelasDoIntervalo(intervalo, fuso);
    return j ? { periodo: "personalizado", janelas: j, intervalo } : null;
  }
  const periodo: Periodo = pedido === "hoje" || pedido === "semana" ? pedido : "mes";
  return { periodo, janelas: janelas(periodo, fuso), intervalo: null };
}

/** A query string de um período, para as rotas do painel (tela, planilha, relatório). */
export function consultaDoPeriodo(periodo: Periodo, intervalo?: Intervalo | null): string {
  const q = new URLSearchParams({ periodo });
  if (periodo === "personalizado" && intervalo) {
    q.set("de", intervalo.de);
    q.set("ate", intervalo.ate);
  }
  return q.toString();
}
