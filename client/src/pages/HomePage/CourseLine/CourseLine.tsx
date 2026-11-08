import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { StarGlyph, StarGlyphDefs, type GlyphState } from "../../../components/StarGlyph/StarGlyph";
import { greekLetter } from "../../../lib/sky";
import type { Constellation, Course } from "../../../types";
import styles from "./CourseLine.module.css";

type Props = {
  course: Course;
  constellation?: Constellation; // si el curso todavía no tiene constelación, no viene
};

const HEIGHT = 76;
const GAP = 84; // la separación máxima entre estrellas: con pocas, la línea no se estira de más

// Un curso: su nombre, cuánto lleva, el material y su constelación estirada a lo ancho
export function CourseLine({ course, constellation }: Props) {
  const stars = constellation?.stars ?? [];
  const n = stars.length;
  const lit = stars.filter((s) => s.completed).length;
  const next = stars.findIndex((s) => s.kind === "lesson" && s.unlocked && !s.completed);
  const href = `/constellations/${course.key}`;

  // El ancho real, para dibujar en píxeles: así las estrellas no se deforman.
  // El recuadro aparece recién cuando llega la constelación, así que el observador se conecta en ese momento
  const hasTrack = !!constellation && n > 0;
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasTrack]);

  const points = stars.map((_, i) => ({
    x: n === 1 ? 14 : 14 + (i * (width - 28)) / (n - 1),
    y: 38 + 16 * Math.sin(i * 0.9),
  }));
  // Si quedan muy juntas (muchas estrellas o pantalla angosta), cada estrella se dibuja más chica
  const spacing = n > 1 ? (width - 28) / (n - 1) : GAP;
  const scale = Math.max(0.45, Math.min(0.85, spacing / 40));
  const glyph = (i: number): GlyphState => (stars[i]!.completed ? "lit" : i === next ? "aim" : "off");

  let meta;
  if (!constellation) meta = "Su constelación se abre pronto";
  else if (n > 0 && lit === n) meta = <>
      <b>{lit}</b> de {n} estrellas encendidas. <span className={styles.next}>La encendiste entera</span>
    </>;
  else
    meta = (
      <>
        <b>{lit}</b> de {n} estrellas encendidas
        {next !== -1 && (
          <>
            . <span className={styles.next}>Tu próxima estrella es {greekLetter(next)}</span>
          </>
        )}
      </>
    );

  return (
    <li className={styles.line}>
      <div className={styles.head}>
        <div>
          {constellation ? (
            <Link to={href} className={styles.title}>
              {course.name}
            </Link>
          ) : (
            <span className={styles.title}>{course.name}</span>
          )}
          <p className={styles.meta}>{meta}</p>
        </div>

        {course.driveUrl ? (
          <a className={styles.rocket} href={course.driveUrl} target="_blank" rel="noopener noreferrer" title="Se abre en Google Drive">
            <svg className={styles.ship} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14.5 4.2c2.6-1.1 4.6-1.2 5.3-.5.7.7.6 2.7-.5 5.3-1.2 2.7-3.6 5.4-6.6 7.2l-3.6-3.6c1.8-3 4.5-5.3 7.4-6.4z" />
              <path d="M9.1 12.6 6.3 12l-2 1.9 3.3 1.1M11.4 14.9l.6 2.8-1.9 2-1.1-3.3" />
              <path d="M15.2 8.8h.01" />
              {/* La estela: aparece cuando el cohete sale */}
              <circle cx="5.6" cy="18.4" r="1.1" />
              <circle cx="3.6" cy="20.4" r="0.85" />
              <circle cx="1.9" cy="22.1" r="0.6" />
            </svg>
            Material en Drive
          </a>
        ) : (
          <span className={styles.soon}>El material se habilita pronto</span>
        )}
      </div>

      {hasTrack && (
        // El dibujo también lleva a la constelación. Para el teclado y los lectores ya está el título
        <Link to={href} className={styles.trackLink} tabIndex={-1} aria-hidden="true">
          <div ref={box} className={styles.track} style={{ maxWidth: Math.max(1, n - 1) * GAP + 28 }}>
            {width > 0 && (
              <svg viewBox={`0 0 ${width} ${HEIGHT}`}>
                <StarGlyphDefs />
                <polyline className={styles.band} points={points.map((p) => `${p.x},${p.y}`).join(" ")} />
                {points.slice(1).map((p, i) => (
                  <line
                    key={i}
                    className={stars[i]!.completed && stars[i + 1]!.completed ? styles.segmentOn : styles.segment}
                    x1={points[i]!.x}
                    y1={points[i]!.y}
                    x2={p.x}
                    y2={p.y}
                  />
                ))}
                {points.map((p, i) => (
                  <StarGlyph key={i} x={p.x} y={p.y} state={glyph(i)} scale={i === next ? Math.max(scale, 0.7) : scale} />
                ))}
                {next !== -1 && (
                  <circle className={styles.scope} cx={points[next]!.x} cy={points[next]!.y} r={Math.max(scale, 0.7) * 18} />
                )}
              </svg>
            )}
          </div>
        </Link>
      )}
    </li>
  );
}
