import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

// Un número que, cuando cambia, cuenta desde el que se mostraba hasta el nuevo, frenando al final
export function useAnimatedNumber(value: number, duration = 450) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(value);
  // El último número que se mostró: de ahí arranca la próxima cuenta, aunque la anterior no haya terminado
  const displayed = useRef(value);

  useEffect(() => {
    if (reduced) return;
    const from = displayed.current;
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const progress = Math.min(1, (now - start) / duration);
      displayed.current = Math.round(from + (value - from) * (1 - Math.pow(1 - progress, 3)));
      setShown(displayed.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced]);

  // Sin animaciones, el número cambia de golpe
  return reduced ? value : shown;
}
