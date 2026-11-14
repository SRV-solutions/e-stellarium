import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { can } from "../lib/permissions";
import type { Permission } from "../types";
import { useAuth } from "./useAuth";

type Props = {
  children: ReactNode;
  anyOf?: Permission[]; // para las pantallas del panel: hace falta al menos uno de estos permisos
};

export function ProtectedRoute({ children, anyOf }: Props) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (anyOf && !anyOf.some((p) => can(user, p))) return <Navigate to="/" replace />;
  return children;
}
