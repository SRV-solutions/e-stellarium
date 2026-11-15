import styles from "./Journey.module.css";

type Props = {
  // Dónde está la pregunta. Sin estado, explica cómo funciona (la lista del docente)
  status?: "draft" | "rejected" | "in_review" | "published" | "unpublished";
  hasPublished?: boolean; // si ya hay una versión que ven los alumnos (se está armando un cambio)
};

// El camino de una pregunta: la armás, la enviás, la ven los alumnos. La parada actual lleva la mira
export function Journey({ status, hasPublished = false }: Props) {
  const stops = [
    {
      title: "La armás",
      text:
        status === "rejected"
          ? "Volvió con un comentario: corregila y enviala de nuevo."
          : status
            ? "Podés guardarla y seguir otro día. Nadie más la ve."
            : "Elegís el juego y completás la plantilla. Nadie más la ve.",
    },
    { title: "La enviás", text: "Un admin la revisa: la aprueba o te la devuelve con un comentario." },
    {
      title: "La ven los alumnos",
      text:
        hasPublished && status && status !== "published" && status !== "unpublished"
          ? "Mientras tanto, siguen viendo la que ya estaba publicada."
          : status === "unpublished"
            ? "Está despublicada: por ahora no la ven."
            : "Si después la cambiás, siguen viendo esta hasta que se apruebe el cambio.",
    },
  ];
  const at = status ? { draft: 0, rejected: 0, in_review: 1, published: 2, unpublished: 2 }[status] : -1;

  return (
    <ol className={`${styles.path} ${status ? "" : styles.how}`} aria-label="El camino de una pregunta">
      {stops.map((stop, i) => {
        let cls = "";
        if (status) {
          if (i < at || (i === at && status === "published")) cls = styles.done!;
          else if (i === at) cls = status === "rejected" ? styles.back! : styles.here!;
        }
        const showText = !status || i === at || (i === 2 && hasPublished);
        return (
          <li key={stop.title} className={cls} aria-current={i === at ? "step" : undefined}>
            <span className={styles.stop} />
            <b>{stop.title}</b>
            {showText && <small>{stop.text}</small>}
          </li>
        );
      })}
    </ol>
  );
}
