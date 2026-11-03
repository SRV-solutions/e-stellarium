import { Link, useParams } from "react-router";
import { useStar } from "../../hooks/useStar";

export function GamePage() {
  const { starId } = useParams();
  const state = useStar(starId);

  if (state.status === "loading") return <p role="status">Cargando la estrella...</p>;
  if (state.status === "error") {
    return (
      <p role="alert">
        {state.message} <Link to="/constellations">Volver a tus constelaciones</Link>
      </p>
    );
  }

  const { star, questions } = state.play;
  return (
    <main style={{ padding: 24 }}>
      <h1>{star.title}</h1>
      <ol>
        {questions.map((q) => (
          <li key={q.id}>
            {q.type}: {q.prompt}
          </li>
        ))}
      </ol>
    </main>
  );
}