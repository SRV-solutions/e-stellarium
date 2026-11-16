import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../auth/useAuth";
import { can } from "../../lib/permissions";
import { Glint } from "../../components/Glint/Glint";
import {
  formatItemField,
  formatSetting,
  ITEM_FIELD_NAMES,
  LEDGER,
  parseInteger,
  SETTING_NAMES,
  type SettingUnit,
} from "../../lib/economy";
import type { AdminShopItem, AuditEntry, AuditPage, SettingInfo } from "../../types";
import { ShopEditor } from "./ShopEditor";
import { effectiveItem, itemChanges, itemError, type ItemDraft, type NewItem } from "./shopForm";
import { Toast } from "./Toast";
import styles from "./EconomyPage.module.css";

type View = "values" | "shop";

const fmt = (n: number) => n.toLocaleString("es-AR");

// La economía editable: lo que da cada cosa (settings) y lo que se vende (shop_items).
// Lo cambiado queda en un borrador hasta guardar; la barra de abajo lo resume como en Roles.
export function EconomyPage() {
  const { user, refreshEconomy } = useAuth();
  const [settings, setSettings] = useState<SettingInfo[] | null>(null);
  const [items, setItems] = useState<AdminShopItem[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({}); // los valores tocados, como se escribieron
  const [edits, setEdits] = useState<Record<string, ItemDraft>>({}); // los campos tocados de cada ítem
  const [added, setAdded] = useState<NewItem[]>([]); // lo nuevo, todavía sin guardar
  const [view, setView] = useState<View>("values");
  const [last, setLast] = useState<AuditEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const canSeeAudit = can(user, "audit:view");

  const show = useCallback((data: Loaded) => {
    setSettings(data.settings);
    setItems(data.items);
    setLast(data.last);
  }, []);

  useEffect(() => {
    fetchEconomy(canSeeAudit).then(show, (err) =>
      setError(err instanceof ApiError ? err.message : "No pudimos cargar la economía.")
    );
  }, [canSeeAudit, show]);

  if (!settings || !items) return error ? <p className={styles.error}>{error}</p> : null;

  // ---------- Lo cambiado ----------
  const saved = Object.fromEntries(settings.map((s) => [s.key, s]));
  const settingValue = (key: string) => (key in values ? parseInteger(values[key]) : saved[key].value);
  const settingValid = (key: string) => {
    const v = settingValue(key);
    return v !== null && v >= saved[key].min && v <= saved[key].max;
  };
  const changedSettings = Object.keys(values).filter((k) => settingValue(k) !== saved[k].value);
  const changedItems = items.filter((i) => edits[i.id] && Object.keys(itemChanges(i, edits[i.id])).length > 0);
  const invalid =
    changedSettings.some((k) => !settingValid(k)) ||
    changedItems.some((i) => itemError(effectiveItem(i, edits[i.id]))) ||
    added.some((n) => itemError(n));
  const total = changedSettings.length + changedItems.length + added.length;

  function setValue(key: string, text: string) {
    setValues((v) => ({ ...v, [key]: text }));
  }

  function discard() {
    setValues({});
    setEdits({});
    setAdded([]);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    let records = 0;
    try {
      if (changedSettings.length > 0) {
        const body = Object.fromEntries(changedSettings.map((k) => [k, settingValue(k)]));
        await api("/admin/settings", { method: "PATCH", body: JSON.stringify({ values: body }) });
        records++;
        setValues({});
      }
      for (const item of changedItems) {
        await api(`/admin/shop/${item.id}`, { method: "PATCH", body: JSON.stringify(itemChanges(item, edits[item.id])) });
        records++;
        setEdits((e) => {
          const copy = { ...e };
          delete copy[item.id];
          return copy;
        });
      }
      for (const item of added) {
        await api("/admin/shop", { method: "POST", body: JSON.stringify(newItemBody(item)) });
        records++;
        // Ya guardado: sale del borrador, así un reintento no lo agrega dos veces
        setAdded((a) => a.filter((n) => n.tempId !== item.tempId));
      }
      setToast(`Guardado. ${records === 1 ? "Quedó 1 registro" : `Quedaron ${records} registros`} en la bitácora.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar todo. Probá de nuevo.");
    } finally {
      await fetchEconomy(canSeeAudit).then(show, () => {});
      refreshEconomy(); // las pantallas del alumno (y el encabezado) ven los números nuevos
      setSaving(false);
    }
  }

  // ---------- La barra de guardar: cada cambio en una línea ----------
  const lines: ReactNode[] = [
    ...changedSettings.map((k) => (
      <div key={k}>
        <span className={styles.k}>{SETTING_NAMES[k]?.name ?? k}:</span>{" "}
        <span className={styles.was}>{fmt(saved[k].value)}</span> →{" "}
        <span className={styles.now}>{settingValue(k) === null ? "?" : formatSetting(k, settingValue(k))}</span>
      </div>
    )),
    ...changedItems.flatMap((item) => {
      const changes = itemChanges(item, edits[item.id]) as Record<string, unknown>;
      return Object.entries(changes).map(([field, value]) =>
        field === "active" ? (
          <div key={item.id + field} className={value ? styles.add : styles.remove}>
            {value ? `+ Vuelve a vender ${item.name}` : `− Retira ${item.name}`}
          </div>
        ) : (
          <div key={item.id + field}>
            <span className={styles.k}>
              {item.name} · {ITEM_FIELD_NAMES[field].toLowerCase()}:
            </span>{" "}
            <span className={styles.was}>{formatItemField(field, (item as Record<string, unknown>)[field])}</span> →{" "}
            <span className={styles.now}>{formatItemField(field, value)}</span>
          </div>
        )
      );
    }),
    ...added.map((n) => (
      <div key={n.tempId} className={styles.add}>
        + {n.name.trim() || "Sin nombre"} <span className={styles.k}>a {n.price || "?"} destellos</span>
      </div>
    )),
  ];

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1>Economía</h1>
        <p>
          Cuánta experiencia y cuántos destellos da cada cosa, y qué se vende en la tienda. Los cambios valen desde que
          guardás: lo que ya se ganó o se compró queda como estaba.
        </p>
        {last && (
          <p className={styles.last}>
            Último cambio: {last.actor?.name ?? "un script"}, {sinceText(last.createdAt)} ·{" "}
            <Link to="/admin/audit">ver en la bitácora</Link>
          </p>
        )}
      </div>

      <div className={styles.kinds} role="group" aria-label="Parte">
        <button type="button" aria-pressed={view === "values"} onClick={() => setView("values")}>
          Lo que da cada cosa{changedSettings.length > 0 && <b>{changedSettings.length}</b>}
        </button>
        <button type="button" aria-pressed={view === "shop"} onClick={() => setView("shop")}>
          La tienda{changedItems.length + added.length > 0 && <b>{changedItems.length + added.length}</b>}
        </button>
      </div>

      {view === "values" ? (
        <div className={styles.eph}>
          <table className={styles.ledger}>
            <thead>
              <tr>
                <th scope="col">Actividad</th>
                <th scope="col">
                  <span className={styles.xp}>XP</span>
                </th>
                <th scope="col">
                  <span className={styles.glintHead}>
                    <Glint /> Destellos
                  </span>
                </th>
              </tr>
            </thead>
            {LEDGER.map((group) => (
              <tbody key={group.group}>
                <tr className={styles.group}>
                  <th colSpan={3} scope="rowgroup">
                    <b>{group.group}</b>
                    {group.note && <small>{group.note}</small>}
                  </th>
                </tr>
                {group.rows.map((row) => {
                  const field = (key: string) => (
                    <NumberField
                      settingKey={key}
                      label={row.name}
                      text={values[key] ?? String(saved[key].value)}
                      was={changedSettings.includes(key) ? saved[key].value : null}
                      invalid={!settingValid(key)}
                      range={saved[key]}
                      disabled={saving}
                      onChange={(text) => setValue(key, text)}
                    />
                  );
                  return (
                    <tr key={row.name + (row.one ?? row.xp ?? row.glints)} className={styles.val}>
                      <th scope="row" className={styles.label}>
                        <b>{row.name}</b>
                        {row.detail && <small>{row.detail}</small>}
                      </th>
                      {row.one ? (
                        <td colSpan={2} className={styles.wide}>
                          {field(row.one)}
                        </td>
                      ) : (
                        <>
                          <td className={styles.cell}>{row.xp ? field(row.xp) : <span className={styles.none}>—</span>}</td>
                          <td className={styles.cell}>
                            {row.glints ? field(row.glints) : <span className={styles.none}>—</span>}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
          <Reckon value={settingValue} saved={(k) => saved[k].value} items={items} edits={edits} added={added} />
        </div>
      ) : (
        <ShopEditor
          items={items}
          edits={edits}
          added={added}
          disabled={saving}
          freezeLimit={
            <NumberField
              settingKey="shop.freezes_per_month"
              label="Protectores comprados por mes"
              text={values["shop.freezes_per_month"] ?? String(saved["shop.freezes_per_month"].value)}
              was={changedSettings.includes("shop.freezes_per_month") ? saved["shop.freezes_per_month"].value : null}
              invalid={!settingValid("shop.freezes_per_month")}
              range={saved["shop.freezes_per_month"]}
              disabled={saving}
              onChange={(text) => setValue("shop.freezes_per_month", text)}
            />
          }
          onEdit={(id, draft) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...draft } }))}
          onAdd={(item) => setAdded((a) => [...a, item])}
          onChangeNew={(tempId, draft) =>
            setAdded((a) => a.map((n) => (n.tempId === tempId ? { ...n, ...draft } : n)))
          }
          onDropNew={(tempId) => setAdded((a) => a.filter((n) => n.tempId !== tempId))}
        />
      )}

      <div className={`${styles.dock} ${total > 0 ? styles.dockOn : ""}`} inert={total === 0}>
        <div className={styles.summary}>
          {lines}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
        <div className={styles.actions}>
          {invalid && <span className={styles.badNote}>Hay un valor fuera de rango</span>}
          <button type="button" className={styles.button} onClick={discard} disabled={saving}>
            Descartar
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            onClick={save}
            disabled={saving || invalid}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}

type Loaded = { settings: SettingInfo[]; items: AdminShopItem[]; last: AuditEntry | null };

// Los valores, la tienda y el último cambio de cualquiera de los dos (si puede ver la bitácora)
async function fetchEconomy(canSeeAudit: boolean): Promise<Loaded> {
  const [s, i] = await Promise.all([
    api<{ settings: SettingInfo[] }>("/admin/settings"),
    api<{ items: AdminShopItem[] }>("/admin/shop"),
  ]);
  let last: AuditEntry | null = null;
  if (canSeeAudit) {
    const pages = await Promise.all(
      ["settings", "shop_item"].map((type) => api<AuditPage>(`/admin/audit?targetType=${type}`))
    );
    last = pages.map((p) => p.entries[0]).filter(Boolean).sort((a, b) => b.id - a.id)[0] ?? null;
  }
  return { settings: s.settings, items: i.items, last };
}

function newItemBody(item: NewItem) {
  return {
    kind: item.kind,
    name: item.name,
    note: item.note,
    price: parseInteger(item.price),
    ...(item.kind === "coupon" ? { percent: parseInteger(item.percent) } : {}),
    ...(item.kind === "color" ? { hex: item.hex } : {}),
    ...(item.kind === "title" ? { altName: item.altName.trim() || null } : {}),
  };
}

// "hace 2 días", "hoy", "ayer"
function sinceText(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

const UNIT: Record<SettingUnit, ReactNode> = {
  xp: <span className={styles.xp}>XP</span>,
  glints: <Glint />,
  percent: <span className={styles.unit}>%</span>,
  days: <span className={styles.unit}>días</span>,
  count: null,
  // Los de los desafíos no aparecen en esta pantalla
  weekday: null,
  hour: null,
  questions: null,
};

type FieldProps = {
  settingKey: string;
  label: string;
  text: string;
  was: number | null; // el valor guardado, si cambió
  invalid: boolean;
  range: { min: number; max: number };
  disabled: boolean;
  onChange: (text: string) => void;
};

// El número editable: una lectura del instrumento. Lo cambiado muestra lo de antes tachado
function NumberField({ settingKey, label, text, was, invalid, range, disabled, onChange }: FieldProps) {
  const unit = SETTING_NAMES[settingKey]?.unit ?? "count";
  const classes = [styles.field, was !== null ? styles.dirty : "", invalid ? styles.bad : ""].join(" ");
  return (
    <span className={styles.num}>
      {was !== null && <span className={styles.wasNum}>{fmt(was)}</span>}
      <label className={classes}>
        <input
          type="text"
          inputMode="numeric"
          value={text}
          disabled={disabled}
          aria-label={label}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        />
        {UNIT[unit]}
      </label>
      {invalid && (
        <span className={styles.err}>
          {unit === "percent" ? "Ningún cupón pasa del 60 %." : `Entre ${fmt(range.min)} y ${fmt(range.max)}.`}
        </span>
      )}
    </span>
  );
}

type ReckonProps = {
  value: (key: string) => number | null;
  saved: (key: string) => number;
  items: AdminShopItem[];
  edits: Record<string, ItemDraft>;
  added: NewItem[];
};

// Una semana de alguien constante: el repaso todos los días (4 de 5) y los dos desafíos (7 de 10)
function weekOf(v: (key: string) => number | null) {
  const n = (key: string) => v(key) ?? 0;
  return {
    glints: 7 * n("glints.review_completed") + 2 * (7 * n("glints.challenge_correct") + n("glints.challenge_completed")),
    xp:
      7 * (4 * n("xp.review_correct") + n("xp.review_completed")) +
      2 * (7 * n("xp.challenge_correct") + n("xp.challenge_completed")),
  };
}

// La cuenta de al lado: qué significan los números juntos, antes de guardar
function Reckon({ value, saved, items, edits, added }: ReckonProps) {
  const now = weekOf(value);
  const before = weekOf(saved);
  // Los cupones como quedarían (con los precios del borrador), de menor a mayor
  const coupons = [
    ...items.filter((i) => i.kind === "coupon").map((i) => effectiveItem(i, edits[i.id])),
    ...added.filter((n) => n.kind === "coupon"),
  ]
    .map((c) => ({ percent: parseInteger(String(c.percent ?? "")), price: parseInteger(String(c.price)), active: c.active }))
    .filter((c) => c.active && c.percent !== null && c.price !== null)
    .sort((a, b) => a.percent! - b.percent!);
  const max = Math.max(1, ...coupons.map((c) => c.price!));

  const delta = (a: number, b: number) =>
    a === b ? null : (
      <span className={`${styles.delta} ${a > b ? styles.up : styles.down}`}>
        {a > b ? "+" : "−"}
        {fmt(Math.abs(a - b))}
      </span>
    );

  return (
    <aside className={styles.reckon}>
      <h2>Una semana constante</h2>
      <p>Con el repaso todos los días (4 de 5) y los dos desafíos (7 de 10), sin contar estrellas ni insignias.</p>
      <dl>
        <div>
          <dt>Destellos por semana</dt>
          <dd className={styles.glintNumber}>
            <Glint />
            {fmt(now.glints)}
            {delta(now.glints, before.glints)}
          </dd>
        </div>
        <div>
          <dt>Experiencia por semana</dt>
          <dd className={styles.xpNumber}>
            {fmt(now.xp)} <small>XP</small>
            {delta(now.xp, before.xp)}
          </dd>
        </div>
      </dl>
      {coupons.length > 0 && (
        <div className={styles.weeks}>
          <h3>Para comprar un cupón</h3>
          {coupons.map((c, i) => {
            const weeks = now.glints > 0 ? c.price! / now.glints : Infinity;
            return (
              <div key={i} className={styles.wk}>
                <span className={styles.pc}>{c.percent} %</span>
                <span className={styles.bar}>
                  <i style={{ width: `${Math.round((c.price! / max) * 100)}%` }} />
                </span>
                <span className={styles.t}>
                  {weeks === Infinity
                    ? "nunca"
                    : weeks <= 1
                      ? "1 semana"
                      : `${(Math.ceil(weeks * 10) / 10).toLocaleString("es-AR")} semanas`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
