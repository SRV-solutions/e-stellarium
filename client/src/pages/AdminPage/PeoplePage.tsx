import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Avatar } from "../../components/Avatar/Avatar";
import { useAuth } from "../../auth/useAuth";
import { api, ApiError } from "../../lib/api";
import type { PeopleKind, PeoplePage as PeoplePageData, Person, RoleInfo } from "../../types";
import { initials } from "./auditText";
import { lastPlayed, ROLE_NAMES, streakNote } from "./people";
import { PersonCard } from "./PersonCard";
import { Toast } from "./Toast";
import styles from "./PeoplePage.module.css";

const KINDS: { kind: PeopleKind; label: string }[] = [
  { kind: "all", label: "Todos" },
  { kind: "students", label: "Alumnos" },
  { kind: "staff", label: "Staff" },
  { kind: "deleted", label: "Dados de baja" },
];

export function PeoplePage() {
  const { user } = useAuth();
  // La persona abierta va en la dirección (?id=...), así se puede llegar directo desde otro lado
  const [params, setParams] = useSearchParams();
  const openId = params.get("id");

  const [q, setQ] = useState("");
  const [search, setSearch] = useState(""); // la búsqueda que se pide: q, 250 ms después de dejar de escribir
  const [kind, setKind] = useState<PeopleKind>("all");
  const [page, setPage] = useState<PeoplePageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [reloads, setReloads] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(q.trim()), 250);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    let current = true;
    const query = new URLSearchParams({ kind });
    if (search) query.set("q", search);
    api<PeoplePageData>(`/admin/users?${query}`).then(
      (data) => {
        if (!current) return;
        setError(null);
        setPage(data);
      },
      (err) => {
        if (current) setError(err instanceof ApiError ? err.message : "No pudimos cargar la lista.");
      }
    );
    return () => {
      current = false;
    };
  }, [kind, search, reloads]);

  // Los permisos de cada rol, para la línea "qué puede hacer" de la ficha
  useEffect(() => {
    api<{ roles: RoleInfo[] }>("/admin/roles").then((r) => setRoles(r.roles), () => {});
  }, [reloads]);

  async function loadMore() {
    if (!page?.nextOffset || loadingMore) return;
    setLoadingMore(true);
    const query = new URLSearchParams({ kind, offset: String(page.nextOffset) });
    if (search) query.set("q", search);
    try {
      const more = await api<PeoplePageData>(`/admin/users?${query}`);
      setPage({ ...more, people: [...page.people, ...more.people] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos cargar más.");
    } finally {
      setLoadingMore(false);
    }
  }

  function open(person: Person | null) {
    setParams(person ? { id: person.id } : {}, { replace: true });
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1>Personas</h1>
        <p>Alumnos y staff. Desde la ficha de cada uno le cambiás el rol, lo das de baja o lo restaurás; todo queda en la bitácora.</p>
      </div>

      <div className={styles.tools}>
        <label className={styles.search}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o email"
            aria-label="Buscar por nombre o email"
          />
        </label>
        <div className={styles.kinds} role="group" aria-label="Quiénes">
          {KINDS.map((option) => (
            <button
              key={option.kind}
              type="button"
              aria-pressed={kind === option.kind}
              onClick={() => setKind(option.kind)}
            >
              {option.label}
              {page && <b>{page.counts[option.kind]}</b>}
            </button>
          ))}
        </div>
      </div>

      <div className={`${styles.people} ${openId ? "" : styles.closed}`}>
        <div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {page && (
            <>
              <div className={styles.colhead} aria-hidden="true">
                <span>Persona</span>
                <span>Rol</span>
                <span className={styles.colAct}>Última vez que jugó</span>
              </div>
              <ul className={styles.list}>
                {page.people.length === 0 && (
                  <li className={styles.none}>{search ? `Nadie coincide con “${search}”.` : "No hay nadie acá."}</li>
                )}
                {page.people.map((person) => {
                  const note = streakNote(person);
                  return (
                    <li key={person.id}>
                      <button
                        type="button"
                        className={`${styles.row} ${person.deletedAt ? styles.gone : ""}`}
                        aria-current={person.id === openId}
                        onClick={() => open(person)}
                      >
                        <Avatar alias={initials(person.name)} frame={null} className={styles.avatar} />
                        <span className={styles.ident}>
                          <span className={styles.name}>
                            {person.name}
                            {person.id === user?.id && <span className={styles.you}> (vos)</span>}
                          </span>
                          <span className={styles.mail}>{person.email}</span>
                        </span>
                        <span className={`${styles.role} ${person.role !== "student" ? styles.staff : ""}`}>
                          {person.deletedAt ? "De baja" : ROLE_NAMES[person.role]}
                        </span>
                        <span className={styles.act}>
                          {lastPlayed(person.lastActiveOn)}
                          {note && <small>{note}</small>}
                        </span>
                        <svg className={styles.chev} viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {page.nextOffset && (
                <div className={styles.more}>
                  <button type="button" className={styles.moreButton} onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Cargando…" : "Ver más"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {openId && (
          <PersonCard
            key={openId}
            id={openId}
            roles={roles}
            meId={user!.id}
            onClose={() => open(null)}
            onChanged={(message) => {
              setToast(message);
              setReloads((n) => n + 1);
            }}
          />
        )}
      </div>

      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
