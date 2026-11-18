import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { api, ApiError } from "../../lib/api";
import { parseInteger } from "../../lib/economy";
import type { RankingBoardId, StaffRanking } from "../../types";
import { BOARDS } from "../RankingPage/boards";
import { firstName } from "./people";
import person from "./PersonCard.module.css";
import styles from "./CouponsPage.module.css";

type Props = {
  board: RankingBoardId;
  people: StaffRanking["top"];
  onClose: () => void;
  onDone: (message: string) => void;
};

// Premiar a los elegidos: destellos y/o un cupón, con motivo. Primero se completa y después se revisa
// (ConfirmDialog) antes de dar nada. El identificador del pedido se genera al abrir: un doble clic no premia dos veces.
export function PrizeDialog({ board, people, onClose, onDone }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState<"form" | "review">("form");
  const [withGlints, setWithGlints] = useState(true);
  const [glints, setGlints] = useState("100");
  const [withCoupon, setWithCoupon] = useState(false);
  const [percent, setPercent] = useState("20");
  const [days, setDays] = useState("30");
  const [reason, setReason] = useState(`Top ${people.length} de ${BOARDS.find((b) => b.id === board)!.name.toLowerCase()}`);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (step === "form" && !el.open) el.showModal();
    if (step === "review" && el.open) el.close();
  }, [step]);

  const g = parseInteger(glints);
  const pct = parseInteger(percent);
  const dayCount = parseInteger(days);
  const glintsBad = withGlints && (g === null || g < 1 || g > 5000);
  const pctBad = withCoupon && (pct === null || pct < 1 || pct > 60);
  const daysBad = withCoupon && (dayCount === null || dayCount < 1 || dayCount > 365);
  const ready = (withGlints || withCoupon) && !glintsBad && !pctBad && !daysBad && reason.trim().length > 0;

  const many = people.length === 1 ? "a 1 alumno" : `a ${people.length} alumnos`;
  const gives = [withGlints && g ? `${g} destellos` : null, withCoupon && pct && dayCount ? `un cupón del ${pct} % por ${dayCount} días` : null]
    .filter(Boolean)
    .join(" y ");

  async function give() {
    setBusy(true);
    setError(null);
    try {
      await api("/admin/ranking/prizes", {
        method: "POST",
        body: JSON.stringify({
          requestId,
          board,
          userIds: people.map((p) => p.userId),
          glints: withGlints ? g : null,
          coupon: withCoupon ? { percent: pct, validDays: dayCount } : null,
          reason: reason.trim(),
          notify,
        }),
      });
      onDone(`Listo: premiaste ${many}. Quedó en la bitácora.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo. Probá de nuevo.");
      setStep("form");
      setBusy(false);
    }
  }

  return (
    <>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="prize-title"
        onCancel={onClose}
        onClick={(e) => e.target === dialog.current && onClose()}
      >
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) setStep("review");
          }}
        >
          <h2 id="prize-title">Premiar {many}</h2>
          <p className={styles.note}>{people.map((p) => `${p.name} (#${p.position})`).join(", ")}.</p>

          <fieldset className={styles.opt}>
            <label className={styles.check}>
              <input type="checkbox" checked={withGlints} onChange={(e) => setWithGlints(e.target.checked)} />
              Destellos
            </label>
            {withGlints && (
              <label className={styles.field}>
                <span>Cuántos a cada uno</span>
                <span className={`${styles.num} ${glintsBad ? styles.bad : ""}`}>
                  <input inputMode="numeric" value={glints} onChange={(e) => setGlints(e.target.value)} aria-label="Destellos" />
                  <span>destellos</span>
                </span>
                <small>Entran al saldo. No suman en la tabla de destellos conseguidos.</small>
              </label>
            )}
          </fieldset>

          <fieldset className={styles.opt}>
            <label className={styles.check}>
              <input type="checkbox" checked={withCoupon} onChange={(e) => setWithCoupon(e.target.checked)} />
              Cupón de descuento
            </label>
            {withCoupon && (
              <div className={styles.pair}>
                <label className={styles.field}>
                  <span>Descuento</span>
                  <span className={`${styles.num} ${pctBad ? styles.bad : ""}`}>
                    <input inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value)} aria-label="Descuento" />
                    <span>%</span>
                  </span>
                </label>
                <label className={styles.field}>
                  <span>Vale por</span>
                  <span className={`${styles.num} ${daysBad ? styles.bad : ""}`}>
                    <input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Días" />
                    <span>días</span>
                  </span>
                </label>
              </div>
            )}
          </fieldset>
          {pctBad && <p className={styles.err}>El descuento va de 1 a 60 %.</p>}
          {daysBad && <p className={styles.err}>Entre 1 y 365 días.</p>}
          {glintsBad && <p className={styles.err}>Entre 1 y 5000 destellos.</p>}

          <label className={styles.field}>
            <span>Motivo</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Por qué se los premia" />
            <small>Queda en la bitácora y los alumnos lo ven en el aviso de los destellos.</small>
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Avisarles por mail
          </label>

          {error && (
            <p className={person.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <button type="button" className={person.button} onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className={`${person.button} ${person.primary}`} disabled={!ready}>
              Revisar
            </button>
          </div>
        </form>
      </dialog>

      <ConfirmDialog
        open={step === "review"}
        title="¿Confirmás el premio?"
        confirmLabel={busy ? "Dando…" : "Dar el premio"}
        cancelLabel="Volver"
        onCancel={() => !busy && setStep("form")}
        onConfirm={() => !busy && give()}
      >
        {`A ${many} (${people.map((p) => firstName(p.name)).join(", ")}), a cada uno: ${gives}. Motivo: «${reason.trim()}». ${
          withGlints && g ? `Son ${(g * people.length).toLocaleString("es-AR")} destellos en total. ` : ""
        }Los destellos se pueden deshacer desde la bitácora si no los gastaron; el cupón se anula desde Cupones.`}
      </ConfirmDialog>
    </>
  );
}
