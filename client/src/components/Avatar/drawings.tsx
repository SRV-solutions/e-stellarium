import type { ReactNode } from "react";

// Los dibujos que se pueden elegir para el avatar. Las claves son las de api/src/lib/avatars.ts
// (la API rechaza cualquier otra). Cada uno se dibuja en un cuadro de 48 con el fondo de la noche.
const SKY = "#0e1b40";

const ART: Record<string, { art: ReactNode }> = {
  luna: {
    art: (
      <>
        <path d="M31 9a16 16 0 1 0 8 22 13 13 0 0 1-8-22z" fill="#dfe8ff" />
        <circle cx="21" cy="26" r="2.2" fill="#b7c4ea" />
        <circle cx="27" cy="33" r="1.5" fill="#b7c4ea" />
      </>
    ),
  },
  saturno: {
    art: (
      <>
        <ellipse cx="24" cy="25" rx="19" ry="5.5" transform="rotate(-18 24 25)" fill="none" stroke="#ffb84d" strokeWidth="2" />
        <circle cx="24" cy="24" r="9" fill="#ff9900" />
        <ellipse cx="24" cy="25" rx="19" ry="5.5" transform="rotate(-18 24 25)" fill="none" stroke="#ffd08a" strokeWidth="2" strokeDasharray="18 40" strokeDashoffset="-14" />
      </>
    ),
  },
  cometa: {
    art: (
      <>
        <path d="M8 40 30 18" stroke="#4fa3ff" strokeWidth="5" strokeLinecap="round" opacity=".35" />
        <path d="M13 36 30 19" stroke="#8fe3ff" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="32" cy="16" r="6" fill="#eef3ff" />
      </>
    ),
  },
  galaxia: {
    art: (
      <>
        <path d="M24 24c6-12 18-6 16 2M24 24c-6 12-18 6-16-2" stroke="#b9a6ff" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M24 24c-12-6-6-18 2-16M24 24c12 6 6 18-2 16" stroke="#4fa3ff" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".8" />
        <circle cx="24" cy="24" r="3.5" fill="#fff" />
      </>
    ),
  },
  sol: {
    art: (
      <>
        <path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.5 10.5l4.2 4.2M33.3 33.3l4.2 4.2M10.5 37.5l4.2-4.2M33.3 14.7l4.2-4.2" stroke="#ff9900" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="24" cy="24" r="9" fill="#ffb84d" />
      </>
    ),
  },
  marte: {
    art: (
      <>
        <circle cx="24" cy="24" r="14" fill="#ff7a6b" />
        <circle cx="19" cy="20" r="3" fill="#d85a4c" />
        <circle cx="29" cy="28" r="4" fill="#d85a4c" />
        <circle cx="26" cy="17" r="1.8" fill="#d85a4c" />
      </>
    ),
  },
  constelacion: {
    art: (
      <>
        <path d="M12 33 21 17 30 26 37 12" stroke="#4fa3ff" strokeWidth="1.6" fill="none" />
        <g fill="#eef3ff">
          <circle cx="12" cy="33" r="2.6" />
          <circle cx="21" cy="17" r="2.6" />
          <circle cx="30" cy="26" r="2.6" />
          <circle cx="37" cy="12" r="2.6" />
        </g>
      </>
    ),
  },
  nebulosa: {
    art: (
      <>
        <circle cx="19" cy="21" r="12" fill="#b9a6ff" opacity=".55" />
        <circle cx="29" cy="27" r="11" fill="#3fe0a2" opacity=".4" />
        <circle cx="24" cy="24" r="6" fill="#4fa3ff" opacity=".6" />
        <g fill="#fff">
          <circle cx="14" cy="34" r="1" />
          <circle cx="35" cy="14" r="1.2" />
          <circle cx="33" cy="36" r=".8" />
        </g>
      </>
    ),
  },
};

export function Drawing({ id, className }: { id: string; className?: string }) {
  const item = ART[id];
  if (!item) return null; // una clave que no conocemos: el avatar queda vacío (la API no deja guardarla)
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="24" fill={SKY} />
      {item.art}
    </svg>
  );
}
