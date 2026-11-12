import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { useAuth } from "../../auth/useAuth";
import { Comet } from "../../components/Comet/Comet";
import { Glint } from "../../components/Glint/Glint";
import styles from "./ReviewDone.module.css";

type Props = {
  correctCount: number;
  total: number;
  xp: number; // lo que ganó en esta partida (0 si abrió un repaso que ya había terminado)
  streak: number | null; // la racha que devolvió la última respuesta; null si no respondió nada ahora
  glints: number; // los destellos por terminarlo (0 si ya estaba terminado)
};

// El final del repaso: cuántas acertó, la experiencia y la racha, con el cometa
export function ReviewDone({ correctCount, total, xp, streak, glints }: Props) {
  const { stats } = useAuth();
  const days = streak ?? stats?.streak ?? 0;
  const button = useRef<HTMLAnchorElement>(null);

  // El foco va a "Volver al inicio": con Enter se sale, sin buscar el botón
  useEffect(() => {
    button.current?.focus();
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <Comet streak={days} activeToday size="large" className={styles.comet} />
        <p className={styles.kicker}>Repaso del día</p>
        <h1 className={styles.title}>Repaso hecho</h1>
        <p className={styles.score}>
          Acertaste <b>{correctCount}</b> de {total}
          {xp > 0 && (
            <>
              {" "}
              y sumaste <b className={styles.xp}>+{xp} XP</b>
            </>
          )}
          .
        </p>
        {glints > 0 && (
          <p className={styles.glints}>
            <Glint />
            <b>+{glints}</b> destellos para la tienda
          </p>
        )}
        {days > 0 && (
          <p className={styles.streak}>
            {days === 1 ? "Empezaste una racha. Volvé mañana para que siga." : `Llevás ${days} días seguidos. Mañana tenés otro repaso.`}
          </p>
        )}
        <Link ref={button} to="/" className={styles.go}>
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
