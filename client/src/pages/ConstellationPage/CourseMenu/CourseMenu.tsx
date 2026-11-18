import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router";
import type { Constellation } from "../../../types";
import styles from "./CourseMenu.module.css";

type Props = {
  className?: string; // el padre decide cuándo se ve (solo en pantallas angostas)
  current: Constellation;
  all: Constellation[];
};

// Elegir otro curso en pantallas angostas: un botón con el curso actual que abre la lista de todos
export function CourseMenu({ className = "", current, all }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Se cierra al tocar afuera o con Escape (al elegir un curso, la página se vuelve a armar y también se cierra)
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

  return (
    <div ref={root} className={`${styles.root} ${className}`}>
      <button type="button" className={styles.button} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={styles.name}>{current.course.name}</span>
        <small>
          {current.completedStars}/{current.totalStars}
        </small>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <nav className={styles.list} aria-label="Tus constelaciones">
          {all.map((c) => (
            <NavLink
              key={c.id}
              to={`/constellations/${c.course.key}`}
              className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ""}`}
            >
              <span className={styles.name}>{c.course.name}</span>
              <small>
                {c.completedStars}/{c.totalStars}
              </small>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
