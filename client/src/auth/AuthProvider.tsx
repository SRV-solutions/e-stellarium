import { useEffect, useState, type ReactNode } from "react";
import { AuthContext } from "./AuthContext";
import { api } from "../lib/api";
import type { User } from "../types";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
  }

  async function setPassword(token: string, password: string) {
    const data = await api<{ user: User }>("/auth/password/set", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
    setUser(data.user);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setPassword }}>
      {children}
    </AuthContext.Provider>
  );
}