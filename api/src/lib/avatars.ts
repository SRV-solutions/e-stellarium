// Los dibujos que se pueden elegir para el avatar (gratis y para todos). Se guarda la clave en
// users.avatar; los dibujos están en el cliente (components/Avatar/drawings.tsx). Sin dibujo, las iniciales.
export const AVATARS = ["luna", "saturno", "cometa", "galaxia", "sol", "marte", "constelacion", "nebulosa"] as const;
export type AvatarId = (typeof AVATARS)[number];

export function isAvatar(value: unknown): value is AvatarId {
  return typeof value === "string" && (AVATARS as readonly string[]).includes(value);
}
