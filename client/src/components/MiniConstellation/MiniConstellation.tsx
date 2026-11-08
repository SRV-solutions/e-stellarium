import styles from "./MiniConstellation.module.css";

export type StepResult = "ok" | "bad";

type Props = {
  total: number;
  current: number;
  results: StepResult[];
};

export function MiniConstellation({ total, current, results }: Props) {
  const steps = Array.from({ length: total }, (_, i) => ({
    x: total === 1 ? 50 : 8 + (i * 84) / (total - 1),
    y: i % 2 ? 14 : 30,
  }));

  return (
    <div className={styles.mini} role="img" aria-label={`Pregunta ${current + 1} de ${total}`}>
      <svg className={styles.lines} viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true">
        {steps.slice(1).map((step, i) => (
          <line
            key={i}
            className={results[i] ? styles.lineOn : styles.line}
            x1={steps[i]!.x}
            y1={steps[i]!.y}
            x2={step.x}
            y2={step.y}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

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