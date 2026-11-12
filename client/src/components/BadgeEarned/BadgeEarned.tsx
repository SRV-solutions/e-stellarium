import { useEffect, useId, useRef, useState } from "react";
import { STREAK_BADGES } from "../../lib/glints";
import type { NewBadge } from "../../types";
import { Glint } from "../Glint/Glint";
import { StreakBadge } from "../StreakBadge/StreakBadge";
import styles from "./BadgeEarned.module.css";

// Cuánto espera antes de aparecer: primero se ve el veredicto de la respuesta
const DELAY_MS = 1200;

type Props = {
  badges: NewBadge[]; // las que trajo la respuesta (casi siempre ninguna)
  onDone: () => void; // ya las vio todas
};

// El aviso de insignia nueva: aparece después del veredicto de la respuesta que la dio, una sola vez
// (la API la devuelve solo en esa respuesta). Si la racha pasó varios umbrales juntos, se muestran de a una
export function BadgeEarned({ badges, onDone }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const badge = badges[index];

  // Llegaron insignias: se muestran (desde la primera) después de un momento
  useEffect(() => {
    if (badges.length === 0) return;
    const timer = setTimeout(() => {
      setIndex(0);
      setShown(true);
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [badges]);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (shown && !el.open) el.showModal();
    if (!shown && el.open) el.close();
  }, [shown]);

  function next() {
    if (index + 1 < badges.length) {
      setIndex(index + 1);
      return;
    }
    setShown(false);
    onDone();
  }

  const info = badge && STREAK_BADGES.find((b) => b.days === badge.days);
  const following = badge && STREAK_BADGES.find((b) => b.days > badge.days);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault(); // con Escape también pasa a la siguiente, así ninguna se pierde
        next();
      }}
    >
      {badge && info && (
        <>
          <p className={styles.eyebrow}>Insignia nueva</p>
          <StreakBadge days={badge.days} earned streak={badge.days} className={styles.icon} />
          <h2 id={titleId}>{info.name}</h2>
          <p>
            {badge.days} días seguidos jugando.{" "}
            {following ? (
              <>
                La próxima, el <b>{following.name}</b>, a los {following.days}.
              </>
            ) : (
              "Ya tenés todas las insignias de racha."
            )}
          </p>
          <p className={styles.plus}>
            <Glint />+{badge.glints} destellos
          </p>
          <button type="button" className={styles.go} onClick={next} autoFocus>
            Seguir
          </button>
        </>
      )}
    </dialog>
  );
}
