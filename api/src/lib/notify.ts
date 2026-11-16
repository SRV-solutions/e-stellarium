import { QueryTypes, type Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { Notification } from "../models/index.js";
import type { NotificationKind } from "../models/Notification.js";
import { sendMail } from "./mailer.js";
import type { Permission } from "./permissions.js";

export type Notice = {
  kind: NotificationKind;
  title: string;
  body: string;
  link?: string | null;
  key?: string | null; // si ya tiene uno con esta clave, no se repite
  emailSent?: boolean; // quien llama ya manda su propio mail (se muestra "también por mail")
};

type Mail = { subject: string; html: string };

// Crea el mismo aviso para cada persona, dentro de la transacción del cambio: si el cambio se
// deshace, el aviso también. Con `mail`, además se manda por mail, siempre después del commit.
// Devuelve los avisos creados (con clave, el que ya existía no se vuelve a crear).
export async function notify(t: Transaction, userIds: string[], notice: Notice, mail?: Mail) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return [];
  const created = await Notification.bulkCreate(
    ids.map((userId) => ({
      userId,
      kind: notice.kind,
      title: notice.title,
      body: notice.body,
      link: notice.link ?? null,
      key: notice.key ?? null,
      emailSent: Boolean(mail) || Boolean(notice.emailSent),
    })),
    // Con clave, el que choca con la restricción única se saltea (puede pedirse dos veces a la vez)
    { transaction: t, ...(notice.key ? { ignoreDuplicates: true } : {}), returning: true }
  );

  if (mail) {
    const users = await sequelize.query<{ email: string }>(
      "SELECT email FROM users WHERE id IN (:ids) AND deleted_at IS NULL",
      { replacements: { ids }, type: QueryTypes.SELECT, transaction: t }
    );
    t.afterCommit(async () => {
      for (const { email } of users) {
        await sendMail({ to: email, ...mail }).catch((err) => console.error("No se pudo mandar el mail del aviso", err));
      }
    });
  }
  return created;
}

// Los activos que tienen un permiso (el super admin tiene todos, aunque no tenga filas)
export async function staffWith(permission: Permission, t?: Transaction): Promise<string[]> {
  const rows = await sequelize.query<{ id: string }>(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.deleted_at IS NULL
        AND (r.key = 'super_admin'
             OR EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = u.role_id AND rp.permission_key = :permission))`,
    { replacements: { permission }, type: QueryTypes.SELECT, transaction: t }
  );
  return rows.map((r) => r.id);
}

export async function superAdmins(t?: Transaction): Promise<string[]> {
  const rows = await sequelize.query<{ id: string }>(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.key = 'super_admin' AND u.deleted_at IS NULL`,
    { type: QueryTypes.SELECT, transaction: t }
  );
  return rows.map((r) => r.id);
}

// "Python", "Python y JavaScript", "Python, Go y JavaScript"
export function listOf(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

// El comienzo del enunciado de una pregunta, para nombrarla en un aviso
export function snippetOf(prompt: string, max = 70) {
  const text = prompt.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const TIME_ZONE = "America/Argentina/Buenos_Aires";

// "el miércoles 18", en hora de Argentina
export function weekdayOf(date: Date) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, weekday: "long", day: "numeric" }).format(date);
}

// "9:00", en hora de Argentina (sin el cero adelante que pone es-AR)
export function hourOf(date: Date) {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return time.replace(/^0(\d)/, "$1");
}

// La hora de Argentina (0 a 23)
export function argentinaHour(now: Date) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hour12: false }).format(now)) % 24;
}

// "15 de enero", en hora de Argentina
export function dateOf(date: Date) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, day: "numeric", month: "long" }).format(date);
}
