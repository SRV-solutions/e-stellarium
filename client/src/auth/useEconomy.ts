import { useAuth } from "./useAuth";

// Cuánta XP y cuántos destellos da cada cosa. Llega con la sesión (AuthProvider la pide junto con el
// usuario), así que en cualquier pantalla con sesión ya está
export function useEconomy() {
  const { economy } = useAuth();
  if (!economy) throw new Error("useEconomy se usa solo con sesión iniciada");
  return economy;
}
