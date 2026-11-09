import { useMemo, type CSSProperties, type KeyboardEvent } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { seededRandom } from "../../lib/random";
import { SKY, greekLetter, segmentPath, serpentPoints, smoothPath, type Layout, type Point } from "../../lib/sky";
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

function labelPosition(layout: Layout, point: Point, index: number, exam: boolean, width: number) {
  if (exam) return { x: point.x, y: point.y - 44, anchor: "middle" as const };
  if (layout === "wide") {
    return { x: point.x, y: index % 2 ? point.y - 44 : point.y + 56, anchor: "middle" as const };
  }
  const left = point.x > width / 2;
  return { x: point.x + (left ? -44 : 44), y: point.y + 6, anchor: left ? ("end" as const) : ("start" as const) };
}

type Props = {
  stars: StarSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function StarMap({ stars, selectedId, onSelect }: Props) {
  const tall = useMediaQuery("(max-width: 700px)");
  const layout: Layout = tall ? "tall" : "wide";
  const { width, height, fontSize } = SKY[layout];

  const points = useMemo(() => serpentPoints(stars.length, layout), [stars.length, layout]);
  const dust = useMemo(() => makeDust(width, height), [width, height]);

  // El examen va al final; la línea encendida recorre solo las lecciones
  const lessonCount = stars.filter((s) => s.kind === "lesson").length;
  const exam = stars.find((s) => s.kind === "exam")?.exam;
  const lastOpen = stars.reduce((last, star, i) => (star.kind === "lesson" && star.unlocked ? i : last), 0);
  const aim = points[stars.findIndex((s) => s.id === selectedId)];

  if (points.length === 0) return null;

  return (
    <svg className={styles.map} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Mapa de la constelación">
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
          x1={points[0]!.x}
          y1={points[0]!.y}
          x2={points[lastOpen]!.x}
          y2={points[lastOpen]!.y}
        >
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#5aa9ff" />
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

      <path className={styles.ghost} d={smoothPath(points)} strokeWidth={tall ? 38 : 46} />
      <path className={styles.future} d={smoothPath(points.slice(lastOpen, lessonCount))} />
      {exam && lessonCount > 0 && (
        <path
          className={`${styles.toExam} ${
            exam.status === "passed" ? styles.toExamLit : exam.status !== "locked" ? styles.toExamOn : ""
          }`}
          d={segmentPath(points, lessonCount - 1)}
        />
      )}
      {lastOpen > 0 && (
        <path key={layout} className={styles.lit} d={smoothPath(points.slice(0, lastOpen + 1))} pathLength={1} />
      )}

      {stars.map((star, i) => {
        const Node = star.exam ? ExamNode : StarNode;
        return (
          <Node
            key={star.id}
            star={star}
            index={i}
            point={points[i]!}
            label={labelPosition(layout, points[i]!, i, star.kind === "exam", width)}
            fontSize={fontSize}
            selected={star.id === selectedId}
            onSelect={() => onSelect(star.id)}
          />
        );
      })}

      {aim && (
        <g className={styles.reticle} style={{ transform: `translate(${aim.x}px, ${aim.y}px)` }}>
          <circle r={30} />
          <line x1={0} y1={-40} x2={0} y2={-33} />
          <line x1={0} y1={33} x2={0} y2={40} />
          <line x1={-40} y1={0} x2={-33} y2={0} />
          <line x1={33} y1={0} x2={40} y2={0} />
        </g>
      )}
    </svg>
  );
}

type NodeProps = {
  star: StarSummary;
  index: number;
  point: Point;
  label: { x: number; y: number; anchor: "start" | "middle" | "end" };
  fontSize: number;
  selected: boolean;
  onSelect: () => void;
};

function StarNode({ star, index, point, label, fontSize, selected, onSelect }: NodeProps) {
  const status = statusOf(star);
  const exam = star.kind === "exam";
  const { x, y } = point;
  const letter = greekLetter(index);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  }

  return (
    <g
      className={`${styles.node} ${styles[status]} ${exam ? styles.exam : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${letter} ${star.title}, ${STATUS_TEXT[status]}`}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <circle className={styles.hit} cx={x} cy={y} r={34} />
      {(status !== "locked" || exam) && <circle className={styles.halo} cx={x} cy={y} r={exam ? 48 : 34} />}

      {status === "done" && (
        <>
          <line className={styles.spike} x1={x - 22} y1={y} x2={x + 22} y2={y} />
          <line className={styles.spike} x1={x} y1={y - 22} x2={x} y2={y + 22} />
        </>
      )}

      {status === "current" && (
        <>
          <circle className={styles.pulse} cx={x} cy={y} r={11} />
          <circle className={styles.orbit} cx={x} cy={y} r={22} />
        </>
      )}

      {exam &&
        Array.from({ length: 8 }, (_, k) => {
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

      <circle className={styles.core} cx={x} cy={y} r={exam ? 10 : status === "locked" ? 5.5 : status === "current" ? 9 : 7} />

      <text x={label.x} y={label.y} textAnchor={label.anchor} fontSize={fontSize}>
        <tspan className={styles.greek}>{letter} </tspan>
        <tspan className={styles.name}>{star.title}</tspan>
      </text>
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

function ExamNode({ star, index, point, fontSize, selected, onSelect }: NodeProps) {
  const exam = star.exam!;
  const view = EXAM_VIEW[exam.status];
  const { x, y } = point;
  const letter = greekLetter(index);

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
