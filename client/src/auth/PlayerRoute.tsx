import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useCourses } from "../hooks/useCourses";
import { adminSectionsFor } from "../lib/permissions";
import { ProtectedRoute } from "./ProtectedRoute";
import { useAuth } from "./useAuth";

// Las pantallas de juego (constelaciones, desafíos, tienda...): además de iniciar sesión, el staff
// que no cursa nada no tiene qué hacer acá y va al panel. Un alumno pasa derecho.
export function PlayerRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const staff = adminSectionsFor(user).length > 0;
  return <ProtectedRoute>{staff ? <StaffGate>{children}</StaffGate> : children}</ProtectedRoute>;
}

// Va aparte porque pide los cursos, y eso solo hace falta para el staff
function StaffGate({ children }: { children: ReactNode }) {
  const { state } = useCourses();
  if (state.status === "loading") return null;
  if (state.status === "ready" && state.courses.length === 0) return <Navigate to="/admin" replace />;
  return children;
}
