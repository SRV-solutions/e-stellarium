import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../../auth/useAuth";
import { api, ApiError } from "../../lib/api";
import { can } from "../../lib/permissions";
import type { ContentCourse, ContentFilter, ContentList, ContentRow } from "../../types";
import {
  destKey,
  destLabel,
  DIFFICULTY_NAMES,
  rowState,
  STATE_NAMES,
  STATE_PLAIN,
  TYPE_INFO,
  when,
  type RowState,
} from "./content";
import { Journey } from "./Journey";
import styles from "./ContentPage.module.css";

// Las muescas de estado: el admin arranca por lo que espera revisión; el docente, por lo que tiene que hacer
const ADMIN_FILTERS: { value: ContentFilter; label: string }[] = [
  { value: "review", label: "Para revisar" },
  { value: "draft", label: "Borradores" },
  { value: "rejected", label: "Rechazadas" },
  { value: "published", label: "Publicadas" },
  { value: "unpublished", label: "Despublicadas" },
  { value: "all", label: "Todas" },
];
const TEACHER_FILTERS: { value: ContentFilter; label: string }[] = [
  { value: "mine", label: "Para hacer" },
  { value: "review", label: "En revisión" },
  { value: "published", label: "Publicadas" },
  { value: "all", label: "Todas" },
];

