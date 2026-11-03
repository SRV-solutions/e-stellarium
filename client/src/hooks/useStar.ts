import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { StarPlay } from "../types";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; play: StarPlay };

export function useStar(starId: string | undefined) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!starId) return;
    let cancelled = false;
    setState({ status: "loading" });

    api<StarPlay>(`/stars/${starId}`)
      .then((play) => !cancelled && setState({ status: "ready", play }))
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : "No pudimos cargar la estrella.";
        setState({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, [starId]);

  return state;
}