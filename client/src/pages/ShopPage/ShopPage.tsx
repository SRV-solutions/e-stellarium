import { useEffect, useState } from "react";
import { AppHeader } from "../../components/AppHeader/AppHeader";
import { Avatar } from "../../components/Avatar/Avatar";
import { Cosmos } from "../../components/Cosmos/Cosmos";
import { Glint } from "../../components/Glint/Glint";
import { useAuth } from "../../auth/useAuth";
import { api, ApiError } from "../../lib/api";
import { formatGlints, GLINTS, STREAK_BADGES } from "../../lib/glints";
import type { CosmeticKind, Purchase, Shop, Worn } from "../../types";
import { ShopDialog, type Offer } from "./ShopDialog";
import styles from "./ShopPage.module.css";

type Cosmetic = Shop["cosmetics"][number];

const TIME_ZONE = "America/Argentina/Buenos_Aires";

// "1 de diciembre"
const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: TIME_ZONE });

const KINDS: { kind: CosmeticKind; title: string; note: string }[] = [
  { kind: "frame", title: "Marco del avatar", note: "En el encabezado y en el ranking." },
  { kind: "color", title: "Color del trazo", note: "Las líneas de tus constelaciones." },
  { kind: "title", title: "Título", note: "Debajo de tu alias en el ranking." },
];

// Para la pregunta de confirmar: "el marco Órbita", "el color Aurora", "el título Navegante"
const KIND_NAME: Record<CosmeticKind, string> = { frame: "el marco", color: "el color", title: "el título" };

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; shop: Shop };

export function ShopPage() {
  const { user, stats, setGlints, setWorn, refreshStats } = useAuth();
  const [state, setState] = useState<State>({ status: "loading" });
  // Lo que está por comprar (se confirma en el diálogo) y lo que acaba de comprar
  const [offer, setOffer] = useState<Offer | null>(null);
  const [bought, setBought] = useState<Purchase | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [wearError, setWearError] = useState<string | null>(null);

  useEffect(() => {
    api<Shop>("/shop")
      .then((shop) => setState({ status: "ready", shop }))
      .catch((err) => {
        const message = err instanceof ApiError ? err.message : "No pudimos abrir la tienda.";
        setState({ status: "error", message });
      });
  }, []);

  function closeDialog() {
    setOffer(null);
    setBought(null);
    setBuyError(null);
  }

  async function confirmPurchase() {
    if (!offer || buying) return;
    setBuying(true);
    setBuyError(null);
    try {
      const purchase = await api<Purchase>("/shop/purchases", {
        method: "POST",
        body: JSON.stringify({ item: offer.item }),
      });
      setState({ status: "ready", shop: purchase.shop });
      setGlints(purchase.shop.glints);
      if (offer.item === "streak_freeze") refreshStats(); // el encabezado y el inicio muestran los protectores
      setBought(purchase);
    } catch (err) {
      setBuyError(err instanceof ApiError ? err.message : "No pudimos hacer la compra. Probá de nuevo.");
    } finally {
      setBuying(false);
    }
  }

  // Ponerse (o sacarse, con id null) un cosmético que ya compró
  async function wear(kind: CosmeticKind, id: string | null, variant = 0) {
    setWearError(null);
    try {
      const { worn } = await api<{ worn: Worn }>("/me/cosmetics", {
        method: "PUT",
        body: JSON.stringify({ kind, id, variant }),
      });
      setWorn(worn);
      setState((previous) => (previous.status === "ready" ? { ...previous, shop: { ...previous.shop, worn } } : previous));
    } catch (err) {
      setWearError(err instanceof ApiError ? err.message : "No pudimos cambiarlo. Probá de nuevo.");
    }
  }

  if (!user) return null;

  return (
    <>
      <Cosmos />
      <AppHeader />
      <main className={styles.page}>
        {state.status === "loading" && <p className={styles.note}>Abriendo la tienda…</p>}
        {state.status === "error" && <p className={styles.error}>{state.message}</p>}
        {state.status === "ready" && (
          <ShopContent
            shop={state.shop}
            alias={user.alias}
            freeFreezes={stats?.streakFreezes ?? null}
            wearError={wearError}
            onBuy={setOffer}
            onWear={wear}
          />
        )}
      </main>

      {state.status === "ready" && (
        <ShopDialog
          offer={offer}
          glints={state.shop.glints}
          bought={bought}
          busy={buying}
          error={buyError}
          onConfirm={confirmPurchase}
          onClose={closeDialog}
          onWear={(kind, id) => {
            closeDialog();
            wear(kind, id);
          }}
        />
      )}
    </>
  );
}

