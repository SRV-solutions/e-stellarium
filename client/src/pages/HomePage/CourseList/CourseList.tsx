import { useId, useState, type ReactNode } from "react";
import type { Constellation, Course } from "../../../types";
import { CourseLine } from "../CourseLine/CourseLine";
import styles from "./CourseList.module.css";

const VISIBLE = 3; // cuántos cursos se ven antes de «Ver los otros»
const MIN_FOR_SEARCH = 6; // desde cuántos cursos aparece el buscador

type Props = {
  heading: ReactNode; // el título y la bajada de la sección: el buscador va a su derecha
  courses: Course[];
  constellations: Constellation[];
};

// Sin tildes ni mayúsculas, para que buscar «pythón» o «PYTHON» encuentre «Master en Python»
const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Arriba, el curso donde encendió una estrella hace menos tiempo. Los que todavía no tocó, al final y por nombre
function byActivity(courses: Course[], constellations: Constellation[]) {
  const last = (course: Course) => {
    const at = constellations.find((c) => c.course.key === course.key)?.lastCompletedAt;
    return at ? new Date(at).getTime() : null;
  };
  return [...courses].sort((a, b) => {
    const x = last(a);
    const y = last(b);
    if (x !== null && y !== null) return y - x;
    if (x !== null) return -1;
    if (y !== null) return 1;
    return a.name.localeCompare(b.name, "es");
  });
}

// Los cursos del alumno: 3 a la vista y el resto se despliega. Con 6 o más aparece un buscador
export function CourseList({ heading, courses, constellations }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();

  const searchable = courses.length >= MIN_FOR_SEARCH;
  const searching = searchable && query.trim() !== "";
  const ordered = byActivity(courses, constellations);
  const matches = searching ? ordered.filter((c) => plain(c.name).includes(plain(query.trim()))) : ordered;
  // Mientras busca se ven todos los que coinciden: el límite de 3 solo vale sin buscar
  const shown = searching || expanded ? matches : matches.slice(0, VISIBLE);
  const hidden = matches.slice(VISIBLE);
  const canExpand = !searching && hidden.length > 0;

  return (
    <>
      <div className={styles.top}>
        <div>{heading}</div>
        {searchable && (
          <div className={styles.search}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4.5 4.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar un curso"
              aria-label="Buscar un curso"
              autoComplete="off"
            />
            {query !== "" && (
              <button type="button" className={styles.clear} onClick={() => setQuery("")} aria-label="Borrar la búsqueda">
                ×
              </button>
            )}
          </div>
        )}
      </div>

      <ul id={listId} className={styles.courses}>
        {shown.map((course) => (
          <CourseLine
            key={course.key}
            course={course}
            constellation={constellations.find((c) => c.course.key === course.key)}
          />
        ))}
      </ul>

      {searching && (
        <p className={styles.status} role="status">
          {matches.length === 0
            ? "Ningún curso coincide con lo que escribiste."
            : matches.length === 1
              ? "1 curso encontrado"
              : `${matches.length} cursos encontrados`}
        </p>
      )}

      {canExpand && (
        <button type="button" className={styles.more} aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(!expanded)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
          {expanded ? (
            "Ver menos"
          ) : (
            <>
              {hidden.length === 1 ? "Ver el otro curso" : `Ver los otros ${hidden.length} cursos`}
              <span className={styles.names}>{hidden.map((c) => c.name).join(" · ")}</span>
            </>
          )}
        </button>
      )}
    </>
  );
}
