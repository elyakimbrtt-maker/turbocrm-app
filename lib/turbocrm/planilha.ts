/**
 * TurboCRM — CSV que o Excel em português abre direto.
 *
 * `;` como separador (o Excel pt-BR usa `,` para decimais), BOM no começo para
 * os acentos, e toda célula que começa com `= + - @` ganha um apóstrofo na
 * frente: um nome de cliente como `=HYPERLINK(...)` viraria fórmula ao abrir
 * a planilha (injeção de CSV).
 */
const PERIGOSO = /^[=+\-@\t\r]/;

function celula(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") return String(valor).replace(".", ",");
  let texto = String(valor);
  if (PERIGOSO.test(texto)) texto = `'${texto}`;
  if (/[";\n\r]/.test(texto)) texto = `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

export function planilha(cabecalho: string[], linhas: Array<Array<string | number | null | undefined>>): string {
  const corpo = [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n");
  return `﻿${corpo}\r\n`;
}

/** Centavos → "1234,56" (número que o Excel pt-BR soma). */
export function reais(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}
