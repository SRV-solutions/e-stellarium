import { Link, NavLink } from "react-router";
import { useAuth } from "../../auth/useAuth";
import logo from "../../assets/logo-srv.png";
import { levelFor } from "../../lib/levels";
import { BrandGauge } from "../BrandGauge/BrandGauge";
import styles from "./AppHeader.module.css";

const navClass = ({ isActive }: { isActive: boolean }) => `${styles.navLink} ${isActive ? styles.active : ""}`;

export function AppHeader() {
  const { user, logout } = useAuth();
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
        </nav>

        <div className={styles.user}>
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
          <button type="button" className={styles.logout} onClick={logout}>
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}