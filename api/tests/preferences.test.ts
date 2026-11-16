import { beforeEach, describe, expect, it } from "vitest";
import { sequelize } from "../src/db.js";
import { Notification, User } from "../src/models/index.js";
import { checkChallengeBank } from "../src/games/challengeBank.js";
import { challengeMailsDone } from "../src/games/challengeMail.js";
import { refreshNotices } from "../src/games/notices.js";
import { unsubscribeToken, userIdFromUnsubscribeToken } from "../src/lib/unsubscribe.js";
import { createPythonStar, createUser, enrolledStudent, http, loginAs, sentMails, setRole } from "./helpers.js";

const challengeMails = () => sentMails().filter((m) => m.subject === "Salió un desafío nuevo en E-Stellarium");

describe("PATCH /me/preferences", () => {
  it("arrancan activadas, se cambian por separado y llegan en GET /me", async () => {
    await createUser("sofia@test.com");
    const sofia = await loginAs("sofia@test.com");
    expect((await sofia.get("/me")).body.user).toMatchObject({ notifyEmail: true, notifyApp: true });

    const res = await sofia.patch("/me/preferences").send({ notifyEmail: false }).expect(200);
    expect(res.body).toEqual({ notifyEmail: false, notifyApp: true });
    expect((await sofia.patch("/me/preferences").send({ notifyApp: false }).expect(200)).body).toEqual({ notifyEmail: false, notifyApp: false });
    expect((await sofia.get("/me")).body.user).toMatchObject({ notifyEmail: false, notifyApp: false });
  });

  it("rechaza lo que no es sí o no, el pedido vacío y la falta de sesión", async () => {
    await createUser("sofia@test.com");
    const sofia = await loginAs("sofia@test.com");
    expect((await sofia.patch("/me/preferences").send({ notifyEmail: "no" })).status).toBe(400);
    expect((await sofia.patch("/me/preferences").send({})).status).toBe(400);
    expect((await http().patch("/me/preferences").send({ notifyEmail: false })).status).toBe(401);
  });
});

describe("GET /unsubscribe", () => {
  it("desactiva el mail con un clic, sin sesión, y es idempotente", async () => {
    const user = await createUser("sofia@test.com");
    const token = unsubscribeToken(user.id);
    const first = await http().get("/unsubscribe").query({ token }).expect(200);
    expect(first.text).toContain("no te mandamos más");
    await http().get("/unsubscribe").query({ token }).expect(200);
    const after = await User.findByPk(user.id);
    expect(after).toMatchObject({ notifyEmail: false, notifyApp: true }); // solo toca el mail
  });

  it("rechaza un token inventado, de otra persona o sin firma", async () => {
    const sofia = await createUser("sofia@test.com");
    const tomas = await createUser("tomas@test.com");
    const forged = `${tomas.id}.${unsubscribeToken(sofia.id).split(".")[1]}`;
    for (const token of [forged, sofia.id, `${sofia.id}.abc`, "basura", ""]) {
      expect((await http().get("/unsubscribe").query({ token })).status).toBe(400);
    }
    expect((await http().get("/unsubscribe")).status).toBe(400);
    expect(await User.count({ where: { notifyEmail: false } })).toBe(0);
    expect(userIdFromUnsubscribeToken(unsubscribeToken(sofia.id))).toBe(sofia.id);
  });
});

describe("el mail del desafío nuevo", () => {
  // challenges no cuelga de users: sin esto, el desafío de otro test sigue vigente y no sale un mail nuevo
  beforeEach(async () => {
    await sequelize.query("TRUNCATE challenges CASCADE");
  });

  it("sale una sola vez a los alumnos con constelación, con el link de baja, y no a quien lo desactivó", async () => {
    await createPythonStar();
    const sofia = await enrolledStudent(["python"], "sofia@test.com");
    await enrolledStudent(["python"], "tomas@test.com");
    await createUser("sin-cursos@test.com");
    await User.update({ notifyEmail: false }, { where: { email: "tomas@test.com" } });
    const before = challengeMails().length;

    await sofia.get("/challenges/current").expect(200);
    await challengeMailsDone();
    const sent = challengeMails().slice(before);
    expect(sent.map((m) => m.to)).toEqual(["sofia@test.com"]);
    const sofiaId = (await User.findOne({ where: { email: "sofia@test.com" } }))!.id;
    expect(sent[0]!.html).toContain(`/api/unsubscribe?token=${unsubscribeToken(sofiaId)}`);

    // Pedirlo de nuevo no crea otro desafío ni repite el mail
    await sofia.get("/challenges/current").expect(200);
    await challengeMailsDone();
    expect(challengeMails().length - before).toBe(1);
  });

  it("el link del mail lo desactiva y el siguiente desafío ya no le llega", async () => {
    await createPythonStar();
    const sofia = await enrolledStudent(["python"], "sofia@test.com");
    const user = (await User.findOne({ where: { email: "sofia@test.com" } }))!;
    await http().get("/unsubscribe").query({ token: unsubscribeToken(user.id) }).expect(200);
    const before = challengeMails().length;
    await sofia.get("/challenges/current").expect(200);
    await challengeMailsDone();
    expect(challengeMails().length).toBe(before);
  });
});

describe("la campanita y las preferencias", () => {
  it("sin avisos de la app, no se crean avisos nuevos, pero el mail de cuenta sigue llegando", async () => {
    const user = await createUser("sofia@test.com");
    await user.update({ notifyApp: false });
    const before = sentMails().length;
    // Le llegan cursos nuevos (mail de cuenta: no se puede desactivar)
    const { provision } = await import("./helpers.js");
    await provision({ email: "sofia@test.com", name: "Sofía", paymentId: "6001", courses: ["python"] }).expect(201);
    expect(sentMails().length - before).toBe(1);
    expect(await Notification.count({ where: { userId: user.id } })).toBe(0);

    // Los que se calculan al pedir la campanita tampoco
    await createPythonStar();
    await refreshNotices(user);
    expect(await Notification.count({ where: { userId: user.id } })).toBe(0);

    await user.update({ notifyApp: true });
    await refreshNotices(user);
    expect(await Notification.count({ where: { userId: user.id } })).toBeGreaterThan(0);
  });

  it("banco bajo: respeta las dos preferencias de cada admin", async () => {
    await createPythonStar();
    const quiet = await setRole(await createUser("quiet@test.com"), "admin");
    const loud = await setRole(await createUser("loud@test.com"), "admin");
    await quiet.update({ notifyEmail: false });
    const before = sentMails().length;

    await sequelize.transaction((t) => checkChallengeBank(t));
    const mails = sentMails().slice(before);
    expect(mails.length).toBe(3); // una por dificultad, solo a quien no lo desactivó
    expect(await Notification.count({ where: { userId: quiet.id } })).toBe(3); // la campanita sigue
    expect((await Notification.findOne({ where: { userId: quiet.id } }))!.emailSent).toBe(false);
    expect((await Notification.findOne({ where: { userId: loud.id } }))!.emailSent).toBe(true);
  });
});
