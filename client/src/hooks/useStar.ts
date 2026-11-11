import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { StarPlay } from "../types";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; play: StarPlay };

// Lo que respondió la API, anotado con la estrella que se pidió
type Loaded = Exclude<State, { status: "loading" }> & { starId: string };

export function useStar(starId: string | undefined) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!starId) return;
    let cancelled = false;

    api<StarPlay>(`/stars/${starId}`)
      .then((play) => !cancelled && setLoaded({ starId, status: "ready", play }))
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : "No pudimos cargar la estrella.";
        setLoaded({ starId, status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, [starId]);

  // Si lo guardado es de otra estrella (pasó a la siguiente), todavía está cargando la nueva
  if (!loaded || loaded.starId !== starId) return { status: "loading" } as State;
  return loaded as State;
}