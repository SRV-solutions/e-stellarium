import { useEffect, useId, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { AuditEntry } from "../../types";
import { describeValue, revertOutcome, targetName } from "./auditText";
import styles from "./RevertDialog.module.css";

type Conflict = { before: Record<string, unknown>; recorded: Record<string, unknown>; current: Record<string, unknown> };

type Props = {
  entry: AuditEntry | null; // el registro a revertir; vacío = cerrado
  onClose: () => void;
  onReverted: (revertId: number) => void;
};

// Pregunta antes de revertir. Si la API responde que lo cambiaron después (409 con "conflict"),
// muestra los tres momentos (antes, lo que dejó el registro, ahora) y pide confirmar de nuevo.
export function RevertDialog({ entry, onClose, onReverted }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (entry && !el.open) {
      setConflict(null);
      setError(null);
      el.showModal();
    }
    if (!entry && el.open) el.close();
  }, [entry]);

  async function revert() {
    if (!entry || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { revertId } = await api<{ revertId: number }>(`/admin/audit/${entry.id}/revert`, {
        method: "POST",
        body: JSON.stringify({ confirm: conflict !== null }),
      });
      onReverted(revertId);
    } catch (err) {
      if (err instanceof ApiError && err.data.conflict) setConflict(err.data.conflict as Conflict);
      else setError(err instanceof ApiError ? err.message : "No pudimos revertirlo. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const name = entry?.target ? targetName(entry) : "";

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      {entry && !conflict && (
        <>
          <h2 id={titleId}>
            ¿Revertir el registro <span className={styles.num}>#{entry.id}</span>?
          </h2>
          <p>Queda un registro nuevo en la bitácora, enlazado a este. Cada registro se revierte una sola vez.</p>
          <p className={styles.result}>{revertOutcome(entry)}</p>
        </>
      )}

      {entry && conflict && (
        <>
          <h2 id={titleId}>Desde ese registro, lo cambiaron otra vez</h2>
          <p>
            Después del registro <span className={styles.num}>#{entry.id}</span>, alguien volvió a cambiar a {name}.
          </p>
          <ol className={styles.when}>
            <li>
              <small>Antes de #{entry.id}</small>
              <b>{describeValue(conflict.before)}</b>
            </li>
            <li className={styles.recorded}>
              <small>Lo que dejó #{entry.id}</small>
              <b>{describeValue(conflict.recorded)}</b>
            </li>
            <li className={styles.current}>
              <small>Ahora</small>
              <b>{describeValue(conflict.current)}</b>
            </li>
          </ol>
          <p className={styles.result}>
            Si revertís, {name} pasa de <b>{describeValue(conflict.current)}</b> a <b>{describeValue(conflict.before)}</b>.
          </p>
        </>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onClose} autoFocus>
          Cancelar
        </button>
        <button
          type="button"
          className={conflict ? styles.anyway : styles.confirm}
          onClick={revert}
          disabled={busy}
        >
          {busy ? "Revirtiendo…" : conflict ? "Revertir igual" : "Revertir"}
        </button>
      </div>
    </dialog>
  );
}
