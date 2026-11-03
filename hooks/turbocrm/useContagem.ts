"use client";

import { useEffect, useRef, useState } from "react";

/**
 * TurboCRM — o número sobe contando de 0 até o valor em ~900 ms, como nos
 * painéis de referência. Quem pediu menos movimento vê o número direto.
 */
export function useContagem(alvo: number, duracao = 900): number {
  const [valor, setValor] = useState(0);
  const inicio = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sem animação: o valor final, de uma vez
      setValor(alvo);
      return;
    }
    let quadro = 0;
    inicio.current = null;
    const passo = (agora: number) => {
      inicio.current ??= agora;
      const t = Math.min(1, (agora - inicio.current) / duracao);
      setValor(Math.round(alvo * (1 - Math.pow(1 - t, 3))));
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [alvo, duracao]);
  return valor;
}
