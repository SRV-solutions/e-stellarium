import { useEffect, useLayoutEffect, useRef, useState } from "react";
import common from "../PeoplePage.module.css";
import styles from "./CourseFilter.module.css";

export type FilterOption = { key: string | null; label: string; count: number };

type Props = {
  label: string;
  options: FilterOption[];
  value: string | null;
  onChange: (key: string | null) => void;
};

// Filtro por curso: botones en fila si entran en el ancho de la barra de herramientas; si no, un desplegable.
// La fila queda siempre en la página (escondida cuando no entra) para medir cuánto ocuparía.
export function CourseFilter({ label, options, value, onChange }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const pills = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const row = root.current?.parentElement;
    const group = pills.current;
    if (!row || !group) return;
    const measure = () => setCompact(group.scrollWidth > row.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [options]);

  // Se cierra al tocar afuera o con Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.key === value) ?? options[0];

  return (
    <div ref={root} className={compact ? styles.menuRoot : styles.root}>
      <div
        ref={pills}
        className={`${common.kinds} ${compact ? styles.measure : ""}`}
        role="group"
        aria-label={label}
        aria-hidden={compact}
      >
        {options.map((o) => (
          <button
            key={o.key ?? "all"}
            type="button"
            tabIndex={compact ? -1 : 0}
            aria-pressed={o.key === value}
            onClick={() => onChange(o.key)}
          >
            {o.label}
            <b>{o.count}</b>
          </button>
        ))}
      </div>

      {compact && (
        <>
          <button
            type="button"
            className={styles.button}
            aria-expanded={open}
            aria-label={label}
            onClick={() => setOpen(!open)}
          >
            <span className={styles.name}>{current.label}</span>
            <small>{current.count}</small>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {open && (
            <div className={styles.list} role="group" aria-label={label}>
              {options.map((o) => (
                <button
                  key={o.key ?? "all"}
                  type="button"
                  className={`${styles.item} ${o.key === value ? styles.active : ""}`}
                  aria-pressed={o.key === value}
                  onClick={() => {
                    onChange(o.key);
                    setOpen(false);
                  }}
                >
                  <span className={styles.name}>{o.label}</span>
                  <small>{o.count}</small>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
