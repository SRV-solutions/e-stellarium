import { QueryTypes, type Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { HttpError } from "../lib/errors.js";
import { checkChallengeBank } from "../games/challengeBank.js";
import { writeAudit, type AuditContext } from "../lib/audit.js";
import { Setting, ShopItem } from "../models/index.js";
import type { ShopItemKind } from "../models/ShopItem.js";
import { groupOf, isSettingKey, keysOf, loadSettings, SETTINGS, type SettingGroup, type SettingKey } from "../games/economy.js";
import { challengeSettingsProblem } from "../games/challenge.js";
import { DEFAULT_COLOR, DEFAULT_THEME, TRAIL_EFFECTS } from "../games/cosmetics.js";
import type { ChangeOptions } from "./users.js";

// La economía editable desde el panel (economy:edit): los valores de settings y lo que se vende.
// Cada cambio queda en la bitácora con solo lo que cambió, y se revierte con estas mismas funciones.

// ---------- Valores (settings) ----------

// Los valores de un grupo: Economía o Desafíos (cada pantalla con su permiso)
export async function listSettings(group: SettingGroup = "economy", t?: Transaction) {
  const rows = await Setting.findAll({ transaction: t });
  return keysOf(group).map((key) => {
    const row = rows.find((r) => r.id === key)!;
    return { key, value: row.value, min: SETTINGS[key].min, max: SETTINGS[key].max, updatedAt: row.updatedAt };
  });
}

export type SettingValues = Partial<Record<SettingKey, number>>;

// { "xp.star_completed": 60, ... }: solo claves que existen (y son de ese grupo), enteros dentro de su rango
export function parseSettingValues(value: unknown, group: SettingGroup = "economy"): SettingValues {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "values tiene que ser un objeto { clave: número }.");
  }
  const entries = Object.entries(value);
  if (entries.length === 0) throw new HttpError(400, "No mandaste ningún valor.");
  const out: SettingValues = {};
  for (const [key, v] of entries) {
    if (!isSettingKey(key) || groupOf(key) !== group) throw new HttpError(400, `No existe el valor ${key}.`);
    const { min, max } = SETTINGS[key];
    if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) {
      throw new HttpError(400, `${key} tiene que ser un número entero entre ${min} y ${max}.`);
    }
    out[key] = v as number;
  }
  return out;
}

// Cambia los valores que mandaron. Un solo registro en la bitácora con lo de antes y lo nuevo de los
// que de verdad cambiaron (así se revierten todos juntos)
export async function updateSettings(
  t: Transaction,
  ctx: AuditContext,
  values: SettingValues,
  options: ChangeOptions = {}
) {
  const keys = (Object.keys(values) as SettingKey[]).sort();
  const groups = [...new Set(keys.map(groupOf))];
  if (groups.length !== 1) throw new HttpError(400, "No se pueden cambiar valores de la economía y de los desafíos juntos.");
  const group = groups[0]!;
  // Bloqueadas en orden: dos cambios a la vez sobre los mismos valores van en fila
  const rows = await Setting.findAll({ where: { id: keys }, order: [["id", "ASC"]], lock: t.LOCK.UPDATE, transaction: t });

  const before: SettingValues = {};
  const after: SettingValues = {};
  for (const row of rows) {
    const value = values[row.id as SettingKey]!;
    if (row.value === value) continue;
    before[row.id as SettingKey] = row.value;
    after[row.id as SettingKey] = value;
    await row.update({ value }, { transaction: t });
  }

  // Los desafíos se validan juntos, con lo que queda después del cambio (al menos un día, el repaso...)
  if (group === "challenge") {
    const problem = challengeSettingsProblem(await loadSettings(t));
    if (problem) throw new HttpError(400, problem);
    // Con otra receta, lo que alcanzaba puede no alcanzar (o al revés)
    await checkChallengeBank(t);
  }

  if (Object.keys(after).length > 0) {
    await writeAudit(t, {
      ...ctx,
      action: options.revertsId ? "audit.revert" : group === "challenge" ? "challenge.update" : "economy.update",
      targetType: "settings",
      targetId: null,
      before,
      after,
      reversible: !options.revertsId,
      revertsId: options.revertsId,
    });
  }
  return listSettings(group, t);
}

// Los valores actuales de esas claves (para comparar al revertir)
export async function currentSettings(t: Transaction, keys: string[]) {
  const rows = await Setting.findAll({ where: { id: keys }, lock: t.LOCK.UPDATE, transaction: t });
  return Object.fromEntries(keys.map((k) => [k, rows.find((r) => r.id === k)?.value ?? null]));
}

// ---------- La tienda (shop_items) ----------

