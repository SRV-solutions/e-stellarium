import styles from "./effects.module.css";

// Efectos de un instante (partículas, la chispa del acierto). No pasan por React: se crean
// sobre la página, se animan con element.animate() y se borran solos al terminar

export type Point = { x: number; y: number };

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// El centro de un elemento en la pantalla
export function centerOf(element: Element): Point {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

// Un elemento nuevo, encima de todo, en ese punto
function place(className: string, at: Point) {
  const element = document.createElement("i");
  element.className = className;
  element.setAttribute("aria-hidden", "true");
  element.style.left = `${at.x}px`;
  element.style.top = `${at.y}px`;
  document.body.appendChild(element);
  return element;
}

// Un estallido de partículas que salen en círculo desde un punto
export function burst(at: Point, color = "#ffffff", count = 14) {
  if (reducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const bit = place(styles.bit!, at);
    bit.style.background = color;
    // Repartidas en círculo, con un poco de azar en el ángulo y la distancia
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const distance = 40 + Math.random() * 50;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    bit
      .animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0 },
        ],
        { duration: 650 + Math.random() * 300, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" },
      )
      .finished.finally(() => bit.remove());
  }
}

// Una chispa que viaja en curva de un punto a otro. Al llegar, llama a onArrive
export function travel(from: Point, to: Point, onArrive: () => void) {
  if (reducedMotion()) {
    onArrive();
    return;
  }
  const spark = place(styles.spark!, from);
  // El punto intermedio: un poco a la derecha y más arriba que los dos extremos, para que haga un arco
  const middle = { x: (from.x + to.x) / 2 + 60, y: Math.min(from.y, to.y) - 40 };
  spark
    .animate(
      [
        { left: `${from.x}px`, top: `${from.y}px`, transform: "scale(0.6)" },
        { left: `${middle.x}px`, top: `${middle.y}px`, transform: "scale(1.3)", offset: 0.5 },
        { left: `${to.x}px`, top: `${to.y}px`, transform: "scale(0.8)" },
      ],
      { duration: 700, easing: "cubic-bezier(0.5, 0, 0.3, 1)" },
    )
    .finished.finally(() => {
      spark.remove();
      onArrive();
    });
}
