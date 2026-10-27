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