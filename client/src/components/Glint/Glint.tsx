// El destello, la moneda de la tienda: una chispa de cuatro puntas. Toma el color de --glint
// y el tamaño del texto (1em), salvo que la clase diga otra cosa
export function Glint({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-12 -12 24 24"
      aria-hidden="true"
      className={className}
      style={{ width: "1em", height: "1em", fill: "var(--glint)", flexShrink: 0 }}
    >
      <path d="M0 -11 C1 -3 3 -1 11 0 C3 1 1 3 0 11 C-1 3 -3 1 -11 0 C-3 -1 -1 -3 0 -11 Z" />
    </svg>
  );
}
