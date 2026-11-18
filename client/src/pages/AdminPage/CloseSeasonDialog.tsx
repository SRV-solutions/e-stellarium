import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import person from "./PersonCard.module.css";
import styles from "./CouponsPage.module.css";

type Props = {
  current: { id: string; name: string };
  suggested: string;
  onClose: () => void;
  onDone: (message: string) => void;
};

const WORD = "CERRAR";

// Cerrar la temporada: una confirmación fuerte (hay que escribir CERRAR) porque no se deshace.
// Dice qué cambia y qué no, para que nadie crea que se borra algo.
export function CloseSeasonDialog({ current, suggested, onClose, onDone }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(suggested);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const ready = typed.trim() === WORD && name.trim().length > 0 && !busy;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await api("/admin/ranking/seasons/close", {
        method: "POST",
        body: JSON.stringify({ seasonId: current.id, name: name.trim() }),
      });
      onDone(`Listo: cerraste la ${current.name} y arrancó la ${name.trim()}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo. Probá de nuevo.");
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="close-season-title"
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
        <h2 id="close-season-title">Cerrar la {current.name}</h2>
        <p className={styles.note}>
          Arranca una temporada nueva desde cero. <b>Esto no se puede deshacer.</b>
        </p>
        <p className={styles.alert}>Los alumnos van a ver las tablas vacías hasta que vuelvan a jugar. Premiá antes a quienes lo merezcan.</p>

        <div className={styles.what}>
          <b>Empiezan de cero</b> en la tabla «Temporada»: experiencia, estrellas, desafíos perfectos y destellos conseguidos.
          <br />
          <b>No cambia nada</b> del XP, el nivel, las estrellas encendidas ni el saldo de destellos de cada alumno; ni las rachas;
          ni ningún movimiento o historial. «Desde siempre» sigue mostrando todo. Queda una foto del top 10 de cada tabla.
        </div>

        <label className={styles.field} style={{ marginTop: 14 }}>
          <span>Nombre de la temporada que arranca</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </label>
        <label className={styles.field}>
          <span>
            Para confirmar, escribí <b className={styles.mono}>{WORD}</b>
          </span>
          <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>

        {error && (
          <p className={person.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={person.button} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={`${person.button} ${person.danger}`} disabled={!ready}>
            {busy ? "Cerrando…" : "Cerrar temporada"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
