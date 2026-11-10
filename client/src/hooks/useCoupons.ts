import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { CouponSummary } from "../types";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; coupons: CouponSummary[] };

export function useCoupons() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    api<{ coupons: CouponSummary[] }>("/coupons")
      .then((d) => !cancelled && setState({ status: "ready", coupons: d.coupons }))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
