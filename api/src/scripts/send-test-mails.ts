import "dotenv/config";
import { config } from "../config.js";
import { sendMail } from "../lib/mailer.js";
import * as mails from "../lib/email.js";

// Manda los 9 mails de la app, con datos de ejemplo, a un email, para ver cómo llegan de verdad
// (Gmail, celular...). Usa el mismo envío que la app: con RESEND_API_KEY y MAIL_FROM sale por Resend;
// sin ellos, por consola. No toca la base de datos.
const [to] = process.argv.slice(2);

if (!to) {
  console.error("Uso: npm run send-test-mails -- <email>   (por ejemplo wearesrv+prueba@gmail.com)");
  process.exit(1);
}

const link = `${config.appUrl}/create-password?token=ejemplo`;
const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const samples = [
  mails.welcomeEmail("Sofía", link, ["Master en Python", "Master en JavaScript"]),
  mails.newCoursesEmail("Sofía", ["Master en JavaScript"]),
  mails.resetPasswordEmail("Sofía", link),
  mails.couponEmail("Sofía", "Master en Python", "ESTL-PY-7K3QM2", 60, inDays(60)),
  mails.giftCouponEmail("Sofía", "ESTL-RG-4HT9XD", 20, inDays(30)),
  mails.demoCouponEmail("ESTL-DM-6QW2RZ", 25, inDays(1), "https://wearesrv.com"),
  mails.newChallengeEmail("Sofía", "el domingo a las 23:59", `${config.appUrl}/challenges`, `${config.appUrl}/api/unsubscribe?token=ejemplo`),
  mails.challengeBankLowEmail("Master en Python", "fáciles", 12, 3),
  mails.integrityFailEmail([
    { kind: "row", table: "users", rowId: "3f9a1c2e" },
    { kind: "table", table: "coupons" },
  ]),
];

for (const mail of samples) {
  // Un asunto reconocible: es una prueba, y no hay que confundirla con un mail de verdad
  await sendMail({ to, ...mail, subject: `[Prueba] ${mail.subject}` });
  console.log(`Enviado: ${mail.subject}`);
}
