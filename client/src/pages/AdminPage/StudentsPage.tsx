import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Avatar } from "../../components/Avatar/Avatar";
import { useAuth } from "../../auth/useAuth";
import { api, ApiError } from "../../lib/api";
import { can } from "../../lib/permissions";
import type { StudentRow, StudentsPage as StudentsPageData } from "../../types";
import { initials } from "./auditText";
import { lastPlayed, shortName } from "./people";
import { EnrollDialog } from "./EnrollDialog";
import { StudentCard } from "./StudentCard";
import { Toast } from "./Toast";
import common from "./PeoplePage.module.css";
import styles from "./StudentsPage.module.css";

// Alumnos: cómo va cada uno en sus cursos. El docente ve solo los de sus cursos (lo filtra la API).
// Con users:manage, además: dar de alta y, desde la ficha, dar y sacar cursos y reenviar el link.
export function StudentsPage() {
  const { user } = useAuth();
  const manage = can(user, "users:manage");
  const teacher = user?.role === "teacher";
  const [params, setParams] = useSearchParams();
  const openId = params.get("id");

  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState<string | null>(null);
  const [page, setPage] = useState<StudentsPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [enrolling, setEnrolling] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(q.trim()), 250);
    return () => clearTimeout(timer);
  }, [q]);

  const queryFor = useCallback(
    (offset = 0) => {
      const query = new URLSearchParams();
      if (search) query.set("q", search);
      if (course) query.set("course", course);
      if (offset) query.set("offset", String(offset));
      return `/admin/students?${query}`;
    },
    [search, course]
  );

  useEffect(() => {
    let current = true;
    api<StudentsPageData>(queryFor()).then(
      (data) => {
        if (!current) return;
        setError(null);
        setPage(data);
      },
      (err) => current && setError(err instanceof ApiError ? err.message : "No pudimos cargar la lista.")
    );
    return () => {
      current = false;
    };
  }, [queryFor, reloads]);

  async function loadMore() {
    if (!page?.nextOffset || loadingMore) return;
    setLoadingMore(true);
    try {
      const more = await api<StudentsPageData>(queryFor(page.nextOffset));
      setPage({ ...more, students: [...page.students, ...more.students] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos cargar más.");
    } finally {
      setLoadingMore(false);
    }
  }

  const open = useCallback(
    (id: string | null) => setParams(id ? { id } : {}, { replace: true }),
    [setParams]
  );
  const changed = useCallback((message: string) => {
    setToast(message);
    setReloads((n) => n + 1);
  }, []);

  return (
    <div className={common.page}>
      <div className={styles.head}>
        <div className={common.head}>
          <h1>Alumnos</h1>
          <p>
            {manage
              ? "Cómo va cada alumno en sus constelaciones. Desde la ficha le das o le sacás un curso y le reenviás el link para entrar."
              : "Cómo van los alumnos: las lecciones que encendieron, el examen y los desafíos."}
          </p>
        </div>
        {manage && (
          <button type="button" className={styles.primary} onClick={() => setEnrolling(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Dar de alta
          </button>
        )}
      </div>

      {teacher && page && (
        <p className={styles.scope}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </svg>
          Ves solo a quienes tienen tus cursos ({page.courses.map((c) => c.name).join(", ") || "todavía no tenés"}), y
          solo su avance en esos.
        </p>
      )}

      <div className={common.tools}>
        <label className={common.search}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o email"
            aria-label="Buscar por nombre o email"
          />
        </label>
        {page && page.courses.length > 1 && (
          <div className={common.kinds} role="group" aria-label="Curso">
            <button type="button" aria-pressed={course === null} onClick={() => setCourse(null)}>
              Todos<b>{page.total}</b>
            </button>
            {page.courses.map((c) => (
              <button key={c.key} type="button" aria-pressed={course === c.key} onClick={() => setCourse(c.key)}>
                {shortName(c.name)}
                <b>{c.count}</b>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`${common.people} ${openId ? styles.withCard : common.closed}`}>
        <div>
          {error && (
            <p className={common.error} role="alert">
              {error}
            </p>
          )}
          {page && (
            <>
              <div className={`${common.colhead} ${styles.cols}`} aria-hidden="true">
                <span>Alumno</span>
                <span>Lecciones encendidas</span>
                <span className={styles.colAct}>Última vez que jugó</span>
              </div>
              <ul className={common.list}>
                {page.students.length === 0 && (
                  <li className={common.none}>
                    {search ? `Nadie coincide con “${search}”.` : "Todavía no hay alumnos acá."}
                  </li>
                )}
                {page.students.map((student) => (
                  <li key={student.id}>
                    <Row student={student} current={student.id === openId} onOpen={() => open(student.id)} />
                  </li>
                ))}
              </ul>
              {page.nextOffset && (
                <div className={common.more}>
                  <button type="button" className={common.moreButton} onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Cargando…" : "Ver más"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {openId && <StudentCard key={openId} id={openId} onClose={() => open(null)} onChanged={changed} />}
      </div>

      {manage && (
        <EnrollDialog
          open={enrolling}
          onClose={() => setEnrolling(false)}
          onDone={(userId, message) => {
            setEnrolling(false);
            changed(message);
            open(userId);
          }}
        />
      )}
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}

function Row({ student, current, onOpen }: { student: StudentRow; current: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`${common.row} ${styles.cols}`} aria-current={current} onClick={onOpen}>
      <Avatar alias={initials(student.name)} frame={null} />
      <span className={common.ident}>
        <span className={common.name}>{student.name}</span>
        <span className={common.mail}>{student.email}</span>
      </span>
      <span className={styles.trails}>
        {student.courses.length === 0 && <span className={common.mail}>Sin cursos</span>}
        {student.courses.map((c) => (
          <span key={c.key} className={styles.trail}>
            <span className={styles.course}>{shortName(c.name)}</span>
            {c.total > 0 ? (
              <>
                <span className={`${styles.bar} ${c.passed ? styles.done : ""}`}>
                  <i style={{ width: `${Math.round((c.lit / c.total) * 100)}%` }} />
                </span>
                <span className={styles.count}>
                  {c.lit}/{c.total}
                </span>
              </>
            ) : (
              <span className={styles.noStars}>sin constelación</span>
            )}
          </span>
        ))}
      </span>
      <span className={`${common.act} ${styles.act}`}>
        {student.lastActiveOn ? lastPlayed(student.lastActiveOn) : "Nunca jugó"}
        {student.streak > 0 && <small>racha de {student.streak}</small>}
      </span>
      <svg className={common.chev} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}
