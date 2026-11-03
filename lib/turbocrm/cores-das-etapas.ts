/**
 * TurboCRM — a paleta das etapas do funil.
 *
 * Poucas cores e bem separadas: o vendedor reconhece a etapa pela cor antes de
 * ler o nome, então duas parecidas seriam a mesma etapa para o olho. Todas têm
 * contraste com branco (o texto do cabeçalho da coluna) e funcionam nos dois
 * temas, porque o quadro usa a cor em véu, nunca como fundo cheio de texto.
 */
export const CORES_DAS_ETAPAS = [
  { nome: "Vermelho", hex: "#e52a30" },
  { nome: "Laranja", hex: "#f97316" },
  { nome: "Âmbar", hex: "#f5a524" },
  { nome: "Verde", hex: "#22c55e" },
  { nome: "Esmeralda", hex: "#10b981" },
  { nome: "Ciano", hex: "#06b6d4" },
  { nome: "Azul", hex: "#3b82f6" },
  { nome: "Índigo", hex: "#6366f1" },
  { nome: "Violeta", hex: "#8b5cf6" },
  { nome: "Rosa", hex: "#ec4899" },
  { nome: "Grafite", hex: "#64748b" },
] as const;

/**
 * A cor de uma etapa sem cor escolhida: ganho é verde, perda é grafite, o resto
 * fica sem cor (o quadro usa o neutro). Assim um funil recém-criado já separa
 * os desfechos sem ninguém configurar nada.
 */
export function corDaEtapa(etapa: {
  color?: string | null;
  is_won?: boolean;
  is_lost?: boolean;
}): string | null {
  if (etapa.color && /^#[0-9a-fA-F]{6}$/.test(etapa.color)) return etapa.color;
  if (etapa.is_won) return "#22c55e";
  if (etapa.is_lost) return "#64748b";
  return null;
}
