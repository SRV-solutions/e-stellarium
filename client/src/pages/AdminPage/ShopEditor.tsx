import { useState, type ReactNode } from "react";
import { Avatar } from "../../components/Avatar/Avatar";
import { Glint } from "../../components/Glint/Glint";
import { useAuth } from "../../auth/useAuth";
import { SHOP_GROUPS } from "../../lib/economy";
import type { AdminShopItem, ShopItemKind } from "../../types";
import { parseInteger } from "../../lib/economy";
import { effectiveItem, itemError, type ItemDraft, type ItemForm, type NewItem } from "./shopForm";
import styles from "./EconomyPage.module.css";

const STARTERS: Partial<Record<ShopItemKind, Omit<ItemForm, "kind" | "active">>> = {
  coupon: { name: "Cupón del 15 %", note: "", price: "250", percent: "15", hex: "", altName: "" },
  color: { name: "", note: "", price: "200", percent: "", hex: "#ff7a50", altName: "" },
  title: { name: "", note: "", price: "150", percent: "", hex: "", altName: "" },
};

type Props = {
  items: AdminShopItem[];
  edits: Record<string, ItemDraft>;
  added: NewItem[];
  disabled: boolean;
  freezeLimit: ReactNode; // el tope de protectores comprados por mes (un valor de settings)
  onEdit: (id: string, draft: ItemDraft) => void;
  onAdd: (item: NewItem) => void;
  onChangeNew: (tempId: string, draft: ItemDraft) => void;
  onDropNew: (tempId: string) => void;
};

const LOCK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

