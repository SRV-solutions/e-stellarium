import { createContext } from "react";
import type { User } from "../types";

export type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setPassword: (token: string, password: string) => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);