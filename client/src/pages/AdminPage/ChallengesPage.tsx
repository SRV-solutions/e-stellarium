import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { api, ApiError } from "../../lib/api";
import { formatSetting, parseInteger, SETTING_NAMES } from "../../lib/economy";
import type { ChallengesOverview } from "../../types";
import { shortName } from "./people";
import { Toast } from "./Toast";
import common from "./PeoplePage.module.css";
import person from "./PersonCard.module.css";
import styles from "./ChallengesPage.module.css";

const TIME_ZONE = "America/Argentina/Buenos_Aires";
// Los días en el orden de la semana argentina, con su clave de settings
const DAYS = [
  { key: "challenge.day_mon", letter: "L", short: "lun", plural: "lunes" },
  { key: "challenge.day_tue", letter: "M", short: "mar", plural: "martes" },
  { key: "challenge.day_wed", letter: "M", short: "mié", plural: "miércoles" },
  { key: "challenge.day_thu", letter: "J", short: "jue", plural: "jueves" },
  { key: "challenge.day_fri", letter: "V", short: "vie", plural: "viernes" },
  { key: "challenge.day_sat", letter: "S", short: "sáb", plural: "sábados" },
  { key: "challenge.day_sun", letter: "D", short: "dom", plural: "domingos" },
];
const PARTS = [
  { part: "own", name: "Sus cursos", detail: "De los cursos que tiene. Si tiene varios, se reparten." },
  { part: "explore", name: "Explorá", detail: "De un curso que no tiene. Al final se lo recomendamos." },
  { part: "discover", name: "Descubrí", detail: "De otro curso que no tiene (o el mismo, si no hay otro)." },
] as const;
const LEVELS = ["easy", "medium", "hard"] as const;
const LEVEL_NAMES = { easy: ["fácil", "fáciles"], medium: ["media", "medias"], hard: ["difícil", "difíciles"] };
const MAX_QUESTIONS = 20;

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`);
// "sábado 21 de noviembre, 09:00"
const when = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIME_ZONE });
const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short", timeZone: TIME_ZONE }).replace(/[.,]/g, "");

// Desafíos: cuándo sale y cómo se arma (settings challenge.*), el de ahora y cuántas preguntas hay.
// Lo cambiado queda en un borrador hasta guardar, como en Economía.
export function AdminChallengesPage() {
  const [data, setData] = useState<ChallengesOverview | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({}); // los valores tocados, como se escribieron
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    api<ChallengesOverview>("/admin/challenges").then(setData, (err) =>
      setError(err instanceof ApiError ? err.message : "No pudimos cargar los desafíos.")
    );
  }, []);

  if (!data) return error ? <p className={common.error}>{error}</p> : null;

  const saved = Object.fromEntries(data.settings.map((s) => [s.key, s.value]));
  const value = (key: string) => (key in draft ? parseInteger(draft[key]) : saved[key]);
  const num = (key: string) => value(key) ?? 0;
  const set = (key: string, text: string) =>
    setDraft((d) => {
      const next = { ...d, [key]: text };
      if (parseInteger(text) === saved[key]) delete next[key];
      return next;
    });

  // ---------- Lo que se ve con el borrador ----------
  const days = DAYS.filter((d) => num(d.key) === 1);
  const hour = num("challenge.hour");
  const counts = (part: string) => LEVELS.map((l) => num(`challenge.${part}_${l}`));
  const sum = (part: string) => counts(part).reduce((a, b) => a + b, 0);
  const total = sum("own") + sum("explore") + sum("discover");
  const review = num("challenge.own_review");
  const badKeys = Object.keys(draft).filter((k) => {
    const v = parseInteger(draft[k]);
    const info = data.settings.find((s) => s.key === k)!;
    return v === null || v < info.min || v > info.max;
  });
  const problems = [
    days.length === 0 && "Elegí al menos un día.",
    sum("own") === 0 && "Tiene que haber al menos una pregunta de sus cursos.",
    review > sum("own") && `No pueden ser más de repaso (${review}) que las de sus cursos (${sum("own")}).`,
    total > MAX_QUESTIONS && `Hasta ${MAX_QUESTIONS} preguntas por desafío.`,
    badKeys.length > 0 && "Hay un número fuera de rango (de 0 a 10).",
  ].filter(Boolean) as string[];
  const changed = Object.keys(draft);
  const scheduleChanged = changed.some((k) => k.startsWith("challenge.day_") || k === "challenge.hour");
  const describe = (part: string) => {
    const parts = LEVELS.map((l, i) => [counts(part)[i], LEVEL_NAMES[l]] as const)
      .filter(([n]) => n > 0)
      .map(([n, names]) => `${n} ${n === 1 ? names[0] : names[1]}`);
    return parts.length ? list(parts) : "ninguna";
  };
  // Para el ejemplo: el curso con más preguntas como "sus cursos", y los siguientes para las otras partes
  const example = data.bank.map((b) => shortName(b.name));
  const exampleOwn = example[0] ?? "su curso";
  const exampleExplore = example[1] ?? "otro curso";
  const exampleDiscover = example[2] ?? example[1] ?? "otro curso";

  async function save() {
    if (problems.length || saving || !data) return;
    setSaving(true);
    setError(null);
    try {
      const values = Object.fromEntries(changed.map((k) => [k, parseInteger(draft[k])]));
      const next = await api<ChallengesOverview>("/admin/challenges", { method: "PATCH", body: JSON.stringify({ values }) });
      setData(next);
      setDraft({});
      setToast("Guardado. Vale desde el próximo desafío; quedó en la bitácora.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const field = (key: string, label: string) => (
    <span className={`${styles.field} ${key in draft ? styles.dirty : ""} ${badKeys.includes(key) ? styles.bad : ""}`}>
      <input
        inputMode="numeric"
        value={key in draft ? draft[key] : String(saved[key])}
        onChange={(e) => set(key, e.target.value)}
        aria-label={label}
      />
    </span>
  );

  return (
    <div className={common.page}>
      <div className={common.head}>
        <h1>Desafíos</h1>
        <p>
          Cuándo sale el desafío y cómo se arma. Cada alumno recibe uno distinto, armado con esta receta a partir de las
          preguntas de desafío de cada curso.
        </p>
      </div>

      <div className={styles.layout}>
        <div>
          <section className={styles.block}>
            <h2>Cuándo sale</h2>
            <p>
              Sale a esa hora (de Argentina) y queda abierto hasta que sale el siguiente. El que está abierto ahora cierra
              cuando tenía previsto, aunque cambies los días.
            </p>
            <div className={styles.days} role="group" aria-label="Días">
              {DAYS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  aria-pressed={num(d.key) === 1}
                  aria-label={d.plural}
                  className={d.key in draft ? styles.dirty : ""}
                  onClick={() => set(d.key, num(d.key) === 1 ? "0" : "1")}
                >
                  {d.letter}
                  <small>{d.short}</small>
                </button>
              ))}
            </div>
            <div className={styles.when}>
              <span className={`${styles.field} ${"challenge.hour" in draft ? styles.dirty : ""}`}>
                <select value={hour} onChange={(e) => set("challenge.hour", e.target.value)} aria-label="Hora">
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {formatSetting("challenge.hour", h)}
                    </option>
                  ))}
                </select>
              </span>
              {days.length > 0 && (
                <span className={styles.sentence}>
                  Sale los <b>{list(days.map((d) => d.plural))}</b> a las <b>{formatSetting("challenge.hour", hour)}</b>.
                </span>
              )}
            </div>
            {scheduleChanged ? (
              <p className={styles.muted}>Al guardar, los próximos se calculan con el horario nuevo.</p>
            ) : (
              <p className={styles.muted}>Los próximos: {data.upcoming.map(when).join(" · ")}.</p>
            )}
          </section>

          <section className={styles.block}>
            <h2>La receta</h2>
            <p>
              Cuántas preguntas de cada parte y de qué dificultad. Si a un curso le faltan preguntas de una dificultad, se usa
              la más parecida.
            </p>
            <table className={styles.recipe}>
              <thead>
                <tr>
                  <th />
                  <th>Fáciles</th>
                  <th>Medias</th>
                  <th>Difíciles</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {PARTS.map((p) => (
                  <tr key={p.part}>
                    <td>
                      <b>
                        <span className={`${styles.part} ${styles[p.part]}`} aria-hidden="true" />
                        {p.name}
                      </b>
                      <small>{p.detail}</small>
                    </td>
                    {LEVELS.map((l) => (
                      <td key={l}>{field(`challenge.${p.part}_${l}`, SETTING_NAMES[`challenge.${p.part}_${l}`].name)}</td>
                    ))}
                    <td className={styles.sum}>{sum(p.part)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>En total</td>
                  <td />
                  <td />
                  <td />
                  <td className={styles.sum}>{total}</td>
                </tr>
              </tfoot>
            </table>
            <div className={styles.review}>
              De las de sus cursos, hasta {field("challenge.own_review", "De repaso")} son de repaso: preguntas que falló en
              desafíos anteriores. Si no tiene, van preguntas nuevas.
            </div>
            {problems.map((p) => (
              <p key={p} className={styles.err}>
                {p}
              </p>
            ))}
          </section>

          <section className={styles.block}>
            <h2>Las preguntas que hay</h2>
            <p>
              Cuántas preguntas de desafío tiene cada curso. Se eligen primero las que el alumno nunca vio; en rojo, las que
              alcanzan para menos de 3 desafíos con esta receta.
            </p>
            {data.bank.length === 0 ? (
              <p className={styles.muted}>Todavía no hay preguntas de desafío.</p>
            ) : (
              <table className={styles.bank}>
                <thead>
                  <tr>
                    <th>Curso</th>
                    <th>Fáciles</th>
                    <th>Medias</th>
                    <th>Difíciles</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bank.map((b) => (
                    <tr key={b.key}>
                      <td>{shortName(b.name)}</td>
                      {LEVELS.map((l, i) => {
                        const need = Math.max(counts("own")[i], counts("explore")[i], counts("discover")[i]);
                        return (
                          <td key={l} className={need && b[l] < need * 3 ? styles.low : ""}>
                            {b[l]}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className={styles.muted}>
              Para sumar preguntas: <Link to="/admin/content?dest=challenge">Contenido → Desafíos</Link>.
            </p>
          </section>
        </div>

        <aside className={styles.side}>
          <div className={styles.box}>
            <h3>Así queda un desafío</h3>
            <p>Por ejemplo, para alguien que tiene {exampleOwn}.</p>
            <div className={styles.ten} aria-hidden="true">
              {Array.from({ length: sum("own") }, (_, i) => (
                <i key={`o${i}`} className={`${styles.own} ${i < review ? styles.rev : ""}`} />
              ))}
              {Array.from({ length: sum("explore") }, (_, i) => (
                <i key={`e${i}`} className={styles.explore} />
              ))}
              {Array.from({ length: sum("discover") }, (_, i) => (
                <i key={`d${i}`} className={styles.discover} />
              ))}
            </div>
            <div className={styles.legend}>
              <span>
                <span className={`${styles.part} ${styles.own}`} />
                {sum("own")} de {exampleOwn}: {describe("own")}
                {review > 0 && `; hasta ${review} de repaso (con anillo)`}
              </span>
              {sum("explore") > 0 && (
                <span>
                  <span className={`${styles.part} ${styles.explore}`} />
                  {sum("explore")} de {exampleExplore} (Explorá): {describe("explore")}
                </span>
              )}
              {sum("discover") > 0 && (
                <span>
                  <span className={`${styles.part} ${styles.discover}`} />
                  {sum("discover")} de {exampleDiscover} (Descubrí): {describe("discover")}
                </span>
              )}
            </div>
          </div>
          <div className={styles.box}>
            <h3>El de ahora</h3>
            <dl className={styles.facts}>
              <div>
                <dt>Salió</dt>
                <dd>{when(data.current.publishedAt)}</dd>
              </div>
              <div>
                <dt>Cierra</dt>
                <dd>{when(data.current.closesAt)}</dd>
              </div>
              <div>
                <dt>Lo empezaron · lo terminaron</dt>
                <dd>
                  <b>{data.current.started}</b> · <b>{data.current.finished}</b> alumnos
                </dd>
              </div>
            </dl>
            {data.past.length > 0 && (
              <ul className={styles.past}>
                {data.past.map((p) => (
                  <li key={p.publishedAt}>
                    <span>{shortDay(p.publishedAt)}</span>
                    <span>
                      {p.started} lo jugaron
                      {p.average !== null && ` · ${p.average.toLocaleString("es-AR")} de promedio`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {error && (
        <p className={common.error} role="alert">
          {error}
        </p>
      )}

      <div className={`${styles.dock} ${changed.length ? styles.on : ""}`} aria-hidden={!changed.length}>
        <div className={styles.dockSum}>
          {changed.map((k) => (
            <div key={k}>
              <span className={styles.k}>{SETTING_NAMES[k].name}:</span>{" "}
              <span className={styles.was}>{formatSetting(k, saved[k])}</span> →{" "}
              <b>{value(k) === null ? "—" : formatSetting(k, value(k))}</b>
            </div>
          ))}
        </div>
        <div className={styles.dockActions}>
          <button type="button" className={person.button} onClick={() => setDraft({})} disabled={saving}>
            Descartar
          </button>
          <button
            type="button"
            className={`${person.button} ${person.primary}`}
            onClick={save}
            disabled={saving || problems.length > 0}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