// Lo que se puede crear desde el panel. Los marcos no: cada uno tiene su dibujo en el cliente.
// El protector tampoco: hay uno solo.
const CREATABLE: ShopItemKind[] = ["coupon", "color", "title"];
const MAX_PRICE = 100_000;

// Los campos que se editan, como los guarda la bitácora
const FIELDS = ["name", "note", "price", "percent", "hex", "effect", "altName", "active"] as const;
type Field = (typeof FIELDS)[number];
export type ItemChanges = Partial<{
  name: string;
  note: string;
  price: number;
  percent: number;
  hex: string;
  effect: string | null;
  altName: string | null;
  active: boolean;
}>;

function snapshot(item: ShopItem) {
  return {
    kind: item.kind,
    name: item.name,
    note: item.note,
    price: item.price,
    percent: item.percent,
    hex: item.hex,
    effect: item.effect,
    altName: item.altName,
    active: item.active,
  };
}

// Cuántos se vendieron (cupones y protectores) o cuántos lo tienen (cosméticos)
async function countsByItem() {
  const rows = await sequelize.query<{ id: string; count: number }>(
    `SELECT s.id,
            CASE s.kind
              WHEN 'coupon' THEN (SELECT count(*) FROM coupons c WHERE c.source = 'shop' AND c.percent = s.percent)
              WHEN 'streak_freeze' THEN (SELECT count(*) FROM glint_events g WHERE g.reason = 'freeze_purchase')
              ELSE (SELECT count(*) FROM user_cosmetics u WHERE u.cosmetic_id = s.id)
            END::int AS count
       FROM shop_items s`,
    { type: QueryTypes.SELECT }
  );
  return new Map(rows.map((r) => [r.id, r.count]));
}

function present(item: ShopItem, count: number) {
  return {
    id: item.id,
    ...snapshot(item),
    position: item.position,
    count,
    // Lo que el panel no deja tocar (lo garantiza también la API, más abajo)
    fixed: item.id === DEFAULT_COLOR || item.id === DEFAULT_THEME, // el azul y Marino: gratis y siempre a la venta
    retirable: item.id !== DEFAULT_COLOR && item.id !== DEFAULT_THEME && item.kind !== "streak_freeze",
  };
}

// Todo, también lo retirado, en el orden de la tienda
export async function listShopItems() {
  const [items, counts] = await Promise.all([ShopItem.findAll({ order: [["position", "ASC"]] }), countsByItem()]);
  return items.map((i) => present(i, counts.get(i.id) ?? 0));
}

function text(value: unknown, field: string, max: number, required: boolean): string {
  if (typeof value !== "string") throw new HttpError(400, `${field} tiene que ser un texto.`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new HttpError(400, `Falta ${field}.`);
  if (trimmed.length > max) throw new HttpError(400, `${field} puede tener hasta ${max} caracteres.`);
  return trimmed;
}

// Valida lo que se quiere cambiar de un ítem de ese tipo. Lo que no corresponde al tipo es un error
export function parseItemChanges(body: unknown, kind: ShopItemKind): ItemChanges {
  if (!body || typeof body !== "object") throw new HttpError(400, "Faltan los cambios.");
  const input = body as Record<string, unknown>;
  const out: ItemChanges = {};
  if ("name" in input) out.name = text(input.name, "el nombre", 60, true);
  if ("note" in input) out.note = text(input.note, "la nota", 80, false);
  if ("price" in input) {
    const price = input.price;
    if (!Number.isInteger(price) || (price as number) < 0 || (price as number) > MAX_PRICE) {
      throw new HttpError(400, `El precio tiene que ser un número entero entre 0 y ${MAX_PRICE}.`);
    }
    out.price = price as number;
  }
  if ("percent" in input) {
    if (kind !== "coupon") throw new HttpError(400, "Solo los cupones tienen porcentaje.");
    const percent = input.percent;
    if (!Number.isInteger(percent) || (percent as number) < 1 || (percent as number) > 60) {
      throw new HttpError(400, "Ningún cupón pasa del 60 %: el porcentaje va de 1 a 60.");
    }
    out.percent = percent as number;
  }
  if ("hex" in input) {
    if (kind !== "color") throw new HttpError(400, "Solo los colores tienen hex.");
    if (typeof input.hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(input.hex)) {
      throw new HttpError(400, "El color tiene que ser como #4fa3ff.");
    }
    out.hex = input.hex.toLowerCase();
  }
  if ("effect" in input) {
    if (kind !== "color") throw new HttpError(400, "Solo los colores tienen efecto.");
    const effect = input.effect;
    if (effect !== null && !TRAIL_EFFECTS.includes(effect as (typeof TRAIL_EFFECTS)[number])) {
      throw new HttpError(400, `El efecto tiene que ser uno de: ${TRAIL_EFFECTS.join(", ")} (o null para ninguno).`);
    }
    out.effect = effect as string | null;
  }
  if ("altName" in input) {
    if (kind !== "title") throw new HttpError(400, "Solo los títulos tienen otra forma.");
    out.altName = input.altName === null ? null : text(input.altName, "la otra forma", 60, false) || null;
  }
  if ("active" in input) {
    if (typeof input.active !== "boolean") throw new HttpError(400, "active tiene que ser true o false.");
    out.active = input.active;
  }
  return out;
}

// Cambia un ítem. Guarda en la bitácora solo los campos que cambiaron
export async function updateShopItem(
  t: Transaction,
  ctx: AuditContext,
  id: string,
  changes: ItemChanges,
  options: ChangeOptions = {}
) {
  const item = await ShopItem.findByPk(id, { lock: t.LOCK.UPDATE, transaction: t });
  if (!item) throw new HttpError(404, "No existe eso en la tienda.");

  if ((item.id === DEFAULT_COLOR || item.id === DEFAULT_THEME) && ((changes.price ?? 0) !== 0 || changes.active === false)) {
    throw new HttpError(409, "El azul y Marino son de todos: no se cobran ni se retiran.");
  }
  if (item.kind === "streak_freeze" && changes.active === false) {
    throw new HttpError(409, "El protector de racha no se retira. Si no querés venderlo, subile el precio.");
  }

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const field of FIELDS) {
    if (!(field in changes)) continue;
    const value = changes[field as Field];
    if (item[field] === value) continue;
    before[field] = item[field];
    after[field] = value;
  }
  if (Object.keys(after).length > 0) {
    await item.update(after, { transaction: t });
    await writeAudit(t, {
      ...ctx,
      action: options.revertsId ? "audit.revert" : "shop.update",
      targetType: "shop_item",
      targetId: item.id,
      before,
      after,
      reversible: !options.revertsId,
      revertsId: options.revertsId,
    });
  }
  return present(item, (await countsByItem()).get(item.id) ?? 0);
}

