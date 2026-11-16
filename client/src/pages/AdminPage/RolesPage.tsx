import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { PERMISSION_GROUPS, PERMISSION_NAMES, ROLE_NAMES } from "../../lib/permissions";
import type { Permission, RoleInfo, RoleKey } from "../../types";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { Toast } from "./Toast";
import styles from "./RolesPage.module.css";

const TOTAL = PERMISSION_GROUPS.reduce((n, g) => n + g.items.length, 0);
type Draft = Partial<Record<RoleKey, Permission[]>>;

// La estrella de cada permiso: el contorno apagado o rellena (encendida)
const STAR_PATH = "M0 -10 L2.6 -2.6 L10 0 L2.6 2.6 L0 10 L-2.6 2.6 L-10 0 L-2.6 -2.6 Z";

const LOCK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

// Qué cambió en un rol: lo agregado y lo sacado, respecto de lo guardado
function diffOf(saved: Permission[], draft: Permission[]) {
  return { added: draft.filter((p) => !saved.includes(p)), removed: saved.filter((p) => !draft.includes(p)) };
}

export function RolesPage() {
  const [roles, setRoles] = useState<RoleInfo[] | null>(null);
  const [draft, setDraft] = useState<Draft>({}); // lo que se tocó y todavía no se guardó
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    api<{ roles: RoleInfo[] }>("/admin/roles").then(
      (r) => setRoles(r.roles),
      (err) => setError(err instanceof ApiError ? err.message : "No pudimos cargar los roles.")
    );
  }, []);

  if (!roles) return error ? <p className={styles.error}>{error}</p> : null;

  // Las columnas: los roles de staff (los alumnos no tienen permisos de staff)
  const columns = roles.filter((r) => r.key !== "student");
  const permissionsOf = (role: RoleInfo) => draft[role.key] ?? role.permissions;

  function toggle(role: RoleInfo, permission: Permission) {
    // Desde el borrador más nuevo (d), no del de esta pantalla: así dos clics seguidos no se pisan
    setDraft((d) => {
      const current = d[role.key] ?? role.permissions;
      const next = current.includes(permission) ? current.filter((p) => p !== permission) : [...current, permission];
      // Si volvió a como estaba guardado, deja de contar como cambio
      const same = next.length === role.permissions.length && next.every((p) => role.permissions.includes(p));
      const copy = { ...d };
      if (same) delete copy[role.key];
      else copy[role.key] = next;
      return copy;
    });
  }

  const changed = columns.filter((role) => draft[role.key]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Un pedido por rol: cada uno reemplaza la lista entera y deja su registro en la bitácora
      const updated = [...roles!];
      for (const role of changed) {
        const { role: saved } = await api<{ role: RoleInfo }>(`/admin/roles/${role.key}`, {
          method: "PATCH",
          body: JSON.stringify({ permissions: draft[role.key] }),
        });
        updated[updated.findIndex((r) => r.key === saved.key)] = saved;
      }
      setRoles(updated);
      setDraft({});
      setToast("Permisos guardados. Quedó en la bitácora.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1>Roles</h1>
        <p>
          Qué puede hacer cada rol. Encendé o apagá una estrella y guardá: cada rol cambiado queda en la bitácora y se
          puede revertir.
        </p>
      </div>

      <table className={styles.matrix}>
        <thead>
          <tr>
            <th>
              <span className={styles.hidden}>Permiso</span>
            </th>
            {columns.map((role) => (
              <th key={role.key} scope="col">
                <b>{ROLE_NAMES[role.key]}</b>
                {role.editable ? (
                  <small>
                    {permissionsOf(role).length} de {TOTAL}
                  </small>
                ) : (
                  <small className={styles.locked}>{LOCK}Todos, fijo</small>
                )}
              </th>
            ))}
          </tr>
        </thead>
        {PERMISSION_GROUPS.map((group) => (
          <tbody key={group.name}>
            <tr className={styles.group}>
              <th colSpan={columns.length + 1} scope="rowgroup">
                {group.name}
              </th>
            </tr>
            {group.items.map((item) => (
              <tr key={item.key} className={styles.perm}>
                <th scope="row" className={styles.label}>
                  <b>{PERMISSION_NAMES[item.key]}</b>
                  <small>{item.detail}</small>
                </th>
                {columns.map((role) => {
                  const on = permissionsOf(role).includes(item.key);
                  const dirty = on !== role.permissions.includes(item.key);
                  return (
                    <td key={role.key} className={styles.cell}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={`${PERMISSION_NAMES[item.key]}: ${ROLE_NAMES[role.key]}`}
                        className={`${styles.star} ${dirty ? styles.dirty : ""}`}
                        disabled={!role.editable || saving}
                        onClick={() => toggle(role, item.key)}
                      >
                        <svg viewBox="-12 -12 24 24" aria-hidden="true">
                          <path d={STAR_PATH} />
                        </svg>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      <p className={styles.note}>
        Los alumnos no tienen permisos de staff: juegan, y nada más. Los docentes van a ver solo el contenido y los
        alumnos de sus cursos (llega con el paso de contenido).
      </p>

      {/* La barra de guardar: aparece abajo mientras haya cambios sin guardar */}
      <div className={`${styles.dock} ${changed.length ? styles.dockOn : ""}`} inert={!changed.length}>
        <div className={styles.summary}>
          {changed.map((role) => {
            const { added, removed } = diffOf(role.permissions, draft[role.key]!);
            return (
              <div key={role.key}>
                <b>{ROLE_NAMES[role.key]}</b>
                {added.map((p) => (
                  <span key={p} className={styles.add}>
                    + {PERMISSION_NAMES[p]}
                  </span>
                ))}
                {removed.map((p) => (
                  <span key={p} className={styles.remove}>
                    − {PERMISSION_NAMES[p]}
                  </span>
                ))}
              </div>
            );
          })}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={() => setDraft({})} disabled={saving}>
            Descartar
          </button>
          <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => setConfirming(true)} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      <Toast message={toast} onDone={clearToast} />

      <ConfirmDialog
        open={confirming}
        title="¿Guardar los permisos?"
        cancelLabel="Cancelar"
        confirmLabel="Guardar"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          save();
        }}
      >
        Cambian los permisos de {changed.map((r) => ROLE_NAMES[r.key]).join(" y ")}. Se aplican en el momento, quedan en
        la bitácora y se pueden revertir.
      </ConfirmDialog>
    </div>
  );
}
