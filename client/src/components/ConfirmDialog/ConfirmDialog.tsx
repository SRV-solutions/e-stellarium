import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./ConfirmDialog.module.css";

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// Un aviso que pide confirmar antes de hacer algo. Usa <dialog> con showModal(): el navegador
// pone el fondo oscuro, deja el foco adentro y lo cierra con Escape
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel, onConfirm, onCancel }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      // Escape: el navegador lo cierra solo; avisamos para que el estado quede igual
      onCancel={onCancel}
      // Un clic en el fondo (fuera del cuadro) también cancela
      onClick={(e) => e.target === dialog.current && onCancel()}
    >
      <h2 id={titleId}>{title}</h2>
      <p>{children}</p>
      <div className={styles.actions}>
        {/* El primero es el que deja todo como estaba: es el que tiene el foco al abrir */}
        <button type="button" className={styles.stay} onClick={onCancel} autoFocus>
          {cancelLabel}
        </button>
        <button type="button" className={styles.confirm} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
