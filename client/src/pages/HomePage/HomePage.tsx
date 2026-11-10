import { useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { useCourses } from "../../hooks/useCourses";
import { useConstellations } from "../../hooks/useConstellations";
import { SUPPORT_HREF } from "../../config";
import { levelFor } from "../../lib/levels";
import { AppHeader } from "../../components/AppHeader/AppHeader";
import { BrandGauge } from "../../components/BrandGauge/BrandGauge";
import { Cosmos } from "../../components/Cosmos/Cosmos";
import { Eyepiece } from "../../components/Eyepiece/Eyepiece";
import { NextStar, type Sighting } from "./NextStar/NextStar";
import { CourseLine } from "./CourseLine/CourseLine";
import { Coupons } from "./Coupons/Coupons";
import type { Constellation } from "../../types";
import styles from "./HomePage.module.css";


// Adónde apunta el telescopio: la primera lección abierta y sin encender. Primero en los cursos que ya empezó
// (para seguir donde viene), después en los demás. Si ya encendió todo, a la última estrella del último curso.
// Si no hay estrellas, a ninguna
function aimTelescope(constellations: Constellation[]) {
  const started = constellations.filter((c) => c.completedStars > 0);
  const notStarted = constellations.filter((c) => c.completedStars === 0);
  for (const c of [...started, ...notStarted]) {
    const index = c.stars.findIndex((s) => s.kind === "lesson" && s.unlocked && !s.completed);
    if (index !== -1) {
      return {
        lit: c.stars.map((s) => s.completed),
        focus: index,
        aiming: true,
        sighting: { kind: "next", star: c.stars[index]!, index, courseName: c.course.name } as Sighting,
      };
    }
  }
  const last = constellations.filter((c) => c.stars.length > 0).at(-1);
  if (last) {
    return {
      lit: last.stars.map((s) => s.completed),
      focus: last.stars.length - 1,
      aiming: false,
      sighting: { kind: "done", courseKey: last.course.key } as Sighting,
    };
  }
  return { lit: [], focus: -1, aiming: false, sighting: { kind: "empty" } as Sighting };
}

export function HomePage() {
  const { user } = useAuth();
  const { state, reload } = useCourses();
  const sky = useConstellations();
  const [settled, setSettled] = useState(false);

  if (!user) return null;
  const level = levelFor(user.totalXp);
  const constellations = sky.state.status === "ready" ? sky.state.constellations : [];
  const telescope = sky.state.status === "ready" ? aimTelescope(constellations) : null;

  return (
    <>
      <Cosmos />
      <AppHeader />

      <main>
        <section className={styles.observatory} aria-labelledby="level-title">
          <div className={`${styles.container} ${styles.observatoryGrid}`}>
            <div className={styles.left}>
              <div className={styles.level}>
                <BrandGauge
                  progress={level.progress}
                  label={`${Math.round(level.progress * 100)} % del nivel ${level.level}`}
                  className={styles.gauge}
                />
                <div>
                  <p className={styles.levelName}>{level.name}</p>
                  <h1 id="level-title" className={styles.levelTitle}>
                    Nivel {level.level}
                  </h1>
                  <p className={styles.points}>
                    <b>{user.totalXp}</b> XP
                  </p>
                  <div className={styles.bar} aria-hidden="true">
                    <i style={{ width: `${level.progress * 100}%` }} />
                  </div>
                  <p className={styles.toNext}>
                    {user.totalXp > 0 ? (
                      <>
                        Te faltan <b>{level.xpToNext} XP</b> para el nivel {level.level + 1}
                      </>
                    ) : (
                      "Encendé tu primera estrella para empezar"
                    )}
                  </p>
                </div>
              </div>

              {telescope && <NextStar sighting={telescope.sighting} show={settled} />}
              {sky.state.status === "error" && (
                <div className={styles.error} role="alert">
                  No pudimos cargar tus constelaciones.
                  <button type="button" className={styles.secondary} onClick={sky.reload}>
                    Reintentar
                  </button>
                </div>
              )}
            </div>

            <div className={styles.eyepiece}>
              {/* key: al llegar los datos, el ocular se crea de nuevo y su animación arranca desde cero */}
              <Eyepiece
                key={telescope ? "sky" : "loading"}
                lit={telescope?.lit ?? []}
                focus={telescope?.focus ?? -1}
                aiming={telescope?.aiming ?? false}
                onSettled={telescope ? () => setSettled(true) : undefined}
              />
            </div>
          </div>
        </section>

        <section className={styles.block} aria-labelledby="courses-title">
          <div className={styles.container}>
            <h2 id="courses-title" className={styles.blockTitle}>Mis cursos</h2>
            <p className={styles.blockLead}>Cada curso es una constelación. Tocá una para verla entera.</p>

            {state.status === "loading" && <p className={styles.muted} role="status">Cargando tus cursos...</p>}

            {state.status === "error" && (
              <div className={styles.error} role="alert">
                No pudimos cargar tus cursos.
                <button type="button" className={styles.secondary} onClick={reload}>Reintentar</button>
              </div>
            )}

            {state.status === "ready" && state.courses.length === 0 && (
              <p className={styles.muted}>
                Todavía no tenés cursos. Cuando compres uno en <a href="https://wearesrv.com">wearesrv.com</a>,
                aparece acá.
              </p>
            )}

            {state.status === "ready" && state.courses.length > 0 && (
              <ul className={styles.courses}>
                {state.courses.map((course) => (
                  <CourseLine
                    key={course.key}
                    course={course}
                    constellation={constellations.find((c) => c.course.key === course.key)}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className={styles.block} aria-labelledby="coupons-title">
          <div className={styles.container}>
            <h2 id="coupons-title" className={styles.blockTitle}>Mis cupones</h2>
            <Coupons />
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.container}>
          ¿Problemas con tu cuenta o con un curso? <a href={SUPPORT_HREF}>Escribinos a soporte</a>.
        </div>
      </footer>
    </>
  );
}
