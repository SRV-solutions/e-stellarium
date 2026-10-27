import { useAuth } from "../auth/useAuth";

export function HomePage() {
  const { user, logout } = useAuth();

  return (
    <main>
      <h1>Hola, {user?.alias}</h1>
      <p>Rol: {user?.role}</p>
      <button onClick={logout}>Salir</button>
    </main>
  );
}