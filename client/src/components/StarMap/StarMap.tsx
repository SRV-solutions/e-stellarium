import { useMemo, type CSSProperties, type KeyboardEvent } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { seededRandom } from "../../lib/random";
import { SKY, greekLetter, serpentPoints, smoothPath, type Layout, type Point } from "../../lib/sky";
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

  const lastOpen = stars.reduce((last, star, i) => (star.unlocked ? i : last), 0);
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
      <path className={styles.future} d={smoothPath(points.slice(lastOpen))} />
      {lastOpen > 0 && (
        <path key={layout} className={styles.lit} d={smoothPath(points.slice(0, lastOpen + 1))} pathLength={1} />
      )}

      {stars.map((star, i) => (
        <StarNode
          key={star.id}
          star={star}
          index={i}
          point={points[i]!}
          label={labelPosition(layout, points[i]!, i, star.kind === "exam", width)}
          fontSize={fontSize}
          selected={star.id === selectedId}
          onSelect={() => onSelect(star.id)}
        />
      ))}

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