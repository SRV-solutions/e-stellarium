import { useEffect } from "react";
import styles from "./Toast.module.css";

type Props = {
  message: string | null; // vacío = no se ve
  onDone: () => void;
};

// El aviso de "listo" abajo de la pantalla: se va solo a los 2,4 s
export function Toast({ message, onDone }: Props) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDone, 2400);
    return () => clearTimeout(timer);
  }, [message, onDone]);

  return (
    <p className={`${styles.toast} ${message ? styles.on : ""}`} role="status">
      {message}
    </p>
  );
}
