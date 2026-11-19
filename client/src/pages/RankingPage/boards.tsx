import type { ReactNode } from "react";
import type { RankingBoardId, RankingPeriod } from "../../types";

// Las seis tablas: su nombre, para qué sirve, su dibujo y la unidad de cada valor.
// Los dibujos son los mismos que usa el resto de la app (la estrella, la insignia, el cometa, la mira, el destello).
export type BoardInfo = {
  id: RankingBoardId;
  name: string;
  desc: string; // una línea en el índice
  sub: string; // lo que explica el tablero
  unit: string;
  one?: string; // la unidad en singular (1 día)
  icon: ReactNode;
  empty: string; // cuando todavía no hay nadie
  periods: RankingPeriod[]; // los períodos que acepta (el primero es el de entrada); vacío = no depende del período
};

export const BOARDS: BoardInfo[] = [
  {
    id: "xp",
    periods: ["week", "season", "all"],
    name: "Experiencia",
    desc: "Todo lo que sumaste jugando",
    sub: "Suma todo lo que jugás: estrellas, repaso y desafíos.",
    unit: "XP",
    empty: "Todavía nadie sumó experiencia. Cualquier acierto te pone en el cielo.",
    icon: (
      <svg viewBox="-20 -18 40 36">
        <circle r="13" fill="#ffc94a" opacity=".2" />
        <path fill="#ffc94a" d="M0 -15 L1.4 -1.4 L15 0 L1.4 1.4 L0 15 L-1.4 1.4 L-15 0 L-1.4 -1.4 Z" />
        <circle r="4.5" fill="#fff1c2" />
      </svg>
    ),
  },
  {
    id: "best_streak",
    periods: [],
    name: "Mejor racha",
    desc: "La más larga de siempre",
    sub: "Los días seguidos más largos que logró cada uno, siga o no en racha.",
    unit: "días",
    one: "día",
    empty: "Todavía nadie tiene racha. Jugá hoy y empezá la tuya.",
    icon: (
      <svg viewBox="-32 -32 64 64">
        <circle r="27" fill="none" stroke="var(--line)" strokeWidth="3.5" />
        <circle r="27" fill="none" stroke="#dff6ff" strokeWidth="3.5" />
        <path d="M2 -2 Q -10 4 -19 11" fill="none" stroke="#dff6ff" strokeWidth="2.4" strokeLinecap="round" opacity=".8" />
        <path d="M-1 2 Q -10 7 -19 13" fill="none" stroke="#dff6ff" strokeWidth="1.8" strokeLinecap="round" opacity=".5" />
        <circle cx="5" cy="-5" r="6" fill="#dff6ff" />
      </svg>
    ),
  },
  {
    id: "streak",
    periods: [],
    name: "Racha vigente",
    desc: "Los que vienen en llamas",
    sub: "Quiénes llevan hoy más días seguidos. Si se corta, vuelve a empezar.",
    unit: "días",
    one: "día",
    empty: "Hoy nadie tiene una racha en marcha. Jugá y encendé la tuya.",
    icon: (
      <svg viewBox="0 0 30 20" style={{ width: 30 }}>
        <path d="M25 8 Q14 8 3 14" fill="none" stroke="#bcd8ff" strokeWidth="3" strokeLinecap="round" opacity=".6" />
        <circle cx="11" cy="10.5" r="1.3" fill="#e6f0ff" />
        <circle cx="17" cy="9.2" r="1.5" fill="#e6f0ff" />
        <circle cx="25" cy="8" r="3.4" fill="#fff" />
      </svg>
    ),
  },
  {
    id: "stars",
    periods: ["season", "all"],
    name: "Estrellas",
    desc: "Lecciones encendidas",
    sub: "Cuántas estrellas encendió cada uno en todos sus cursos.",
    unit: "estrellas",
    one: "estrella",
    empty: "Todavía nadie encendió una estrella.",
    icon: (
      <svg viewBox="-20 -18 40 36">
        <path fill="#fff" opacity=".9" d="M0 -9 L1.4 -1.4 L9 0 L1.4 1.4 L0 9 L-1.4 1.4 L-9 0 L-1.4 -1.4 Z" />
        <circle r="3.2" fill="#fff" />
        <circle cx="-14" cy="9" r="2" fill="#fff" opacity=".5" />
        <circle cx="13" cy="-10" r="1.6" fill="#fff" opacity=".5" />
      </svg>
    ),
  },
  {
    id: "challenges",
    periods: ["season", "all"],
    name: "Desafíos",
    desc: "Los que salieron sin errores",
    sub: "Desafíos completados con las 10 preguntas bien.",
    unit: "perfectos",
    one: "perfecto",
    empty: "Todavía nadie completó un desafío sin errores.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" />
      </svg>
    ),
  },
  {
    id: "glints",
    periods: ["season", "all"],
    name: "Destellos",
    desc: "Los que más juntaron",
    sub: "Todos los destellos que consiguió cada uno, aunque ya los haya gastado en la tienda.",
    unit: "destellos",
    one: "destello",
    empty: "Todavía nadie consiguió destellos.",
    icon: (
      <svg viewBox="-12 -12 24 24">
        <path fill="#8fe3ff" d="M0 -11 C1 -3 3 -1 11 0 C3 1 1 3 0 11 C-1 3 -3 1 -11 0 C-3 -1 -1 -3 0 -11 Z" />
      </svg>
    ),
  },
];
