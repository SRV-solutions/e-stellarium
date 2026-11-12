import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { seededRandom } from "../../lib/random";
import { figureFor, placeLetters, placeStars, type Box, type Layout, type LetterSpot, type Point } from "../../lib/figures";
import { useCountdown } from "../../hooks/useCountdown";
import { formatCountdown } from "../../lib/time";
import type { StarSummary } from "../../types";
import styles from "./StarMap.module.css";

type Status = "done" | "current" | "locked";

const STATUS_TEXT: Record<Status, string> = {
  done: "encendida",
  current: "lista para encender",
  locked: "bloqueada",
};

function statusOf(star: StarSummary): Status {
  if (star.completed) return "done";
  return star.unlocked ? "current" : "locked";
}

function makeDust(width: number, height: number) {
  const random = seededRandom(11);
  return Array.from({ length: 150 }, () => {
    const big = random() < 0.08;
    return {
      x: random() * width,
      y: random() * height,
      r: big ? 1.5 : 0.8,
      opacity: 0.2 + random() * 0.55,
      twinkle: big ? { duration: 3 + random() * 4, delay: random() * 3 } : null,
    };
  });
}

// Una línea recta de estrella a estrella, como en una carta celeste
const polyline = (points: Point[]) => points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

const RETICLE = 19; // el radio de la mira sobre una lección (sobre el examen es más grande)

