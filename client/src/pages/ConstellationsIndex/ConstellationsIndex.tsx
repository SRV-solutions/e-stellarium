import { Navigate } from "react-router";
import { AppHeader } from "../../components/AppHeader/AppHeader";
import { useConstellations } from "../../hooks/useConstellations";

export function ConstellationsIndex() {
  const { state } = useConstellations();

  if (state.status === "ready" && state.constellations.length > 0) {
    return <Navigate to={`/constellations/${state.constellations[0]!.course.key}`} replace />;
  }

  return (
    <>
      <AppHeader />
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 24px", color: "var(--muted)" }}>
        {state.status === "loading" && <p role="status">Cargando tus constelaciones...</p>}
        {state.status === "error" && <p role="alert">No pudimos cargar tus constelaciones.</p>}
        {state.status === "ready" && <p>Todavía no tenés constelaciones. Se abren cuando tu curso tenga contenido.</p>}
      </main>
    </>
  );
}