import { useEffect, useState, type ReactNode } from "react";
import { tokenize } from "../../../lib/highlight";
import { usePrefersReducedMotion } from "../../../hooks/usePrefersReducedMotion";
import styles from "./Terminal.module.css";

// Una línea de código, con sus colores
export function CodeText({ text }: { text: string }) {
  return (
    <>
      {tokenize(text).map((t, i) => (
        <span key={i} className={styles[t.kind]}>
          {t.text}
        </span>
      ))}
    </>
  );
}

// Escribe un texto letra por letra
function Typewriter({ text }: { text: string }) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(reduced ? text.length : 0);

  useEffect(() => {
    if (reduced || shown >= text.length) return;
    const timer = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 250 : 45);
    return () => clearTimeout(timer);
  }, [shown, text, reduced]);

  return <span className={styles.value}>{text.slice(0, shown)}</span>;
}

type Props = {
  lines: ReactNode[];
  // undefined: todavía no comprobó; null: comprobó, pero no hay salida para mostrar
  output?: string | null;
};

export function Terminal({ lines, output }: Props) {
  const checked = output !== undefined;

  return (
    <div className={`${styles.term} ${output ? styles.ran : ""}`}>
      {lines.length > 0 && (
        <pre className={styles.code}>
          {lines.map((line, i) => (
            <span key={i} className={styles.row}>
              {line}
            </span>
          ))}
        </pre>
      )}
      <div className={styles.out}>
        <span className={styles.label}>Salida</span>
        {!checked && <span className={styles.caret} />}
        {checked && output && <Typewriter text={output} />}
        {checked && !output && <span className={styles.noRun}>Así, el programa no hace lo que pide la consigna.</span>}
      </div>
    </div>
  );
}