type Props = {
  courseKey: string;
  stars: StarSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function StarMap({ courseKey, stars, selectedId, onSelect }: Props) {
  const tall = useMediaQuery("(max-width: 700px)");
  const layout: Layout = tall ? "tall" : "wide";
  const fontSize = tall ? 15 : 17;
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Las lecciones van sobre la figura; el examen, en su centro
  const lessons = useMemo(() => stars.filter((s) => s.kind === "lesson"), [stars]);
  const figure = useMemo(() => figureFor(courseKey, layout), [courseKey, layout]);
  const { width, height, center } = figure;
  const { spots, cut } = useMemo(() => placeStars(lessons.map((s) => s.module), figure), [lessons, figure]);
  const dust = useMemo(() => makeDust(width, height), [width, height]);
  const examStar = stars.find((s) => s.kind === "exam");

  const selected = stars.find((s) => s.id === selectedId);
  const aimIndex = selected ? lessons.indexOf(selected) : -1;

  // Las letras, sin pisarse entre ellas ni con la mira ni con el examen (su nombre y su cuenta van debajo).
  // La estrella apuntada no lleva letra suelta: la muestra la plaquita con su título
  const letterSpots = useMemo(() => {
    const blocked: Box[] = [];
    if (examStar) blocked.push({ x: center.x - 95, y: center.y - 45, w: 190, h: 160 });
    const aim = spots[aimIndex];
    if (aim) blocked.push({ x: aim.x - RETICLE - 7, y: aim.y - RETICLE - 7, w: 2 * (RETICLE + 7), h: 2 * (RETICLE + 7) });
    const letters = lessons.map((s, i) => (i === aimIndex ? "" : s.letter));
    return placeLetters(spots, letters, figure, fontSize, blocked);
  }, [spots, lessons, aimIndex, figure, fontSize, examStar, center]);

  // El área que responde al toque de cada estrella: la mitad de la distancia a la más cercana, así no se pisan
  const hitRadius = useMemo(() => {
    const gaps = spots.slice(1).map((p, i) => Math.hypot(p.x - spots[i]!.x, p.y - spots[i]!.y));
    return Math.max(12, Math.min(30, Math.min(...gaps, 60) / 2));
  }, [spots]);

  if (spots.length === 0) return null;

  const at = (star: StarSummary): Point => (star.kind === "exam" ? center : spots[lessons.indexOf(star)]!);
  // La línea encendida llega hasta la última lección abierta; el resto, de puntos
  const lastOpen = lessons.reduce((last, star, i) => (star.unlocked ? i : last), 0);
  const exam = examStar?.exam;

  // Un tramo de línea por trazo: entre los dos trazos de la figura no hay línea seguida, hay un salto de puntos
  const pieces = (from: number, to: number) => {
    if (to <= from) return [];
    if (cut > from && cut <= to) return [spots.slice(from, cut), spots.slice(cut, to + 1)];
    return [spots.slice(from, to + 1)];
  };
  const litPath = pieces(0, lastOpen).filter((p) => p.length > 1).map(polyline).join(" ");
  const futurePath = pieces(lastOpen, spots.length - 1).filter((p) => p.length > 1).map(polyline).join(" ");
  const tagStar = stars.find((s) => s.id === (hoverId ?? selectedId));
  const aim = selected ? at(selected) : null;
  const aimRadius = selected?.kind === "exam" ? 40 : RETICLE;

  return (
    <svg
      className={styles.map}
      viewBox={`0 0 ${width} ${height}`}
      role="group"
      aria-label={`Mapa de la constelación: ${figure.name}`}
    >
      <defs>
        <filter id="bloom" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="starGlow">
          <stop offset="0" stopColor="#d9e6ff" stopOpacity=".55" />
          <stop offset="1" stopColor="#d9e6ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="blueGlow">
          <stop offset="0" stopColor="#2b92ff" stopOpacity=".6" />
          <stop offset="1" stopColor="#2b92ff" stopOpacity="0" />
        </radialGradient>
        <filter id="bloomBig" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="goldGlow">
          <stop offset="0" stopColor="#fff2d6" stopOpacity=".7" />
          <stop offset=".4" stopColor="#ff9900" stopOpacity=".3" />
          <stop offset="1" stopColor="#ff9900" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="orangeGlow">
          <stop offset="0" stopColor="#ff9900" stopOpacity=".45" />
          <stop offset="1" stopColor="#ff9900" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id="litGrad"
          gradientUnits="userSpaceOnUse"
          x1={spots[0]!.x}
          y1={spots[0]!.y}
          x2={spots[lastOpen]!.x}
          y2={spots[lastOpen]!.y}
        >
          <stop offset="0" stopColor="#ffffff" />
          {/* El color del trazo que compró en la tienda (el azul, si no eligió otro) */}
          <stop offset="1" style={{ stopColor: "var(--trail)" }} />
        </linearGradient>
      </defs>

      <g className={styles.dust}>
        {dust.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={d.r}
            opacity={d.opacity}
            className={d.twinkle ? styles.twinkle : undefined}
            style={d.twinkle ? ({ "--t": `${d.twinkle.duration}s`, "--d": `${d.twinkle.delay}s` } as CSSProperties) : undefined}
          />
        ))}
      </g>

      {/* La silueta de la figura, de fondo */}
      {figure.strokes.map((line, i) => (
        <path key={i} className={styles.ghost} d={polyline(line)} strokeWidth={tall ? 30 : 40} />
      ))}

      {futurePath && <path className={styles.future} d={futurePath} />}
      {cut > 0 && (
        <path
          className={`${styles.jump} ${lastOpen >= cut ? styles.jumpLit : ""}`}
          d={polyline([spots[cut - 1]!, spots[cut]!])}
        />
      )}
      {exam && (
        <path
          className={`${styles.toExam} ${
            exam.status === "passed" ? styles.toExamLit : exam.status !== "locked" ? styles.toExamOn : ""
          }`}
          d={polyline([spots[spots.length - 1]!, center])}
        />
      )}
      {litPath && <path key={layout} className={styles.lit} d={litPath} pathLength={1} />}

      {lessons.map((star, i) => (
        <StarNode
          key={star.id}
          star={star}
          point={spots[i]!}
          letterSpot={letterSpots[i] ?? null}
          hitRadius={hitRadius}
          fontSize={fontSize}
          selected={star.id === selectedId}
          onSelect={() => onSelect(star.id)}
          onHover={(on) => setHoverId(on ? star.id : null)}
        />
      ))}
      {examStar && (
        <ExamNode
          star={examStar}
          point={center}
          fontSize={fontSize}
          selected={examStar.id === selectedId}
          onSelect={() => onSelect(examStar.id)}
        />
      )}

      {aim && (
        <g className={styles.reticle} style={{ transform: `translate(${aim.x}px, ${aim.y}px)` }}>
          <circle r={aimRadius} />
          <line x1={0} y1={-aimRadius - 7} x2={0} y2={-aimRadius - 2} />
          <line x1={0} y1={aimRadius + 2} x2={0} y2={aimRadius + 7} />
          <line x1={-aimRadius - 7} y1={0} x2={-aimRadius - 2} y2={0} />
          <line x1={aimRadius + 2} y1={0} x2={aimRadius + 7} y2={0} />
        </g>
      )}

      {/* El título de la estrella apuntada (o de la que está bajo el mouse), encima de todo. El examen ya lo tiene debajo */}
      {tagStar && tagStar.kind === "lesson" && (
        <TitleTag key={tagStar.id} star={tagStar} point={at(tagStar)} fontSize={fontSize} width={width} />
      )}
    </svg>
  );
}

