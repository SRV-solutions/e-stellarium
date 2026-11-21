import { useState, type FormEvent } from "react";
import { AppHeader } from "../../components/AppHeader/AppHeader";
import { Avatar } from "../../components/Avatar/Avatar";
import { Drawing } from "../../components/Avatar/drawings";
import { DRAWINGS } from "../../components/Avatar/drawingNames";
import { Cosmos } from "../../components/Cosmos/Cosmos";
import { Inventory } from "../../components/Inventory/Inventory";
import { useAuth } from "../../auth/useAuth";
import { api, ApiError } from "../../lib/api";
import type { User } from "../../types";
import styles from "./ProfilePage.module.css";

type Note = { kind: "ok" | "err"; text: string } | null;

const ALIAS_RULE = /^[A-Za-z0-9_-]{3,20}$/;
const ALIAS_HELP = "De 3 a 20 caracteres: letras, números, guion y guion bajo.";

const message = (err: unknown) => (err instanceof ApiError ? err.message : "No pudimos guardarlo. Probá de nuevo.");

export function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <>
      <Cosmos />
      <AppHeader />
      <main className={styles.page}>
        <div className={styles.who}>
          <Avatar alias={user.alias} frame={user.wornFrame} drawing={user.avatar} size={64} />
          <div>
            <h1 className={styles.title}>{user.alias}</h1>
            <p className={styles.sub}>
              {user.name} · {user.email}
            </p>
          </div>
        </div>
        <NameSection user={user} />
        <AliasSection user={user} />
        <DrawingSection user={user} />
        <Inventory />
        <NoticesSection user={user} />
      </main>
    </>
  );
}

// El nombre llega del pago de Mercado Pago y a veces viene vacío ("Estudiante"): acá se corrige.
// Misma regla que PATCH /me/name; la API junta los espacios repetidos.
const NAME_HELP = "De 2 a 60 caracteres, con al menos una letra.";
const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ");
const validName = (value: string) => value.length >= 2 && value.length <= 60 && /\p{L}/u.test(value) && !/[<>]/.test(value);

function NameSection({ user }: { user: User }) {
  const { updateProfile } = useAuth();
  const [value, setValue] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<Note>(null);

  const normalized = normalizeName(value);
  const valid = validName(normalized);
  const invalid = normalized.length > 0 && !valid;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!valid || normalized === user.name) return;
    setSaving(true);
    setNote(null);
    try {
      const res = await api<{ name: string }>("/me/name", { method: "PATCH", body: JSON.stringify({ name: normalized }) });
      updateProfile({ name: res.name });
      setValue(res.name);
      setNote({ kind: "ok", text: "Listo." });
    } catch (err) {
      setNote({ kind: "err", text: message(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="perfil-nombre">
      <h2 id="perfil-nombre" className={styles.h2}>
        Tu nombre
      </h2>
      <p className={styles.lead}>Es el que usamos en los mails. No sale en el ranking.</p>
      <form className={styles.field} onSubmit={save} noValidate>
        <label htmlFor="nombre">Nombre</label>
        <input
          id="nombre"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setNote(null);
          }}
          maxLength={60}
          autoComplete="name"
          aria-invalid={invalid}
          aria-describedby="nombre-hint"
        />
        <button type="submit" className={styles.button} disabled={!valid || normalized === user.name || saving}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <p id="nombre-hint" className={`${styles.hint} ${invalid || note?.kind === "err" ? styles.err : ""} ${note?.kind === "ok" ? styles.ok : ""}`} aria-live="polite">
          {note?.text ?? NAME_HELP}
        </p>
      </form>
    </section>
  );
}

// El alias se escribe de a letras: se guarda con el botón, no al tocar
function AliasSection({ user }: { user: User }) {
  const { updateProfile } = useAuth();
  const [value, setValue] = useState(user.alias);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<Note>(null);

  const trimmed = value.trim();
  const valid = ALIAS_RULE.test(trimmed);
  const invalid = trimmed.length > 0 && !valid;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!valid || trimmed === user.alias) return;
    setSaving(true);
    setNote(null);
    try {
      const res = await api<{ alias: string; aliasChangedAt: string }>("/me/alias", {
        method: "PATCH",
        body: JSON.stringify({ alias: trimmed }),
      });
      updateProfile({ alias: res.alias, aliasChangedAt: res.aliasChangedAt });
      setValue(res.alias);
      setNote({ kind: "ok", text: "Listo. Podés volver a cambiarlo dentro de 30 días." });
    } catch (err) {
      setNote({ kind: "err", text: message(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="perfil-alias">
      <h2 id="perfil-alias" className={styles.h2}>
        Tu nombre en el ranking
      </h2>
      <p className={styles.lead}>Es el que ven los demás. Podés cambiarlo una vez cada 30 días.</p>
      <form className={styles.field} onSubmit={save} noValidate>
        <label htmlFor="alias">Alias</label>
        <input
          id="alias"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setNote(null);
          }}
          maxLength={20}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid}
          aria-describedby="alias-hint"
        />
        <button type="submit" className={styles.button} disabled={!valid || trimmed === user.alias || saving}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <p id="alias-hint" className={`${styles.hint} ${invalid || note?.kind === "err" ? styles.err : ""} ${note?.kind === "ok" ? styles.ok : ""}`} aria-live="polite">
          {note?.text ?? ALIAS_HELP}
        </p>
      </form>
    </section>
  );
}

