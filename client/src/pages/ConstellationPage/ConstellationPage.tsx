import { useState } from "react";
import { Link, useParams } from "react-router";
import { AppHeader } from "../../components/AppHeader/AppHeader";
import { StarMap } from "../../components/StarMap/StarMap";
import { useConstellations } from "../../hooks/useConstellations";
import type { Constellation, StarSummary } from "../../types";
import styles from "./ConstellationPage.module.css";

export function ConstellationPage() {
  const { courseKey } = useParams();
  const { state, reload } = useConstellations();

  return (
    <>
      <AppHeader />
      <main>
        {state.status === "loading" && (
          <p className={`${styles.container} ${styles.message}`} role="status">
            Cargando tu constelación...
          </p>
        )}

        {state.status === "error" && (
          <div className={styles.container}>
            <div className={styles.error} role="alert">
              No pudimos cargar tu constelación.
              <button type="button" className={styles.retry} onClick={reload}>
                Reintentar
              </button>
            </div>
          </div>
        )}

        {state.status === "ready" && <ReadyView constellations={state.constellations} courseKey={courseKey} />}
      </main>
    </>
  );
}

function ReadyView({ constellations, courseKey }: { constellations: Constellation[]; courseKey?: string }) {
  const constellation = constellations.find((c) => c.course.key === courseKey);

  if (!constellation) {
    return (
      <p className={`${styles.container} ${styles.message}`}>
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
      <section className={styles.sky} aria-labelledby="constellation-title">
        <div className={styles.container}>
          <div className={styles.head}>
            <div>
              <p className={styles.course}>{constellation.course.name}</p>
              <h1 id="constellation-title" className={styles.title}>
                {constellation.name}
              </h1>
            </div>
            <p className={styles.count}>
              <b>
                {constellation.completedStars} / {constellation.totalStars}
              </b>
              estrellas encendidas
            </p>
          </div>

          <StarMap stars={constellation.stars} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </section>

      {selected && <p className={`${styles.container} ${styles.message}`}>Elegida: {selected.title}</p>}
    </>
  );
}