import type { CSSProperties } from "react";
import styles from "./Avatar.module.css";

// Los marcos de la segunda tanda de la tienda. Mismo cuadro de 48 que los de Avatar.tsx
// (el avatar ocupa el centro, de radio 17): lo que se dibuja más afuera sobresale.
const C = 24;

const ring = (r: number, stroke: string, width: number, extra: Record<string, string | number> = {}) => (
  <circle cx={C} cy={C} r={r} fill="none" stroke={stroke} strokeWidth={width} {...extra} />
);

// Un grupo que gira: t es lo que tarda una vuelta; origin, el punto sobre el que gira
function Turn({ t, reverse, origin, children }: { t: number; reverse?: boolean; origin?: string; children: React.ReactNode }) {
  const style = { "--t": `${t}s`, "--dir": reverse ? "reverse" : "normal", "--o": origin } as CSSProperties;
  return (
    <g className={styles.turn} style={style}>
      {children}
    </g>
  );
}

// Una línea de puntos o rayas que corre sobre su círculo
const flow = (reverse = false, seconds = 5) => ({ className: styles.flow, style: { "--t": `${seconds}s`, "--dir": reverse ? "reverse" : "normal" } as CSSProperties });

export function ExtraFrame({ id }: { id: string }) {
  switch (id) {
    case "constellation": {
      // Ocho estrellas sobre el borde, las primeras seis unidas por una línea
      const angles = [-100, -60, -18, 28, 70, 118, 160, 205];
      const radii = [21, 22.5, 20.5, 22, 21, 23, 20.5, 22];
      const points = angles.map((a, i) => [C + Math.cos((a * Math.PI) / 180) * radii[i]!, C + Math.sin((a * Math.PI) / 180) * radii[i]!]);
      return (
        <svg className={styles.frame} viewBox="0 0 48 48">
          <polyline points={points.slice(0, 6).map((p) => p.join(",")).join(" ")} fill="none" stroke="#cfe3ff" strokeWidth="1" opacity=".55" />
          {points.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2.2 : 1.4} fill="#fff" />
          ))}
        </svg>
      );
    }
    case "pulsar":
      // Un anillo violeta y dos haces de luz, arriba y abajo
      return (
        <svg className={styles.frame} viewBox="0 0 48 48">
          {ring(20.5, "rgba(185,166,255,.5)", 1.2)}
          <g stroke="#b9a6ff" strokeLinecap="round" strokeWidth="1.6">
            <line x1="24" y1="-3" x2="24" y2="6" />
            <line x1="24" y1="42" x2="24" y2="51" />
          </g>
          <g stroke="#b9a6ff" strokeLinecap="round" strokeWidth="1" opacity=".5">
            <line x1="24" y1="-8" x2="24" y2="-5" />
            <line x1="24" y1="53" x2="24" y2="56" />
          </g>
        </svg>
      );
    case "belt":
      // Un anillo de asteroides que gira muy lento
      return (
        <svg className={styles.frame} viewBox="0 0 48 48">
          <Turn t={60}>
            {Array.from({ length: 26 }, (_, i) => {
              const a = (i * 2 * Math.PI) / 26;
              const r = 21.5 + (((i * 7) % 5) - 2) * 0.7;
              return <circle key={i} cx={C + Math.cos(a) * r} cy={C + Math.sin(a) * r} r={0.8 + ((i * 5) % 3) * 0.5} fill="#c9b79c" opacity={0.55 + (i % 3) * 0.15} />;
            })}
          </Turn>
        </svg>
      );
    case "double_orbit":
      // Dos órbitas con una luna cada una, que giran en sentidos opuestos
      return (
        <svg className={styles.frame} viewBox="0 0 48 48">
          {ring(19.5, "rgba(143,227,255,.45)", 1.1, { strokeDasharray: "2 3" })}
          {ring(23.2, "rgba(255,184,77,.4)", 1.1, { strokeDasharray: "1 3" })}
          <Turn t={12}>
            <circle cx={C} cy="4.5" r="2.2" fill="#dff6ff" />
          </Turn>
          <Turn t={18} reverse>
            <circle cx={C} cy="0.8" r="1.8" fill="#ffd98a" />
          </Turn>
        </svg>
      );
    case "phases":
      // Ocho lunas, de nueva a llena y de vuelta
      return (
        <svg className={styles.frame} viewBox="0 0 48 48">
          {[0, 0.3, 0.6, 0.85, 1, 0.85, 0.6, 0.3].map((fill, i) => {
            const a = (i * Math.PI) / 4 - Math.PI / 2;
            return <circle key={i} cx={C + Math.cos(a) * 22} cy={C + Math.sin(a) * 22} r="2.3" fill="#f4ecd8" fillOpacity={fill} stroke="#f4ecd8" strokeWidth=".9" strokeOpacity=".8" />;
          })}
        </svg>
      );
    case "supernova":
      // Rayos que giran y dos ondas de luz que se expanden y se apagan
      return (
        <svg className={styles.frame} viewBox="0 0 48 48">
          {ring(19.5, "#ffb84d", 1.5)}
          <Turn t={12}>
            {Array.from({ length: 16 }, (_, i) => {
              const a = (i * Math.PI) / 8;
              const r2 = i % 2 ? 24.5 : 27.5;
              return <line key={i} x1={C + Math.cos(a) * 22} y1={C + Math.sin(a) * 22} x2={C + Math.cos(a) * r2} y2={C + Math.sin(a) * r2} stroke="#ffd98a" strokeWidth="1.3" strokeLinecap="round" opacity=".8" />;
            })}
          </Turn>
          <circle className={styles.wave} cx={C} cy={C} r="20" fill="none" stroke="#ffd98a" strokeWidth="1.2" />
          <circle className={styles.wave} style={{ animationDelay: "1.5s" }} cx={C} cy={C} r="20" fill="none" stroke="#ffd98a" strokeWidth="1.2" />
        </svg>
      );
    case "black_hole":
      // El borde del agujero y un disco de materia inclinado, con dos corrientes que corren en sentidos opuestos
      return (
        <svg className={styles.frame} viewBox="0 0 48 48">
          {ring(19, "#fff", 1, { opacity: 0.55 })}
          <g transform={`rotate(-20 ${C} ${C})`}>
            <ellipse {...flow()} cx={C} cy={C} rx="29" ry="8.5" fill="none" stroke="#ff9a3d" strokeWidth="2" strokeDasharray="10 5 3 5" strokeLinecap="round" />
            <ellipse {...flow(true, 9)} cx={C} cy={C} rx="25" ry="6.2" fill="none" stroke="#ffd98a" strokeWidth="1" strokeDasharray="2 6" strokeLinecap="round" opacity=".8" />
          </g>
        </svg>
      );
    case "aurora_borealis":
      // Tres cintas de luz que corren y cambian de color
      return (
        <svg className={styles.frame} viewBox="0 0 48 48">
          <g className={styles.hue}>
            <circle {...flow()} cx={C} cy={C} r="20.5" fill="none" stroke="#3fe0a2" strokeWidth="2.4" strokeDasharray="16 6 9 5" strokeLinecap="round" />
            <circle {...flow(true, 9)} cx={C} cy={C} r="23.6" fill="none" stroke="#8fe3ff" strokeWidth="1.3" strokeDasharray="7 9" strokeLinecap="round" opacity=".75" />
            <circle {...flow()} cx={C} cy={C} r="17.8" fill="none" stroke="#b9a6ff" strokeWidth="1" strokeDasharray="3 8" strokeLinecap="round" opacity=".7" />
          </g>
        </svg>
      );
    case "solar_system":
      // Tres órbitas y tres planetas; el naranja tiene anillo y una luna
      return (
        <svg className={styles.frame} viewBox="0 0 48 48">
          {ring(19.5, "rgba(143,227,255,.3)", 0.8)}
          {ring(23, "rgba(255,184,77,.28)", 0.8)}
          {ring(26.5, "rgba(185,166,255,.25)", 0.8)}
          <Turn t={7}>
            <circle cx={C} cy="4.5" r="2.1" fill="#6fb8ff" />
          </Turn>
          <Turn t={13} reverse>
            <circle cx={C} cy="1" r="2.8" fill="#ffb84d" />
            <ellipse cx={C} cy="1" rx="5.2" ry="1.4" fill="none" stroke="#ffd98a" strokeWidth=".9" transform={`rotate(-20 ${C} 1)`} />
            <Turn t={3} origin="24px 1px">
              <circle cx={C} cy="-4" r="1" fill="#fff" />
            </Turn>
          </Turn>
          <Turn t={22}>
            <circle cx={C} cy="-2.5" r="1.7" fill="#b9a6ff" />
          </Turn>
        </svg>
      );
    case "galaxy": {
      // Dos brazos espirales de puntos que giran; las estrellas titilan a destiempo
      const arm = (offset: number, color: string) =>
        Array.from({ length: 14 }, (_, i) => {
          const t = i / 13;
          const a = offset + t * 2.7 * Math.PI;
          const r = 18 + t * 9;
          return <circle key={i} className={styles.twinkle} style={{ animationDelay: `${((i * 0.37) % 2).toFixed(2)}s` }} cx={C + Math.cos(a) * r} cy={C + Math.sin(a) * r} r={1.9 - t * 1.2} fill={color} />;
        });
      return (
        <svg className={styles.frame} viewBox="0 0 48 48">
          {ring(17.6, "rgba(185,166,255,.35)", 1)}
          <Turn t={24}>
            {arm(0, "#cdbfff")}
            {arm(Math.PI, "#9fe9ff")}
          </Turn>
        </svg>
      );
    }
    default:
      return null;
  }
}
