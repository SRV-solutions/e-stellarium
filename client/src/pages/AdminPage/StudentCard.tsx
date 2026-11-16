import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Avatar } from "../../components/Avatar/Avatar";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { useAuth } from "../../auth/useAuth";
import { api, ApiError } from "../../lib/api";
import { levelFor } from "../../lib/levels";
import { can } from "../../lib/permissions";
import type { StudentCourse, StudentDetail } from "../../types";
import { initials } from "./auditText";
import { dayMonth, firstName, lastPlayed, shortName } from "./people";
import person from "./PersonCard.module.css";
import styles from "./StudentCard.module.css";

type Props = {
  id: string;
  onClose: () => void;
  onChanged: (message: string) => void;
};

const TIME_ZONE = "America/Argentina/Buenos_Aires";
// "Sáb 14 nov"
const shortDay = (iso: string) => {
  const text = new Date(iso).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short", timeZone: TIME_ZONE });
  return (text[0].toUpperCase() + text.slice(1)).replace(/[.,]/g, "");
};

// Una estrella de cuatro puntas: encendida (lección hecha) o apagada
function Star4({ lit }: { lit: boolean }) {
  return (
    <svg viewBox="-12 -12 24 24" aria-hidden="true" className={lit ? styles.lit : styles.unlit}>
      <path d="M0 -10 L2.6 -2.6 L10 0 L2.6 2.6 L0 10 L-2.6 2.6 L-10 0 L-2.6 -2.6 Z" />
    </svg>
  );
}

const ICON = {
  ok: <path d="M8 12.5l2.7 2.7L16 9.8" />,
  wait: <path d="M12 7v5l3 2" />,
  fail: <path d="M12 7v5M12 16h.01" />,
};

// El examen en una línea, con las mismas reglas que ve el alumno
function examText(course: StudentCourse): { kind: keyof typeof ICON; text: string } {
  const exam = course.exam;
  if (!exam) return { kind: "wait", text: "Este curso no tiene examen." };
  switch (exam.status) {
    case "passed":
      return {
        kind: "ok",
        text: `Aprobó el examen (${exam.correctCount}/10${exam.passedAt ? `, el ${dayMonth(exam.passedAt)}` : ""})${exam.couponPercent ? ` y ganó un cupón del ${exam.couponPercent} %` : ""}.`,
      };
    case "waiting":
      return { kind: "wait", text: `Terminó las lecciones. El examen se le abre el ${dayMonth(exam.opensAt)}.` };
    case "retry_wait":
      return { kind: "fail", text: `Sacó ${exam.lastCorrect}/10 en el examen (necesita 7). Reintenta el ${dayMonth(exam.opensAt)}.` };
    case "open":
      return { kind: "wait", text: exam.attempts ? "Ya puede volver a rendir el examen." : "Ya puede rendir el examen." };
    case "in_progress":
      return { kind: "wait", text: "Está rindiendo el examen." };
    default: {
      const left = course.total - course.lit;
      return { kind: "wait", text: `Examen: le ${left === 1 ? "falta 1 lección" : `faltan ${left} lecciones`}.` };
    }
  }
}

