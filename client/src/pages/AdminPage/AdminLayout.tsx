import { NavLink, Navigate, Outlet, useLocation } from "react-router";
import { AppHeader } from "../../components/AppHeader/AppHeader";
import { useAuth } from "../../auth/useAuth";
import { adminSectionsFor, ROLE_NAMES } from "../../lib/permissions";
import styles from "./AdminLayout.module.css";

// El armazón del panel: el índice a la izquierda (solo las secciones que tus permisos dejan ver)
// y la sección elegida a la derecha. Sin el cosmos que se mueve: el panel es para trabajar.
export function AdminLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const sections = adminSectionsFor(user);

  // /admin a secas lleva a la primera sección que tengas
  if (pathname === "/admin" || pathname === "/admin/") return <Navigate to={sections[0].to} replace />;

  return (
    <div className={styles.screen}>
      <AppHeader />
      <div className={styles.panel}>
        <nav className={styles.rail} aria-label="Panel">
          <p>
            Panel · <span>{ROLE_NAMES[user!.role]}</span>
          </p>
          {sections.map((section) => (
            <NavLink
              key={section.to}
              to={section.to}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}
            >
              {section.label}
            </NavLink>
          ))}
        </nav>
        <main className={styles.page}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
