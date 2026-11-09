const pad = (n: number) => String(n).padStart(2, "0");

// Una cuenta regresiva: "2d 06:14:37", o "06:14:37" si falta menos de un día
export function formatCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(s / 86400);
  const clock = `${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

// "el miércoles 11 de noviembre a las 18:40"
export function formatMoment(date: Date) {
  const day = date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const time = date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `el ${day.replace(",", "")} a las ${time}`;
}