type ContentProps = {
  shop: Shop;
  alias: string;
  freeFreezes: number | null;
  wearError: string | null;
  onBuy: (offer: Offer) => void;
  onWear: (kind: CosmeticKind, id: string | null, variant?: number) => void;
};

function ShopContent({ shop, alias, freeFreezes, wearError, onBuy, onWear }: ContentProps) {
  const { freeze } = shop;
  const freezesLeft = freeze.monthlyLimit - freeze.boughtThisMonth;

  return (
    <>
      <div className={styles.top}>
        <div>
          <p className={styles.eyebrow}>La tienda</p>
          <h1 className={styles.title}>Lo que juntás jugando, convertido en descuento.</h1>
          <p className={styles.lead}>
            Los destellos salen sobre todo de los <b>desafíos</b>. Gastarlos no te baja el nivel ni el puesto en el
            ranking: eso es la experiencia, que nunca baja.
          </p>
        </div>
        <div className={styles.balance}>
          <div className={styles.balanceNumber}>
            <Glint className={styles.balanceGlint} />
            {formatGlints(shop.glints)}
          </div>
          <div className={styles.balanceLabel}>destellos para gastar</div>
        </div>
      </div>

      {/* De dónde salen: una línea, no una tabla */}
      <ul className={styles.earn}>
        <li>
          <span>Desafío</span> <b>{GLINTS.challengeCorrect}</b> por acierto y <b>{GLINTS.challengeCompleted}</b> al
          terminarlo
        </li>
        <li>
          <span>Repaso del día</span> <b>{GLINTS.reviewCompleted}</b> al terminarlo
        </li>
        <li>
          <span>Insignias de racha</span> <b>{STREAK_BADGES[0].glints}</b>, <b>{STREAK_BADGES[1].glints}</b> y{" "}
          <b>{STREAK_BADGES[2].glints}</b>
        </li>
      </ul>

      <section className={styles.section} aria-labelledby="shop-coupons">
        <h2 id="shop-coupons">Cupones</h2>
        <p className={styles.sub}>
          Uno por semana. Se suman a <b>Mis cupones</b>, en el inicio, y se usan al comprar otro curso. No se acumulan
          con otro cupón en la misma compra.
        </p>
        <div className={styles.stubs}>
          {shop.coupons.map((coupon) => (
            <CouponStub
              key={coupon.item}
              coupon={coupon}
              glints={shop.glints}
              validDays={shop.couponValidDays}
              onBuy={() =>
                onBuy({ item: coupon.item, price: coupon.price, kind: "coupon", percent: coupon.percent, validDays: shop.couponValidDays })
              }
            />
          ))}
        </div>
        <p className={styles.week}>
          <i className={shop.couponBoughtThisWeek ? styles.weekUsed : ""} aria-hidden="true" />
          {shop.couponBoughtThisWeek ? (
            <span>
              Ya canjeaste el de esta semana. <b>El próximo, desde el lunes.</b>
            </span>
          ) : (
            <span>
              Te queda <b>1 canje</b> esta semana. Se renueva el lunes a las 00:00.
            </span>
          )}
        </p>
      </section>

      <section className={styles.section} aria-labelledby="shop-freeze">
        <h2 id="shop-freeze">Protectores de racha</h2>
        <div className={styles.freeze}>
          {/* El cometa de la racha dentro de un escudo de luz */}
          <svg className={styles.shield} viewBox="-30 -30 60 60" aria-hidden="true">
            <circle r="25" fill="none" stroke="rgba(143,227,255,.5)" strokeWidth="1.6" strokeDasharray="3 4" />
            <path d="M-14 12 Q -2 6 6 -4" fill="none" stroke="rgba(255,153,0,.6)" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 5" />
            <circle cx="8" cy="-6" r="5" fill="#ffb84d" />
          </svg>
          <div className={styles.freezeText}>
            <strong>Un día que faltás, sin perder la racha</strong>
            <span>
              Tenés <b>2 gratis por mes</b>
              {freeFreezes !== null && (
                <>
                  {" "}
                  y hoy te quedan <b>{freeFreezes}</b>
                </>
              )}
              . Los comprados se usan después de los gratis y no vencen
              {freeze.owned > 0 && (
                <>
                  : ya tenés <b>{freeze.owned}</b>
                </>
              )}
              .{" "}
              {freezesLeft > 0 ? (
                <>
                  Podés comprar <b>{freezesLeft} más este mes</b>.
                </>
              ) : (
                <>
                  Ya compraste los {freeze.monthlyLimit} de este mes.{" "}
                  {freeze.availableAt && <b>El próximo, desde el {dayMonth(freeze.availableAt)}.</b>}
                </>
              )}
            </span>
          </div>
          <div className={styles.freezeAction}>
            <Price amount={freeze.price} />
            {freeze.blockedBy === "glints" ? (
              <Missing price={freeze.price} glints={shop.glints} />
            ) : (
              <button
                type="button"
                className={styles.buy}
                disabled={freeze.blockedBy !== null}
                onClick={() => onBuy({ item: freeze.item, price: freeze.price, kind: "freeze" })}
              >
                Comprar
              </button>
            )}
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="shop-cosmetics">
        <h2 id="shop-cosmetics">Para que te vean</h2>
        <p className={styles.sub}>
          No dan ventaja: solo cambian cómo te ven los demás en el ranking y cómo ves tu cielo. Se compran una vez y
          quedan para siempre.
        </p>
        {wearError && <p className={styles.error}>{wearError}</p>}
        <div className={styles.kinds}>
          {KINDS.map(({ kind, title, note }) => (
            <div key={kind}>
              <h3 className={styles.kindTitle}>{title}</h3>
              <p className={styles.kindNote}>{note}</p>
              <ul className={styles.items}>
                {shop.cosmetics
                  .filter((c) => c.kind === kind)
                  .map((cosmetic) => (
                    <CosmeticRow
                      key={cosmetic.item}
                      cosmetic={cosmetic}
                      worn={shop.worn}
                      alias={alias}
                      glints={shop.glints}
                      onBuy={() =>
                        onBuy({
                          item: cosmetic.item,
                          price: cosmetic.price,
                          kind: "cosmetic",
                          cosmeticKind: kind,
                          label: `${KIND_NAME[kind]} ${cosmetic.name}`,
                        })
                      }
                      onWear={onWear}
                    />
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// El precio en destellos, con la chispa
function Price({ amount }: { amount: number }) {
  return (
    <span className={styles.price}>
      <Glint />
      {formatGlints(amount)}
    </span>
  );
}

// Cuánto le falta: una regla fina que se llena con los destellos que tiene
function Missing({ price, glints }: { price: number; glints: number }) {
  return (
    <>
      <span className={styles.reach} aria-hidden="true">
        <i style={{ width: `${Math.round((glints / price) * 100)}%` }} />
      </span>
      <span className={styles.short}>Te faltan {formatGlints(price - glints)}</span>
    </>
  );
}

type CouponProps = { coupon: Shop["coupons"][number]; glints: number; validDays: number; onBuy: () => void };

// Un talón con troquel, como en "Mis cupones", con el precio del lado chico
function CouponStub({ coupon, glints, validDays, onBuy }: CouponProps) {
  return (
    <article className={`${styles.stub} ${coupon.blockedBy ? styles.stubLocked : ""}`}>
      <div className={styles.face}>
        <div className={styles.percent}>
          {coupon.percent} %<small>off</small>
        </div>
        <div className={styles.fine}>
          En cualquier curso de SRV.
          <br />
          Vence a los {validDays} días.
        </div>
      </div>
      <div className={styles.side}>
        <Price amount={coupon.price} />
        {coupon.blockedBy === "glints" ? (
          <Missing price={coupon.price} glints={glints} />
        ) : (
          <button
            type="button"
            className={styles.buy}
            disabled={coupon.blockedBy !== null}
            onClick={onBuy}
            aria-label={`Canjear un cupón del ${coupon.percent} % por ${coupon.price} destellos`}
          >
            Canjear
          </button>
        )}
      </div>
    </article>
  );
}

type RowProps = {
  cosmetic: Cosmetic;
  worn: Worn;
  alias: string;
  glints: number;
  onBuy: () => void;
  onWear: (kind: CosmeticKind, id: string | null, variant?: number) => void;
};

// Una pieza: la muestra (como se ve puesta), el nombre y, a la derecha, el precio, "Usar" o "Puesto"
function CosmeticRow({ cosmetic, worn, alias, glints, onBuy, onWear }: RowProps) {
  const { kind, item, variants } = cosmetic;
  const isWorn = worn[kind] === item;
  // Los títulos con dos formas: el nombre muestra la que lleva puesta, y abajo se puede cambiar a la otra
  const variant = isWorn ? worn.titleVariant : 0;
  const name = variants ? variants[variant] : cosmetic.name;

  let swatch;
  if (kind === "frame") swatch = <Avatar alias={alias} frame={item} />;
  else if (kind === "color") swatch = <Trail color={cosmetic.hex ?? "#4fa3ff"} />;
  else swatch = <span className={styles.titleSwatch}>“…”</span>;

  let end;
  if (isWorn) {
    end = (
      <span className={styles.wornEnd}>
        <span className={styles.tag}>Puesto</span>
        {/* El color no se saca: se vuelve al azul eligiéndolo */}
        {kind !== "color" && (
          <button type="button" className={styles.takeOff} onClick={() => onWear(kind, null)}>
            Sacar
          </button>
        )}
      </span>
    );
  } else if (cosmetic.owned) {
    end = (
      <button type="button" className={styles.use} onClick={() => onWear(kind, item)}>
        Usar
      </button>
    );
  } else if (cosmetic.blockedBy === "glints") {
    end = (
      <span className={styles.lacking} title={`Te faltan ${formatGlints(cosmetic.price - glints)}`}>
        <Price amount={cosmetic.price} />
        <small>faltan {formatGlints(cosmetic.price - glints)}</small>
      </span>
    );
  } else {
    end = (
      <button
        type="button"
        className={styles.buyPrice}
        onClick={onBuy}
        aria-label={`Comprar ${cosmetic.name} por ${cosmetic.price} destellos`}
      >
        <Price amount={cosmetic.price} />
      </button>
    );
  }

  return (
    <li className={`${styles.item} ${isWorn ? styles.itemWorn : ""}`}>
      <span className={styles.swatch}>{swatch}</span>
      <span className={styles.itemName}>
        {name}
        {variants && cosmetic.owned ? (
          <button type="button" className={styles.variant} onClick={() => onWear(kind, item, variant === 0 ? 1 : 0)}>
            o {variants[variant === 0 ? 1 : 0]}
          </button>
        ) : (
          cosmetic.note && <small>{cosmetic.note}</small>
        )}
      </span>
      {end}
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