// Las preguntas de un curso, agrupadas por dónde van (cada lección, el examen y los desafíos)
export function ContentPage() {
  const { user } = useAuth();
  const approver = can(user, "content:approve");
  const editor = can(user, "content:edit");
  const filters = approver ? ADMIN_FILTERS : TEACHER_FILTERS;

  // Curso, estado y destino van en la dirección: al volver del editor quedan como estaban
  const [params, setParams] = useSearchParams();
  const [courses, setCourses] = useState<ContentCourse[] | null>(null);
  const [list, setList] = useState<ContentList | null>(null);
  const [more, setMore] = useState<ContentRow[]>([]);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const courseKey = params.get("course") ?? courses?.[0]?.key ?? null;
  const filter = (params.get("filter") as ContentFilter | null) ?? filters[0]!.value;
  const dest = params.get("dest") ?? "";
  const course = courses?.find((c) => c.key === courseKey);

  function setParam(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    if (name === "course") next.delete("dest");
    setParams(next, { replace: true });
  }

  useEffect(() => {
    api<{ courses: ContentCourse[] }>("/admin/content/courses").then(
      (data) => setCourses(data.courses),
      (err) => setError(err instanceof ApiError ? err.message : "No pudimos cargar los cursos.")
    );
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(q.trim()), 250);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (!courseKey) return;
    let current = true;
    const query = new URLSearchParams({ course: courseKey, filter });
    if (dest) query.set("dest", dest);
    if (search) query.set("q", search);
    api<ContentList>(`/admin/questions?${query}`).then(
      (data) => {
        if (!current) return;
        setList(data);
        setMore([]);
        setError(null);
      },
      (err) => current && setError(err instanceof ApiError ? err.message : "No pudimos cargar las preguntas.")
    );
    return () => {
      current = false;
    };
  }, [courseKey, filter, dest, search]);

  async function loadMore() {
    if (!list?.nextOffset || !courseKey) return;
    const query = new URLSearchParams({ course: courseKey, filter, offset: String(list.nextOffset) });
    if (dest) query.set("dest", dest);
    if (search) query.set("q", search);
    const next = await api<ContentList>(`/admin/questions?${query}`);
    setMore((rows) => [...rows, ...next.questions]);
    setList({ ...list, nextOffset: next.nextOffset });
  }

  if (courses && courses.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.head}>
          <h1>Contenido</h1>
          <p>Todavía no tenés cursos asignados. Pedile a un super admin que te los asigne desde Personas.</p>
        </div>
      </div>
    );
  }

  const rows = [...(list?.questions ?? []), ...more];
  const groups = groupByDest(rows);

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1>Contenido</h1>
          <p>
            {approver
              ? "Las preguntas de cada lección, del examen y de los desafíos. Lo que se envía espera tu revisión; lo publicado sigue igual hasta que apruebes el cambio."
              : "Las preguntas de tus cursos. Lo que armás queda en borrador hasta que lo enviás, y lo ven los alumnos cuando un admin lo aprueba."}
          </p>
        </div>
        {editor && courseKey && (
          <Link className={`${styles.button} ${styles.primary}`} to={`/admin/content/new?course=${courseKey}${dest ? `&dest=${dest}` : ""}`}>
            Nueva pregunta
          </Link>
        )}
      </div>

      <div className={styles.bar}>
        {courses && courses.length > 1 && (
          <select className={styles.select} value={courseKey ?? ""} onChange={(e) => setParam("course", e.target.value)} aria-label="Curso">
            {courses.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <div className={styles.kinds} role="group" aria-label="Estado">
          {filters.map((f) => {
            const count = list?.counts[f.value] ?? 0;
            const hot = (f.value === "review" && approver) || f.value === "mine";
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                className={hot && count > 0 ? styles.hot : ""}
                onClick={() => setParam("filter", f.value)}
              >
                {f.label}
                <b>{count}</b>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.bar}>
        <select className={styles.select} value={dest} onChange={(e) => setParam("dest", e.target.value)} aria-label="Destino">
          <option value="">Todos los destinos</option>
          {course?.stars.map((s) => (
            <option key={s.id} value={s.id}>
              Lección {s.letter} · {s.title}
            </option>
          ))}
          <option value="exam">Examen final (secreto)</option>
          <option value="challenge">Desafíos semanales</option>
        </select>
        <input
          className={styles.search}
          type="search"
          placeholder="Buscar en el enunciado"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar"
        />
      </div>

      {approver ? (
        <div className={styles.legend}>
          {(Object.keys(STATE_NAMES) as RowState[]).map((s) => (
            <span key={s}>
              <i className={`${styles.node} ${styles[s]}`} />
              {STATE_NAMES[s]}
            </span>
          ))}
        </div>
      ) : (
        <Journey />
      )}

      {error && <p className={styles.error}>{error}</p>}

      {list && groups.length === 0 && (
        <p className={styles.empty}>
          {filter === "review" && approver ? "No hay nada esperando revisión." : "No hay preguntas con estos filtros."}
        </p>
      )}

      {groups.map((group) => {
        const label = destLabel(course, group.key);
        return (
          <section key={group.key} className={styles.dest}>
            <h2>
              <span className={`${styles.letter} ${group.key === "exam" ? styles.examLetter : ""}`}>{label.letter}</span>
              {label.name}
              {group.key === "exam" ? (
                <small className={styles.secret}>Secreto: no aparece en la práctica, el repaso ni los desafíos</small>
              ) : (
                <small>{group.key === "challenge" ? "Solo para los desafíos" : "Lección"}</small>
              )}
            </h2>
            <ul className={styles.rows}>
              {group.rows.map((row) => (
                <li key={row.id}>
                  <QuestionRow row={row} approver={approver} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {list?.nextOffset && (
        <button type="button" className={styles.button} onClick={loadMore}>
          Ver más
        </button>
      )}
    </div>
  );
}

function groupByDest(rows: ContentRow[]) {
  const groups: { key: string; rows: ContentRow[] }[] = [];
  for (const row of rows) {
    const key = destKey(row);
    const last = groups.at(-1);
    if (last?.key === key) last.rows.push(row);
    else groups.push({ key, rows: [row] });
  }
  return groups;
}

// Una fila: el nodo del estado, el juego, el enunciado y cómo está. El admin ve los números de versión;
// el docente, el estado en palabras
function QuestionRow({ row, approver }: { row: ContentRow; approver: boolean }) {
  const state = rowState(row);
  const shown = row.open ?? row.published!;
  // Si está publicada y tiene un cambio en camino, el nodo es el de lo publicado y el cambio va aparte
  const node = row.published && row.open ? (row.visible ? "published" : "unpublished") : state;

  let detail;
  if (row.open?.rejection) {
    detail = (
      <span className={styles.rejection}>
        {row.open.rejection.by ?? "Un admin"}: {row.open.rejection.comment}
      </span>
    );
  } else if (row.open) {
    detail = `${approver ? `v${row.open.number} · ` : ""}${row.open.authorName ?? "Alguien"}, ${when(row.open.updatedAt)}`;
  } else {
    detail = (
      <>
        {row.published!.topic} · <span className={styles[`d_${row.published!.difficulty}`]}>{DIFFICULTY_NAMES[row.published!.difficulty]}</span>
      </>
    );
  }

  const pending = row.published && row.open && (
    <span className={styles.pending}>
      <i className={`${styles.node} ${styles.small} ${styles[row.open.status]}`} />
      {approver
        ? `v${row.open.number} ${STATE_NAMES[row.open.status].toLowerCase()}`
        : { in_review: "Cambios en revisión", rejected: "Cambios rechazados", draft: "Cambios sin enviar" }[row.open.status]}
    </span>
  );

  return (
    <Link className={styles.row} to={`/admin/content/${row.id}`}>
      <i className={`${styles.node} ${styles[node]}`} title={STATE_NAMES[state]} />
      <span className={styles.type}>{TYPE_INFO[shown.type].name}</span>
      <span className={styles.text}>
        <b>
          {shown.prompt || "Sin enunciado todavía"}
          {shown.snippet && <code className={styles.snippet}>{shown.snippet}</code>}
        </b>
        <small>{detail}</small>
      </span>
      <span className={styles.meta}>
        {pending}
        {approver ? (
          row.published ? (
            <>
              <span className={styles.version}>v{row.published.number}</span>
              {row.answers > 0 && <span>{row.answers} respuestas</span>}
            </>
          ) : (
            <span>{STATE_NAMES[state]}</span>
          )
        ) : (
          !pending && <span className={state === "rejected" ? styles.rejection : ""}>{STATE_PLAIN[state]}</span>
        )}
      </span>
    </Link>
  );
}
