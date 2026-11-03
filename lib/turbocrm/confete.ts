/**
 * TurboCRM — a comemoração da venda: confete caindo pela tela.
 *
 * Um `<canvas>` por cima de tudo, sem biblioteca: são ~80 linhas, e uma
 * dependência nova seria mais uma coisa para o `update.sh` puxar. O canvas
 * ignora o ponteiro (`pointer-events: none`) e se remove sozinho quando o
 * último pedaço sai da tela, então nunca atrapalha o próximo clique.
 *
 * Quem pediu menos movimento no sistema (`prefers-reduced-motion`) não recebe
 * a chuva, só o aviso de texto de quem chamou.
 */

const CORES = ["#e52a30", "#ff6b6f", "#f5a524", "#ffd166", "#22c55e", "#3b82f6", "#ffffff"];

interface Pedaco {
  x: number;
  y: number;
  vx: number;
  vy: number;
  giro: number;
  vgiro: number;
  largura: number;
  altura: number;
  cor: string;
  oscila: number;
}

export function celebrarVenda(): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const largura = window.innerWidth;
  const altura = window.innerHeight;
  canvas.width = largura * dpr;
  canvas.height = altura * dpr;
  ctx.scale(dpr, dpr);

  // Dois canhões nos cantos de baixo, mirando para o centro — e uma chuva
  // do alto, para a tela inteira participar.
  const pedacos: Pedaco[] = [];
  const novo = (x: number, y: number, vx: number, vy: number): Pedaco => ({
    x,
    y,
    vx,
    vy,
    giro: Math.random() * Math.PI,
    vgiro: (Math.random() - 0.5) * 0.3,
    largura: 6 + Math.random() * 6,
    altura: 8 + Math.random() * 10,
    cor: CORES[Math.floor(Math.random() * CORES.length)]!,
    oscila: Math.random() * Math.PI * 2,
  });
  for (let i = 0; i < 90; i++) {
    const forca = 11 + Math.random() * 9;
    const angulo = (Math.PI / 180) * (55 + Math.random() * 25);
    pedacos.push(novo(0, altura, Math.cos(angulo) * forca, -Math.sin(angulo) * forca));
    pedacos.push(novo(largura, altura, -Math.cos(angulo) * forca, -Math.sin(angulo) * forca));
  }
  for (let i = 0; i < 70; i++) {
    pedacos.push(novo(Math.random() * largura, -20 - Math.random() * altura * 0.5, (Math.random() - 0.5) * 2, 2 + Math.random() * 3));
  }

  const inicio = performance.now();
  const quadro = (agora: number) => {
    const t = agora - inicio;
    ctx.clearRect(0, 0, largura, altura);
    let vivos = 0;
    for (const p of pedacos) {
      p.vy += 0.28;
      p.vx *= 0.985;
      p.vy = Math.min(p.vy, 7);
      p.oscila += 0.08;
      p.x += p.vx + Math.sin(p.oscila) * 0.8;
      p.y += p.vy;
      p.giro += p.vgiro;
      if (p.y > altura + 30) continue;
      vivos++;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.giro);
      // O "achatado" do seno dá a ilusão do papel virando no ar.
      ctx.scale(1, Math.abs(Math.cos(p.oscila)) * 0.8 + 0.2);
      ctx.globalAlpha = t > 4500 ? Math.max(0, 1 - (t - 4500) / 800) : 1;
      ctx.fillStyle = p.cor;
      ctx.fillRect(-p.largura / 2, -p.altura / 2, p.largura, p.altura);
      ctx.restore();
    }
    if (vivos > 0 && t < 5300) requestAnimationFrame(quadro);
    else canvas.remove();
  };
  requestAnimationFrame(quadro);
}
