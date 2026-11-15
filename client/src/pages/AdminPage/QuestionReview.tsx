import type { ReactNode } from "react";
import type { QuestionDetail } from "../../types";
import { CodeText } from "../GamePage/Terminal/Terminal";
import { DIFFICULTY_NAMES, draftFrom, type Draft } from "./content";
import styles from "./QuestionReview.module.css";

type Props = { detail: QuestionDetail };

// Qué cambia la versión en revisión respecto de la publicada (o qué tiene, si es nueva), y la historia
export function QuestionReview({ detail }: Props) {
  const now = draftFrom(detail.open!);
  const was = detail.published ? draftFrom(detail.published) : null;

  const rows: { label: string; body: ReactNode }[] = [];
  const text = (label: string, get: (d: Draft) => string) => {
    const a = was ? get(was) : null;
    const b = get(now);
    if (!b && !a) return;
    rows.push({ label, body: <TextChange was={a} now={b} /> });
  };

  text("Enunciado", (d) => d.prompt);
  if (now.type === "output" || now.type === "fill_blank") {
    rows.push({ label: "Código", body: <CodeChange was={was?.code ?? null} now={now.code} /> });
  }
  if (now.type === "order_lines") {
    rows.push({ label: "Líneas, en orden", body: <CodeChange was={was?.lines ?? null} now={now.lines} /> });
  }
  if (now.type === "output" || now.type === "multiple_choice") {
    rows.push({
      label: "Opciones",
      body: <OptionsChange was={was && { options: was.options, correct: was.correct }} now={{ options: now.options, correct: now.correct }} mono={now.type === "output"} />,
    });
  }
  if (now.type === "fill_blank") {
    now.blanks.forEach((options, b) => {
      const before = was?.blanks[b];
      rows.push({
        label: `Hueco ${b + 1}${was && !before ? " (nuevo)" : ""}`,
        body: (
          <OptionsChange
            was={before ? { options: before, correct: was!.correctBlanks[b]! } : null}
            now={{ options, correct: now.correctBlanks[b]! }}
            mono
          />
        ),
      });
    });
  }
  if (now.type === "fill_blank" || now.type === "order_lines") text("Salida si acierta", (d) => d.output);
  text("Explicación", (d) => d.explanation);
  text("Tema y dificultad", (d) => `${d.topic}, ${DIFFICULTY_NAMES[d.difficulty].toLowerCase()}`);
  text("Módulo", (d) => (d.module ? `Módulo ${d.module}` : "Sin módulo"));

  // La historia: cada envío y cada revisión, en orden
  const events = [
    ...detail.history
      .filter((h) => h.submittedAt)
      .map((h) => ({ at: h.submittedAt!, kind: "sent", text: `${h.author ?? "Alguien"} envió la v${h.number}`, comment: null as string | null })),
    ...detail.reviews.map((r) => ({
      at: r.createdAt,
      kind: r.decision === "approved" ? "ok" : "rejected",
      text: `${r.reviewer ?? "Un admin"} ${r.decision === "approved" ? "aprobó" : "rechazó"} la v${r.version}`,
      comment: r.comment,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div>
      <section>
        <h2 className={styles.title}>{was ? `Qué cambia de la v${detail.published!.number}` : "Qué tiene"}</h2>
        {rows.map((row) => (
          <div key={row.label} className={styles.change}>
            <h3>{row.label}</h3>
            {row.body}
          </div>
        ))}
      </section>
      {events.length > 0 && (
        <section className={styles.thread}>
          <h2 className={styles.title}>Historia</h2>
          <ol>
            {events.map((e, i) => (
              <li key={i} className={styles[e.kind]}>
                {e.text}
                <small>{dateTime(e.at)}</small>
                {e.comment && <q>{e.comment}</q>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Argentina/Buenos_Aires",
  });

function TextChange({ was, now }: { was: string | null; now: string }) {
  if (was === null) return <div>{now || <span className={styles.same}>Vacío</span>}</div>;
  if (was === now) return <div className={styles.same}>Sin cambios</div>;
  return (
    <div>
      <span className={styles.was}>{was || "vacío"}</span> → <span>{now || "vacío"}</span>
    </div>
  );
}

// El código línea por línea: lo sacado en rojo, lo agregado en verde (una comparación simple, por lugar)
function CodeChange({ was, now }: { was: string | null; now: string }) {
  if (was !== null && was === now) return <div className={styles.same}>Sin cambios</div>;
  const a = (was ?? "").split("\n");
  const b = now.split("\n");
  const lines: ReactNode[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (was === null || a[i] === b[i]) {
      if (b[i] !== undefined) lines.push(<span key={`e${i}`} className={styles.eq}><CodeText text={b[i]!} /></span>);
      continue;
    }
    if (a[i] !== undefined) lines.push(<span key={`d${i}`} className={styles.del}>{a[i]}</span>);
    if (b[i] !== undefined) lines.push(<span key={`i${i}`} className={styles.ins}>{b[i]}</span>);
  }
  return <pre className={styles.diff}>{lines}</pre>;
}

type OptionList = { options: string[]; correct: number };

function OptionsChange({ was, now, mono }: { was: OptionList | null; now: OptionList; mono: boolean }) {
  const same = was && JSON.stringify(was) === JSON.stringify(now);
  return (
    <ul className={styles.options}>
      {now.options.map((o, i) => (
        <li key={i}>
          <span className={mono ? styles.mono : ""}>{o}</span>
          {i === now.correct && <span className={styles.right}>correcta</span>}
          {was && !same && !was.options.includes(o) && <span className={styles.added}>nueva</span>}
        </li>
      ))}
      {was &&
        !same &&
        was.options
          .filter((o) => !now.options.includes(o))
          .map((o) => (
            <li key={`x-${o}`} className={styles.was}>
              <span className={mono ? styles.mono : ""}>{o}</span>
            </li>
          ))}
      {same && <li className={styles.same}>Sin cambios</li>}
    </ul>
  );
}
