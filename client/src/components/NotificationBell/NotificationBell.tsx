import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useNotifications, type Notice, type NotificationKind } from "../../hooks/useNotifications";
import styles from "./NotificationBell.module.css";

// Un dibujo y un color por tipo de aviso: naranja lo que pide hacer algo, menta lo bueno,
// coral los problemas, celeste el desafío y violeta lo que espera revisión
const LOOK: Record<NotificationKind, { tone: string; glyph: ReactNode }> = {
  courses: {
    tone: "",
    glyph: (
      <>
        <circle cx="5" cy="17" r="1.6" />
        <circle cx="11" cy="8" r="1.6" />
        <circle cx="19" cy="12" r="1.6" />
        <path d="M6.2 15.8l3.6-6.4M12.4 8.8l5.2 2.4" />
      </>
    ),
  },
  coupon: {
    tone: styles.orange,
    glyph: (
      <>
        <path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z" />
        <path d="M10 7v10" strokeDasharray="2 2" />
      </>
    ),
  },
  coupon_expiring: {
    tone: styles.orange,
    glyph: (
      <>
        <path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z" />
        <path d="M14 10v2.2l1.6 1" />
      </>
    ),
  },
  streak_risk: {
    tone: styles.orange,
    glyph: (
      <>
        <circle cx="16" cy="8" r="3" />
        <path d="M13.6 9.8L4 19M14.8 11L8 18M12.5 7.6L6 14" />
      </>
    ),
  },
  badge: {
    tone: styles.mint,
    glyph: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7.5l1.3 2.8 3 .3-2.2 2 .6 3-2.7-1.5-2.7 1.5.6-3-2.2-2 3-.3z" />
      </>
    ),
  },
  challenge: { tone: styles.glint, glyph: <path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z" /> },
  content_review: {
    tone: styles.violet,
    glyph: (
      <>
        <path d="M4 5h16M4 12h9M4 19h6" />
        <path d="M15 19l1.5-4 4-4 2 2-4 4z" />
      </>
    ),
  },
  content_approved: {
    tone: styles.mint,
    glyph: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M8.5 12.2l2.4 2.4 4.8-5" />
      </>
    ),
  },
  content_rejected: {
    tone: styles.coral,
    glyph: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7.5v5.5M12 16v.4" />
      </>
    ),
  },
  challenge_bank_low: {
    tone: styles.orange,
    glyph: (
      <>
        <path d="M4 19h16M6 19v-3M10 19v-6M14 19v-2M18 19v-9" />
        <path d="M15 6l2 2 3-4" strokeDasharray="1.5 2" />
      </>
    ),
  },
  integrity_fail: {
    tone: styles.coral,
    glyph: (
      <>
        <circle cx="12" cy="4.5" r="1.3" />
        <circle cx="18.2" cy="8" r="1.3" />
        <circle cx="18.2" cy="15.5" r="1.3" />
        <circle cx="12" cy="19.5" r="1.3" />
        <circle cx="5.8" cy="15.5" r="1.3" />
        <circle cx="5.8" cy="8" r="1.3" />
        <path d="M13.2 5.2l3.8 2.2M18.2 9.3v4.9M17 16.3l-3.8 2.4M10.8 18.7l-3.8-2.4M5.8 14.2v-1.5" />
      </>
    ),
  },
};

const TIME_ZONE = "America/Argentina/Buenos_Aires";
const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(d); // "2026-11-16"
// "9:05" (sin el cero adelante)
const hourOf = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false })
    .format(d)
    .replace(/^0(\d)/, "$1");
const weekdayOf = (d: Date) => {
  const w = new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, weekday: "long" }).format(d);
  return w.charAt(0).toUpperCase() + w.slice(1);
};
const dateOf = (d: Date) => new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, day: "numeric", month: "long" }).format(d);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

// En qué grupo va y cómo se dice cuándo llegó: "Hoy, 18:04", "Sábado, 21:40", "2 de noviembre"
function whenOf(iso: string, now: Date) {
  const date = new Date(iso);
  const ago = daysBetween(dayOf(date), dayOf(now));
  if (ago <= 0) return { group: "Hoy", label: `Hoy, ${hourOf(date)}` };
  if (ago === 1) return { group: "Ayer", label: `Ayer, ${hourOf(date)}` };
  if (ago < 7) return { group: "Esta semana", label: `${weekdayOf(date)}, ${hourOf(date)}` };
  return { group: "Antes", label: dateOf(date) };
}

