import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { parseInteger } from "../../lib/economy";
import { dayMonth, firstName } from "./people";
import person from "./PersonCard.module.css";
import styles from "./CouponsPage.module.css";

type Lookup = { user: { id: string; name: string; deleted: boolean } | null; validDays: number; maxPercent: number };

type Props = { open: boolean; onClose: () => void; onDone: (message: string) => void };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "Emitir un cupón": para quién (la API dice quién es), el descuento, cuántos días vale, el motivo y si se le avisa
export function IssueCouponDialog({ open, onClose, onDone }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [percent, setPercent] = useState("20");
  const [days, setDays] = useState<string | null>(null); // null: el de la economía, cuando llegue
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now()); // para calcular el vencimiento que se muestra

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      setEmail("");
      setPercent("20");
      setDays(null);
      setReason("");
      setNotify(true);
      setError(null);
      el.showModal();
    }
    if (!open && el.open) el.close();
  }, [open]);

  const clean = email.trim().toLowerCase();
  const valid = EMAIL_RE.test(clean);
  useEffect(() => {
    if (!open) return;
    let current = true;
    const timer = setTimeout(
      () =>
        api<Lookup>(`/admin/coupons/lookup?${new URLSearchParams({ email: valid ? clean : "" })}`).then(
          (r) => current && setLookup(r),
          () => {}
        ),
      valid ? 300 : 0
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [open, clean, valid]);

  const maxPercent = lookup?.maxPercent ?? 60;
  const daysText = days ?? String(lookup?.validDays ?? "");
  const pct = parseInteger(percent);
  const dayCount = parseInteger(daysText);
  const pctBad = pct === null || pct < 1 || pct > maxPercent;
  const daysBad = dayCount === null || dayCount < 1 || dayCount > 365;
  const who = valid ? (lookup?.user ?? null) : null;
  const ready = who && !who.deleted && !pctBad && !daysBad && reason.trim() && !busy;
  const until = dayCount && !daysBad ? dayMonth(new Date(now + dayCount * 86_400_000).toISOString()) : null;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ emailSent: boolean | null }>("/admin/coupons", {
        method: "POST",
        body: JSON.stringify({ email: clean, percent: pct, validDays: dayCount, reason: reason.trim(), notify }),
      });
      const mail = r.emailSent === true ? " Le avisamos por mail." : r.emailSent === false ? " No pudimos mandarle el mail." : "";
      onDone(`Listo: ${firstName(who!.name)} tiene un cupón del ${pct} %.${mail}`);
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
      aria-labelledby="issue-title"
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
        <h2 id="issue-title">Emitir un cupón</h2>
        <p className={styles.note}>
          Un cupón de regalo para un alumno: una beca, una compensación, un premio. Vale en wearesrv.com como los del examen.
        </p>

        <label className={styles.field}>
          <span>Para quién</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email del alumno" autoFocus />
        </label>
        {valid && lookup && (
          <div className={`${styles.found} ${!who || who.deleted ? styles.warn : ""}`}>
            {!who ? (
              <>
                <b>No hay nadie con ese email.</b> Si todavía no tiene cuenta, dalo de alta desde Alumnos.
              </>
            ) : who.deleted ? (
              <>
                <b>{who.name}</b> está dado de baja: restauralo primero desde Personas.
              </>
            ) : (
              <>
                Es <b>{who.name}</b>.
              </>
            )}
          </div>
        )}

        <div className={styles.pair}>
          <label className={styles.field}>
            <span>Descuento</span>
            <span className={`${styles.num} ${pctBad ? styles.bad : ""}`}>
              <input inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value)} aria-label="Descuento" />
              <span>%</span>
            </span>
          </label>
          <label className={styles.field}>
            <span>Vale por</span>
            <span className={`${styles.num} ${daysBad ? styles.bad : ""}`}>
              <input inputMode="numeric" value={daysText} onChange={(e) => setDays(e.target.value)} aria-label="Días" />
              <span>días</span>
            </span>
          </label>
        </div>
        {pctBad && <p className={styles.err}>Entre 1 y {maxPercent} %: ningún cupón pasa del {maxPercent} %.</p>}
        {daysBad && <p className={styles.err}>Entre 1 y 365 días.</p>}

        <label className={styles.field}>
          <span>Motivo</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Por ejemplo: beca por el concurso de la semana"
            maxLength={300}
          />
          <small>Lo ven el staff y la bitácora, no el alumno.</small>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Avisarle por mail
        </label>

        <div className={styles.what}>
          {who && !who.deleted ? (
            <>
              {firstName(who.name)} lo va a ver en <b>Mis cupones</b>
              {notify && " y le llega un mail con el código"}. Vence el <b>{until ?? "—"}</b>.
            </>
          ) : (
            "Elegí a quién se lo das."
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
            {busy ? "Emitiendo…" : "Emitir el cupón"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
