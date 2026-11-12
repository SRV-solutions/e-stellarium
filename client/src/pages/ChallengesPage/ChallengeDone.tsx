import { Link } from "react-router";
import { Glint } from "../../components/Glint/Glint";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import { XP_PER_CHALLENGE, XP_PER_CHALLENGE_ANSWER } from "../../lib/xp";
import type { ChallengeResult } from "../../types";
import { ChallengeRoute } from "./ChallengeRoute";
import styles from "./ChallengeDone.module.css";

type Props = {
  result: ChallengeResult;
  title: string; // "Desafío del lunes 9"
  discover: string | null; // el curso de Descubrí
  onRanking: () => void;
};

// La pantalla final: cuántas acertó, la experiencia y la recomendación del curso de Explorá
export function ChallengeDone({ result, title, discover, onRanking }: Props) {
  const shown = useAnimatedNumber(result.correctCount);
  const explore = result.results.filter((r) => r.part === "explore");
  const exploreRight = explore.filter((r) => r.correct).length;

  return (
    <main className={styles.end}>
      <p className={styles.eyebrow}>{title}</p>
      <p className={styles.big}>
        {shown} <small>de {result.total}</small>
      </p>
      <p className={styles.xpLine}>
        <b>+{result.xpGained} XP</b> · {result.correctCount * XP_PER_CHALLENGE_ANSWER} por aciertos y {XP_PER_CHALLENGE}{" "}
        por terminarlo
      </p>
      {result.glintsGained > 0 && (
        <p className={styles.glintLine}>
          <Glint />
          <b>+{result.glintsGained}</b> destellos para la tienda
        </p>
      )}
      <div className={styles.route}>
        <ChallengeRoute questions={result.results} explore={result.recommendation?.name ?? null} discover={discover} />
      </div>

      {result.recommendation && (
        <div className={styles.reco}>
          <strong>Esto lo vas a ver a fondo en {result.recommendation.name}</strong>
          <p>
            Acertaste {exploreRight} de las {explore.length} de Explorá.
          </p>
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.go} onClick={onRanking}>
          Ver el ranking
        </button>
        <Link to="/" className={styles.ghost}>
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