// Un link con #: se navega y, cuando la pantalla terminó de cargar, se baja hasta esa parte
function goTo(navigate: ReturnType<typeof useNavigate>, link: string) {
  navigate(link);
  const hash = link.split("#")[1];
  if (!hash) return;
  let tries = 0;
  const look = () => {
    const target = document.getElementById(hash);
    if (target) target.scrollIntoView({ block: "start" });
    else if (++tries < 30) window.setTimeout(look, 100);
  };
  window.setTimeout(look, 50);
}

// La campanita del encabezado: el número de no leídas y, al tocarla, los últimos avisos
export function NotificationBell() {
  const { count, items, fresh, error, open, close } = useNotifications();
  const [isOpen, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sheetId = useId();
  const navigate = useNavigate();

  // El número nuevo hace sonar la campana (una vez por cada aumento)
  const [ringing, setRinging] = useState(false);
  const lastCount = useRef(count);
  useEffect(() => {
    if (count > lastCount.current) setRinging(true);
    lastCount.current = count;
  }, [count]);

  function toggle() {
    if (isOpen) {
      setOpen(false);
      close();
    } else {
      setOpen(true);
      open();
    }
  }

  // Se cierra tocando afuera o con Escape
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
        close();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, close]);

  function follow(notice: Notice) {
    setOpen(false);
    close();
    if (notice.link) goTo(navigate, notice.link);
  }

  const label = count ? `Avisos: ${count} sin leer` : "Avisos";
  const now = new Date();
  const freshCount = items?.filter((n) => fresh.has(n.id)).length ?? 0;

  // Los avisos agrupados por día, en el orden en que llegan (los más nuevos arriba)
  const groups: { name: string; notices: { notice: Notice; when: string }[] }[] = [];
  for (const notice of items ?? []) {
    const { group, label: when } = whenOf(notice.createdAt, now);
    if (groups.at(-1)?.name !== group) groups.push({ name: group, notices: [] });
    groups.at(-1)!.notices.push({ notice, when });
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.bell} ${count ? styles.has : ""} ${ringing ? styles.ringing : ""}`}
        onClick={toggle}
        onAnimationEnd={() => setRinging(false)}
        aria-label={label}
        title={label}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={sheetId}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
          <path d="M10 20.5a2 2 0 0 0 4 0" />
          <path d="M12 3v2" />
        </svg>
        {count > 0 && (
          <span className={styles.count} aria-hidden="true">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      <section id={sheetId} className={styles.sheet} hidden={!isOpen} aria-label="Avisos">
        <header className={styles.head}>
          <h2>Avisos</h2>
          {items && items.length > 0 && (
            <span>{freshCount ? (freshCount === 1 ? "1 nuevo" : `${freshCount} nuevos`) : "Nada nuevo"}</span>
          )}
        </header>

        {error && <p className={styles.empty}>No se pudieron traer los avisos. Probá de nuevo en un rato.</p>}
        {!error && items === null && <p className={styles.empty}>Cargando…</p>}
        {!error && items?.length === 0 && (
          <div className={styles.empty}>
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="22" strokeDasharray="2 4" />
              <circle cx="32" cy="32" r="2" className={styles.dot} />
            </svg>
            <p>No tenés avisos. Cuando pase algo, aparece acá.</p>
          </div>
        )}

        {!error && items && items.length > 0 && (
          <>
            <div className={styles.list}>
              {groups.map((group) => (
                <div key={group.name}>
                  <div className={styles.day}>{group.name}</div>
                  <ul>
                    {group.notices.map(({ notice, when }) => {
                      const look = LOOK[notice.kind] ?? LOOK.courses;
                      const content = (
                        <>
                          <span className={styles.glyph}>
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              {look.glyph}
                            </svg>
                          </span>
                          <span className={styles.text}>
                            <b>
                              {notice.title}
                              {fresh.has(notice.id) && <span className={styles.newDot} aria-label="nuevo" />}
                            </b>
                            <span className={styles.body}>{notice.body}</span>
                            <span className={styles.when}>
                              {when}
                              {notice.emailSent && (
                                <span className={styles.mail}>
                                  <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <rect x="3.5" y="6" width="17" height="12" rx="2" />
                                    <path d="M4 7l8 6 8-6" />
                                  </svg>
                                  también por mail
                                </span>
                              )}
                            </span>
                          </span>
                        </>
                      );
                      const className = `${styles.notice} ${look.tone} ${fresh.has(notice.id) ? styles.fresh : ""}`;
                      return (
                        <li key={notice.id}>
                          {notice.link ? (
                            <button type="button" className={className} onClick={() => follow(notice)}>
                              {content}
                            </button>
                          ) : (
                            <div className={className}>{content}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <footer className={styles.foot}>Al abrir la campanita se marcan como leídos. Los leídos se borran solos a los 90 días.</footer>
          </>
        )}
      </section>
    </div>
  );
}