// Una plaquita arriba de la estrella (abajo si no entra), que no se sale del cielo
function TitleTag({ star, point, fontSize, width }: { star: StarSummary; point: Point; fontSize: number; width: number }) {
  const text = useRef<SVGTextElement>(null);
  const [plate, setPlate] = useState<{ x: number; y: number; w: number; h: number; shift: number } | null>(null);
  const y = point.y - 40 < 20 ? point.y + 40 : point.y - 40;

  // Se mide el texto ya dibujado para saber de qué tamaño hacer la placa y cuánto correrla si se sale
  useLayoutEffect(() => {
    const b = text.current!.getBBox();
    const pad = 12;
    let shift = 0;
    if (b.x - pad < 4) shift = 4 - (b.x - pad);
    if (b.x + b.width + pad > width - 4) shift = width - 4 - (b.x + b.width + pad);
    setPlate({ x: b.x - pad, y: b.y - 6, w: b.width + 2 * pad, h: b.height + 12, shift });
  }, [point.x, point.y, width, fontSize]);

  return (
    <g
      className={styles.tag}
      style={{ opacity: plate ? 1 : 0 }}
      transform={plate ? `translate(${plate.shift} 0)` : undefined}
    >
      {plate && <rect className={styles.plate} x={plate.x} y={plate.y} width={plate.w} height={plate.h} rx={8} />}
      <text ref={text} x={point.x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize}>
        <tspan className={styles.greek}>{star.letter} </tspan>
        <tspan className={styles.name}>{star.title}</tspan>
      </text>
    </g>
  );
}

type NodeProps = {
  star: StarSummary;
  point: Point;
  letterSpot: LetterSpot | null;
  hitRadius: number;
  fontSize: number;
  selected: boolean;
  onSelect: () => void;
  onHover: (on: boolean) => void;
};

function StarNode({ star, point, letterSpot, hitRadius, fontSize, selected, onSelect, onHover }: NodeProps) {
  const status = statusOf(star);
  const { x, y } = point;

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  }

  return (
    <g
      className={`${styles.node} ${styles[status]}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${star.letter} ${star.title}, ${STATUS_TEXT[status]}`}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
    >
      <circle className={styles.hit} cx={x} cy={y} r={hitRadius} />
      {status !== "locked" && <circle className={styles.halo} cx={x} cy={y} r={26} />}

      {status === "done" && (
        <>
          <line className={styles.spike} x1={x - 16} y1={y} x2={x + 16} y2={y} />
          <line className={styles.spike} x1={x} y1={y - 16} x2={x} y2={y + 16} />
        </>
      )}

      {status === "current" && (
        <>
          <circle className={styles.pulse} cx={x} cy={y} r={9} />
          <circle className={styles.orbit} cx={x} cy={y} r={18} />
        </>
      )}

      <circle className={styles.core} cx={x} cy={y} r={status === "locked" ? 4.5 : status === "current" ? 7.5 : 6} />

      {letterSpot && (
        <text
          className={styles.letter}
          x={letterSpot.x}
          y={letterSpot.y}
          textAnchor={letterSpot.anchor}
          dominantBaseline="middle"
          fontSize={fontSize}
        >
          {star.letter}
        </text>
      )}
    </g>
  );
}

// La estrella de examen: más grande, con ocho rayos y un anillo de cúpula que se cierra mientras espera
type ExamView = "examLocked" | "examWaiting" | "examOpen" | "examRetry" | "examPassed";

const EXAM_VIEW: Record<NonNullable<StarSummary["exam"]>["status"], ExamView> = {
  locked: "examLocked",
  waiting: "examWaiting",
  open: "examOpen",
  in_progress: "examOpen",
  retry_wait: "examRetry",
  passed: "examPassed",
};