// La tienda en el panel: cada grupo con sus ítems, el precio editable, Editar, Retirar y Agregar
export function ShopEditor({ items, edits, added, disabled, freezeLimit, onEdit, onAdd, onChangeNew, onDropNew }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState<string | null>(null); // el id (o tempId) que se está editando

  function add(kind: ShopItemKind) {
    const tempId = `nuevo-${crypto.randomUUID()}`;
    onAdd({ tempId, kind, active: true, ...STARTERS[kind]! });
    setOpen(tempId);
  }

  return (
    <div className={styles.shop}>
      {SHOP_GROUPS.map((group) => {
        const saved = items.filter((i) => i.kind === group.kind);
        const fresh = added.filter((n) => n.kind === group.kind);
        return (
          <section key={group.kind} className={styles.sgroup} aria-labelledby={`shop-${group.kind}`}>
            <div className={styles.shead}>
              <h2 id={`shop-${group.kind}`}>{group.title}</h2>
              <p>{group.note}</p>
              {group.add && (
                <button type="button" className={styles.small} onClick={() => add(group.kind)} disabled={disabled}>
                  + {group.add}
                </button>
              )}
            </div>
            <ul className={styles.items}>
              {saved.map((item) => {
                const form = effectiveItem(item, edits[item.id]);
                const dirtyPrice = parseInteger(form.price) !== item.price;
                return (
                  <li key={item.id}>
                    <div className={`${styles.item} ${form.active ? "" : styles.off}`}>
                      <span className={styles.glyph}>
                        <Glyph form={form} id={item.id} alias={user?.alias ?? ""} />
                      </span>
                      <span className={styles.nm}>
                        <b>{form.name || "Sin nombre"}</b>
                        <span className={styles.tag}>{tagOf(item, form)}</span>
                        <small>{subtitle(form)}</small>
                      </span>
                      <span className={styles.priceCell}>
                        {item.kind === "streak_freeze" && (
                          <span className={styles.sublimit}>
                            <span className={styles.sublimitText}>Hasta</span>
                            {freezeLimit}
                            <span className={styles.sublimitText}>por mes</span>
                          </span>
                        )}
                        {item.fixed ? (
                          <span className={styles.capnote}>{LOCK}Gratis, siempre</span>
                        ) : (
                          <PriceField
                            text={form.price}
                            was={dirtyPrice ? item.price : null}
                            label={`Precio de ${item.name}`}
                            disabled={disabled}
                            onChange={(price) => onEdit(item.id, { price })}
                          />
                        )}
                      </span>
                      <span className={styles.rowActions}>
                        {!item.fixed && (
                          <button type="button" className={styles.ghost} onClick={() => setOpen(open === item.id ? null : item.id)}>
                            {open === item.id ? "Cerrar" : "Editar"}
                          </button>
                        )}
                        {item.retirable && (
                          <button
                            type="button"
                            className={styles.ghost}
                            disabled={disabled}
                            onClick={() => onEdit(item.id, { active: !form.active })}
                          >
                            {form.active ? "Retirar" : "Volver a vender"}
                          </button>
                        )}
                      </span>
                    </div>
                    {open === item.id && (
                      <ItemEditor
                        form={form}
                        isNew={false}
                        disabled={disabled}
                        onChange={(draft) => onEdit(item.id, draft)}
                        onClose={() => setOpen(null)}
                      />
                    )}
                  </li>
                );
              })}
              {fresh.map((n) => (
                <li key={n.tempId}>
                  <div className={`${styles.item} ${styles.fresh}`}>
                    <span className={styles.glyph}>
                      <Glyph form={n} id={n.tempId} alias={user?.alias ?? ""} />
                    </span>
                    <span className={styles.nm}>
                      <b>{n.name || "Sin nombre"}</b>
                      <span className={styles.tag}>nuevo</span>
                      <small>{subtitle(n)}</small>
                    </span>
                    <span className={styles.priceCell}>
                      <PriceField
                        text={n.price}
                        was={null}
                        dirty
                        label={`Precio de ${n.name || "lo nuevo"}`}
                        disabled={disabled}
                        onChange={(price) => onChangeNew(n.tempId, { price })}
                      />
                    </span>
                    <span className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.ghost}
                        onClick={() => setOpen(open === n.tempId ? null : n.tempId)}
                      >
                        {open === n.tempId ? "Cerrar" : "Editar"}
                      </button>
                    </span>
                  </div>
                  {open === n.tempId && (
                    <ItemEditor
                      form={n}
                      isNew
                      disabled={disabled}
                      onChange={(draft) => onChangeNew(n.tempId, draft)}
                      onClose={() => setOpen(null)}
                      onDrop={() => onDropNew(n.tempId)}
                    />
                  )}
                </li>
              ))}
            </ul>
            {group.lock && (
              <p className={styles.locknote}>
                {LOCK}
                <span>{group.lock}</span>
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function tagOf(item: AdminShopItem, form: ItemForm) {
  if (!form.active) return "retirado";
  if (item.fixed) return "el de todos";
  if (!item.count) return "";
  const n = item.count.toLocaleString("es-AR");
  return item.kind === "coupon" || item.kind === "streak_freeze" ? `${n} vendidos` : `lo tienen ${n}`;
}

function subtitle(form: ItemForm) {
  if (form.kind === "coupon") return "Va a “Mis cupones” con su raspadita";
  if (form.kind === "title" && form.altName.trim()) return `o ${form.altName.trim()}`;
  return form.note;
}

// El dibujo de cada cosa: el talón del cupón, el escudo, el avatar con el marco, el trazo o la inicial
function Glyph({ form, id, alias }: { form: ItemForm; id: string; alias: string }) {
  if (form.kind === "coupon") {
    return (
      <span className={styles.stub}>
        <b>{form.percent || "?"}</b>
        <small>%</small>
      </span>
    );
  }
  if (form.kind === "streak_freeze") {
    return (
      <svg className={styles.shield} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
        <path d="M12 8v8M8.5 10l7 4M15.5 10l-7 4" />
      </svg>
    );
  }
  if (form.kind === "frame") return <Avatar alias={alias.slice(0, 2).toUpperCase()} frame={id} size={30} />;
  if (form.kind === "color") {
    const color = /^#[0-9a-fA-F]{6}$/.test(form.hex) ? form.hex : "#4fa3ff";
    return <span className={styles.line} style={{ background: `linear-gradient(90deg, rgba(220,232,255,.25), ${color})` }} />;
  }
  return <span className={styles.initial}>{(form.name.trim() || "T")[0]}</span>;
}

type PriceProps = {
  text: string;
  was: number | null;
  dirty?: boolean;
  label: string;
  disabled: boolean;
  onChange: (text: string) => void;
};

function PriceField({ text, was, dirty, label, disabled, onChange }: PriceProps) {
  const bad = parseInteger(text) === null;
  const classes = [styles.field, was !== null || dirty ? styles.dirty : "", bad ? styles.bad : ""].join(" ");
  return (
    <span className={styles.num}>
      {was !== null && <span className={styles.wasNum}>{was.toLocaleString("es-AR")}</span>}
      <label className={classes}>
        <input
          type="text"
          inputMode="numeric"
          value={text}
          aria-label={label}
          aria-invalid={bad}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        />
        <Glint />
      </label>
    </span>
  );
}

type EditorProps = {
  form: ItemForm;
  isNew: boolean;
  disabled: boolean;
  onChange: (draft: ItemDraft) => void;
  onClose: () => void;
  onDrop?: () => void;
};

// La edición de un ítem: se abre debajo de su fila
function ItemEditor({ form, isNew, disabled, onChange, onClose, onDrop }: EditorProps) {
  const error = itemError(form);
  const hexOk = /^#[0-9a-fA-F]{6}$/.test(form.hex);
  return (
    <div className={styles.edit}>
      <label>
        Nombre
        <input type="text" value={form.name} maxLength={60} disabled={disabled} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      {form.kind === "coupon" ? (
        <label>
          Porcentaje
          <span className={`${styles.field} ${styles.fieldInline}`}>
            <input
              type="text"
              inputMode="numeric"
              value={form.percent}
              disabled={disabled}
              onChange={(e) => {
                const percent = e.target.value.replace(/[^\d]/g, "");
                // El nombre de un cupón sigue a su porcentaje mientras sea el de siempre
                const auto = /^Cupón del \d* %$/.test(form.name);
                onChange(auto ? { percent, name: `Cupón del ${percent} %` } : { percent });
              }}
            />
            <span className={styles.unit}>%</span>
          </span>
        </label>
      ) : (
        <label>
          Nota
          <input
            type="text"
            value={form.note}
            maxLength={80}
            placeholder="Una línea debajo del nombre"
            disabled={disabled}
            onChange={(e) => onChange({ note: e.target.value })}
          />
        </label>
      )}
      {form.kind === "color" && (
        <label>
          Color
          <span className={styles.hexrow}>
            <input
              type="color"
              value={hexOk ? form.hex.toLowerCase() : "#4fa3ff"}
              disabled={disabled}
              onChange={(e) => onChange({ hex: e.target.value })}
            />
            <input type="text" value={form.hex} maxLength={7} disabled={disabled} onChange={(e) => onChange({ hex: e.target.value })} />
          </span>
        </label>
      )}
      {form.kind === "title" && (
        <label>
          Otra forma (opcional)
          <input
            type="text"
            value={form.altName}
            maxLength={60}
            placeholder="Cazador de cometas"
            disabled={disabled}
            onChange={(e) => onChange({ altName: e.target.value })}
          />
        </label>
      )}
      <div className={styles.full}>
        <span className={error ? styles.errInline : ""}>
          {error ??
            (isNew
              ? "Se suma a la tienda al guardar."
              : form.kind === "coupon"
                ? "Los cupones ya comprados quedan con su porcentaje."
                : "Quien ya lo tiene lo sigue teniendo.")}
        </span>
        <span className={styles.editActions}>
          {onDrop && (
            <button type="button" className={styles.ghost} onClick={onDrop}>
              Quitar
            </button>
          )}
          <button type="button" className={styles.small} onClick={onClose}>
            Listo
          </button>
        </span>
      </div>
    </div>
  );
}
