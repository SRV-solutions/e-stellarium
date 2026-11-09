import { useEffect, useRef, useState } from "react";

// Los milisegundos que faltan hasta `target`, actualizados cada segundo.
// Cuando llega a cero, llama una vez a `onDone`.
export function useCountdown(target: string | Date | null | undefined, onDone?: () => void) {
  const end = target ? new Date(target).getTime() : null;
  const [now, setNow] = useState(() => Date.now());
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (end === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= end) {
        clearInterval(id);
        done.current?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [end]);

  return end === null ? 0 : Math.max(0, end - now);
}
