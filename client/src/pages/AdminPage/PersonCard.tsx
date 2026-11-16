import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Avatar } from "../../components/Avatar/Avatar";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { useAuth } from "../../auth/useAuth";
import { api, ApiError } from "../../lib/api";
import { can } from "../../lib/permissions";
import type { PersonDetail, RoleInfo, RoleKey } from "../../types";
import { initials } from "./auditText";
import { dayMonth, firstName, lastPlayed, ROLE_NAMES, ROLE_ORDER, roleSummary, streakNote } from "./people";
import styles from "./PersonCard.module.css";

type Props = {
  id: string;
  roles: RoleInfo[];
  meId: string;
  onClose: () => void;
  onChanged: (message: string) => void; // cambió algo: la lista se vuelve a pedir y aparece el aviso
};

const LOCK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

// La ficha de una persona: sus datos, el rol y la baja. Las protecciones (no cambiarte el rol a vos
// mismo, no darte de baja, el último super admin) las garantiza la API; acá se muestran antes.
export function PersonCard({ id, roles, meId, onClose, onChanged }: Props) {
  const { user } = useAuth();
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [reloads, setReloads] = useState(0);
  const [pick, setPick] = useState<RoleKey | null>(null); // el rol elegido y todavía sin guardar
  const [teach, setTeach] = useState<string[] | null>(null); // los cursos tildados y todavía sin guardar
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRole, setConfirmRole] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    api<{ person: PersonDetail }>(`/admin/users/${id}`).then(
      (r) => current && setPerson(r.person),
      (err) => current && setError(err instanceof ApiError ? err.message : "No pudimos abrir la ficha.")
    );
    return () => {
      current = false;
    };
  }, [id, reloads]);

  // Escape cierra la ficha (si no está abierto el diálogo de la baja, que se cierra solo)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !confirmDelete && !confirmRole) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmDelete, confirmRole, onClose]);

  // Cambiar el rol, dar de baja o restaurar: los tres siguen el mismo camino
  async function act(path: string, method: string, body: object | undefined, message: string) {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method, body: body ? JSON.stringify(body) : undefined });
      setPick(null);
      setTeach(null);
      setReloads((n) => n + 1);
      onChanged(message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (!person) {
    return (
      <aside className={styles.card} aria-label="Ficha">
        <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
          ×
        </button>
        <p className={error ? styles.error : styles.muted}>{error ?? "Cargando…"}</p>
      </aside>
    );
  }

  const self = person.id === meId;
  const gone = person.deletedAt !== null;
  const locked = self || gone || busy;
  const chosen = pick ?? person.role;
  const name = firstName(person.name);
  const note = streakNote(person);

  let consequence = "";
  if (chosen === "student") consequence = " Deja de ver el panel.";
  else if (person.role === "student") consequence = " Sale del ranking.";

  return (
    <aside className={styles.card} aria-label={`Ficha de ${person.name}`}>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
        ×
      </button>

      <div className={styles.who}>
        <Avatar alias={initials(person.name)} frame={null} size={64} />
        <div>
          <h2>{person.name}</h2>
          <p>{person.email}</p>
        </div>
      </div>

      <dl className={styles.facts}>
        <dt>Desde</dt>
        <dd>{dayMonth(person.createdAt)}</dd>
        <dt>Cursos</dt>
        <dd>{person.courses.map((c) => c.name).join(", ") || "Ninguno"}</dd>
        <dt>Jugó</dt>
        <dd>
          {lastPlayed(person.lastActiveOn)}
          {note && `, ${note}`}
        </dd>
      </dl>

      <section className={styles.sect}>
        <h3>Rol</h3>
        {self && (
          <p className={styles.lock}>
            {LOCK}
            <span>No podés cambiar tu propio rol. Lo hace otro super admin.</span>
          </p>
        )}
        {gone && !self && (
          <p className={styles.lock}>
            {LOCK}
            <span>Para cambiarle el rol, primero restauralo.</span>
          </p>
        )}
        <div className={styles.roles} role="radiogroup" aria-label="Rol" aria-disabled={locked}>
          {ROLE_ORDER.map((key) => (
            <label key={key}>
              <input
                type="radio"
                name="role"
                value={key}
                checked={chosen === key}
                disabled={locked}
                onChange={() => setPick(key === person.role ? null : key)}
              />
              <span className={styles.pin} aria-hidden="true" />
              <b>
                {ROLE_NAMES[key]}
                {person.role === key && <span className={styles.now}>actual</span>}
              </b>
              <small>{roleSummary(key, roles)}</small>
            </label>
          ))}
        </div>
        {pick && (
          <div className={styles.save}>
            <p>
              {name} pasa de <b>{ROLE_NAMES[person.role]}</b> a <b>{ROLE_NAMES[pick]}</b>.{consequence}
            </p>
            <div className={styles.buttons}>
              <button type="button" className={styles.button} onClick={() => setPick(null)} disabled={busy}>
                Dejar como estaba
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.primary}`}
                disabled={busy}
                onClick={() => setConfirmRole(true)}
              >
                Cambiar el rol
              </button>
            </div>
          </div>
        )}
      </section>

      {person.role === "teacher" && !gone && (
        <section className={styles.sect}>
          <h3>Cursos que da</h3>
          <p className={styles.muted}>Ve y edita las preguntas de estos cursos. Lo que envía lo aprueba un admin.</p>
          <ul className={styles.teach}>
            {person.courseOptions.map((course) => {
              const checked = (teach ?? person.teaching).includes(course.key);
              return (
                <li key={course.key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const current = teach ?? person.teaching;
                        const next = checked ? current.filter((k) => k !== course.key) : [...current, course.key];
                        setTeach(next.sort().join() === [...person.teaching].sort().join() ? null : next);
                      }}
                    />
                    <span className={styles.box} />
                    <b>{course.name}</b>
                  </label>
                </li>
              );
            })}
          </ul>
          {teach && (
            <div className={styles.save}>
              <p>
                {name} va a dar:{" "}
                <b>{teach.length ? person.courseOptions.filter((c) => teach.includes(c.key)).map((c) => c.name).join(", ") : "ningún curso"}</b>.
              </p>
              <div className={styles.buttons}>
                <button type="button" className={styles.button} onClick={() => setTeach(null)} disabled={busy}>
                  Dejar como estaba
                </button>
                <button
                  type="button"
                  className={`${styles.button} ${styles.primary}`}
                  disabled={busy}
                  onClick={() => act(`/admin/users/${person.id}/teaching`, "PUT", { courses: teach }, `Listo: cambiaron los cursos de ${name}.`)}
                >
                  Guardar
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className={styles.sect}>
        {gone ? (
          <>
            <div className={styles.gone}>
              <b>Dado de baja el {dayMonth(person.deletedAt!)}.</b> No puede entrar ni aparece en el ranking. Su
              progreso sigue guardado.
            </div>
            <button
              type="button"
              className={styles.button}
              disabled={busy}
              onClick={() =>
                act(`/admin/users/${person.id}/restore`, "POST", undefined, `${name} volvió a estar activo.`)
              }
            >
              Restaurar
            </button>
          </>
        ) : (
          <>
            <h3>Baja</h3>
            <p className={styles.muted}>No borra nada: deja de poder entrar y sale del ranking. Se puede restaurar.</p>
            {self ? (
              <p className={styles.lock}>
                {LOCK}
                <span>No podés darte de baja a vos mismo.</span>
              </p>
            ) : (
              <button
                type="button"
                className={`${styles.button} ${styles.danger}`}
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                Dar de baja
              </button>
            )}
          </>
        )}
      </section>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {can(user, "audit:view") && (
        <section className={styles.sect}>
          {person.auditCount > 0 ? (
            <Link
              className={styles.logLink}
              to={`/admin/audit?${new URLSearchParams({ targetType: "user", targetId: person.id, name: person.name })}`}
            >
              {person.auditCount === 1 ? "Ver su registro en la bitácora" : `Ver sus ${person.auditCount} registros en la bitácora`} →
            </Link>
          ) : (
            <p className={styles.muted}>Sin registros en la bitácora.</p>
          )}
        </section>
      )}

      <ConfirmDialog
        open={confirmRole && pick !== null}
        title={`¿Cambiar el rol de ${name}?`}
        cancelLabel="Cancelar"
        confirmLabel="Cambiar el rol"
        onCancel={() => setConfirmRole(false)}
        onConfirm={() => {
          setConfirmRole(false);
          if (pick)
            act(
              `/admin/users/${person.id}/role`,
              "PATCH",
              { role: pick },
              `Listo: ${name} pasó de ${ROLE_NAMES[person.role]} a ${ROLE_NAMES[pick]}.`
            );
        }}
      >
        Pasa de {ROLE_NAMES[person.role]} a {pick ? ROLE_NAMES[pick] : ""}.{consequence} Queda en la bitácora y se puede
        revertir desde ahí.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        title={`¿Dar de baja a ${person.name}?`}
        cancelLabel="Cancelar"
        confirmLabel="Dar de baja"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          act(`/admin/users/${person.id}`, "DELETE", undefined, `${name} quedó dado de baja.`);
        }}
      >
        No puede entrar más y sale del ranking. Su progreso, sus cupones y sus cursos quedan guardados, y se puede
        restaurar cuando quieras, desde acá o desde la bitácora.
      </ConfirmDialog>
    </aside>
  );
}
