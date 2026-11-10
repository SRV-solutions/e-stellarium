import { useEffect, useMemo, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { seededRandom } from "../../lib/random";
import { StarGlyph, StarGlyphDefs } from "../StarGlyph/StarGlyph";
import styles from "./Eyepiece.module.css";

type Props = {
  lit: boolean[]; // una por estrella de la constelación: si ya está encendida
  letters: string[]; // el nombre de cada una (α, β², Ω)
  focus: number; // la estrella que queda en el centro; -1 si no hay ninguna
  aiming: boolean; // true: la del centro es la próxima (la mira se traba). false: es la última, ya encendida
  onSettled?: () => void; // cuando la vista termina de moverse
};

// El ocular mide 400 × 400. La constelación entera vive en un "mundo" más grande: una estrella cada
// 120 unidades, ondulando. Moviendo el mundo, la estrella que queremos queda en el centro
const C = 200;
const STEP = 120;
const HOP = 360; // lo que tarda la vista en pasar de una estrella a la siguiente (ms)
const MAX_HOPS = 5; // la vista recorre como mucho las 5 estrellas anteriores

function worldPoint(i: number) {
  return { x: i * STEP, y: C + 70 * Math.sin(i * 0.85) - 30 * Math.cos(i * 0.4) };
}

function centerOn(i: number) {
  const p = worldPoint(i);
  return `translate(${C - p.x}px, ${C - p.y}px)`;
}

// El dial: 72 marcas (una cada 5°); las de cada 30° más largas y con el número
const DIAL = Array.from({ length: 72 }, (_, k) => {
  const angle = (k * 5 * Math.PI) / 180;
  const major = k % 6 === 0;
  const at = (r: number) => ({ x: C + Math.sin(angle) * r, y: C - Math.cos(angle) * r });
  return { k, major, from: at(188), to: at(major ? 176 : 182), label: major && k > 0 ? at(166) : null };
});

export function Eyepiece({ lit, letters, focus, aiming, onSettled }: Props) {
  const reduced = usePrefersReducedMotion();
  const world = useRef<SVGGElement>(null);
  const dial = useRef<SVGGElement>(null);

  // El callback más nuevo, sin que el efecto de la animación dependa de él
  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  });

  const start = Math.max(0, focus - MAX_HOPS);
  // Si no hay recorrido (sin estrellas, la primera, o sin animaciones), todo arranca en su lugar final
  const [animate] = useState(() => !reduced && focus > 0 && start < focus);
  // Las estrellas con índice menor a reach ya se ven encendidas (si lo están)
  const [reach, setReach] = useState(animate ? start : focus + 1);
  const [locked, setLocked] = useState(!animate);

  useEffect(() => {
    if (!animate) {
      settled.current?.();
      return;
    }
    const duration = HOP * (focus - start);
    const easing = "cubic-bezier(0.45, 0, 0.3, 1)";
    const frames = Array.from({ length: focus - start + 1 }, (_, i) => ({ transform: centerOn(start + i) }));
    const pan = world.current?.animate(frames, { duration, easing, fill: "forwards" });
    // El dial gira mientras la vista se mueve, como si alguien moviera el telescopio
    const turn = dial.current?.animate(
      [{ transform: "rotate(0deg)" }, { transform: `rotate(${-14 * (focus - start)}deg)` }],
      { duration, easing, fill: "forwards" },
    );

    const timers: number[] = [];
    for (let i = start; i <= focus; i++) {
      timers.push(window.setTimeout(() => setReach(i + 1), 120 + HOP * (i - start)));
    }
    timers.push(
      window.setTimeout(() => {
        setLocked(true);
        settled.current?.();
      }, duration + 80),
    );
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      pan?.cancel();
      turn?.cancel();
    };
  }, [animate, focus, start]);

  // Un polvo de estrellas fijo, siempre igual
  const dust = useMemo(() => {
    const random = seededRandom(7);
    return Array.from({ length: 70 }, () => ({
      x: random() * 400,
      y: random() * 400,
      r: random() < 0.85 ? 0.9 : 1.5,
      opacity: 0.15 + random() * 0.5,
    }));
  }, []);

  const points = lit.map((_, i) => worldPoint(i));
  const shownLit = (i: number) => lit[i]! && i < reach;

  return (
    <div className={styles.eyepiece} aria-hidden="true">
      <svg viewBox="0 0 400 400">
        <StarGlyphDefs />
        <g>
          {dust.map((d, i) => (
            <circle key={i} className={styles.dust} cx={d.x} cy={d.y} r={d.r} opacity={d.opacity} />
          ))}
        </g>

        {focus >= 0 && (
          <g ref={world} style={{ transform: centerOn(locked || !animate ? focus : start) }}>
            {points.slice(1).map((p, i) => (
              <g key={i}>
                <line className={styles.segment} x1={points[i]!.x} y1={points[i]!.y} x2={p.x} y2={p.y} />
                {shownLit(i) && (
                  <line className={styles.segmentOn} pathLength={1} x1={points[i]!.x} y1={points[i]!.y} x2={p.x} y2={p.y} />
                )}
              </g>
            ))}
            {points.map((p, i) => {
              const isAim = aiming && locked && i === focus;
              return (
                <g key={i}>
                  <StarGlyph
                    x={p.x}
                    y={p.y}
                    state={isAim ? "aim" : shownLit(i) ? "lit" : "off"}
                    scale={i === focus ? 1.15 : 1}
                    pop={animate && shownLit(i) && i >= start}
                  />
                  <text className={`${styles.letter} ${aiming && i === focus ? styles.letterAim : ""}`} x={p.x + 16} y={p.y - 16}>
                    {letters[i]}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        <g ref={dial} className={styles.dial}>
          {DIAL.map((t) => (
            <g key={t.k}>
              <line className={t.major ? styles.major : ""} x1={t.from.x} y1={t.from.y} x2={t.to.x} y2={t.to.y} />
              {t.label && (
                <text x={t.label.x} y={t.label.y}>
                  {t.k * 5}
                </text>
              )}
            </g>
          ))}
        </g>
        <path className={styles.mark} d="M200 4 L195 13 L205 13 Z" />
        <path className={styles.glare} d="M70 120 A150 150 0 0 1 150 58" />

        {aiming && (
          <g className={`${styles.cross} ${locked ? styles.locked : ""}`}>
            <line x1="200" y1="30" x2="200" y2="162" />
            <line x1="200" y1="238" x2="200" y2="370" />
            <line x1="30" y1="200" x2="162" y2="200" />
            <line x1="238" y1="200" x2="370" y2="200" />
            <line className={styles.fine} x1="194" y1="120" x2="206" y2="120" />
            <line className={styles.fine} x1="194" y1="280" x2="206" y2="280" />
            <line className={styles.fine} x1="120" y1="194" x2="120" y2="206" />
            <line className={styles.fine} x1="280" y1="194" x2="280" y2="206" />
            <circle className={styles.ring} cx="200" cy="200" r="24" />
            <circle className={styles.lock} cx="200" cy="200" r="34" />
          </g>
        )}
      </svg>
    </div>
  );
}
