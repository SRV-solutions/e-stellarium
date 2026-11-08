import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import styles from "./Cosmos.module.css";

// Cada cuánto pasa una estrella fugaz: un tiempo al azar entre estos dos (ms)
const METEOR_MIN = 4000;
const METEOR_MAX = 10000;

// Una estrella fugaz: cruza en diagonal hacia abajo a la izquierda y se borra al terminar
function launchMeteor(sky: HTMLElement) {
  const meteor = document.createElement("i");
  meteor.className = styles.meteor!;
  const x = window.innerWidth * (0.35 + Math.random() * 0.65);
  const y = window.innerHeight * Math.random() * 0.45;
  meteor.style.left = `${x}px`;
  meteor.style.top = `${y}px`;
  sky.appendChild(meteor);

  const angle = 150 + Math.random() * 20;
  const radians = (angle * Math.PI) / 180;
  const distance = 380 + Math.random() * 260;
  meteor
    .animate(
      [
        { transform: `rotate(${angle}deg) scaleX(0.2)`, opacity: 0 },
        { opacity: 1, offset: 0.15 },
        {
          transform: `translate(${Math.cos(radians) * distance}px, ${Math.sin(radians) * distance}px) rotate(${angle}deg) scaleX(1)`,
          opacity: 0,
        },
      ],
      { duration: 900 + Math.random() * 500, easing: "cubic-bezier(0.3, 0, 0.6, 1)" },
    )
    .finished.finally(() => meteor.remove());
}

// El fondo del espacio: fijo detrás de toda la página, con estrellas que se desplazan despacio
// (parece que viajamos) y alguna estrella fugaz de vez en cuando
export function Cosmos() {
  const sky = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(() => {
        // Si la pestaña no está a la vista, no gastamos nada
        if (sky.current && !document.hidden) launchMeteor(sky.current);
        next();
      }, METEOR_MIN + Math.random() * (METEOR_MAX - METEOR_MIN));
    };
    next();
    return () => window.clearTimeout(timer);
  }, [reduced]);

  return (
    <div ref={sky} className={styles.cosmos} aria-hidden="true">
      <div className={`${styles.drift} ${styles.far}`} />
      <div className={`${styles.drift} ${styles.near}`} />
    </div>
  );
}
