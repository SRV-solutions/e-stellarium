import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../../auth/useAuth";
import { api, ApiError } from "../../lib/api";
import type { CosmeticKind, Shop, Worn } from "../../types";
import { Avatar } from "../Avatar/Avatar";
import styles from "./Inventory.module.css";

type Cosmetic = Shop["cosmetics"][number];

// Cuántas piezas se ven de entrada en cada grupo; el resto, con "Ver todos"
const LIMIT = 5;

const GROUPS: { kind: CosmeticKind; title: string; note: string; none: string | null }[] = [
  { kind: "frame", title: "Marco del avatar", note: "Se ve en el encabezado y en el ranking.", none: "Sin marco" },
  { kind: "color", title: "Color del trazo", note: "Las líneas de tus constelaciones.", none: null },
  { kind: "title", title: "Título", note: "Debajo de tu alias en el ranking.", none: "Sin título" },
];

// El inventario: lo que ya compró, para ponerse o sacarse. Usa GET /shop (qué tiene) y PUT /me/cosmetics (ponerse),
// los mismos que la tienda.
export function Inventory() {
  const { user, setWorn } = useAuth();
  const [shop, setShop] = useState<Shop | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Partial<Record<CosmeticKind, boolean>>>({});

  useEffect(() => {
    api<Shop>("/shop")
      .then(setShop)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No pudimos abrir tu inventario."));
  }, []);

  if (!user) return null;

  async function wear(kind: CosmeticKind, id: string | null, variant = 0) {
    setError(null);
    try {
      const { worn } = await api<{ worn: Worn }>("/me/cosmetics", {
        method: "PUT",
        body: JSON.stringify({ kind, id, variant }),
      });
      setWorn(worn);
      setShop((previous) => (previous ? { ...previous, worn } : previous));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos cambiarlo. Probá de nuevo.");
    }
  }

  return (
    <section className={styles.section} aria-labelledby="perfil-inventario">
      <h2 id="perfil-inventario" className={styles.h2}>
        Tu inventario
      </h2>
      <p className={styles.lead}>
        Lo que compraste en la tienda. Tocá una pieza para llevarla puesta; cambiarlas es gratis y las veces que quieras.
      </p>
      {error && <p className={styles.error}>{error}</p>}
      {!shop && !error && <p className={styles.note}>Abriendo tu inventario…</p>}
      {shop && (
        <>
          <Preview alias={user.alias} drawing={user.avatar} worn={shop.worn} />
          {GROUPS.map((group) => {
            const owned = shop.cosmetics.filter((c) => c.kind === group.kind && c.owned);
            const pieces = owned; // el azul de siempre también viene de la tienda, como comprado
            const shown = open[group.kind] ? pieces : pieces.slice(0, LIMIT);
            return (
              <div key={group.kind} className={styles.group}>
                <h3>{group.title}</h3>
                <p>{group.note}</p>
                {pieces.length === 0 ? (
                  <p className={styles.empty}>
                    Todavía no tenés ninguno. <Link to="/shop">Mirá la tienda</Link>.
                  </p>
                ) : (
                  <ul className={styles.opts} role="radiogroup" aria-label={group.title}>
                    {group.none && (
                      <Option
                        kind={group.kind}
                        name={group.none}
                        checked={shop.worn[group.kind] === null}
                        alias={user.alias}
                        onPick={() => wear(group.kind, null)}
                      />
                    )}
                    {shown.map((cosmetic) => (
                      <Option
                        key={cosmetic.item}
                        kind={group.kind}
                        cosmetic={cosmetic}
                        name={cosmetic.name}
                        checked={shop.worn[group.kind] === cosmetic.item}
                        alias={user.alias}
                        variant={shop.worn.titleVariant}
                        onPick={() => wear(group.kind, cosmetic.item, shop.worn.title === cosmetic.item ? shop.worn.titleVariant : 0)}
                        onVariant={(v) => wear("title", cosmetic.item, v)}
                      />
                    ))}
                  </ul>
                )}
                {pieces.length > LIMIT && (
                  <button type="button" className={styles.more} onClick={() => setOpen({ ...open, [group.kind]: !open[group.kind] })}>
                    {open[group.kind] ? "Ver menos" : `Ver todos (${pieces.length})`}
                  </button>
                )}
              </div>
            );
          })}
          <p className={styles.shopLink}>
            ¿Querés más? En <Link to="/shop">la tienda</Link> hay marcos, colores y títulos nuevos.
          </p>
        </>
      )}
    </section>
  );
}

// Cómo te ven: el avatar con el marco, el alias y el título (de ahí se ve el cambio al tocar)
function Preview({ alias, drawing, worn }: { alias: string; drawing: string | null; worn: Worn }) {
  return (
    <div className={styles.preview}>
      <Avatar alias={alias} frame={worn.frame} drawing={drawing} size={40} />
      <div>
        <b>{alias}</b>
        <span>{worn.titleText ?? "Sin título"}</span>
      </div>
    </div>
  );
}

type OptionProps = {
  kind: CosmeticKind;
  name: string;
  checked: boolean;
  alias: string;
  cosmetic?: Cosmetic; // sin cosmético: la opción "Sin marco" / "Sin título"
  variant?: number;
  onPick: () => void;
  onVariant?: (variant: number) => void;
};

function Option({ kind, name, checked, alias, cosmetic, variant = 0, onPick, onVariant }: OptionProps) {
  let stage;
  if (!cosmetic) stage = <span className={styles.none} />;
  else if (kind === "frame") stage = <Avatar alias={alias} frame={cosmetic.item} size={26} />;
  else if (kind === "color") stage = <Trail color={cosmetic.hex ?? "#4fa3ff"} />;
  else stage = <span className={styles.titleMark}>“…”</span>;

  // Los títulos con dos formas muestran la que lleva puesta
  const label = checked && cosmetic?.variants ? cosmetic.variants[variant] : name;

  return (
    <li>
      <button type="button" role="radio" aria-checked={checked} className={styles.opt} onClick={onPick} title={label}>
        <span className={styles.stage}>{stage}</span>
        <b>{label}</b>
        <small>{checked ? "Puesto" : (cosmetic?.note ?? "")}</small>
      </button>
      {checked && cosmetic?.variants && onVariant && (
        <button type="button" className={styles.variant} onClick={() => onVariant(variant === 0 ? 1 : 0)}>
          Cambiar a {cosmetic.variants[variant === 0 ? 1 : 0]}
        </button>
      )}
    </li>
  );
}

// El trazo de una constelación, en su color: cuatro estrellas unidas
const TRAIL = [
  [2, 24],
  [16, 12],
  [30, 18],
  [46, 4],
];

function Trail({ color }: { color: string }) {
  return (
    <svg className={styles.trail} viewBox="0 0 48 28" aria-hidden="true">
      <polyline points={TRAIL.map((p) => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      {TRAIL.map(([x, y]) => (
        <g key={x}>
          <circle cx={x} cy={y} r="5" fill={color} opacity=".25" />
          <circle cx={x} cy={y} r="2.6" fill="#fff" />
        </g>
      ))}
    </svg>
  );
}
