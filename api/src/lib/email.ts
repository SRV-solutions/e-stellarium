import { config } from "../config.js";

// Los mails de E-Stellarium. Todos pasan por layout(): el encabezado con la constelación, el cuerpo y el pie.
// Son tablas con estilos en línea porque Gmail y Outlook ignoran casi todo el CSS moderno, y claros siempre
// (muchos clientes no respetan el modo oscuro). La vista previa está en docs/diseno/mails.html.

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const COLOR = {
  night: "#0a1735",
  ink: "#1b2650",
  body: "#34406a",
  muted: "#6b779d",
  line: "#d9dfef",
  page: "#eef1f8",
  orange: "#ff9900",
  blue: "#007bff",
  coral: "#d6453a",
};
const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

// La constelación del encabezado vive en client/public/mail/header.png y la sirve la app
const headerImage = () => `${config.appUrl}/mail/header.png`;

const paragraph = (html: string) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${COLOR.body}">${html}</p>`;

const small = (html: string) =>
  `<p style="margin:0 0 12px;font-size:13px;line-height:1.55;color:${COLOR.muted}">${html}</p>`;

// El título, con una etiqueta naranja arriba que dice de qué se trata el mail
const heading = (text: string, tag: string) =>
  `<div style="margin:0 0 10px;font-size:13px;font-weight:700;color:#c46f00"><span style="color:${COLOR.orange}">&#10022;</span>&nbsp; ${tag}</div>` +
  `<h1 style="margin:0 0 20px;font-size:28px;line-height:1.2;color:${COLOR.ink};font-weight:700">${text}</h1>`;

