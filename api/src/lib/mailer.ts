type Mail = { to: string; subject: string; html: string };

// Con RESEND_API_KEY manda el mail por Resend (su API es un POST con JSON, no hace falta ninguna librería).
// Sin la clave (desarrollo y tests) lo muestra por consola. MAIL_FROM es el remitente, con un dominio
// verificado en Resend, por ejemplo: E-Stellarium <no-reply@wearesrv.com>
export async function sendMail(mail: Mail) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`\n--- Mail para ${mail.to} ---\nAsunto: ${mail.subject}\n${mail.html}\n---\n`);
    return;
  }

  const from = process.env.MAIL_FROM;
  if (!from) throw new Error("Falta MAIL_FROM en las variables de entorno");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, html: mail.html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Resend respondió ${response.status}: ${await response.text()}`);
}
