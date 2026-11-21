import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { shortName } from "./people";
import person from "./PersonCard.module.css";
import styles from "./EnrollDialog.module.css";

type Lookup = {
  user: { id: string; name: string; deleted: boolean; courses: string[] } | null;
  courseOptions: { key: string; name: string }[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onDone: (userId: string, message: string) => void;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "Dar de alta": email, nombre (si no tiene cuenta) y cursos. Mientras escribe el email, la API dice si ya
// existe, así queda claro qué le va a llegar: la bienvenida con el link o el aviso de cursos nuevos
export function EnrollDialog({ open, onClose, onDone }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      setEmail("");
      setName("");
      setPicked([]);
      setError(null);
      el.showModal();
    }
    if (!open && el.open) el.close();
  }, [open]);

  // Se consulta el email 300 ms después de dejar de escribir
  const clean = email.trim().toLowerCase();
  const valid = EMAIL_RE.test(clean);
  useEffect(() => {
    if (!open) return;
    let current = true;
    const timer = setTimeout(
      () => {
        api<Lookup>(`/admin/enrollments/lookup?${new URLSearchParams({ email: valid ? clean : "" })}`).then(
          (r) => current && setLookup(r),
          () => {}
        );
      },
      valid ? 300 : 0
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [open, clean, valid]);

  const found = valid && lookup?.user ? lookup.user : null;
  const has = found?.courses ?? [];
  const toGive = picked.filter((k) => !has.includes(k));
  const names = (keys: string[]) =>
    keys.map((k) => shortName(lookup?.courseOptions.find((o) => o.key === k)?.name ?? k)).join(" y ");
  const ready = valid && !found?.deleted && (found || name.trim()) && toGive.length > 0 && !busy;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ userId: string; created: boolean; emailSent: boolean }>("/admin/enrollments", {
        method: "POST",
        body: JSON.stringify({ email: clean, name: name.trim() || undefined, courses: toGive }),
      });
      const who = found ? found.name.split(" ")[0] : name.trim().split(/\s+/)[0];
      const mail = r.emailSent ? "" : " No pudimos mandarle el mail: reenviáselo desde su ficha.";
      onDone(r.userId, r.created ? `Listo: le mandamos la bienvenida a ${who}.${mail}` : `Listo: ${who} ya tiene los cursos nuevos.${mail}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="enroll-title"
      onCancel={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 id="enroll-title">Dar de alta</h2>
        <p className={styles.note}>Para alguien que no compró por la web: una beca, un canje, un error en el pago.</p>

        <label className={styles.field}>
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@gmail.com" autoFocus />
        </label>

        {found ? (
          <div className={`${styles.found} ${found.deleted ? styles.warn : ""}`}>
            {found.deleted ? (
              <>
                <b>{found.name}</b> está dado de baja. Para darle cursos, primero restauralo desde Personas.
              </>
            ) : (
              <>
                Ya tiene cuenta: <b>{found.name}</b>
                {has.length > 0 && `, con ${names(has)}`}. Le sumamos los cursos que elijas.
              </>
            )}
          </div>
        ) : (
          <label className={styles.field}>
            <span>Nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" maxLength={120} />
            <small>Así lo saludamos en los mails. En el ranking sale el alias, que se cambia desde el perfil.</small>
          </label>
        )}

        <div className={styles.field}>
          <span>Cursos</span>
          <div className={styles.checks}>
            {(lookup?.courseOptions ?? []).map((option) =>
              has.includes(option.key) ? (
                <label key={option.key} className={styles.had}>
                  <input type="checkbox" checked disabled />
                  {option.name}
                  <small>ya lo tiene</small>
                </label>
              ) : (
                <label key={option.key}>
                  <input
                    type="checkbox"
                    checked={picked.includes(option.key)}
                    onChange={(e) =>
                      setPicked(e.target.checked ? [...picked, option.key] : picked.filter((k) => k !== option.key))
                    }
                  />
                  {option.name}
                </label>
              )
            )}
          </div>
        </div>

        <div className={styles.what}>
          {found ? (
            <>
              Le llega un mail avisándole que tiene {toGive.length ? <b>{names(toGive)}</b> : "cursos nuevos"}. Entra con la
              contraseña de siempre.
            </>
          ) : (
            <>
              Le llega un mail de bienvenida con un link para <b>crear su contraseña</b>. El link vale 3 días; si vence, se lo
              reenviás desde su ficha.
            </>
          )}
        </div>

        {error && (
          <p className={person.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <button type="button" className={person.button} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={`${person.button} ${person.primary}`} disabled={!ready}>
            {busy ? "Guardando…" : found ? "Darle los cursos" : "Dar de alta"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
