import type { ContentCourse, Difficulty, QuestionType } from "../../types";
import { DIFFICULTY_NAMES, emptyDraft, syncBlanks, TYPE_INFO, TYPES, type DestKey, type Draft } from "./content";
import styles from "./QuestionForm.module.css";

type Props = {
  course: ContentCourse;
  draft: Draft;
  onChange: (draft: Draft) => void;
  dest: DestKey;
  onDest: (dest: DestKey) => void;
  readOnly: boolean; // enviada: no se edita hasta retirarla
  published: boolean; // ya la ven los alumnos: no cambian ni el juego ni el lugar
  problems: string[];
};

// La plantilla, en cinco pasos: dónde va, qué juego, la pregunta, la explicación y para ordenarla
export function QuestionForm({ course, draft, onChange, dest, onDest, readOnly, published, problems }: Props) {
  const set = (fields: Partial<Draft>) => onChange({ ...draft, ...fields });

  const destHelp =
    dest === "exam"
      ? "La ven solo al rendir el examen. Nunca aparece en la práctica, el repaso ni los desafíos."
      : dest === "challenge"
        ? "Entra en los desafíos que se armen desde que se apruebe."
        : "Se suma al final de esa lección. Para encenderla, el alumno tiene que acertarla.";

  function changeType(type: QuestionType) {
    // Al cambiar de juego se conserva lo común (el tema, la explicación...) y la plantilla arranca vacía
    const fresh = emptyDraft(type);
    onChange({ ...fresh, difficulty: draft.difficulty, topic: draft.topic, module: draft.module, explanation: draft.explanation });
  }

  return (
    <div className={styles.form}>
      <section className={styles.step}>
        <h2>
          <span className={styles.n}>1</span>¿Dónde va?
        </h2>
        <label className={styles.field}>
          <select className={styles.input} value={dest} onChange={(e) => onDest(e.target.value)} disabled={readOnly || published} aria-label="Dónde va">
            {course.stars.map((s) => (
              <option key={s.id} value={`star:${s.id}`}>
                Lección {s.letter} · {s.title}
              </option>
            ))}
            <option value="exam">Examen final (secreto)</option>
            <option value="challenge">Desafíos semanales</option>
          </select>
          <span className={styles.help}>{destHelp}</span>
        </label>
        {course.modules.length > 0 && (
          <label className={styles.field}>
            <span className={styles.label}>
              ¿En qué módulo del curso se explica?<small>Si el alumno erra en un desafío, le decimos dónde verlo</small>
            </span>
            <select
              className={styles.input}
              value={draft.module ?? ""}
              onChange={(e) => set({ module: e.target.value ? Number(e.target.value) : null })}
              disabled={readOnly}
            >
              <option value="">Sin módulo</option>
              {course.modules.map((m) => (
                <option key={m.number} value={m.number}>
                  Módulo {m.number} · {m.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section className={styles.step}>
        <h2>
          <span className={styles.n}>2</span>¿Qué juego?{published && <small>No se cambia en una pregunta publicada</small>}
        </h2>
        <div className={styles.types} role="radiogroup" aria-label="Juego">
          {TYPES.map((type) => (
            <label key={type}>
              <input
                type="radio"
                name="type"
                aria-label={TYPE_INFO[type].name}
                checked={draft.type === type}
                disabled={readOnly || published}
                onChange={() => changeType(type)}
              />
              <TypeSign type={type} />
              <b>{TYPE_INFO[type].name}</b>
              <small>{TYPE_INFO[type].description}</small>
            </label>
          ))}
        </div>
      </section>

      <section className={styles.step}>
        <h2>
          <span className={styles.n}>3</span>La pregunta
        </h2>
        <label className={styles.field}>
          <span className={styles.label}>Lo que se le pregunta</span>
          <input
            className={styles.input}
            value={draft.prompt}
            onChange={(e) => set({ prompt: e.target.value })}
            placeholder={draft.type === "multiple_choice" ? "Por ejemplo: ¿Cuándo se ejecuta el else?" : "Por ejemplo: ¿Qué imprime este programa?"}
            disabled={readOnly}
            maxLength={1000}
          />
        </label>
        <Template draft={draft} onChange={onChange} readOnly={readOnly} />
      </section>

      <section className={styles.step}>
        <h2>
          <span className={styles.n}>4</span>La explicación<small>La lee después de responder, acierte o no</small>
        </h2>
        <textarea
          className={styles.area}
          value={draft.explanation}
          onChange={(e) => set({ explanation: e.target.value })}
          placeholder='Por ejemplo: int convierte el texto "3" en el número 3, y por eso se puede sumar.'
          aria-label="La explicación"
          disabled={readOnly}
          maxLength={4000}
        />
      </section>

      <section className={styles.step}>
        <h2>
          <span className={styles.n}>5</span>Para ordenarla<small>Lo usan el repaso y los desafíos</small>
        </h2>
        <div className={styles.two}>
          <label className={styles.field}>
            <span className={styles.label}>Tema</span>
            <input
              className={styles.input}
              value={draft.topic}
              onChange={(e) => set({ topic: e.target.value })}
              placeholder="Por ejemplo: Conversiones"
              disabled={readOnly}
              maxLength={60}
            />
          </label>
          <div className={styles.field}>
            <span className={styles.label}>Dificultad</span>
            <div className={styles.seg} role="group" aria-label="Dificultad">
              {(Object.keys(DIFFICULTY_NAMES) as Difficulty[]).map((d) => (
                <button key={d} type="button" aria-pressed={draft.difficulty === d} disabled={readOnly} onClick={() => set({ difficulty: d })}>
                  {DIFFICULTY_NAMES[d]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {!readOnly && problems.length > 0 && (
        <div className={styles.field}>
          <span className={styles.label}>Para poder enviarla falta:</span>
          <ul className={styles.problems}>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// La seña de cada juego, en chiquito
function TypeSign({ type }: { type: QuestionType }) {
  if (type === "output") return <span className={styles.sign}>print(<i />)</span>;
  if (type === "fill_blank") return <span className={styles.sign}>x = <span className={styles.gap} /></span>;
  if (type === "order_lines")
    return (
      <span className={`${styles.sign} ${styles.stack}`}>
        <i />
        <i style={{ width: 12 }} />
        <i style={{ width: 22 }} />
      </span>
    );
  return <span className={styles.sign}>a · b · c</span>;
}

// Lo que cambia según el juego
function Template({ draft, onChange, readOnly }: { draft: Draft; onChange: (d: Draft) => void; readOnly: boolean }) {
  const set = (fields: Partial<Draft>) => onChange({ ...draft, ...fields });
  const output = (
    <label className={styles.field}>
      <span className={styles.label}>
        ¿Qué imprime cuando está bien?<small>Se le muestra cuando acierta</small>
      </span>
      <textarea
        className={`${styles.area} ${styles.code} ${styles.short}`}
        value={draft.output}
        onChange={(e) => set({ output: e.target.value })}
        placeholder="7"
        spellCheck={false}
        disabled={readOnly}
      />
    </label>
  );

  if (draft.type === "output" || draft.type === "multiple_choice") {
    return (
      <>
        {draft.type === "output" && (
          <label className={styles.field}>
            <span className={styles.label}>
              El código<small>Tal cual lo ve el alumno</small>
            </span>
            <textarea
              className={`${styles.area} ${styles.code}`}
              value={draft.code}
              onChange={(e) => set({ code: e.target.value })}
              placeholder={'a = "3"\nprint(a * 2)'}
              spellCheck={false}
              disabled={readOnly}
            />
          </label>
        )}
        <div className={styles.field}>
          <span className={styles.label}>
            {draft.type === "output" ? "Lo que podría imprimir" : "Las opciones"}
            <small>De 2 a 4. Tocá el círculo de la correcta; el orden se mezcla solo</small>
          </span>
          <Options
            options={draft.options}
            correct={draft.correct}
            mono={draft.type === "output"}
            readOnly={readOnly}
            onChange={(options, correct) => set({ options, correct })}
          />
        </div>
      </>
    );
  }

  if (draft.type === "fill_blank") {
    return (
      <>
        <label className={styles.field}>
          <span className={styles.label}>
            El código, con los huecos
            <small>
              Escribí <code>___</code> (tres guiones bajos) donde va cada hueco
            </small>
          </span>
          <textarea
            className={`${styles.area} ${styles.code}`}
            value={draft.code}
            onChange={(e) => onChange(syncBlanks({ ...draft, code: e.target.value }))}
            placeholder={'a = "3"\nprint(___(a) + 4)'}
            spellCheck={false}
            disabled={readOnly}
          />
        </label>
        <div className={styles.field}>
          <span className={styles.label}>
            Qué puede elegir en cada hueco<small>Tocá el círculo de la correcta</small>
          </span>
          {draft.blanks.map((options, b) => (
            <div key={b} className={styles.hole}>
              <h4>Hueco {b + 1}</h4>
              <Options
                options={options}
                correct={draft.correctBlanks[b] ?? 0}
                mono
                readOnly={readOnly}
                onChange={(next, correct) => {
                  const blanks = draft.blanks.map((o, i) => (i === b ? next : o));
                  const correctBlanks = draft.correctBlanks.map((c, i) => (i === b ? correct : c));
                  set({ blanks, correctBlanks });
                }}
              />
            </div>
          ))}
        </div>
        {output}
      </>
    );
  }

  return (
    <>
      <label className={styles.field}>
        <span className={styles.label}>
          El código, en el orden correcto<small>Una línea por renglón. Al alumno le llegan mezcladas</small>
        </span>
        <textarea
          className={`${styles.area} ${styles.code}`}
          value={draft.lines}
          onChange={(e) => set({ lines: e.target.value })}
          placeholder={"for i in range(3):\n    print(i)"}
          spellCheck={false}
          disabled={readOnly}
        />
      </label>
      {output}
    </>
  );
}

type OptionsProps = {
  options: string[];
  correct: number;
  mono: boolean;
  readOnly: boolean;
  onChange: (options: string[], correct: number) => void;
};

// La lista de opciones: la correcta lleva la mira; de 2 a 4
function Options({ options, correct, mono, readOnly, onChange }: OptionsProps) {
  function remove(i: number) {
    const next = options.filter((_, j) => j !== i);
    const nextCorrect = correct === i ? 0 : correct > i ? correct - 1 : correct;
    onChange(next, nextCorrect);
  }

  return (
    <div className={styles.options}>
      {options.map((option, i) => (
        <div key={i} className={styles.option}>
          <button
            type="button"
            className={styles.pick}
            aria-pressed={correct === i}
            aria-label={`La correcta es la ${i + 1}`}
            disabled={readOnly}
            onClick={() => onChange(options, i)}
          >
            <span />
          </button>
          <input
            className={`${styles.input} ${mono ? styles.mono : ""}`}
            value={option}
            onChange={(e) => onChange(options.map((o, j) => (j === i ? e.target.value : o)), correct)}
            placeholder={correct === i ? "La respuesta correcta" : "Una opción incorrecta"}
            aria-label={`Opción ${i + 1}`}
            disabled={readOnly}
          />
          <span className={styles.is}>{correct === i ? "Correcta" : ""}</span>
          {options.length > 2 && !readOnly ? (
            <button type="button" className={styles.remove} aria-label={`Sacar la opción ${i + 1}`} onClick={() => remove(i)}>
              ×
            </button>
          ) : (
            <span />
          )}
        </div>
      ))}
      {options.length < 4 && !readOnly && (
        <button type="button" className={styles.add} onClick={() => onChange([...options, ""], correct)}>
          + Otra opción
        </button>
      )}
    </div>
  );
}
