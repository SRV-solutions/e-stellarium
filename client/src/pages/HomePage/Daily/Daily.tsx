import { Link } from "react-router";
import { Comet } from "../../../components/Comet/Comet";
import { StreakBadge } from "../../../components/StreakBadge/StreakBadge";
import { STREAK_BADGES } from "../../../lib/glints";
import { XP_PER_REVIEW, XP_PER_REVIEW_ANSWER } from "../../../lib/xp";
import type { Stats } from "../../../types";
import styles from "./Daily.module.css";

// La racha a la izquierda y el repaso del día a la derecha
export function Daily({ stats }: { stats: Stats }) {
  return (
    <div className={styles.daily}>
      <Streak stats={stats} />
      <ReviewBox stats={stats} />
    </div>
  );
}

// El cometa con los días y los protectores y, debajo, las insignias
function Streak({ stats }: { stats: Stats }) {
  return (
    <div>
      <StreakLine stats={stats} />
      <Badges stats={stats} />
    </div>
  );
}

function StreakLine({ stats }: { stats: Stats }) {
  const { streak, activeToday, streakFreezes, boughtFreezes } = stats;
  let say;
  if (streak === 0) say = <p className={`${styles.say} ${styles.sayOff}`}>Jugá algo hoy para empezar una racha nueva.</p>;
  else if (activeToday) say = <p className={`${styles.say} ${styles.sayOk}`}>Hoy ya jugaste. Volvé mañana para que siga.</p>;
  else say = <p className={`${styles.say} ${styles.sayRisk}`}>Jugá algo antes de las 00:00 para que siga.</p>;

  return (
    <div className={styles.streak}>
      <Comet streak={streak} activeToday={activeToday} size="large" className={styles.comet} />
      <div>
        <h2 className={styles.streakTitle}>
          {streak} <small>{streak === 1 ? "día seguido" : "días seguidos"}</small>
        </h2>
        {say}
        <p
          className={styles.freezes}
          title="Si un día no jugás, se usa un protector y la racha sigue. Se recargan cada mes."
        >
          {/* Una luna por protector: la que ya se usó queda solo en contorno */}
          {[0, 1].map((i) => (
            <svg key={i} viewBox="0 0 16 16" aria-hidden="true">
              <path
                className={i < streakFreezes ? styles.moon : styles.moonUsed}
                d="M10.5 2.2A6 6 0 1 0 13.8 11 5 5 0 0 1 10.5 2.2z"
              />
            </svg>
          ))}
          {streakFreezes} {streakFreezes === 1 ? "protector" : "protectores"} este mes
          {boughtFreezes > 0 && ` y ${boughtFreezes} ${boughtFreezes === 1 ? "comprado" : "comprados"}`}
        </p>
      </div>
    </div>
  );
}

const TIME_ZONE = "America/Argentina/Buenos_Aires";

// Las insignias de racha, con un anillo que se llena con los días. Las ganadas quedan para siempre
function Badges({ stats }: { stats: Stats }) {
  return (
    <ul className={styles.badges} aria-label="Insignias de racha">
      {STREAK_BADGES.map((badge) => {
        const earned = stats.badges.find((b) => b.days === badge.days);
        const since =
          earned &&
          new Date(earned.earnedAt).toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: TIME_ZONE });
        const missing = badge.days - Math.min(stats.streak, badge.days);
        return (
          <li key={badge.days} className={`${styles.badge} ${earned ? "" : styles.badgeOff}`}>
            <StreakBadge days={badge.days} earned={!!earned} streak={stats.streak} className={styles.badgeIcon} />
            <span className={styles.badgeName}>
              {badge.name}
              <small>
                {earned
                  ? `Desde el ${since} · +${badge.glints}`
                  : `${badge.days} días · faltan ${missing} · +${badge.glints}`}
              </small>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ReviewBox({ stats }: { stats: Stats }) {
  const { review } = stats;

  if (review.status === "unavailable") {
    return (
      <div>
        <h2 className={styles.title}>Repaso del día</h2>
        <p className={styles.empty}>
          Cuando juegues tu primera estrella, acá vas a tener todos los días unas preguntas para repasar.
        </p>
      </div>
    );
  }

  const { answered, total } = review;
  return (
    <div>
      <h2 className={styles.title}>Repaso del día</h2>
      <p className={styles.lead}>
        {total} {total === 1 ? "pregunta" : "preguntas"} de lo que ya jugaste, empezando por las que te costaron.{" "}
        {XP_PER_REVIEW_ANSWER} XP por acierto y {XP_PER_REVIEW} al terminarlo.
      </p>

      {/* Una estrella por pregunta, unidas en fila. Desde acá solo se sabe cuántas respondió */}
      <div className={styles.five} role="img" aria-label={`${answered} de ${total} preguntas respondidas`}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={styles.slot}>
            {i > 0 && <span className={`${styles.link} ${i < answered ? styles.linkOn : ""}`} />}
            <span
              className={`${styles.q} ${i < answered ? styles.qDone : ""} ${
                i === answered && review.status === "in_progress" ? styles.qNow : ""
              }`}
            >
              <svg viewBox="-13 -13 26 26">
                <path className={styles.flare} d="M0 -12 L1.4 -1.4 L12 0 L1.4 1.4 L0 12 L-1.4 1.4 L-12 0 L-1.4 -1.4 Z" />
                <circle className={styles.core} r="5" />
              </svg>
            </span>
          </span>
        ))}
        <span className={styles.count}>
          <b>{answered}</b> de {total}
        </span>
      </div>

      {review.status === "finished" ? (
        <p className={styles.done}>Repaso hecho. Mañana tenés otro.</p>
      ) : (
        <Link to="/review" className={styles.go}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" />
          </svg>
          {review.status === "pending" ? "Empezar el repaso" : "Seguir el repaso"}
        </Link>
      )}
    </div>
  );
}
