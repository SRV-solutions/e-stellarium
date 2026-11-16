import { QueryTypes, type Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { config } from "../config.js";
import { newChallengeEmail } from "../lib/email.js";
import { sendMail } from "../lib/mailer.js";
import { hourOf, weekdayOf } from "../lib/notify.js";
import { unsubscribeLink } from "../lib/unsubscribe.js";

// Los mails salen de a uno y espaciados (Resend limita los pedidos por segundo). En los tests, sin espera.
const GAP_MS = process.env.NODE_ENV === "test" ? 0 : 600;

let sending: Promise<void> = Promise.resolve();
// Para los tests: espera a que terminen los mails que quedaron saliendo
export const challengeMailsDone = () => sending;

// El mail de "Desafío nuevo": a los alumnos activos (con algún curso con constelación) que no lo
// desactivaron. Se llama una sola vez por desafío, cuando se crea la fila. Sale después del commit y
// sin hacer esperar a quien abrió la app justo en ese momento: el primer pedido del día no puede
// quedarse esperando a que salgan todos los mails.
export async function announceChallenge(t: Transaction, challenge: { closesAt: Date }) {
  const people = await sequelize.query<{ id: string; email: string; name: string }>(
    `SELECT DISTINCT u.id, u.email, u.name
       FROM users u
       JOIN enrollments e ON e.user_id = u.id AND e.status = 'active'
       JOIN constellations c ON c.product_id = e.product_id
      WHERE u.deleted_at IS NULL AND u.notify_email`,
    { type: QueryTypes.SELECT, transaction: t }
  );
  if (!people.length) return;

  const closes = `el ${weekdayOf(challenge.closesAt)} a las ${hourOf(challenge.closesAt)}`;
  t.afterCommit(() => {
    sending = sending.then(async () => {
      for (const person of people) {
        const mail = newChallengeEmail(person.name, closes, `${config.appUrl}/challenges`, unsubscribeLink(person.id));
        await sendMail({ to: person.email, ...mail }).catch((err) => console.error("No se pudo mandar el mail del desafío", err));
        if (GAP_MS) await new Promise((resolve) => setTimeout(resolve, GAP_MS));
      }
    });
  });
}
