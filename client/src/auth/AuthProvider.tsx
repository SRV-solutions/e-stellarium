import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AuthContext } from "./AuthContext";
import { api } from "../lib/api";
import type { Stats, User, Worn } from "../types";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);

  const refreshStats = useCallback(() => {
    api<Stats>("/me/stats")
      .then((data) => {
        setStats(data);
        // Trae también el saldo de destellos: una insignia nueva puede haberlo cambiado
        setUser((previous) => previous && { ...previous, glints: data.glints });
      })
      .catch(() => {}); // si falla, la racha simplemente no se muestra
  }, []);

  // Cada vez que cambia quién inició sesión, se piden sus estadísticas
  const userId = user?.id;
  useEffect(() => {
    if (userId) refreshStats();
  }, [userId, refreshStats]);

  // Al abrir la app, preguntamos si ya hay una sesión activa
  useEffect(() => {
    api<{ user: User }>("/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await api<{ user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(data.user);
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
    setStats(null);
  }

  async function setPassword(token: string, password: string) {
    const data = await api<{ user: User }>("/auth/password/set", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
    setUser(data.user);
  }

  // Suma la experiencia que la API acaba de dar, sin volver a pedir el usuario
  function addXp(xp: number) {
    setUser((previous) => previous && { ...previous, totalXp: previous.totalXp + xp });
  }

  // Los destellos se reemplazan por el saldo que manda la API (no se suman: así nunca se desfasan)
  function setGlints(glints: number) {
    setUser((previous) => previous && { ...previous, glints });
  }

  // El color "blue" es el de siempre: en el usuario se guarda vacío, como en la base
  function setWorn(worn: Worn) {
    setUser(
      (previous) =>
        previous && {
          ...previous,
          wornFrame: worn.frame,
          wornColor: worn.color === "blue" ? null : worn.color,
          wornTitle: worn.title,
          titleVariant: worn.titleVariant,
        }
    );
  }

  function noteActivity() {
    if (!stats?.activeToday) refreshStats();
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setPassword, addXp, setGlints, setWorn, stats, refreshStats, noteActivity }}>
      {children}
    </AuthContext.Provider>
  );
}