import { useEffect, useId, useRef } from "react";
import { Link } from "react-router";
import { formatGlints } from "../../lib/glints";
import type { CosmeticKind, Purchase } from "../../types";
import page from "./ShopPage.module.css";
import styles from "./ShopDialog.module.css";

// Lo que está por comprar: el precio sale de GET /shop (la API lo vuelve a calcular al comprar)
export type Offer =
  | { kind: "coupon"; item: string; price: number; percent: number; validDays: number }
  | { kind: "freeze"; item: string; price: number }
  | { kind: "cosmetic"; item: string; price: number; cosmeticKind: CosmeticKind; label: string };

type Props = {
  offer: Offer | null; // null: el diálogo está cerrado
  glints: number; // el saldo de ahora
  bought: Purchase | null; // si ya compró: la pantalla de "listo"
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
  onWear: (kind: CosmeticKind, id: string) => void;
};

const TIME_ZONE = "America/Argentina/Buenos_Aires";

// "9 de enero"
const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: TIME_ZONE });

// Primero pregunta con la cuenta (tenés, cuesta, te quedan); después de comprar, muestra lo que compró.
// Es un <dialog> con showModal(), como ConfirmDialog: el navegador pone el fondo, el foco y el Escape
export function ShopDialog({ offer, glints, bought, busy, error, onConfirm, onClose, onWear }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = offer !== null;

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(e) => e.target === dialog.current && !busy && onClose()}
    >
      {offer && !bought && (
        <>
          <h2 id={titleId}>{question(offer)}</h2>
          <p>{explanation(offer)}</p>
          <dl className={styles.ledger}>
            <dt>Tenés</dt>
            <dd>{formatGlints(glints)}</dd>
            <dt>Cuesta</dt>
            <dd className={styles.minus}>−{formatGlints(offer.price)}</dd>
            <dt>Te quedan</dt>
            <dd className={styles.total}>{formatGlints(glints - offer.price)}</dd>
          </dl>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.actions}>
            {/* El que deja todo como estaba tiene el foco al abrir */}
            <button type="button" className={styles.ghost} onClick={onClose} disabled={busy} autoFocus>
              Todavía no
            </button>
            <button type="button" className={styles.go} onClick={onConfirm} disabled={busy}>
              {busy ? "Comprando…" : `${offer.kind === "coupon" ? "Canjear" : "Comprar por"} ${formatGlints(offer.price)} destellos`}
            </button>
          </div>
        </>
      )}

      {offer && bought && (
        <div className={styles.got}>
          <h2 id={titleId}>{offer.kind === "freeze" ? "Listo, un protector más" : "Listo, es tuyo"}</h2>
          {offer.kind === "coupon" && bought.coupon && (
            <>
              <p>
                Lo encontrás en <b>Mis cupones</b>, tapado como los otros: raspalo cuando lo vayas a usar.
              </p>
              <article className={`${page.stub} ${styles.newStub}`}>
                <div className={page.face}>
                  <div className={page.percent}>
                    {bought.coupon.percent} %<small>off</small>
                  </div>
                  <div className={page.fine}>Vence el {dayMonth(bought.coupon.expiresAt)}</div>
                </div>
                <div className={page.side}>
                  <span className={styles.scratch}>Raspá</span>
                </div>
              </article>
              <div className={styles.actions}>
                <button type="button" className={styles.ghost} onClick={onClose} autoFocus>
                  Seguir en la tienda
                </button>
                <Link to="/#mis-cupones" className={styles.go}>
                  Ir a Mis cupones
                </Link>
              </div>
            </>
          )}
          {offer.kind === "freeze" && (
            <>
              <p>
                Ya tenés <b>{bought.shop.freeze.owned}</b> {bought.shop.freeze.owned === 1 ? "comprado" : "comprados"}. Se
                usan solos, un día que faltes, después de los gratis del mes.
              </p>
              <div className={styles.actions}>
                <button type="button" className={styles.go} onClick={onClose} autoFocus>
                  Seguir en la tienda
                </button>
              </div>
            </>
          )}
          {offer.kind === "cosmetic" && (
            <>
              <p>Queda en tu colección para siempre. ¿Te lo ponés ahora?</p>
              <div className={styles.actions}>
                <button type="button" className={styles.ghost} onClick={onClose}>
                  Después
                </button>
                <button type="button" className={styles.go} onClick={() => onWear(offer.cosmeticKind, offer.item)} autoFocus>
                  Ponérmelo
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}

function question(offer: Offer) {
  if (offer.kind === "coupon") return `¿Canjeás un cupón del ${offer.percent} %?`;
  if (offer.kind === "freeze") return "¿Comprás un protector de racha?";
  return `¿Comprás ${offer.label}?`;
}

function explanation(offer: Offer) {
  if (offer.kind === "coupon")
    return `Es tu canje de esta semana. El cupón vence a los ${offer.validDays} días y se puede regalar.`;
  if (offer.kind === "freeze") return "Se usa solo, un día que faltes, después de los gratis del mes. No vence.";
  return "No da ventaja: solo cambia cómo te ven. Se compra una vez y queda para siempre.";
}
