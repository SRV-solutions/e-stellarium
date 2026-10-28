import { useAuth } from "../../auth/useAuth";
import { useCourses } from "../../hooks/useCourses";
import { SUPPORT_HREF } from "../../config";
import { AppHeader } from "../../components/AppHeader/AppHeader";
import { BrandGauge } from "../../components/BrandGauge/BrandGauge";
import type { Course } from "../../types";
import styles from "./HomePage.module.css";

const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric" });

export function HomePage() {
  const { user } = useAuth();
  const { state, reload } = useCourses();

  if (!user) return null;

  return (
    <>
      <AppHeader />

      <main>
        <section className={styles.hero} aria-labelledby="level-title">
          <div className={styles.container}>
            <div className={styles.gauge}>
              <BrandGauge progress={0} label="Todavía no sumaste experiencia" />
            </div>

            <div>
              {/* TODO: calcular el nivel a partir de totalXp cuando definamos la tabla de niveles */}
              <h1 id="level-title" className={styles.level}>Nivel 1</h1>
              <p className={styles.xp}><strong>{user.totalXp} XP</strong></p>
              <p className={styles.lead}>
                Resolvé desafíos para sumar experiencia. Al subir de nivel ganás descuentos para tus próximos cursos.
              </p>
            </div>

            <aside className={styles.soon}>
              <h2 className={styles.soonTitle}>Los desafíos llegan pronto</h2>
              <p>
                Estamos preparando los desafíos de tus cursos. Mientras tanto, el material de cada curso ya está
                en Drive.
              </p>
            </aside>
          </div>
        </section>

        <section className={styles.block} aria-labelledby="courses-title">
          <div className={styles.container}>
            <h2 id="courses-title" className={styles.blockTitle}>Mis cursos</h2>

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
                  <CourseItem key={course.key} course={course} />
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className={styles.block} aria-labelledby="coupons-title">
          <div className={styles.container}>
            <h2 id="coupons-title" className={styles.blockTitle}>Mis cupones</h2>
            <div className={styles.emptyCoupon}>
              <strong>Todavía no tenés cupones</strong>
              Ganás el primero, del 10 %, al llegar al nivel 3.
            </div>
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

function CourseItem({ course }: { course: Course }) {
  return (
    <li className={styles.course}>
      <div>
        <h3 className={styles.courseName}>{course.name}</h3>
        <p className={styles.courseMeta}>
          Lo compraste el {dateFormat.format(new Date(course.purchasedAt))}. Los desafíos de este curso llegan pronto.
        </p>
      </div>
      {course.driveUrl ? (
        <a className={styles.secondary} href={course.driveUrl} target="_blank" rel="noopener noreferrer">
          Abrir material en Drive
        </a>
      ) : (
        <span className={styles.muted}>El material se habilita pronto</span>
      )}
    </li>
  );
}