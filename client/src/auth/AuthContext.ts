import { createContext } from "react";
import type { Economy, NewBadge, Stats, User, Worn } from "../types";

export type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setPassword: (token: string, password: string) => Promise<void>;
  addXp: (xp: number) => void;
  // El saldo de destellos que acaba de devolver la API (repaso, desafío, tienda)
  setGlints: (glints: number) => void;
  // Lo que lleva puesto, después de cambiarlo en la tienda
  setWorn: (worn: Worn) => void;
  // Lo que cambió en el perfil (alias, dibujo, preferencias), con lo que devolvió la API
  updateProfile: (changes: Partial<Pick<User, "alias" | "aliasChangedAt" | "avatar" | "notifyEmail" | "notifyApp">>) => void;
  // Las insignias que trajo una respuesta: se muestra el aviso después del veredicto
  announceBadges: (badges: NewBadge[] | undefined) => void;
  // La racha y el repaso de hoy (GET /me/stats). null mientras carga
  stats: Stats | null;
  refreshStats: () => void;
  // Después de responder algo: si era lo primero del día, la racha cambió y se vuelve a pedir
  noteActivity: () => void;
  // Cuánta XP y cuántos destellos da cada cosa (GET /economy). Llega junto con el usuario: con sesión,
  // nunca es null (usá useEconomy)
  economy: Economy | null;
  // Después de cambiar la economía en el panel, para que se vea enseguida
  refreshEconomy: () => void;
};

export const AuthContext = createContext<AuthState | null>(null);