import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Course } from "../types";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; courses: Course[] };

function fetchCourses() {
  return api<{ courses: Course[] }>("/courses").then((d) => d.courses);
}

export function useCourses() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchCourses()
      .then((courses) => !cancelled && setState({ status: "ready", courses }))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    fetchCourses()
      .then((courses) => setState({ status: "ready", courses }))
      .catch(() => setState({ status: "error" }));
  }, []);

  return { state, reload };
}