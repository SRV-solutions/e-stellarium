import { parseInteger } from "../../lib/economy";
import type { AdminShopItem, ShopItemKind } from "../../types";

// Un ítem como se ve en el formulario: los números como texto (se pueden borrar mientras se tipea)
export type ItemForm = {
  kind: ShopItemKind;
  name: string;
  note: string;
  price: string;
  percent: string;
  hex: string;
  altName: string;
  active: boolean;
};
export type ItemDraft = Partial<ItemForm>; // solo lo tocado
export type NewItem = ItemForm & { tempId: string };

export function effectiveItem(item: AdminShopItem, draft: ItemDraft | undefined): ItemForm {
  return {
    kind: item.kind,
    name: item.name,
    note: item.note,
    price: String(item.price),
    percent: item.percent === null ? "" : String(item.percent),
    hex: item.hex ?? "",
    altName: item.altName ?? "",
    active: item.active,
    ...draft,
  };
}

// Por qué no se puede guardar así (o null). La API vuelve a validar todo
export function itemError(form: ItemForm): string | null {
  if (!form.name.trim()) return "Falta el nombre.";
  if (parseInteger(form.price) === null) return "El precio tiene que ser un número.";
  if (form.kind === "coupon") {
    const percent = parseInteger(form.percent);
    if (percent === null || percent < 1 || percent > 60) return "Ningún cupón pasa del 60 %.";
  }
  if (form.kind === "color" && !/^#[0-9a-fA-F]{6}$/.test(form.hex)) return "El color va como #4fa3ff.";
  return null;
}

// Lo que cambió respecto de lo guardado, como lo espera PATCH /admin/shop/:id
export function itemChanges(item: AdminShopItem, draft: ItemDraft | undefined) {
  if (!draft) return {};
  const form = effectiveItem(item, draft);
  const out: Record<string, unknown> = {};
  if (form.name.trim() !== item.name) out.name = form.name.trim();
  if (form.note.trim() !== item.note) out.note = form.note.trim();
  if (parseInteger(form.price) !== item.price) out.price = parseInteger(form.price);
  if (item.kind === "coupon" && parseInteger(form.percent) !== item.percent) out.percent = parseInteger(form.percent);
  if (item.kind === "color" && form.hex.toLowerCase() !== item.hex) out.hex = form.hex.toLowerCase();
  if (item.kind === "title" && (form.altName.trim() || null) !== item.altName) out.altName = form.altName.trim() || null;
  if (form.active !== item.active) out.active = form.active;
  return out;
}

