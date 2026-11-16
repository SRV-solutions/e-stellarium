function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function courseList(courses: string[]) {
  return `<ul>${courses.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>`;
}

export function welcomeEmail(name: string, link: string, courses: string[]) {
  return {
    subject: "Bienvenido a E-Stellarium: elegí tu contraseña",
    html: `<p>¡Hola ${escapeHtml(name)}!</p>
<p>Ya tenés acceso a E-Stellarium con estos cursos:</p>
${courseList(courses)}
<p>Para entrar, elegí tu contraseña con este link. Vence en 72 horas:</p>
<p><a href="${link}">${link}</a></p>`,
  };
}

export function newCoursesEmail(name: string, courses: string[]) {
  return {
    subject: "Tenés cursos nuevos en E-Stellarium",
    html: `<p>¡Hola ${escapeHtml(name)}!</p>
<p>Sumamos estos cursos a tu cuenta:</p>
${courseList(courses)}
<p>Entrá a E-Stellarium con tu email y tu contraseña de siempre.</p>`,
  };
}

export function resetPasswordEmail(name: string, link: string) {
  return {
    subject: "Cambiá tu contraseña de E-Stellarium",
    html: `<p>¡Hola ${escapeHtml(name)}!</p>
<p>Pediste cambiar tu contraseña. Usá este link, que vence en 1 hora:</p>
<p><a href="${link}">${link}</a></p>
<p>Si no fuiste vos, ignorá este mail: tu contraseña sigue igual.</p>`,
  };
}
export function couponEmail(name: string, courseName: string, code: string, percent: number, expiresAt: Date) {
  const until = expiresAt.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
  return {
    subject: `Aprobaste el examen de ${courseName}: tu cupón del ${percent} %`,
    html: `<p>¡Felicitaciones, ${escapeHtml(name)}!</p>
<p>Aprobaste el examen de <strong>${escapeHtml(courseName)}</strong> en E-Stellarium y ganaste un
${percent} % de descuento en tu próximo curso de WeAreSRV.</p>
<p style="font-size:20px"><strong>${escapeHtml(code)}</strong></p>
<p>Vale para una sola compra, hasta el ${until}.</p>
<p><strong>No lo compartas:</strong> el que lo use primero se queda con el descuento.</p>`,
  };
}

// Un cupón de regalo, emitido a mano desde el panel (el motivo no va: es para el staff)
export function giftCouponEmail(name: string, code: string, percent: number, expiresAt: Date) {
  const until = expiresAt.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });
  return {
    subject: `Te regalamos un cupón del ${percent} %`,
    html: `<p>¡Hola ${escapeHtml(name)}!</p>
<p>Te regalamos un ${percent} % de descuento en tu próximo curso de WeAreSRV.</p>
<p style="font-size:20px"><strong>${escapeHtml(code)}</strong></p>
<p>Vale para una sola compra, hasta el ${until}. También lo ves en <strong>Mis cupones</strong>, en E-Stellarium.</p>
<p><strong>No lo compartas:</strong> el que lo use primero se queda con el descuento.</p>`,
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
    .map((p) => `<li>${escapeHtml(p.table)}${p.rowId ? ` (${escapeHtml(p.rowId)})` : ""}: ${KIND[p.kind]}</li>`)
    .join("");
  return {
    subject: "E-Stellarium: falló la verificación de integridad",
    html: `<p>La verificación de integridad encontró datos que se cambiaron sin pasar por la app:</p>
<ul>${items}</ul>
<p>Revisalo en el panel, en Integridad.</p>`,
  };
}

export function challengeBankLowEmail(courseName: string, difficulty: string, left: number, minChallenges: number) {
  return {
    subject: `E-Stellarium: se acaban las preguntas ${difficulty} de ${courseName}`,
    html: `<p>A los desafíos de <strong>${escapeHtml(courseName)}</strong> les quedan ${left} preguntas ${escapeHtml(difficulty)}: con la receta de hoy alcanzan para menos de ${minChallenges} desafíos.</p>
<p>Hace falta sumar más desde el panel, en Contenido. Este aviso no se repite hasta que se repongan.</p>`,
  };
}

// El mail del desafío nuevo: se puede desactivar, así que lleva el link para darse de baja con un clic
export function newChallengeEmail(name: string, closesAt: string, link: string, unsubscribe: string) {
  return {
    subject: "Salió un desafío nuevo en E-Stellarium",
    html: `<p>¡Hola ${escapeHtml(name)}!</p>
<p>Ya está el desafío: una sola vez, contra reloj. Cierra ${escapeHtml(closesAt)}.</p>
<p><a href="${link}">Entrar al desafío</a></p>
<p style="color:#666;font-size:13px">¿No querés más estos mails? <a href="${unsubscribe}">Dejar de recibirlos</a>
(con un clic, sin iniciar sesión). También lo cambiás desde tu perfil.</p>`,
  };
}
