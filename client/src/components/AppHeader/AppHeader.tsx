import { Link } from "react-router";
import { useAuth } from "../../auth/useAuth";
import logo from "../../assets/logo-srv.png";
import styles from "./AppHeader.module.css";

export function AppHeader() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <Link to="/" className={styles.brand}>
          <img src={logo} alt="" className={styles.logo} />
          E-Stellarium
        </Link>
        <div className={styles.user}>
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