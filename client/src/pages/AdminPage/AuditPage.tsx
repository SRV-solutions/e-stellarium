import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Avatar } from "../../components/Avatar/Avatar";
import { useAuth } from "../../auth/useAuth";
import { api, ApiError } from "../../lib/api";
import { can } from "../../lib/permissions";
import type { AuditEntry, AuditPage as AuditPageData, IntegrityCheck } from "../../types";
import { ACTION_FILTERS, actorName, changeOf, initials, sentence, targetName } from "./auditText";
import { IntegritySeal } from "./IntegritySeal";
import { RevertDialog } from "./RevertDialog";
import styles from "./AuditPage.module.css";

const TIME_ZONE = "America/Argentina/Buenos_Aires";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
const hour = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TIME_ZONE });

// "Hoy", "Ayer", "Miércoles 12 de noviembre"
function dayLabel(iso: string) {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (dayKey(iso) === today) return "Hoy";
  if (dayKey(iso) === yesterday) return "Ayer";
  const text = new Date(iso).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TIME_ZONE,
  });
  return text[0].toUpperCase() + text.slice(1);
}

type Filters = { actor: string; action: string; from: string; to: string };
type Target = { type: string; id: string; name: string };
type Actor = { id: string; name: string; email: string };

function query(filters: Filters, target: Target | null, before?: number) {
  const params = new URLSearchParams();
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.action) params.set("action", filters.action);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (target) {
    params.set("targetType", target.type);
    params.set("targetId", target.id);
  }
  if (before) params.set("before", String(before));
  const text = params.toString();
  return text ? `?${text}` : "";
}

// El color del nodo dice qué es: un cambio, un inicio de sesión, una reversión o una falla
function nodeClass(entry: AuditEntry) {
  if (entry.action === "auth.login") return styles.nodeLogin;
  if (entry.action === "audit.revert") return styles.nodeRevert;
  if (entry.action === "integrity.fail") return styles.nodeAlert;
  return styles.nodeChange;
}

