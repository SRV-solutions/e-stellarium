import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

export type NotificationKind =
  | "courses"
  | "coupon"
  | "coupon_expiring"
  | "streak_risk"
  | "badge"
  | "challenge"
  | "content_review"
  | "content_approved"
  | "content_rejected"
  | "challenge_bank_low"
  | "integrity_fail";

export type Notice = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  emailSent: boolean;
  createdAt: string;
  readAt: string | null;
};

// Cada cuánto se pregunta la cantidad de no leídas mientras la pestaña está a la vista
const POLL_MS = 60_000;

// Toda la campanita pasa por acá: si algún día hiciera falta tiempo real (WebSockets), se cambia
// el interior de este hook y nada más.
// - Pregunta cuántas hay sin leer al cargar, al volver a la pestaña y cada un minuto (solo si se ve).
// - `open()` trae las últimas y las marca como leídas en la API. Las que eran nuevas quedan en
//   `fresh` hasta que se cierra, para que se sepa cuáles eran.
export function useNotifications() {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notice[] | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);

  // Pregunta cuántas hay sin leer. Si no hay red o sesión, se queda con el número que tenía y prueba
  // en el próximo minuto. Nunca hay dos pedidos a la vez
  useEffect(() => {
    let timer: number | undefined;
    let cancelled = false;
    let pending = false;
    const refresh = () => {
      if (pending) return;
      pending = true;
      api<{ count: number }>("/notifications/unread-count")
        .then((d) => !cancelled && setCount(d.count))
        .catch(() => {})
        .finally(() => (pending = false));
    };
    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(refresh, POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
        start();
      } else {
        window.clearInterval(timer); // con la pestaña escondida no pregunta
      }
    };
    refresh();
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const open = useCallback(async () => {
    setError(false);
    try {
      const data = await api<{ items: Notice[]; unread: number }>("/notifications");
      const unread = data.items.filter((n) => !n.readAt).map((n) => n.id);
      setItems(data.items);
      setFresh(new Set(unread));
      setCount(data.unread);
      if (unread.length > 0) {
        // Solo las que se ven: una que llegue mientras tanto sigue sin leer
        const { unread: left } = await api<{ unread: number }>("/notifications/read", {
          method: "POST",
          body: JSON.stringify({ ids: unread }),
        });
        setCount(left);
      }
    } catch {
      setError(true);
    }
  }, []);

  const close = useCallback(() => setFresh(new Set()), []);

  return { count, items, fresh, error, open, close };
}