// El dibujo se guarda al tocar (es una elección, no un texto)
function DrawingSection({ user }: { user: User }) {
  const { updateProfile } = useAuth();
  const [note, setNote] = useState<Note>(null);
  const options = [{ id: null, name: "Iniciales" }, ...DRAWINGS];

  async function pick(id: string | null) {
    if (id === user.avatar) return;
    const before = user.avatar;
    updateProfile({ avatar: id }); // se ve ya; si falla, vuelve
    setNote(null);
    try {
      await api("/me/avatar", { method: "PATCH", body: JSON.stringify({ avatar: id }) });
      setNote({ kind: "ok", text: "Guardado" });
    } catch (err) {
      updateProfile({ avatar: before });
      setNote({ kind: "err", text: message(err) });
    }
  }

  // Como un grupo de radio: las flechas pasan de una opción a la otra
  function onKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"];
    if (!keys.includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const next = buttons[(at + (forward ? 1 : buttons.length - 1)) % buttons.length]!;
    next.focus();
    next.click();
  }

  return (
    <section className={styles.section} aria-labelledby="perfil-dibujo">
      <h2 id="perfil-dibujo" className={styles.h2}>
        Tu dibujo
      </h2>
      <p className={styles.lead}>Elegí un astro para tu avatar, o quedate con las iniciales. Los marcos de la tienda van arriba de cualquiera.</p>
      <ul className={styles.picks} role="radiogroup" aria-label="Dibujo del avatar" onKeyDown={onKeyDown}>
        {options.map((option) => {
          const checked = option.id === user.avatar;
          return (
            <li key={option.id ?? "iniciales"}>
              <button
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={option.name}
                tabIndex={checked ? 0 : -1}
                className={styles.pick}
                onClick={() => pick(option.id)}
              >
                {option.id ? <Drawing id={option.id} /> : <span className={styles.initials}>{user.alias.slice(0, 2).toUpperCase()}</span>}
              </button>
              <span className={styles.pickName}>{option.name}</span>
            </li>
          );
        })}
      </ul>
      <p className={`${styles.hint} ${note?.kind === "err" ? styles.err : ""} ${note?.kind === "ok" ? styles.ok : ""}`} aria-live="polite">
        {note?.text}
      </p>
    </section>
  );
}

// Los avisos: dos interruptores que se guardan al tocar y vuelven atrás si falla
function NoticesSection({ user }: { user: User }) {
  const rows: { field: Field; title: string; text: string }[] = [
    {
      field: "notifyEmail",
      title: "Mails de desafíos",
      text: "Un mail cuando sale un desafío nuevo. Cada mail trae un link para darte de baja con un clic.",
    },
    {
      field: "notifyApp",
      title: "Avisos en la campanita",
      text: "Desafío nuevo, racha en riesgo, cupones por vencer e insignias, dentro de la app.",
    },
  ];

  return (
    <section className={styles.section} aria-labelledby="perfil-avisos">
      <h2 id="perfil-avisos" className={styles.h2}>
        Avisos
      </h2>
      <p className={styles.lead}>Elegí por dónde querés enterarte de lo que pasa. Cada uno se cambia por separado.</p>
      <ul className={styles.rows}>
        {rows.map((row) => (
          <PreferenceRow key={row.field} user={user} {...row} />
        ))}
      </ul>
      <p className={styles.fixed}>
        <b>Los mails de tu cuenta no se pueden desactivar:</b> el de crear o cambiar la contraseña, el de cursos nuevos y el de tus cupones.
      </p>
    </section>
  );
}

type Field = "notifyEmail" | "notifyApp";

function PreferenceRow({ user, field, title, text }: { user: User; field: Field; title: string; text: string }) {
  const { updateProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const on = user[field];

  async function toggle() {
    const before = on;
    updateProfile({ [field]: !before }); // el interruptor se mueve ya; si falla, vuelve
    setSaving(true);
    setNote(null);
    try {
      await api("/me/preferences", { method: "PATCH", body: JSON.stringify({ [field]: !before }) });
      setNote({ kind: "ok", text: "Guardado" });
    } catch (err) {
      updateProfile({ [field]: before });
      setNote({ kind: "err", text: message(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className={styles.row}>
      <div>
        <b id={`pref-${field}`}>{title}</b>
        <p>{text}</p>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-labelledby={`pref-${field}`} className={styles.switch} disabled={saving} onClick={toggle} />
      <p className={`${styles.state} ${note?.kind === "err" ? styles.err : ""} ${note?.kind === "ok" ? styles.ok : ""}`} aria-live="polite">
        {note?.text}
      </p>
    </li>
  );
}
