import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Constellation } from "../types";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; constellations: Constellation[] };

function fetchConstellations() {
  return api<{ constellations: Constellation[] }>("/constellations").then((d) => d.constellations);
}

export function useConstellations() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchConstellations()
      .then((constellations) => !cancelled && setState({ status: "ready", constellations }))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    fetchConstellations()
      .then((constellations) => setState({ status: "ready", constellations }))
      .catch(() => setState({ status: "error" }));
  }, []);

  return { state, reload };
}