const EXAM_STATUS_TEXT: Record<ExamView, string> = {
  examLocked: "todavía cerrado",
  examWaiting: "se abre pronto",
  examOpen: "abierto",
  examRetry: "esperando otro intento",
  examPassed: "aprobado",
};

const DAY_MS = 24 * 60 * 60 * 1000;

type ExamProps = { star: StarSummary; point: Point; fontSize: number; selected: boolean; onSelect: () => void };

function ExamNode({ star, point, fontSize, selected, onSelect }: ExamProps) {
  const exam = star.exam!;
  const view = EXAM_VIEW[exam.status];
  const { x, y } = point;
  const letter = star.letter;

  // La espera: 3 días antes del primer intento, 2 antes de cada reintento
  const opensAt = exam.status === "waiting" || exam.status === "retry_wait" ? exam.opensAt : null;
  const left = useCountdown(opensAt);
  const total = (exam.status === "retry_wait" ? 2 : 3) * DAY_MS;
  const progress = Math.min(1, Math.max(0, 1 - left / total));

  // El nombre va debajo (el examen suele quedar arriba de todo) y la cuenta, debajo del nombre
  const sub = fontSize * 0.74;
  const nameY = y + 62;
  const infoY = nameY + fontSize * 1.4;
  let below;
  if (opensAt) {
    below = (
      <>
        <text className={styles.count} x={x} y={infoY} textAnchor="middle" fontSize={fontSize * 0.9}>
          {formatCountdown(left)}
        </text>
        <text className={styles.sub} x={x} y={infoY + sub * 1.4} textAnchor="middle" fontSize={sub}>
          {exam.status === "retry_wait" ? "para volver a intentar" : "para que se abra"}
        </text>
      </>
    );
  } else {
    const text =
      exam.status === "passed"
        ? `aprobado, ${exam.correctCount} de 10`
        : exam.status === "in_progress"
          ? "en curso"
          : exam.status === "open"
            ? "abierto"
            : "se abre después de las lecciones";
    const tone = exam.status === "passed" ? styles.subPassed : view === "examOpen" ? styles.subOpen : "";
    below = (
      <text className={`${styles.sub} ${tone}`} x={x} y={infoY} textAnchor="middle" fontSize={sub}>
        {text}
      </text>
    );
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  }

  return (
    <g
      className={`${styles.node} ${styles.exam} ${styles[view]}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${letter} ${star.title}, ${EXAM_STATUS_TEXT[view]}`}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <circle className={styles.hit} cx={x} cy={y} r={40} />
      <circle className={styles.halo} cx={x} cy={y} r={56} />

      {opensAt && (
        <>
          <circle className={styles.dome} cx={x} cy={y} r={40} />
          <circle
            className={styles.wait}
            cx={x}
            cy={y}
            r={40}
            pathLength={1}
            strokeDasharray={`${progress.toFixed(4)} 1`}
          />
        </>
      )}

      {view === "examOpen" && (
        <>
          <circle className={styles.beat} cx={x} cy={y} r={12} />
          <circle className={styles.sight} cx={x} cy={y} r={40} />
        </>
      )}

      {view === "examPassed" && (
        <>
          <line className={styles.spike} x1={x - 40} y1={y} x2={x + 40} y2={y} />
          <line className={styles.spike} x1={x} y1={y - 40} x2={x} y2={y + 40} />
        </>
      )}

      {Array.from({ length: 8 }, (_, k) => {
        const angle = (k * Math.PI) / 4;
        const outer = k % 2 ? 22 : 30;
        return (
          <line
            key={k}
            className={styles.ray}
            x1={x + Math.cos(angle) * 15}
            y1={y + Math.sin(angle) * 15}
            x2={x + Math.cos(angle) * outer}
            y2={y + Math.sin(angle) * outer}
          />
        );
      })}

      <circle className={styles.core} cx={x} cy={y} r={10} />

      <text x={x} y={nameY} textAnchor="middle" fontSize={fontSize}>
        <tspan className={styles.greek}>{letter} </tspan>
        <tspan className={styles.name}>{star.title}</tspan>
      </text>
      {below}
    </g>
  );
}
