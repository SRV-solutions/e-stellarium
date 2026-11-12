import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { useAuth } from "../../auth/useAuth";
import logo from "../../assets/logo-srv.png";
import { levelFor } from "../../lib/levels";
import { Avatar } from "../Avatar/Avatar";
import { BrandGauge } from "../BrandGauge/BrandGauge";
import { Comet } from "../Comet/Comet";
import { ConfirmDialog } from "../ConfirmDialog/ConfirmDialog";
import { Glint } from "../Glint/Glint";
import styles from "./AppHeader.module.css";

// Las secciones: las mismas en el menú de arriba y en el del celular
const LINKS: { to: string; label: string; end?: boolean; icon: ReactNode }[] = [
  { to: "/", label: "Inicio", end: true, icon: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /> },
  {
    to: "/constellations",
    label: "Constelaciones",
    icon: (
      <>
        <circle cx="5" cy="18" r="2" />
        <circle cx="11" cy="9" r="2" />
        <circle cx="19" cy="5" r="2" />
        <path d="M6.5 16.5l3-6M12.8 8l4.4-2.2" />
      </>
    ),
  },
  {
    to: "/challenges",
    label: "Desafíos",
    // Una mira de telescopio
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" />
      </>
    ),
  },
  {
    to: "/shop",
    label: "Tienda",
    // Una bolsa
    icon: (
      <>
        <path d="M4 9h16l-1.2 10.2a1 1 0 0 1-1 .8H6.2a1 1 0 0 1-1-.8z" />
        <path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2" />
      </>
    ),
  },
];

const navClass = ({ isActive }: { isActive: boolean }) => `${styles.navLink} ${isActive ? styles.active : ""}`;
const drawerClass = ({ isActive }: { isActive: boolean }) => `${styles.drawerLink} ${isActive ? styles.drawerActive : ""}`;
const format = (n: number) => n.toLocaleString("es-AR");

export function AppHeader() {
  const { user, logout, stats } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerTop, setDrawerTop] = useState(68);
  const barRef = useRef<HTMLElement>(null);

  // El menú del celular se cierra con Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (!user) return null;
  const level = levelFor(user.totalXp);

  function toggleMenu() {
    // El panel arranca justo debajo del encabezado, esté donde esté (si bajaste un poco, más arriba)
    if (!menuOpen && barRef.current) setDrawerTop(barRef.current.getBoundingClientRect().bottom);
    setMenuOpen(!menuOpen);
  }

  return (
    <>
      <header className={styles.bar} ref={barRef}>
        <div className={styles.inner}>
          <Link to="/" className={styles.brand}>
            <img src={logo} alt="" className={styles.logo} />
            <span className={styles.brandName}>E-Stellarium</span>
          </Link>

          <nav className={styles.nav} aria-label="Principal">
            {LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={navClass}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {link.icon}
                </svg>
                <span>{link.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className={styles.user}>
            {stats && <StreakChip streak={stats.streak} activeToday={stats.activeToday} />}
            <Link
              to="/shop"
              className={styles.glints}
              title="Destellos para la tienda"
              aria-label={`${format(user.glints)} destellos. Ir a la tienda`}
            >
              <Glint />
              {format(user.glints)}
            </Link>
            <Link
              to="/"
              className={styles.level}
              aria-label={`Nivel ${level.level}, ${level.name}, ${user.totalXp} XP`}
              title={`${level.name}. Te faltan ${level.xpToNext} XP para el nivel ${level.level + 1}`}
            >
              <BrandGauge progress={level.progress} still className={styles.gauge} />
              <b className={styles.levelNumber}>Nivel {level.level}</b>
              <span className={styles.xp}>{user.totalXp} XP</span>
            </Link>
            <Avatar alias={user.alias} frame={user.wornFrame} className={styles.avatar} />
            <span className={styles.alias}>{user.alias}</span>
            <button type="button" className={styles.logout} onClick={() => setConfirming(true)} aria-label="Salir">
              <span>Salir</span>
            </button>
            {/* Desde 760 px: tres líneas que se cruzan en una X al abrir */}
            <button
              type="button"
              className={styles.burger}
              onClick={toggleMenu}
              aria-label="Menú"
              aria-expanded={menuOpen}
              aria-controls="app-drawer"
            >
              <i />
              <i />
              <i />
            </button>
          </div>
        </div>
      </header>

      {/* El menú del celular: se abre como el diafragma de un telescopio, en círculo desde el botón.
          Va afuera del encabezado porque su backdrop-filter haría que "fixed" se mida desde él */}
      <nav
        id="app-drawer"
        className={`${styles.drawer} ${menuOpen ? styles.drawerOpen : ""}`}
        style={{ top: drawerTop }}
        aria-label="Menú"
        inert={!menuOpen}
      >
        <div className={styles.who} style={{ "--i": 0 } as CSSProperties}>
          <Avatar alias={user.alias} frame={user.wornFrame} size={52} />
          <div>
            <strong>{user.alias}</strong>
            <span className={styles.whoLevel}>
              Nivel {level.level} · {level.name} · <b>{format(user.totalXp)} XP</b>
            </span>
          </div>
          <div className={styles.balance}>
            <b>
              <Glint />
              {format(user.glints)}
            </b>
            destellos
          </div>
        </div>
        {LINKS.map((link, i) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={drawerClass}
            style={{ "--i": i + 1 } as CSSProperties}
            onClick={() => setMenuOpen(false)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {link.icon}
            </svg>
            {link.label}
          </NavLink>
        ))}
        <div className={styles.drawerOut} style={{ "--i": LINKS.length + 1 } as CSSProperties}>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setConfirming(true);
            }}
          >
            Salir
          </button>
        </div>
      </nav>

      <ConfirmDialog
        open={confirming}
        title="¿Cerrar sesión?"
        cancelLabel="Quedarme"
        confirmLabel="Cerrar sesión"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          logout();
        }}
      >
        Para volver a entrar vas a necesitar tu email y tu contraseña.
      </ConfirmDialog>
    </>
  );
}

// La racha al lado del nivel: el cometa chiquito y los días. Si todavía no jugó hoy, el borde se pone naranja
function StreakChip({ streak, activeToday }: { streak: number; activeToday: boolean }) {
  const days = streak === 1 ? "día" : "días";
  let title;
  if (streak === 0) title = "Sin racha. Jugá algo hoy para empezar una.";
  else title = `Racha de ${streak} ${days}. ${activeToday ? "Hoy ya jugaste." : "Todavía no jugaste hoy."}`;
  const state = streak === 0 ? styles.streakOff : activeToday ? "" : styles.streakRisk;

  return (
    <Link to="/" className={`${styles.streak} ${state}`} title={title} aria-label={title}>
      <Comet streak={streak} activeToday={activeToday} size="small" />
      {streak}
      <small className={styles.streakDays}>{days}</small>
    </Link>
  );
}
