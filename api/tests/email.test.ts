import { describe, expect, it } from "vitest";
import * as mails from "../src/lib/email.js";

const link = "https://e-stellarium.wearesrv.com/create-password?token=abc-123";
const future = new Date("2027-01-15T12:00:00-03:00");

const all = {
  welcome: mails.welcomeEmail("Sofía", link, ["Master en Python"]),
  newCourses: mails.newCoursesEmail("Sofía", ["Master en Python"]),
  reset: mails.resetPasswordEmail("Sofía", link),
  coupon: mails.couponEmail("Sofía", "Master en Python", "ESTL-PY-7K3QM2", 60, future),
  gift: mails.giftCouponEmail("Sofía", "ESTL-RG-4HT9XD", 20, future),
  demo: mails.demoCouponEmail("ESTL-DM-6QW2RZ", 25, future, "https://wearesrv.com"),
  challenge: mails.newChallengeEmail("Sofía", "el domingo a las 23:59", "https://x.test/challenges", "https://x.test/unsubscribe?token=t"),
  bankLow: mails.challengeBankLowEmail("Master en Python", "fáciles", 12, 3),
  integrity: mails.integrityFailEmail([{ kind: "row", table: "users", rowId: "3f9a" }]),
};

describe("los mails", () => {
  it.each(Object.entries(all))("%s tiene asunto, marco y pie", (_name, mail) => {
    expect(mail.subject.length).toBeGreaterThan(5);
    expect(mail.html).toContain("E-Stellarium");
    expect(mail.html).toContain("Somos Revolución");
    // El encabezado carga la constelación desde la app
    expect(mail.html).toContain("/mail/header.png");
  });

  it("escapa lo que escribió el usuario", () => {
    const evil = mails.welcomeEmail('<script>alert(1)</script>"', link, ["<b>curso</b>"]);
    expect(evil.html).not.toContain("<script>");
    expect(evil.html).not.toContain("<b>curso</b>");
    expect(evil.html).toContain("&lt;script&gt;");
  });

  it("los links y los códigos están en el cuerpo", () => {
    expect(all.reset.html).toContain(link);
    expect(all.coupon.html).toContain("ESTL-PY-7K3QM2");
    expect(all.coupon.html).toContain("60 %");
    expect(all.challenge.html).toContain("unsubscribe?token=t");
  });

  it("solo el del desafío ofrece darse de baja; los de cuenta dicen que no se pueden desactivar", () => {
    expect(all.challenge.html).toContain("Dejar de recibirlos");
    expect(all.welcome.html).toContain("no se puede desactivar");
    expect(all.welcome.html).not.toContain("Dejar de recibirlos");
  });
});
