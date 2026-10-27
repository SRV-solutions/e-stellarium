import type { CSSProperties } from "react";
import styles from "./BrandGauge.module.css";

const ARC_LENGTH = 377; // largo del arco de 3/4 de círculo, con radio 80
const ARC_PATH = "M100 20 A80 80 0 1 0 180 100";

type Props = {
  progress?: number; // de 0 a 1; sin valor, hace la animación del logo
  label?: string;    // texto para lectores de pantalla, si el medidor informa algo
  className?: string;
};

export function BrandGauge({ progress, label, className }: Props) {
  const isBrand = progress === undefined;
  const value = isBrand ? 1 : Math.min(Math.max(progress, 0), 1);

  const style = {
    "--gauge-offset": ARC_LENGTH * (1 - value),
    "--needle-to": `${-270 * value}deg`,
  } as CSSProperties;

  const classes = [styles.gauge, isBrand ? styles.brand : "", className ?? ""].join(" ");

  return (
    <svg
      viewBox="0 0 200 200"
      className={classes}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={ARC_PATH} className={styles.track} />
      <path d={ARC_PATH} className={styles.fill} />
      <g className={styles.needle}>
        <path d="M100 112 L96 62 L91 46 L100 24 L109 46 L104 62 Z" />
      </g>
      <circle cx="100" cy="100" r="7" className={styles.pivot} />
    </svg>
  );
}