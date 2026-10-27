type Mail = { to: string; subject: string; html: string };

// Por ahora por consola, después con Resend
export async function sendMail(mail: Mail) {
  console.log(`\n--- Mail para ${mail.to} ---\nAsunto: ${mail.subject}\n${mail.html}\n---\n`);
}