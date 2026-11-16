// Dominios de email descartables conocidos (bandejas que se crean y se tiran en un minuto).
// La demo no entrega cupón a estos. Es una lista corta de los más usados: para sumar uno, agregalo acá.
// También se bloquean sus subdominios (x.mailinator.com).
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com", "10minutemail.net", "20minutemail.com", "33mail.com", "burnermail.io", "byom.de",
  "cool.fr.nf", "discard.email", "discardmail.com", "dispostable.com", "dropmail.me", "emailondeck.com",
  "emailfake.com", "fakeinbox.com", "fakemail.net", "fakemailgenerator.com", "getairmail.com", "getnada.com",
  "guerrillamail.biz", "guerrillamail.com", "guerrillamail.de", "guerrillamail.net", "guerrillamail.org",
  "guerrillamailblock.com", "harakirimail.com", "inboxbear.com", "inboxkitten.com", "jetable.org",
  "kasmail.com", "mail-temporaire.fr", "mailcatch.com", "maildrop.cc", "mailforspam.com", "mailinator.com",
  "mailinator.net", "mailnesia.com", "mailnull.com", "mailsac.com", "mintemail.com", "mohmal.com",
  "moakt.com", "mytemp.email", "nada.email", "sharklasers.com", "grr.la", "spam4.me", "spamgourmet.com",
  "temp-mail.io", "temp-mail.org", "tempail.com", "tempinbox.com", "tempmail.com", "tempmail.net",
  "tempmailo.com", "tempr.email", "throwawaymail.com", "trashmail.com", "trashmail.de", "trashmail.net",
  "trbvm.com", "yopmail.com", "yopmail.fr", "yopmail.net", "zetmail.com",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  const parts = domain.split(".");
  // "a.b.mailinator.com" también: se prueba cada final del dominio
  return parts.some((_, i) => DISPOSABLE_DOMAINS.has(parts.slice(i).join(".")));
}