// El botón va en una tabla porque Outlook no pinta el fondo de un <a>
const button = (label: string, href: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px"><tr>` +
  `<td style="background:${COLOR.blue};border-radius:6px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;font-family:${FONT}">${escapeHtml(label)}</a></td></tr></table>`;

// El link entero en texto, por si el botón no anda
const rawLink = (href: string) =>
  small(
    `Si el botón no anda, copiá este link en el navegador:<br><a href="${escapeHtml(href)}" style="color:${COLOR.blue};word-break:break-all">${escapeHtml(href)}</a>`
  );

const courseList = (courses: string[]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px">${courses
    .map(
      (c) =>
        `<tr><td valign="top" style="padding:0 10px 6px 0;font-size:15px;color:${COLOR.orange}">&#10022;</td>` +
        `<td style="padding:0 0 6px;font-size:15px;line-height:1.5;color:${COLOR.ink};font-weight:600">${escapeHtml(c)}</td></tr>`
    )
    .join("")}</table>`;

// Un dato que no se puede perder (cuándo vence, cuándo cierra): el rótulo chico y el valor grande
const fact = (label: string, value: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:2px 0 20px;border-top:1px solid ${COLOR.line};border-bottom:1px solid ${COLOR.line}"><tr>` +
  `<td style="padding:12px 0;font-size:13px;color:${COLOR.muted}">${label}</td>` +
  `<td align="right" style="padding:12px 0;font-size:16px;font-weight:700;color:${COLOR.ink}">${value}</td></tr></table>`;

// El talón de un cupón: el porcentaje a la izquierda, el código a la derecha y un borde de troquel
const stub = (percent: number, code: string, validity: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 20px;border:1px dashed #9aa7cf;border-radius:8px"><tr>` +
  `<td width="120" align="center" style="background:${COLOR.night};border-radius:7px 0 0 7px;padding:18px 8px">` +
  `<div style="font-size:34px;line-height:1;font-weight:700;color:${COLOR.orange};font-family:${FONT}">${percent} %</div>` +
  `<div style="font-size:12px;color:#9aaad0;padding-top:6px;font-family:${FONT}">de descuento</div></td>` +
  `<td style="padding:16px 20px;background:#f6f8fd;border-radius:0 7px 7px 0">` +
  `<div style="font-size:12px;color:${COLOR.muted};padding-bottom:4px;font-family:${FONT}">Tu código</div>` +
  `<div style="font-size:22px;letter-spacing:2px;font-weight:700;color:${COLOR.ink};font-family:${MONO}">${escapeHtml(code)}</div>` +
  `<div style="font-size:13px;color:${COLOR.muted};padding-top:6px;font-family:${FONT}">${validity}</div></td></tr></table>`;

// Un aviso para el staff: una barra de color a la izquierda
const notice = (color: string, html: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px"><tr>` +
  `<td width="4" style="background:${color}"></td>` +
  `<td style="padding:10px 16px;background:#f6f8fd;font-size:14px;line-height:1.6;color:${COLOR.body}">${html}</td></tr></table>`;

const ACCOUNT_FOOTER = small("Este es un mail de tu cuenta de E-Stellarium: no se puede desactivar.");
const STAFF_FOOTER = small("Aviso de staff de E-Stellarium.");

function layout({ preheader, body, footer }: { preheader: string; body: string; footer: string }) {
  const image = headerImage();
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${COLOR.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLOR.page}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;font-family:${FONT}">
<tr><td background="${image}" bgcolor="${COLOR.night}" height="110" valign="middle" style="background-color:${COLOR.night};background-image:url('${image}');background-size:560px 110px;background-repeat:no-repeat;background-position:right top;padding:0 28px;height:110px;border-radius:8px 8px 0 0">
<div style="font-size:22px;font-weight:700;color:#eef3ff"><span style="color:${COLOR.orange}">&#10022;</span>&nbsp; E-Stellarium</div>
<div style="font-size:13px;color:#9aaad0;padding-top:6px">Practicá con juegos. Ganá descuentos.</div>
</td></tr>
<tr><td style="background:#ffffff;padding:30px 28px 14px;border-left:1px solid ${COLOR.line};border-right:1px solid ${COLOR.line}">${body}</td></tr>
<tr><td style="background:#ffffff;padding:0 28px 26px;border:1px solid ${COLOR.line};border-top:0;border-radius:0 0 8px 8px">
<div style="border-top:1px solid ${COLOR.line};padding-top:16px">${footer}</div>
</td></tr>
<tr><td align="center" style="padding:16px 12px;font-size:12px;color:${COLOR.muted}">WeAreSRV &middot; Somos Revolución</td></tr>
</table></td></tr></table></body></html>`;
}

const dayFormat: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Argentina/Buenos_Aires",
};

export function welcomeEmail(name: string, link: string, courses: string[]) {
  return {
    subject: "Bienvenido a E-Stellarium: elegí tu contraseña",
    html: layout({
      preheader: "Ya tenés acceso. Elegí tu contraseña para entrar.",
      body:
        heading(`¡Hola ${escapeHtml(name)}!`, "Bienvenida") +
        paragraph(
          "Ya tenés acceso a E-Stellarium, la plataforma donde repasás con juegos, ganás experiencia y conseguís descuentos. Tus cursos:"
        ) +
        courseList(courses) +
        paragraph("Para entrar, elegí tu contraseña.") +
        fact("El link vence en", "72 horas") +
        button("Elegir mi contraseña", link) +
        rawLink(link),
      footer: ACCOUNT_FOOTER,
    }),
  };
}

export function newCoursesEmail(name: string, courses: string[]) {
  return {
    subject: "Tenés cursos nuevos en E-Stellarium",
    html: layout({
      preheader: "Sumamos cursos a tu cuenta.",
      body:
        heading(`¡Hola ${escapeHtml(name)}!`, "Cursos nuevos") +
        paragraph("Sumamos estos cursos a tu cuenta:") +
        courseList(courses) +
        paragraph("Entrá con tu email y tu contraseña de siempre.") +
        button("Ir a E-Stellarium", config.appUrl),
      footer: ACCOUNT_FOOTER,
    }),
  };
}

export function resetPasswordEmail(name: string, link: string) {
  return {
    subject: "Cambiá tu contraseña de E-Stellarium",
    html: layout({
      preheader: "Usá este link para elegir una contraseña nueva. Vence en 1 hora.",
      body:
        heading(`¡Hola ${escapeHtml(name)}!`, "Nueva contraseña") +
        paragraph("Pediste cambiar tu contraseña. Tocá el botón y elegí una nueva.") +
        fact("El link vence en", "1 hora") +
        button("Cambiar mi contraseña", link) +
        rawLink(link) +
        paragraph("Si no fuiste vos, ignorá este mail: tu contraseña sigue igual."),
      footer: ACCOUNT_FOOTER,
    }),
  };
}

export function couponEmail(name: string, courseName: string, code: string, percent: number, expiresAt: Date) {
  const until = expiresAt.toLocaleDateString("es-AR", dayFormat);
  return {
    subject: `Aprobaste el examen de ${courseName}: tu cupón del ${percent} %`,
    html: layout({
      preheader: `Ganaste un ${percent} % de descuento en tu próximo curso.`,
      body:
        heading(`¡Felicitaciones, ${escapeHtml(name)}!`, "Examen aprobado") +
        paragraph(
          `Aprobaste el examen de <strong>${escapeHtml(courseName)}</strong> y ganaste un descuento en tu próximo curso de WeAreSRV.`
        ) +
        stub(percent, code, `Una sola compra, hasta el ${until}.`) +
        paragraph("<strong>No lo compartas:</strong> el que lo use primero se queda con el descuento.") +
        small("Lo ves siempre en <strong>Mis cupones</strong>, en E-Stellarium."),
      footer: ACCOUNT_FOOTER,
    }),
  };
}

// Un cupón de regalo, emitido a mano desde el panel (el motivo no va: es para el staff)
export function giftCouponEmail(name: string, code: string, percent: number, expiresAt: Date) {
  const until = expiresAt.toLocaleDateString("es-AR", dayFormat);
  return {
    subject: `Te regalamos un cupón del ${percent} %`,
    html: layout({
      preheader: "Un cupón de regalo para tu próximo curso.",
      body:
        heading(`¡Hola ${escapeHtml(name)}!`, "Un regalo") +
        paragraph("Te regalamos un descuento en tu próximo curso de WeAreSRV.") +
        stub(percent, code, `Una sola compra, hasta el ${until}.`) +
        paragraph("<strong>No lo compartas:</strong> el que lo use primero se queda con el descuento.") +
        small("También lo ves en <strong>Mis cupones</strong>, en E-Stellarium."),
      footer: ACCOUNT_FOOTER,
    }),
  };
}

export function integrityFailEmail(problems: { kind: string; table: string; rowId?: string }[]) {
  const KIND: Record<string, string> = {
    row: "una fila no coincide con su dígito verificador",
    table: "el dígito vertical no coincide (agregaron o borraron filas)",
    chain: "la cadena de la bitácora se rompe en este registro",
  };
  const items = problems
    .slice(0, 20)
    .map((p) => `${p.table}${p.rowId ? ` (${p.rowId})` : ""}: ${KIND[p.kind]}`);
  return {
    subject: "E-Stellarium: falló la verificación de integridad",
    html: layout({
      preheader: "Se encontraron datos cambiados sin pasar por la app.",
      body:
        heading("Falló la verificación de integridad", "Integridad") +
        notice(COLOR.coral, "La verificación encontró datos que se cambiaron <strong>sin pasar por la app</strong>.") +
        courseList(items) +
        paragraph("Revisalo en el panel, en Integridad.") +
        button("Abrir Integridad", `${config.appUrl}/admin/audit`),
      footer: STAFF_FOOTER,
    }),
  };
}

export function challengeBankLowEmail(courseName: string, difficulty: string, left: number, minChallenges: number) {
  return {
    subject: `E-Stellarium: se acaban las preguntas ${difficulty} de ${courseName}`,
    html: layout({
      preheader: `Con la receta de hoy alcanzan para menos de ${minChallenges} desafíos.`,
      body:
        heading("Se acaban las preguntas", "Banco bajo") +
        notice(
          COLOR.orange,
          `A los desafíos de <strong>${escapeHtml(courseName)}</strong> les quedan <strong>${left}</strong> preguntas ${escapeHtml(difficulty)}: con la receta de hoy alcanzan para menos de ${minChallenges} desafíos.`
        ) +
        paragraph("Hace falta sumar más desde el panel, en <strong>Contenido</strong>.") +
        button("Ir a Contenido", `${config.appUrl}/admin/content`) +
        small("Este aviso no se repite hasta que se repongan."),
      footer: STAFF_FOOTER,
    }),
  };
}

// El mail del desafío nuevo: se puede desactivar, así que lleva el link para darse de baja con un clic
export function newChallengeEmail(name: string, closesAt: string, link: string, unsubscribe: string) {
  return {
    subject: "Salió un desafío nuevo en E-Stellarium",
    html: layout({
      preheader: `Una sola vez, contra reloj. Cierra ${closesAt}.`,
      body:
        heading(`¡Hola ${escapeHtml(name)}!`, "Desafío nuevo") +
        paragraph("Ya está el desafío de la semana: una sola vez y contra reloj.") +
        fact("Cierra", escapeHtml(closesAt)) +
        button("Entrar al desafío", link),
      footer: small(
        `¿No querés más estos mails? <a href="${escapeHtml(unsubscribe)}" style="color:${COLOR.blue}">Dejar de recibirlos</a>, con un clic y sin iniciar sesión. También lo cambiás desde tu perfil.`
      ),
    }),
  };
}

// El cupón de la demo: el invitado no tiene cuenta, así que el mail es lo único que recibe.
// Invita a ver los cursos, con el link a la web de SRV
export function demoCouponEmail(code: string, percent: number, expiresAt: Date, webUrl: string) {
  const until = expiresAt.toLocaleString("es-AR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  return {
    subject: `Tu cupón del ${percent} % para tu primer curso en WeAreSRV`,
    html: layout({
      preheader: "Tu cupón vale 24 horas. Mirá los cursos.",
      body:
        heading("¡Hola!", "Tu cupón de la demo") +
        paragraph("Gracias por probar E-Stellarium. Este es tu cupón para tu primera compra en WeAreSRV:") +
        stub(percent, code, `Una sola compra, <strong>hasta el ${until}</strong> (hora de Argentina).`) +
        paragraph("No se suma a otros cupones ni aplica en preventas, combos o packs.") +
        button("Ver los cursos", webUrl) +
        paragraph("Si comprás, tu constelación empieza desde cero: lo que jugaste en la demo no se guarda."),
      footer: small("Recibís este mail una sola vez, porque pediste el cupón en la demo de E-Stellarium."),
    }),
  };
}
