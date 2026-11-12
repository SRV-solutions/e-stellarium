import { createContext } from "react";
import type { Stats, User } from "../types";

export type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setPassword: (token: string, password: string) => Promise<void>;
  addXp: (xp: number) => void;
  // El saldo de destellos que acaba de devolver la API (repaso, desafío, tienda)
  setGlints: (glints: number) => void;
  // La racha y el repaso de hoy (GET /me/stats). null mientras carga
  stats: Stats | null;
  refreshStats: () => void;
  // Después de responder algo: si era lo primero del día, la racha cambió y se vuelve a pedir
  noteActivity: () => void;
};

export const AuthContext = createContext<AuthState | null>(null);