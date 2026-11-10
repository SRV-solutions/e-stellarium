import { useEffect, useState } from "react";
import styles from "./ExamPage.module.css";

const RIBS = [-50, -25, 25, 50];

// La cúpula del observatorio: cerrada mientras espera. Cuando se abre, las compuertas se corren
// y el telescopio asoma por la ranura (la animación arranca un instante después de aparecer)
export function Dome({ open }: { open: boolean }) {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setOpened(true)));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <div className={`${styles.dome} ${open && opened ? styles.domeOpen : ""}`} aria-hidden="true">
      <svg viewBox="0 -20 240 210">
        <defs>
          <filter id="dome-bloom" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle className={styles.target} cx="133" cy="-6" r="4" />
        <path className={styles.shell} d="M30 128 A90 90 0 0 1 210 128 Z" />
        {RIBS.map((x) => (
          <path key={x} className={styles.rib} d={`M${120 + x} 128 Q ${120 + x * 0.55} 40 120 28`} />
        ))}
        <path className={styles.slitSky} d="M105 128 L105 44 Q120 36 135 44 L135 128 Z" />
        <circle className={styles.slitStar} cx="110" cy="70" r="1" />
        <circle className={styles.slitStar} cx="131" cy="96" r="1.2" />
        <circle className={styles.slitStar} cx="109" cy="112" r="0.9" />
        <g className={styles.scope}>
          <rect className={styles.tube} x="115" y="22" width="10" height="102" rx="3" />
          <rect className={styles.lens} x="113" y="16" width="14" height="9" rx="2" />
        </g>
        <path className={`${styles.shutter} ${styles.shutterL}`} d="M105 128 L105 44 Q112 40 120 38 L120 128 Z" />
        <path className={`${styles.shutter} ${styles.shutterR}`} d="M135 128 L135 44 Q128 40 120 38 L120 128 Z" />
        <rect className={styles.base} x="22" y="128" width="196" height="46" rx="4" />
        <rect className={styles.rib} x="104" y="146" width="32" height="28" rx="2" />
      </svg>
    </div>
  );
}