function ExamLine({ course }: { course: StudentCourse }) {
  const { kind, text } = examText(course);
  return (
    <p className={`${styles.exam} ${styles[kind]}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        {ICON[kind]}
      </svg>
      <span>{text}</span>
    </p>
  );
}

function whereText(course: StudentCourse) {
  if (course.lit === 0) return <>Todavía no encendió ninguna lección</>;
  if (!course.current) return <>Encendió las {course.total} lecciones</>;
  const { moduleTitle, module, lesson, index, of } = course.current;
  return (
    <>
      Va por <b>{moduleTitle ?? lesson}</b> · lección {index} de {of}
      {module ? ` del módulo ${module}` : ""}
    </>
  );
}

// El recorrido entero de un curso: cada módulo con sus estrellas
function JourneyDialog({ student, course, onClose }: { student: StudentDetail; course: StudentCourse; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const here = course.current;
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label={`Recorrido de ${student.name} en ${course.name}`}
      onCancel={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <h2>
        {firstName(student.name)} en {shortName(course.name)}
      </h2>
      <p className={styles.dialogNote}>
        {course.lit} de {course.total} lecciones encendidas. Cada estrella es una lección.
      </p>
      <ul className={styles.mods}>
        {course.modules.map((m, i) => {
          const lit = m.lessons.filter((l) => l.lit).length;
          const isHere = here !== null && here.module === m.number && course.lit > 0;
          return (
            <li key={i} className={`${lit === m.lessons.length ? styles.modDone : ""} ${isHere ? styles.modHere : ""}`}>
              <span className={styles.num}>{m.number ?? ""}</span>
              <span className={styles.modTitle} title={m.title ?? undefined}>
                {m.title ?? "Otras lecciones"}
              </span>
              <span className={styles.stars} aria-label={`${lit} de ${m.lessons.length}`}>
                {m.lessons.map((l, j) => (
                  <Star4 key={j} lit={l.lit} />
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      <ExamLine course={course} />
      <div className={styles.dialogActions}>
        <button type="button" className={person.button} onClick={onClose} autoFocus>
          Cerrar
        </button>
      </div>
    </dialog>
  );
}

// La ficha de un alumno: su nivel, cada curso (dónde va y el examen), los desafíos y, con users:manage,
// los cursos que tiene y cómo entra a la plataforma
export function StudentCard({ id, onClose, onChanged }: Props) {
  const { user } = useAuth();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [reloads, setReloads] = useState(0);
  const [journey, setJourney] = useState<StudentCourse | null>(null);
  const [revoking, setRevoking] = useState<StudentCourse | null>(null);
  const [resending, setResending] = useState(false);
  const [give, setGive] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    api<{ student: StudentDetail }>(`/admin/students/${id}`).then(
      (r) => current && setStudent(r.student),
      (err) => current && setError(err instanceof ApiError ? err.message : "No pudimos abrir la ficha.")
    );
    return () => {
      current = false;
    };
  }, [id, reloads]);

  // Escape cierra la ficha, salvo que haya un diálogo abierto (ese se cierra solo)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !journey && !revoking && !resending) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [journey, revoking, resending, onClose]);

  async function act(path: string, method: string, body: object | undefined, message: (r: { emailSent?: boolean }) => string) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ emailSent?: boolean }>(path, { method, body: body ? JSON.stringify(body) : undefined });
      setReloads((n) => n + 1);
      onChanged(message(r));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (!student) {
    return (
      <aside className={`${person.card} ${styles.card}`} aria-label="Ficha">
        <button type="button" className={person.close} onClick={onClose} aria-label="Cerrar">
          ×
        </button>
        <p className={error ? person.error : person.muted}>{error ?? "Cargando…"}</p>
      </aside>
    );
  }

  const name = firstName(student.name);
  const manage = student.access !== undefined; // la API manda access solo si podés gestionarlo
  const gone = student.deletedAt !== null;
  const level = levelFor(student.totalXp);
  const missing = (student.courseOptions ?? []).filter((o) => !student.courses.some((c) => c.key === o.key));
  const pick = missing.some((m) => m.key === give) ? give : (missing[0]?.key ?? "");
  const mailNote = (r: { emailSent?: boolean }) => (r.emailSent === false ? " No pudimos mandarle el mail." : " Le avisamos por mail.");

  return (
    <aside className={`${person.card} ${styles.card}`} aria-label={`Ficha de ${student.name}`}>
      <button type="button" className={person.close} onClick={onClose} aria-label="Cerrar">
        ×
      </button>

      <div className={person.who}>
        <Avatar alias={initials(student.name)} frame={null} size={64} />
        <div>
          <h2>{student.name}</h2>
          <p>{student.email}</p>
        </div>
      </div>

      <dl className={styles.facts}>
        <div>
          <dt>Nivel</dt>
          <dd>
            {level.level} <small>{student.totalXp.toLocaleString("es-AR")} XP</small>
          </dd>
        </div>
        <div>
          <dt>Racha</dt>
          <dd>{student.streak ? <>{student.streak} <small>{student.streak === 1 ? "día" : "días"}</small></> : "—"}</dd>
        </div>
        <div>
          <dt>Jugó</dt>
          <dd className={styles.small}>{student.lastActiveOn ? lastPlayed(student.lastActiveOn) : "Nunca"}</dd>
        </div>
      </dl>

      {gone && (
        <div className={`${person.gone} ${styles.goneBox}`}>
          <b>Dado de baja el {dayMonth(student.deletedAt!)}.</b> Para darle cursos o mandarle un link, primero restauralo
          desde Personas.
        </div>
      )}

      <section className={person.sect}>
        <h3>Cursos</h3>
        {manage && <p className={person.muted}>Sacar un curso no borra su avance: si se lo devolvés, sigue donde estaba.</p>}
        <ul className={styles.courses}>
          {student.courses.length === 0 && <li className={styles.course}>{name} no tiene cursos.</li>}
          {student.courses.map((course) =>
            course.status === "revoked" ? (
              <li key={course.key} className={`${styles.course} ${styles.off}`}>
                <div className={styles.top}>
                  <b>{shortName(course.name)}</b>
                  <small>Se lo sacaron el {dayMonth(course.revokedAt!)}</small>
                  {!gone && (
                    <button
                      type="button"
                      className={`${person.button} ${styles.sm}`}
                      disabled={busy}
                      onClick={() =>
                        act(`/admin/users/${student.id}/courses`, "POST", { course: course.key }, (r) =>
                          `${name} volvió a tener ${shortName(course.name)}.${mailNote(r)}`
                        )
                      }
                    >
                      Devolver
                    </button>
                  )}
                </div>
              </li>
            ) : (
              <li key={course.key} className={styles.course}>
                <div className={styles.top}>
                  <b>{shortName(course.name)}</b>
                  {manage && (
                    <>
                      <small>{course.manual ? "Dado a mano" : "Comprado en la web"}</small>
                      {!gone && (
                        <button
                          type="button"
                          className={`${person.button} ${person.danger} ${styles.sm}`}
                          disabled={busy}
                          onClick={() => setRevoking(course)}
                        >
                          Sacar
                        </button>
                      )}
                    </>
                  )}
                </div>
                {course.total > 0 ? (
                  <>
                    <p className={styles.where}>
                      <Star4 lit />
                      <span>{whereText(course)}</span>
                    </p>
                    <div className={styles.meter}>
                      <span className={`${styles.bar} ${course.exam?.status === "passed" ? styles.done : ""}`}>
                        <i style={{ width: `${Math.round((course.lit / course.total) * 100)}%` }} />
                      </span>
                      <span>
                        {course.lit}/{course.total}
                      </span>
                    </div>
                    <ExamLine course={course} />
                    {course.lit > 0 && (
                      <button type="button" className={styles.see} onClick={() => setJourney(course)}>
                        Ver todo el recorrido →
                      </button>
                    )}
                  </>
                ) : (
                  <p className={styles.where}>Este curso todavía no tiene constelación.</p>
                )}
              </li>
            )
          )}
        </ul>
        {manage && !gone && missing.length > 0 && (
          <div className={styles.give}>
            <select value={pick} onChange={(e) => setGive(e.target.value)} aria-label="Curso para darle">
              {missing.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`${person.button} ${styles.sm}`}
              disabled={busy || !pick}
              onClick={() => {
                const course = missing.find((m) => m.key === pick)!;
                act(`/admin/users/${student.id}/courses`, "POST", { course: pick }, (r) =>
                  `Listo: ${name} tiene ${shortName(course.name)}.${mailNote(r)}`
                );
              }}
            >
              Darle el curso
            </button>
          </div>
        )}
      </section>

      <section className={person.sect}>
        <h3>Desafíos</h3>
        {student.challenges.length === 0 ? (
          <p className={person.muted}>Todavía no salió ningún desafío.</p>
        ) : (
          <ul className={styles.challenges}>
            {student.challenges.map((c) => (
              <li key={c.publishedAt} className={c.finished ? "" : styles.skip}>
                <b>
                  {c.finished ? (
                    <>
                      {c.correct}
                      <small>/{c.total}</small>
                    </>
                  ) : c.played ? (
                    "…"
                  ) : (
                    "—"
                  )}
                </b>
                <span>{shortDay(c.publishedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {manage && student.access && !gone && (
        <section className={person.sect}>
          <h3>Entrar a la plataforma</h3>
          <div className={`${styles.access} ${student.access.hasPassword ? "" : styles.pending}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {student.access.hasPassword ? (
                <>
                  <circle cx="8" cy="15" r="4" />
                  <path d="M11 12l8-8M16 7l2 2" />
                </>
              ) : (
                <>
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3.5 6.5l8.5 6 8.5-6" />
                </>
              )}
            </svg>
            <span>
              {student.access.hasPassword ? "Ya entra con su contraseña." : "Todavía no creó su contraseña."}
              <small>
                {student.access.hasPassword
                  ? "Si se la olvidó, le mandás un link."
                  : student.access.linkUntil
                    ? `El link vence el ${dayMonth(student.access.linkUntil)}.`
                    : "El link que le mandamos ya venció."}
              </small>
            </span>
            <button type="button" className={`${person.button} ${styles.sm}`} disabled={busy} onClick={() => setResending(true)}>
              {student.access.hasPassword ? "Mandar un link" : "Reenviar el link"}
            </button>
          </div>
        </section>
      )}

      {error && (
        <p className={person.error} role="alert">
          {error}
        </p>
      )}

      {manage && can(user, "audit:view") && (
        <section className={person.sect}>
          {student.auditCount ? (
            <Link
              className={person.logLink}
              to={`/admin/audit?${new URLSearchParams({ targetType: "user", targetId: student.id, name: student.name })}`}
            >
              {student.auditCount === 1 ? "Ver su registro en la bitácora" : `Ver sus ${student.auditCount} registros en la bitácora`} →
            </Link>
          ) : (
            <p className={person.muted}>Sin registros en la bitácora.</p>
          )}
        </section>
      )}

      {journey && <JourneyDialog student={student} course={journey} onClose={() => setJourney(null)} />}

      <ConfirmDialog
        open={revoking !== null}
        title={`¿Sacarle ${revoking ? shortName(revoking.name) : ""} a ${name}?`}
        cancelLabel="Cancelar"
        confirmLabel="Sacar el curso"
        onCancel={() => setRevoking(null)}
        onConfirm={() => {
          const course = revoking!;
          setRevoking(null);
          act(`/admin/users/${student.id}/courses/${course.key}`, "DELETE", undefined, () =>
            `${name} ya no tiene ${shortName(course.name)}.`
          );
        }}
      >
        Deja de ver esa constelación y sus preguntas en los desafíos. Su avance, su XP y sus cupones quedan guardados, y no
        le mandamos ningún mail. Se lo podés devolver cuando quieras, desde acá o desde la bitácora.
      </ConfirmDialog>

      <ConfirmDialog
        open={resending}
        title={student.access?.hasPassword ? `¿Mandarle un link a ${name}?` : `¿Reenviarle el link a ${name}?`}
        cancelLabel="Cancelar"
        confirmLabel={student.access?.hasPassword ? "Mandar el link" : "Reenviar"}
        onCancel={() => setResending(false)}
        onConfirm={() => {
          setResending(false);
          act(`/admin/users/${student.id}/link`, "POST", undefined, (r) =>
            r.emailSent === false ? "No pudimos mandar el mail. Probá de nuevo." : `Mail enviado a ${student.email}.`
          );
        }}
      >
        {student.access?.hasPassword
          ? `Le llega un mail a ${student.email} con un link para crear una contraseña nueva, que vale 1 hora. Mientras no la cambie, la de ahora sigue sirviendo.`
          : `Le llega un mail nuevo a ${student.email} con un link para crear su contraseña, que vale 3 días. El anterior deja de servir.`}
      </ConfirmDialog>
    </aside>
  );
}
