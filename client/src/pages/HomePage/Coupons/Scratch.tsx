import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../../../hooks/usePrefersReducedMotion";
import styles from "./Coupons.module.css";

const BRUSH = 13; // el radio de la "moneda" que raspa, en píxeles
const ENOUGH = 0.45; // con esta parte raspada, la franja se cae sola

type Point = { x: number; y: number };

// Una viruta: salta un poco y cae girando
function flake(x: number, y: number) {
  const el = document.createElement("i");
  el.className = styles.flake!;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.background = Math.random() < 0.5 ? "#ffb238" : "#ff9900";
  document.body.appendChild(el);
  const dx = (Math.random() - 0.5) * 50;
  const up = -10 - Math.random() * 16;
  el.animate(
    [
      { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${up}px) rotate(${dx * 4}deg)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${dx}px, ${30 + Math.random() * 30}px) rotate(${dx * 9}deg)`, opacity: 0 },
    ],
    { duration: 650 + Math.random() * 300, easing: "cubic-bezier(.3,.6,.6,1)" },
  ).onfinish = () => el.remove();
}

// La franja para raspar que tapa el código. Es un canvas: se pinta la franja y después
// todo lo que se dibuja la borra (destination-out), así se ve lo que hay debajo
export function Scratch({ onReveal }: { onReveal: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const [gone, setGone] = useState(false);
  // autoScratch lo arma el efecto, porque necesita el canvas ya dibujado
  const auto = useRef<() => void>(() => {});

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    let done = false;
    let last: Point | null = null;
    let moved = 0;
    let width = 0;
    let height = 0;

    function reveal() {
      if (done) return;
      done = true;
      setGone(true);
      // Después del fundido, avisa para que la franja deje de existir
      setTimeout(onReveal, reduced ? 0 : 450);
    }

    function paint() {
      const ratio = window.devicePixelRatio || 1;
      ({ width, height } = el.getBoundingClientRect());
      el.width = width * ratio;
      el.height = height * ratio;
      ctx.scale(ratio, ratio);

      // Las rayas naranjas y el texto, como la franja de una tarjeta para raspar
      ctx.fillStyle = "#ff9900";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "#ffb238";
      ctx.lineWidth = 6;
      for (let x = -height; x < width + height; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x, height);
        ctx.lineTo(x + height, 0);
        ctx.stroke();
      }
      ctx.fillStyle = "#1a1205";
      ctx.font = "700 14px 'Bricolage Grotesque', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Raspá para ver el código", width / 2, height / 2 + 1);

      // A partir de acá, dibujar es borrar
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = BRUSH * 2;
    }

    const local = (e: PointerEvent): Point => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    function scrape(from: Point, to: Point) {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      if (!reduced && Math.random() < 0.55) {
        const r = el.getBoundingClientRect();
        flake(r.left + to.x, r.top + to.y);
      }
    }

    // Qué parte ya se raspó: se mira un píxel de cada 6, sin recorrer todos
    function scratched() {
      const { data } = ctx.getImageData(0, 0, el.width, el.height);
      let clear = 0;
      let total = 0;
      for (let i = 3; i < data.length; i += 4 * 6) {
        total++;
        if (data[i] === 0) clear++;
      }
      return clear / total;
    }

    // Un toque, o Enter: tres pasadas en zigzag, como cuando se raspa apurado con una moneda
    auto.current = () => {
      if (done) return;
      if (reduced) return reveal();
      const points = [
        [0.08, 0.25],
        [0.95, 0.5],
        [0.05, 0.78],
        [0.95, 0.95],
      ].map(([x, y]) => ({ x: x! * width, y: y! * height }));
      const start = { x: -BRUSH, y: height * 0.1 };
      const duration = 650;
      let began: number | null = null;
      let prev = start;
      const step = (now: number) => {
        began ??= now;
        const t = Math.min(1, (now - began) / duration);
        const seg = Math.min(points.length - 1, Math.floor(t * points.length));
        const from = seg === 0 ? start : points[seg - 1]!;
        const to = points[seg]!;
        const k = t * points.length - seg;
        const p = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
        scrape(prev, p);
        prev = p;
        if (t < 1) requestAnimationFrame(step);
        else setTimeout(reveal, 120);
      };
      requestAnimationFrame(step);
    };

    function down(e: PointerEvent) {
      if (done) return;
      el.setPointerCapture(e.pointerId);
      last = local(e);
      moved = 0;
      scrape(last, last);
    }
    function move(e: PointerEvent) {
      if (!last || done) return;
      const p = local(e);
      moved += Math.hypot(p.x - last.x, p.y - last.y);
      scrape(last, p);
      last = p;
      if (moved > 40 && scratched() > ENOUGH) reveal();
    }
    function up() {
      // Un toque sin arrastrar: raspa solo
      if (last && moved < 8) auto.current();
      last = null;
    }

    // Se espera la tipografía, así el texto de la franja sale con Bricolage
    let cancelled = false;
    document.fonts.ready.then(() => !cancelled && paint());
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    return () => {
      cancelled = true;
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
  }, [onReveal, reduced]);

  return (
    <button
      ref={button}
      type="button"
      className={`${styles.scratch} ${gone ? styles.gone : ""}`}
      aria-label="Raspá para ver el código"
      tabIndex={gone ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          auto.current();
        }
      }}
    >
      <canvas ref={canvas} />
    </button>
  );
}
