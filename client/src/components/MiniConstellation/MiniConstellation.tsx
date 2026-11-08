import { useEffect, useRef, useState } from "react";
import styles from "./MiniConstellation.module.css";

export type StepResult = "ok" | "bad";

type Props = {
  total: number;
  current: number;
  // Una por pregunta; undefined si todavía no se muestra su resultado
  results: (StepResult | undefined)[];
};

const HEIGHT = 44;

export function MiniConstellation({ total, current, results }: Props) {
  // El ancho real en píxeles. Las líneas se dibujan en píxeles (sin estirar el SVG) para que el trazo
  // que se enciende de a poco se vea parejo
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    // Avisa cada vez que cambia el tamaño (y una vez al empezar)
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // x en porcentaje del ancho; y en píxeles
  const steps = Array.from({ length: total }, (_, i) => ({
    x: total === 1 ? 50 : 8 + (i * 84) / (total - 1),
    y: i % 2 ? 14 : 30,
  }));
  const px = (x: number) => (x / 100) * width;

  return (
    <div ref={box} className={styles.mini} role="img" aria-label={`Pregunta ${current + 1} de ${total}`}>
      {width > 0 && (
        <svg className={styles.lines} viewBox={`0 0 ${width} ${HEIGHT}`} aria-hidden="true">
          {steps.slice(1).map((step, i) => {
            const from = steps[i]!;
            return (
              <g key={i}>
                <line className={styles.line} x1={px(from.x)} y1={from.y} x2={px(step.x)} y2={step.y} />
                {/* La línea encendida aparece encima de la punteada y se dibuja de una estrellita a la otra */}
                {results[i] && (
                  <line
                    className={styles.lineOn}
                    x1={px(from.x)}
                    y1={from.y}
                    x2={px(step.x)}
                    y2={step.y}
                    pathLength={1}
                  />
                )}
              </g>
            );
          })}
        </svg>
      )}

      {steps.map((step, i) => {
        const result = results[i];
        const isCurrent = i === current && !result;
        const cls = result === "ok" ? styles.ok : result === "bad" ? styles.bad : isCurrent ? styles.now : "";
        return (
          // data-step: adonde llega la chispa cuando se acierta esa pregunta
          <span key={i} className={styles.step} style={{ left: `${step.x}%`, top: step.y }} data-step={i}>
            {isCurrent && <span className={styles.ring} />}
            <span className={`${styles.dot} ${cls}`} />
          </span>
        );
      })}
    </div>
  );
}