// "Corona solar" → "corona_solar". Los cupones: "coupon_15"
function slug(text: string) {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "item"
  );
}

// Agrega algo a la tienda: un cupón, un color o un título. Queda a la venta al final de la lista
export async function createShopItem(t: Transaction, ctx: AuditContext, body: unknown) {
  const kind = (body as Record<string, unknown> | null)?.kind;
  if (kind === "frame") {
    throw new HttpError(400, "Un marco nuevo necesita su dibujo: se suma desde el código.");
  }
  if (!CREATABLE.includes(kind as ShopItemKind)) {
    throw new HttpError(400, "Se pueden agregar cupones, colores y títulos.");
  }
  const changes = parseItemChanges(body, kind as ShopItemKind);
  if (changes.name === undefined) throw new HttpError(400, "Falta el nombre.");
  if (changes.price === undefined) throw new HttpError(400, "Falta el precio.");
  if (kind === "coupon" && changes.percent === undefined) throw new HttpError(400, "Falta el porcentaje.");
  if (kind === "color" && changes.hex === undefined) throw new HttpError(400, "Falta el color.");

  // Nadie más agrega a la vez: así el id y la posición no se pisan
  await sequelize.query("LOCK TABLE shop_items IN SHARE ROW EXCLUSIVE MODE", { transaction: t });
  const base = kind === "coupon" ? `coupon_${changes.percent}` : slug(changes.name);
  let id = base;
  for (let n = 2; await ShopItem.findByPk(id, { transaction: t }); n++) id = `${base}_${n}`;
  const last = (await ShopItem.max("position", { transaction: t })) as number | null;

  const item = await ShopItem.create(
    {
      id,
      kind: kind as ShopItemKind,
      name: changes.name,
      note: changes.note ?? "",
      price: changes.price,
      percent: changes.percent ?? null,
      hex: changes.hex ?? null,
      effect: changes.effect ?? null,
      altName: changes.altName ?? null,
      position: (last ?? -1) + 1,
    },
    { transaction: t }
  );
  await item.reload({ transaction: t });

  await writeAudit(t, {
    ...ctx,
    action: "shop.create",
    targetType: "shop_item",
    targetId: item.id,
    before: { active: false }, // revertirlo lo retira (no se borra: alguien pudo haberlo comprado)
    after: snapshot(item),
    reversible: true,
  });
  return present(item, 0);
}

// El ítem como está ahora, con los mismos campos que el registro (para comparar al revertir)
export async function currentItemFields(t: Transaction, id: string, fields: string[]) {
  const item = await ShopItem.findByPk(id, { lock: t.LOCK.UPDATE, transaction: t });
  if (!item) throw new HttpError(404, "Ese ítem de la tienda ya no existe.");
  const all = snapshot(item) as Record<string, unknown>;
  return Object.fromEntries(fields.map((f) => [f, all[f]]));
}
