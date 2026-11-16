import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { AdminCoupon, AdminCouponsPage, AdminCouponStatus } from "../../types";
import { dayMonth, firstName, shortName } from "./people";
import { IssueCouponDialog } from "./IssueCouponDialog";
import { Toast } from "./Toast";
import common from "./PeoplePage.module.css";
import person from "./PersonCard.module.css";
import styles from "./CouponsPage.module.css";

const STATUSES: { key: AdminCouponStatus | "all"; label: string }[] = [
  { key: "live", label: "Vigentes" },
  { key: "used", label: "Usados" },
  { key: "expired", label: "Vencidos" },
  { key: "void", label: "Anulados" },
  { key: "all", label: "Todos" },
];

function origin(c: AdminCoupon) {
  if (c.source === "constellation") return c.course ? `Examen de ${shortName(c.course)}` : "Examen";
  if (c.source === "shop") return "Tienda (destellos)";
  return c.reason ? `A mano · ${c.reason}` : "A mano";
}

function Status({ c }: { c: AdminCoupon }) {
  const text = {
    live: ["Vigente", `vence el ${dayMonth(c.expiresAt)}`],
    used: ["Usado", c.usedAt ? `el ${dayMonth(c.usedAt)}` : ""],
    expired: ["Venció", `el ${dayMonth(c.expiresAt)}`],
    void: ["Anulado", c.void ? `el ${dayMonth(c.void.at)}${c.void.by ? `, por ${firstName(c.void.by)}` : ""}` : ""],
  }[c.status];
  return (
    <span className={`${styles.status} ${styles[c.status]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {text[0]}
      <small>{text[1]}</small>
      {c.void && <small>{c.void.reason}</small>}
    </span>
  );
}

// Cupones: todos (examen, tienda y de regalo), emitir uno de regalo y anular uno sin usar
export function CouponsPage() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AdminCouponStatus | "all">("live");
  const [page, setPage] = useState<AdminCouponsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [voiding, setVoiding] = useState<AdminCoupon | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(q.trim()), 250);
    return () => clearTimeout(timer);
  }, [q]);

  const queryFor = useCallback(
    (offset = 0) => {
      const query = new URLSearchParams({ status });
      if (search) query.set("q", search);
      if (offset) query.set("offset", String(offset));
      return `/admin/coupons?${query}`;
    },
    [status, search]
  );

  useEffect(() => {
    let current = true;
    api<AdminCouponsPage>(queryFor()).then(
      (data) => {
        if (!current) return;
        setError(null);
        setPage(data);
      },
      (err) => current && setError(err instanceof ApiError ? err.message : "No pudimos cargar los cupones.")
    );
    return () => {
      current = false;
    };
  }, [queryFor, reloads]);

  async function loadMore() {
    if (!page?.nextOffset || loadingMore) return;
    setLoadingMore(true);
    try {
      const more = await api<AdminCouponsPage>(queryFor(page.nextOffset));
      setPage({ ...more, coupons: [...page.coupons, ...more.coupons] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos cargar más.");
    } finally {
      setLoadingMore(false);
    }
  }

  const changed = (message: string) => {
    setToast(message);
    setReloads((n) => n + 1);
  };

  return (
    <div className={common.page}>
      <div className={styles.head}>
        <div className={common.head}>
          <h1>Cupones</h1>
          <p>
            Todos los cupones: los del examen, los de la tienda y los que se dan a mano. Desde acá emitís uno de regalo o
            anulás uno que todavía no se usó.
          </p>
        </div>
        <button type="button" className={styles.primary} onClick={() => setIssuing(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Emitir un cupón
        </button>
      </div>

      <div className={common.tools}>
        <label className={common.search}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código, nombre o email"
            aria-label="Buscar por código, nombre o email"
          />
        </label>
        <div className={common.kinds} role="group" aria-label="Estado">
          {STATUSES.map((s) => (
            <button key={s.key} type="button" aria-pressed={status === s.key} onClick={() => setStatus(s.key)}>
              {s.label}
              {page && <b>{page.counts[s.key]}</b>}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className={common.error} role="alert">
          {error}
        </p>
      )}
      {page && (
        <>
          <div className={`${styles.row} ${styles.colhead}`} aria-hidden="true">
            <span />
            <span>Código y origen</span>
            <span>De quién</span>
            <span className={styles.colStatus}>Estado</span>
            <span />
          </div>
          <ul className={common.list}>
            {page.coupons.length === 0 && <li className={common.none}>No hay cupones acá.</li>}
            {page.coupons.map((c) => (
              <li key={c.id} className={`${styles.row} ${c.status === "live" ? "" : styles.off}`}>
                <span className={styles.ticket}>
                  {c.percent}
                  <small>%</small>
                </span>
                <span className={styles.code}>
                  {c.code}
                  <small>{origin(c)}</small>
                </span>
                <span className={styles.who}>
                  {c.user.name}
                  <small>{c.user.email}</small>
                </span>
                <Status c={c} />
                <span className={styles.act}>
                  {c.status === "live" && (
                    <button type="button" className={`${person.button} ${person.danger} ${styles.sm}`} onClick={() => setVoiding(c)}>
                      Anular
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {page.nextOffset && (
            <div className={common.more}>
              <button type="button" className={common.moreButton} onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Cargando…" : "Ver más"}
              </button>
            </div>
          )}
        </>
      )}

      <IssueCouponDialog
        open={issuing}
        onClose={() => setIssuing(false)}
        onDone={(message) => {
          setIssuing(false);
          setStatus("live");
          changed(message);
        }}
      />
      {voiding && (
        <VoidDialog
          coupon={voiding}
          onClose={() => setVoiding(null)}
          onDone={(message) => {
            setVoiding(null);
            changed(message);
          }}
        />
      )}
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}

// Anular: pide el motivo (queda en la bitácora y en la lista)
function VoidDialog({ coupon, onClose, onDone }: { coupon: AdminCoupon; onClose: () => void; onDone: (m: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function submit() {
    if (!reason.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/coupons/${coupon.id}`, { method: "DELETE", body: JSON.stringify({ reason: reason.trim() }) });
      onDone(`El cupón ${coupon.code} quedó anulado.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo. Probá de nuevo.");
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="void-title"
      onCancel={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <h2 id="void-title">¿Anular el cupón de {firstName(coupon.user.name)}?</h2>
      <p className={styles.note}>
        <b className={styles.mono}>{coupon.code}</b> · {coupon.percent} % · {origin(coupon)}
      </p>
      <ul className={styles.say}>
        <li>Deja de servir en wearesrv.com.</li>
        <li>En Mis cupones lo ve como anulado.</li>
        {coupon.source === "shop" && <li>No le devolvemos los destellos.</li>}
      </ul>
      <label className={styles.field}>
        <span>Motivo</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Por qué se anula" maxLength={300} autoFocus />
      </label>
      <p className={styles.small}>Se puede deshacer desde la bitácora.</p>
      {error && (
        <p className={person.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className={person.button} onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className={`${person.button} ${person.danger}`} disabled={!reason.trim() || busy} onClick={submit}>
          {busy ? "Anulando…" : "Anular"}
        </button>
      </div>
    </dialog>
  );
}
