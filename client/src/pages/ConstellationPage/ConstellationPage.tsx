import { useState } from "react";
import { Link, NavLink, useParams } from "react-router";
import { AppHeader } from "../../components/AppHeader/AppHeader";
import { StarMap } from "../../components/StarMap/StarMap";
import { useConstellations } from "../../hooks/useConstellations";
import { StarReadout } from "../../components/StarReadout/StarReadout";
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

        {state.status === "ready" && (
          <ReadyView
            constellations={state.constellations}
            courseKey={courseKey}
            reload={reload}
          />
        )}
      </main>
    </>
  );
}

function ReadyView({
  constellations,
  courseKey,
  reload,
}: {
  constellations: Constellation[];
  courseKey?: string;
  reload: () => void;
}) {
  const constellation = constellations.find((c) => c.course.key === courseKey);

  if (!constellation) {
    return (
      <p className={`${styles.container} ${styles.message}`}>
        No encontramos esa constelación entre tus cursos.{" "}
        <Link to="/">Volver al inicio</Link>
      </p>
    );
  }

  // La key hace que, al cambiar de constelación, el componente arranque de cero
    return <ConstellationView key={constellation.id} constellation={constellation} all={constellations} reload={reload} />;
}

// La estrella que se muestra al entrar: la primera que se puede jugar, el examen si ya encendió
// todas las lecciones (aunque esté esperando), o la última abierta
function defaultStarId(stars: StarSummary[]) {
  const playable = stars.find((s) => s.unlocked && !s.completed) ?? stars.find((s) => s.exam && s.exam.status !== "locked");
  const lastOpen = stars.filter((s) => s.unlocked).at(-1);
  return (playable ?? lastOpen ?? stars[0])?.id ?? null;
}

function ConstellationView({
  constellation,
  all,
  reload,
}: {
  constellation: Constellation;
  all: Constellation[];
  reload: () => void;
}) {
  const [selectedId, setSelectedId] = useState(() =>
    defaultStarId(constellation.stars),
  );
  const selectedIndex = constellation.stars.findIndex(
    (s) => s.id === selectedId,
  );
  const selected = constellation.stars[selectedIndex];

  return (
    <>
      <section className={styles.sky} aria-labelledby="constellation-title">
        <div className={styles.container}>
                    <div className={styles.trail}>
            <Link to="/" className={styles.back}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
              Inicio
            </Link>

            {all.length > 1 && (
              <nav className={styles.switch} aria-label="Tus constelaciones">
                {all.map((c) => (
                  <NavLink
                    key={c.id}
                    to={`/constellations/${c.course.key}`}
                    className={({ isActive }) => `${styles.switchItem} ${isActive ? styles.switchActive : ""}`}
                  >
                    <span className={styles.switchName}>{c.course.name}</span>
                    <small>
                      {c.completedStars}/{c.totalStars}
                    </small>
                  </NavLink>
                ))}
              </nav>
            )}
          </div>
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

          <div className={styles.mapArea}>
            <StarMap courseKey={constellation.course.key} stars={constellation.stars} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        </div>
      </section>

      {selected && (
        <StarReadout
          star={selected}
          index={selectedIndex}
          previous={constellation.stars[selectedIndex - 1]}
          onExamOpens={reload}
        />
      )}
    </>
  );
}