export function AuditPage() {
  const { user } = useAuth();
  const canView = can(user, "audit:view");
  const canRevert = can(user, "audit:revert");
  const canCheck = can(user, "integrity:view");

  const [filters, setFilters] = useState<Filters>({ actor: "", action: "", from: "", to: "" });
  // Se puede llegar ya filtrado por un elemento, desde la ficha de una persona:
  // /admin/audit?targetType=user&targetId=...&name=Panel%20Dos
  const [params] = useSearchParams();
  const [target, setTarget] = useState<Target | null>(() => {
    const type = params.get("targetType");
    const id = params.get("targetId");
    return type && id ? { type, id, name: params.get("name") ?? id.slice(0, 8) } : null;
  });
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [actors, setActors] = useState<Actor[]>([]);

  const [check, setCheck] = useState<IntegrityCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const [reverting, setReverting] = useState<AuditEntry | null>(null);
  // El registro que se ilumina un momento (el nuevo de una reversión, o al que se saltó)
  const [flashId, setFlashId] = useState<number | null>(null);

  // Cambiar un filtro vuelve a pedir la lista; reload() la pide de nuevo con los mismos filtros
  const [reloads, setReloads] = useState(0);
  const reload = () => setReloads((n) => n + 1);

  useEffect(() => {
    if (!canView) return;
    let current = true; // si cambian los filtros antes de que llegue, esta respuesta ya no sirve
    api<AuditPageData>(`/admin/audit${query(filters, target)}`).then(
      (page) => {
        if (!current) return;
        setListError(null);
        setEntries(page.entries);
        setNextBefore(page.nextBefore);
      },
      (err) => {
        if (current) setListError(err instanceof ApiError ? err.message : "No pudimos cargar la bitácora.");
      }
    );
    return () => {
      current = false;
    };
  }, [canView, filters, target, reloads]);

  useEffect(() => {
    if (canView) api<{ actors: Actor[] }>("/admin/audit/actors").then((r) => setActors(r.actors), () => {});
    if (canCheck) api<{ check: IntegrityCheck | null }>("/admin/integrity").then((r) => setCheck(r.check), () => {});
  }, [canView, canCheck]);

  // Después de dibujar, el registro iluminado se centra en la pantalla y se apaga solo
  useEffect(() => {
    if (flashId === null) return;
    const el = document.getElementById(`entry-${flashId}`);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    const timer = setTimeout(() => setFlashId(null), 1600);
    return () => clearTimeout(timer);
  }, [flashId, entries]);

  async function loadMore() {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api<AuditPageData>(`/admin/audit${query(filters, target, nextBefore)}`);
      setEntries((current) => [...(current ?? []), ...page.entries]);
      setNextBefore(page.nextBefore);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "No pudimos cargar más registros.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function runCheck() {
    setChecking(true);
    setCheckError(null);
    try {
      // Lo que tarde de verdad, y al menos lo que tarda la luz en bajar por el hilo
      const [result] = await Promise.all([
        api<{ check: IntegrityCheck }>("/admin/integrity/check", { method: "POST" }),
        new Promise((resolve) => setTimeout(resolve, 1600)),
      ]);
      setCheck(result.check);
      // Si falló, la bitácora tiene un registro nuevo (integrity.fail)
      if (!result.check.ok) reload();
    } catch (err) {
      setCheckError(err instanceof ApiError ? err.message : "No pudimos verificar. Probá de nuevo.");
    } finally {
      setChecking(false);
    }
  }

  // Saltar a un registro: sin filtros, para que seguro esté en la lista
  function jumpTo(id: number) {
    const shown = entries?.some((e) => e.id === id);
    if (!shown) {
      setFilters({ actor: "", action: "", from: "", to: "" });
      setTarget(null);
    }
    setFlashId(id);
  }

  function setFilter(name: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  // Los registros donde se corta la cadena, según la última verificación
  const broken = new Set(
    (check?.problems ?? []).flatMap((p) => (p.kind === "chain" ? [Number(p.rowId)] : []))
  );

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1>Bitácora</h1>
        <p>Todo lo que el staff cambió, en orden. Nada se borra ni se edita: deshacer algo agrega un registro nuevo.</p>
      </div>

      {canView && (
        <section className={styles.book} aria-label="Registros">
          <div className={styles.filters}>
            <label className={styles.field}>
              Quién
              <select value={filters.actor} onChange={(e) => setFilter("actor", e.target.value)}>
                <option value="">Todos</option>
                {actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.name}
                  </option>
                ))}
                <option value="system">La app (scripts y verificación)</option>
              </select>
            </label>
            <label className={styles.field}>
              Qué
              <select value={filters.action} onChange={(e) => setFilter("action", e.target.value)}>
                <option value="">Todo</option>
                {ACTION_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Desde
              <input type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} />
            </label>
            <label className={styles.field}>
              Hasta
              <input type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} />
            </label>
            {target && (
              <span className={styles.focus}>
                Solo <b>{target.type === "role" ? `el rol ${target.name}` : target.name}</b>
                <button type="button" onClick={() => setTarget(null)} aria-label="Ver todos">
                  ×
                </button>
              </span>
            )}
          </div>

          {listError && (
            <p className={styles.error} role="alert">
              {listError}
            </p>
          )}

          {entries && (
            <ol className={`${styles.log} ${checking ? styles.scanning : ""}`}>
              {entries.length === 0 && <li className={styles.empty}>No hay registros con estos filtros.</li>}
              {entries.map((entry, i) => {
                // Un título por día, antes del primer registro de ese día
                const newDay = i === 0 || dayKey(entries[i - 1].createdAt) !== dayKey(entry.createdAt);
                const header = newDay ? <li className={styles.day}>{dayLabel(entry.createdAt)}</li> : null;
                const change = changeOf(entry);
                const isBroken = broken.has(entry.id);
                const className = [
                  styles.entry,
                  entry.revertedBy ? styles.undone : "",
                  isBroken ? styles.broken : "",
                  flashId === entry.id ? styles.flash : "",
                ].join(" ");
                const targetButton = entry.target && (
                  <button
                    type="button"
                    className={styles.target}
                    title="Ver solo sus registros"
                    onClick={() =>
                      setTarget({ type: entry.target!.type, id: entry.target!.id, name: targetName(entry) })
                    }
                  >
                    {targetName(entry)}
                  </button>
                );

                return (
                  <Fragment key={entry.id}>
                    {header}
                  <li id={`entry-${entry.id}`} className={className}>
                    <span className={`${styles.node} ${nodeClass(entry)}`} aria-hidden="true" />
                    <p className={styles.what}>
                      <span className={styles.who}>
                        {entry.actor ? (
                          <Avatar alias={initials(entry.actor.name)} frame={null} size={26} className={styles.avatar} />
                        ) : (
                          <span className={styles.system} aria-hidden="true" />
                        )}
                        {actorName(entry)}
                      </span>{" "}
                      {sentence(entry, targetButton)}
                    </p>

                    {change?.kind === "role" && (
                      <div className={styles.diff}>
                        <span className={styles.was}>{change.was}</span>
                        <span className={styles.arrow} aria-label="pasó a">
                          →
                        </span>
                        <span>{change.now}</span>
                      </div>
                    )}
                    {change?.kind === "permissions" && (change.added.length > 0 || change.removed.length > 0) && (
                      <div className={styles.diff}>
                        {change.added.map((name) => (
                          <span key={name} className={`${styles.perm} ${styles.add}`}>
                            <i aria-label="agregó">+</i>
                            {name}
                          </span>
                        ))}
                        {change.removed.map((name) => (
                          <span key={name} className={`${styles.perm} ${styles.remove}`}>
                            <i aria-label="sacó">−</i>
                            {name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className={styles.meta}>
                      <span className={styles.num}>#{entry.id}</span>
                      <span>{hour(entry.createdAt)}</span>
                      {entry.ip && <span className={styles.ip}>{entry.ip}</span>}
                      {isBroken && (
                        <span className={styles.brokenNote}>La cadena se corta acá: este registro fue modificado</span>
                      )}
                    </div>

                    <div className={styles.side}>
                      {entry.revertedBy ? (
                        <span className={styles.tag}>
                          Revertido en{" "}
                          <button type="button" onClick={() => jumpTo(entry.revertedBy!)}>
                            #{entry.revertedBy}
                          </button>
                        </span>
                      ) : entry.revertsId ? (
                        <span className={styles.tag}>
                          Deshace{" "}
                          <button type="button" onClick={() => jumpTo(entry.revertsId!)}>
                            #{entry.revertsId}
                          </button>
                        </span>
                      ) : (
                        canRevert &&
                        entry.canRevert && (
                          <button type="button" className={styles.revert} onClick={() => setReverting(entry)}>
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M9 14L4 9l5-5" />
                              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                            </svg>
                            Revertir
                          </button>
                        )
                      )}
                    </div>
                  </li>
                  </Fragment>
                );
              })}
            </ol>
          )}

          {nextBefore && (
            <div className={styles.more}>
              <button type="button" className={styles.moreButton} onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Cargando…" : "Ver registros anteriores"}
              </button>
            </div>
          )}
        </section>
      )}

      {canCheck && (
        <IntegritySeal check={check} checking={checking} error={checkError} onCheck={runCheck} onJump={jumpTo} />
      )}

      <RevertDialog
        entry={reverting}
        onClose={() => setReverting(null)}
        onReverted={(revertId) => {
          setReverting(null);
          reload();
          setFlashId(revertId);
        }}
      />
    </div>
  );
}
