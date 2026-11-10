import { useState } from "react";
import { Link, NavLink } from "react-router";
import { useAuth } from "../../auth/useAuth";
import logo from "../../assets/logo-srv.png";
import { levelFor } from "../../lib/levels";
import { BrandGauge } from "../BrandGauge/BrandGauge";
import { Comet } from "../Comet/Comet";
import { ConfirmDialog } from "../ConfirmDialog/ConfirmDialog";
import styles from "./AppHeader.module.css";

const navClass = ({ isActive }: { isActive: boolean }) => `${styles.navLink} ${isActive ? styles.active : ""}`;

export function AppHeader() {
  const { user, logout, stats } = useAuth();
  const [confirming, setConfirming] = useState(false);
  if (!user) return null;
  const level = levelFor(user.totalXp);

  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <Link to="/" className={styles.brand}>
          <img src={logo} alt="" className={styles.logo} />
          <span className={styles.brandName}>E-Stellarium</span>
        </Link>

        <nav className={styles.nav} aria-label="Principal">
          <NavLink to="/" end className={navClass}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
            </svg>
            <span>Inicio</span>
          </NavLink>
          <NavLink to="/constellations" className={navClass}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="5" cy="18" r="2" />
              <circle cx="11" cy="9" r="2" />
              <circle cx="19" cy="5" r="2" />
              <path d="M6.5 16.5l3-6M12.8 8l4.4-2.2" />
            </svg>
            <span>Constelaciones</span>
          </NavLink>
          <NavLink to="/challenges" className={navClass}>
            {/* Una mira de telescopio: los desafíos */}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8" />
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" />
            </svg>
            <span>Desafíos</span>
          </NavLink>
        </nav>

        <div className={styles.user}>
          {stats && <StreakChip streak={stats.streak} activeToday={stats.activeToday} />}
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
          <span className={styles.avatar} aria-hidden="true">
            {user.alias.slice(0, 2).toUpperCase()}
          </span>
          <span className={styles.alias}>{user.alias}</span>
          <button type="button" className={styles.logout} onClick={() => setConfirming(true)} aria-label="Salir">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8M10 12h10M17 9l3 3-3 3" />
            </svg>
            <span>Salir</span>
          </button>
        </div>
      </div>

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
    </header>
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
