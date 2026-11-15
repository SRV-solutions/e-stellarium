import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useAuth } from "../../auth/useAuth";
import { api, ApiError } from "../../lib/api";
import { can } from "../../lib/permissions";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import type { ContentCourse, QuestionDetail } from "../../types";
import { destKey, destLabel, destPayload, draftFrom, emptyDraft, payloadOf, problemsOf, when, type DestKey, type Draft, type RowState } from "./content";
import { Journey } from "./Journey";
import { QuestionForm } from "./QuestionForm";
import { QuestionReview } from "./QuestionReview";
import { StudentPreview } from "./StudentPreview";
import { Toast } from "./Toast";
import styles from "./QuestionPage.module.css";

// Una pregunta: el editor (la plantilla y la vista del alumno) o, si espera revisión y podés aprobar,
// la revisión. /admin/content/new crea una nueva (?course=python&dest=<lección|exam|challenge>)
export function QuestionPage() {
  const { id } = useParams();
  // Una pantalla nueva por pregunta: al pasar de una a otra (o de "nueva" a la creada) arranca de cero
  return <QuestionScreen key={id} id={id!} />;
}

function QuestionScreen({ id }: { id: string }) {
  const isNew = id === "new";
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const approver = can(user, "content:approve");
  const editor = can(user, "content:edit");

  const [courses, setCourses] = useState<ContentCourse[] | null>(null);
  const [detail, setDetail] = useState<QuestionDetail | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [saved, setSaved] = useState<string>(""); // el borrador como se guardó, para saber si hay cambios
  const [destChoice, setDest] = useState<DestKey>(""); // vacío: el de la pregunta, o el que viene en la dirección
  const [editing, setEditing] = useState(false); // el admin que revisa puede pasar al editor (solo para mirar)
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  // Lo que mandó la API pasa a ser lo guardado
  const show = useCallback((q: QuestionDetail) => {
    const version = q.open ?? q.published;
    const d = version ? draftFrom(version) : emptyDraft();
    setDetail(q);
    setDraft(d);
    setSaved(JSON.stringify(d));
    setDest(destKey(q));
  }, []);

  useEffect(() => {
    api<{ courses: ContentCourse[] }>("/admin/content/courses").then(
      (data) => setCourses(data.courses),
      (err) => setError(err instanceof ApiError ? err.message : "No pudimos cargar los cursos.")
    );
  }, []);

  useEffect(() => {
    if (isNew) return;
    api<{ question: QuestionDetail }>(`/admin/questions/${id}`).then(
      (data) => show(data.question),
      (err) => setError(err instanceof ApiError ? err.message : "No pudimos cargar la pregunta.")
    );
  }, [id, isNew, show]);

  const courseKey = detail?.course ?? params.get("course");
  const course = courses?.find((c) => c.key === courseKey);

  if (error && !detail && !isNew) return <p className={styles.error}>{error}</p>;
  if (!course || (!isNew && !detail)) return null;

  // En una nueva, el destino arranca en el que venía filtrado en la lista, o en la primera lección
  const wanted = params.get("dest");
  const dest: DestKey =
    destChoice ||
    (wanted === "exam" || wanted === "challenge"
      ? wanted
      : wanted && course.stars.some((s) => s.id === wanted)
        ? `star:${wanted}`
        : course.stars[0]
          ? `star:${course.stars[0].id}`
          : "challenge");

  const open = detail?.open ?? null;
  const published = detail?.published ?? null;
  // Dónde está en el camino: la versión abierta, o si los alumnos la ven
  const status: RowState = open ? (open.status as RowState) : detail ? (detail.visible ? "published" : "unpublished") : "draft";
  const reviewing = !!open && open.status === "in_review" && approver && !editing;
  const readOnly = !editor || (!!open && open.status === "in_review");
  const dirty = isNew || JSON.stringify(draft) !== saved || (!!detail && destKey(detail) !== dest && !published);
  const problems = problemsOf(draft);
  const where = destLabel(course, dest);
  const lastRejection = open && [...(detail?.reviews ?? [])].reverse().find((r) => r.version === open.number && r.decision === "rejected");

  // ---------- Acciones ----------
  async function run(action: () => Promise<{ question: QuestionDetail }>, done: string) {
    setBusy(true);
    setError(null);
    try {
      const { question } = await action();
      show(question);
      setToast(done);
      return question;
    } catch (err) {
      if (err instanceof ApiError) {
        const list = Array.isArray(err.data.problems) ? ` ${(err.data.problems as string[]).join(" ")}` : "";
        setError(err.message + list);
      } else setError("Algo salió mal. Probá de nuevo.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (isNew) {
      const q = await run(
        () =>
          api("/admin/questions", {
            method: "POST",
            body: JSON.stringify({ course: course!.key, dest: destPayload(dest), ...payloadOf(draft) }),
          }),
        "Guardada. Nadie más la ve todavía."
      );
      if (q) navigate(`/admin/content/${q.id}`, { replace: true });
      return q;
    }
    const body = { ...payloadOf(draft), ...(!published && destKey(detail!) !== dest ? { dest: destPayload(dest) } : {}) };
    return run(() => api(`/admin/questions/${id}`, { method: "PATCH", body: JSON.stringify(body) }), "Guardada. Nadie más la ve todavía.");
  }

  async function send() {
    const q = dirty ? await save() : detail;
    if (!q) return;
    await run(
      () => api(`/admin/questions/${q.id}/submit`, { method: "POST" }),
      approver ? "Enviada a revisión." : "Enviada. Cuando la revisen, la vas a ver acá."
    );
    if (isNew) navigate(`/admin/content/${q.id}`, { replace: true });
  }

  const post = (path: string, done: string, body?: object) =>
    run(() => api(`/admin/questions/${id}/${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined }), done);

  async function reject() {
    const q = await post("reject", "Rechazada. Queda en la bitácora.", { comment: comment.trim() });
    if (q) {
      setRejecting(false);
      setComment("");
    }
  }

  // ---------- La barra de abajo ----------
  let dock;
  if (reviewing) {
    dock = rejecting ? (
      <div className={`${styles.dock} ${styles.top}`}>
        <div className={styles.sum}>
          Devolver la v{open!.number}
          <small>Le llega a {open!.author?.name ?? "quien la escribió"} con tu comentario, para que la corrija.</small>
          <textarea
            className={styles.comment}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Qué tiene que cambiar"
            aria-label="Comentario"
            autoFocus
            maxLength={2000}
          />
        </div>
        <div className={`${styles.actions} ${styles.column}`}>
          <button type="button" className={`${styles.button} ${styles.danger}`} disabled={!comment.trim() || busy} onClick={reject}>
            Rechazar
          </button>
          <button type="button" className={`${styles.button} ${styles.ghost}`} onClick={() => setRejecting(false)}>
            Cancelar
          </button>
        </div>
      </div>
    ) : (
      <div className={styles.dock}>
        <div className={styles.sum}>
          ¿La publicás?
          <small>{published ? `Reemplaza a la v${published.number} para todos los alumnos.` : "La empiezan a ver los alumnos."}</small>
        </div>
        <div className={styles.actions}>
          <button type="button" className={`${styles.button} ${styles.danger}`} onClick={() => setRejecting(true)}>
            Rechazar…
          </button>
          <button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={() => post("approve", "Publicada. Queda en la bitácora.")}>
            Aprobar y publicar
          </button>
        </div>
      </div>
    );
  } else if (open?.status === "in_review") {
    dock = (
      <div className={styles.dock}>
        <div className={styles.sum}>
          Enviada {open.submittedAt ? when(open.submittedAt) : ""}
          <small>{approver ? "La podés revisar o retirarla." : "Cuando la revisen, la vas a ver publicada o con un comentario. Si querés cambiar algo, retirala."}</small>
        </div>
        <div className={styles.actions}>
          {editor && (
            <button type="button" className={styles.button} disabled={busy} onClick={() => post("withdraw", "Volvió a borrador.")}>
              Retirarla para cambiar algo
            </button>
          )}
          {approver && (
            <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => setEditing(false)}>
              Revisar
            </button>
          )}
        </div>
      </div>
    );
  } else if (editor) {
    const canSend = problems.length === 0 && (dirty || !!open);
    dock = (
      <div className={styles.dock}>
        <div className={styles.sum}>
          {dirty ? "Tenés cambios sin guardar" : open ? "Guardada. Nadie más la ve todavía." : "Sin cambios"}
          <small>{problems.length === 0 ? "Cuando esté lista, enviala: un admin la revisa." : `Para enviarla: ${problems[0]!.toLowerCase()}`}</small>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.button} disabled={!dirty || busy} onClick={save}>
            Guardar y seguir después
          </button>
          <button type="button" className={`${styles.button} ${styles.primary}`} disabled={!canSend || busy} onClick={send}>
            Enviar a revisión
          </button>
        </div>
      </div>
    );
  }

  // ---------- La página ----------
  const title = reviewing ? `Revisar la v${open!.number}` : isNew ? "Nueva pregunta" : published ? "Cambiar una pregunta" : "Tu pregunta";
  return (
    <div className={styles.page}>
      <Link className={styles.back} to={`/admin/content?course=${course.key}`}>
        ← Contenido
      </Link>
      <div className={styles.head}>
        <div>
          <h1>
            {title}
            {approver && !reviewing && detail && (open || published) && <span className={styles.version}>v{(open ?? published)!.number}</span>}
          </h1>
          <p>
            {reviewing
              ? `${open!.author?.name ?? "Alguien"} la envió ${open!.submittedAt ? when(open!.submittedAt) : ""} · ${where.letter} ${where.name}`
              : readOnly && open
                ? "Ya la enviaste. Mientras espera, no se puede editar."
                : "Completá los pasos. A la derecha la probás como la va a ver el alumno."}
          </p>
        </div>
        {approver && !open && published && (
          detail!.visible ? (
            <button type="button" className={`${styles.button} ${styles.danger} ${styles.small}`} onClick={() => setConfirmUnpublish(true)}>
              Despublicar
            </button>
          ) : (
            <button type="button" className={`${styles.button} ${styles.small}`} disabled={busy} onClick={() => post("republish", "Se ve de nuevo.")}>
              Volver a publicar la v{published.number}
            </button>
          )
        )}
        {reviewing && (
          <button type="button" className={`${styles.button} ${styles.ghost} ${styles.small}`} onClick={() => setEditing(true)}>
            Ver en el editor
          </button>
        )}
      </div>

      {!reviewing && <Journey status={status} hasPublished={!!published} />}

      {/* Lo que tiene que saber antes de seguir */}
      {reviewing ? (
        <p className={styles.note}>
          <i className={`${styles.node} ${published ? styles.published : styles.inReview}`} />
          <span>
            {published ? (
              <>
                <b>Los alumnos ven la v{published.number}</b>
                {detail!.answers > 0 && ` (${detail!.answers} respuestas)`}. Si la aprobás, la v{open!.number} la reemplaza: quien esté en medio
                de un examen o un desafío lo termina con la que tenía, y lo ya respondido queda atado a su versión.
              </>
            ) : (
              <>
                <b>Pregunta nueva.</b> Si la aprobás, aparece en{" "}
                {dest === "exam" ? "el examen final (solo al rendir)" : dest === "challenge" ? "los desafíos que se armen desde ahora" : "su lección, al final"}.
              </>
            )}
          </span>
        </p>
      ) : lastRejection && open?.status !== "in_review" ? (
        <p className={`${styles.note} ${styles.rejectedNote}`}>
          <i className={`${styles.node} ${styles.rejected}`} />
          <span>
            <b>{lastRejection.reviewer ?? "Un admin"} te la devolvió con este comentario:</b>
            <q>{lastRejection.comment}</q>
          </span>
        </p>
      ) : (
        published &&
        !readOnly && (
          <p className={styles.note}>
            <i className={`${styles.node} ${detail!.visible ? styles.published : styles.unpublished}`} />
            <span>
              {detail!.visible ? <b>Esta pregunta ya la ven los alumnos.</b> : <b>Está despublicada: los alumnos no la ven.</b>} Lo que cambies acá no les
              llega hasta que un admin lo apruebe{approver ? `: queda como v${open?.number ?? published.number + 1}` : ""}.
              {detail!.answers > 0 && ` Las ${detail!.answers} respuestas que ya dieron no se pierden.`}
            </span>
          </p>
        )
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.work}>
        {reviewing ? (
          <QuestionReview detail={detail!} />
        ) : (
          <QuestionForm
            course={course}
            draft={draft}
            onChange={setDraft}
            dest={dest}
            onDest={setDest}
            readOnly={readOnly}
            published={!!published}
            problems={problems}
          />
        )}
        <StudentPreview draft={draft} where={where} />
      </div>

      {dock}
      <Toast message={toast} onDone={clearToast} />
      <ConfirmDialog
        open={confirmUnpublish}
        title="¿Despublicar?"
        confirmLabel="Despublicar"
        cancelLabel="Cancelar"
        onCancel={() => setConfirmUnpublish(false)}
        onConfirm={async () => {
          setConfirmUnpublish(false);
          await post("unpublish", "Despublicada. Queda en la bitácora.");
        }}
      >
        Los alumnos dejan de verla:{" "}
        {dest === "exam" ? "sale de los exámenes que se sorteen desde ahora." : dest === "challenge" ? "sale de los desafíos que se armen desde ahora." : "sale de su lección."}
        {detail && detail.answers > 0 && ` Sus ${detail.answers} respuestas quedan guardadas, y quien ya encendió la estrella la sigue teniendo encendida.`}{" "}
        Se puede volver a publicar la misma versión, o revertir desde la bitácora.
      </ConfirmDialog>
    </div>
  );
}
