import { useCountdown } from "../../hooks/useCountdown";
import styles from "./ExamPage.module.css";

const UNITS = ["días", "horas", "minutos", "segundos"];
const pad = (n: number) => String(n).padStart(2, "0");

// La cuenta regresiva grande, en vivo. Cuando llega a cero, llama a onDone
export function Countdown({ until, onDone }: { until: string; onDone?: () => void }) {
  const s = Math.floor(useCountdown(until, onDone) / 1000);
  const values = [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60];

  return (
    <div className={styles.count} role="timer" aria-live="off">
      {UNITS.map((unit, i) => (
        <div key={unit}>
          <b>{pad(values[i]!)}</b>
          <span>{unit}</span>
        </div>
      ))}
    </div>
  );
}
