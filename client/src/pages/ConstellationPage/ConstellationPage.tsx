import { useState } from "react";
import { Link, useParams } from "react-router";
import { AppHeader } from "../../components/AppHeader/AppHeader";
import { useConstellations } from "../../hooks/useConstellations";
import type { Constellation, StarSummary } from "../../types";
import styles from "./ConstellationPage.module.css";

export function ConstellationPage() {
  const { courseKey } = useParams();
  const { state, reload } = useConstellations();

  return (
    <>
      <AppHeader />
      <main className={styles.page}>
        {state.status === "loading" && (
          <p className={styles.muted} role="status">Cargando tu constelación...</p>
        )}

        {state.status === "error" && (
          <div className={styles.error} role="alert">
            No pudimos cargar tu constelación.
            <button type="button" className={styles.retry} onClick={reload}>Reintentar</button>
          </div>
        )}

        {state.status === "ready" && (
          <ReadyView constellations={state.constellations} courseKey={courseKey} />
        )}
      </main>
    </>
  );
}

function ReadyView({ constellations, courseKey }: { constellations: Constellation[]; courseKey?: string }) {
  const constellation = constellations.find((c) => c.course.key === courseKey);

  if (!constellation) {
    return (
      <p className={styles.muted}>
        No encontramos esa constelación entre tus cursos. <Link to="/">Volver al inicio</Link>
      </p>
    );
  }

  // La key hace que, al cambiar de constelación, el componente arranque de cero
  return <ConstellationView key={constellation.id} constellation={constellation} />;
}

// La estrella que se muestra al entrar: la primera que se puede jugar, o la última abierta
function defaultStarId(stars: StarSummary[]) {
  const playable = stars.find((s) => s.unlocked && !s.completed);
  const lastOpen = stars.filter((s) => s.unlocked).at(-1);
  return (playable ?? lastOpen ?? stars[0])?.id ?? null;
}

function ConstellationView({ constellation }: { constellation: Constellation }) {
  const [selectedId, setSelectedId] = useState(() => defaultStarId(constellation.stars));
  const selected = constellation.stars.find((s) => s.id === selectedId) ?? null;

  return (
    <>
      <p className={styles.muted}>{constellation.course.name}</p>
      <h1>{constellation.name}</h1>
      <p>
        {constellation.completedStars} / {constellation.totalStars} estrellas encendidas
      </p>

      <ul>
        {constellation.stars.map((star) => (
          <li key={star.id}>
            <button type="button" aria-pressed={star.id === selectedId} onClick={() => setSelectedId(star.id)}>
              {star.position}. {star.title} ({star.completed ? "encendida" : star.unlocked ? "lista" : "bloqueada"})
            </button>
          </li>
        ))}
      </ul>

      {selected && <p>Elegida: {selected.title}</p>}
    </>
  );
}