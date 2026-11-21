import { describe, expect, it } from "vitest";
import { User } from "../src/models/index.js";
import { checkIntegrity, sealAll } from "../src/lib/integrity.js";
import { createUser, http, loginAs } from "./helpers.js";

describe("PATCH /me/alias", () => {
  it("cambia el alias, lo recorta y deja la fecha", async () => {
    await createUser("sofia@test.com");
    const sofia = await loginAs("sofia@test.com");
    const res = await sofia.patch("/me/alias").send({ alias: "  lunaria  " }).expect(200);
    expect(res.body.alias).toBe("lunaria");
    expect(res.body.aliasChangedAt).not.toBeNull();
    expect((await sofia.get("/me")).body.user).toMatchObject({ alias: "lunaria", avatar: null });
  });

  it("puede repetirse con el de otra persona: el que identifica es el email", async () => {
    await createUser("sofia@test.com");
    await createUser("tomas@test.com");
    await User.update({ alias: "estrella" }, { where: { email: "tomas@test.com" } });
    const sofia = await loginAs("sofia@test.com");
    await sofia.patch("/me/alias").send({ alias: "estrella" }).expect(200);
    expect(await User.count({ where: { alias: "estrella" } })).toBe(2);
  });

  it("rechaza lo que no cumple el formato y los nombres bloqueados", async () => {
    await createUser("sofia@test.com");
    const sofia = await loginAs("sofia@test.com");
    for (const alias of ["ab", "a".repeat(21), "con espacio", "ñandú", "", 5, undefined]) {
      expect((await sofia.patch("/me/alias").send({ alias })).status).toBe(400);
    }
    for (const alias of ["admin", "Soporte-SRV", "el_admin_real", "WeAreSRV"]) {
      const res = await sofia.patch("/me/alias").send({ alias });
      expect(res.status).toBe(400);
      expect(res.body.error ?? res.body.message).toContain("no está disponible");
    }
    expect((await http().patch("/me/alias").send({ alias: "lunaria" })).status).toBe(401);
  });

  it("solo se puede cambiar una vez cada 30 días", async () => {
    await createUser("sofia@test.com");
    const sofia = await loginAs("sofia@test.com");
    await sofia.patch("/me/alias").send({ alias: "primero" }).expect(200);
    const again = await sofia.patch("/me/alias").send({ alias: "segundo" });
    expect(again.status).toBe(429);
    expect(await User.count({ where: { alias: "primero" } })).toBe(1);

    // Pasados los 30 días, sí
    await User.update({ aliasChangedAt: new Date(Date.now() - 31 * 86_400_000) }, { where: { email: "sofia@test.com" } });
    await sofia.patch("/me/alias").send({ alias: "segundo" }).expect(200);
    // Mandar el mismo alias no cuenta como cambio
    await sofia.patch("/me/alias").send({ alias: "segundo" }).expect(200);
  });
});

describe("PATCH /me/name", () => {
  it("cambia el nombre, junta los espacios y deja sellada la fila", async () => {
    await createUser("sofia@test.com");
    await sealAll(); // createUser escribe fuera de una transacción: la fila nace sin sellar
    const sofia = await loginAs("sofia@test.com");
    const res = await sofia.patch("/me/name").send({ name: "  María   José Núñez " }).expect(200);
    expect(res.body.name).toBe("María José Núñez");
    expect((await sofia.get("/me")).body.user.name).toBe("María José Núñez");
    // Se puede volver a cambiar enseguida: no tiene espera como el alias
    await sofia.patch("/me/name").send({ name: "Sofi" }).expect(200);
    const problems = (await checkIntegrity()).filter((p) => "table" in p && p.table === "users");
    expect(problems).toEqual([]);
  });

  it("rechaza nombres vacíos, sin letras, muy largos o con caracteres raros, y pide sesión", async () => {
    await createUser("sofia@test.com");
    const sofia = await loginAs("sofia@test.com");
    for (const name of ["", "   ", "a", "12345", "a".repeat(61), "<b>Sofía</b>", "Sofía​", 5, undefined]) {
      expect((await sofia.patch("/me/name").send({ name })).status).toBe(400);
    }
    expect((await User.findOne({ where: { email: "sofia@test.com" } }))!.name).not.toBe("a");
    expect((await http().patch("/me/name").send({ name: "Sofía" })).status).toBe(401);
  });
});

describe("PATCH /me/avatar", () => {
  it("elige un dibujo de la lista y se vuelve a las iniciales con null", async () => {
    await createUser("sofia@test.com");
    const sofia = await loginAs("sofia@test.com");
    expect((await sofia.patch("/me/avatar").send({ avatar: "luna" }).expect(200)).body).toEqual({ avatar: "luna" });
    expect((await sofia.get("/me")).body.user.avatar).toBe("luna");
    expect((await sofia.patch("/me/avatar").send({ avatar: null }).expect(200)).body).toEqual({ avatar: null });
  });

  it("rechaza lo que no está en la lista", async () => {
    await createUser("sofia@test.com");
    const sofia = await loginAs("sofia@test.com");
    for (const avatar of ["foto.png", "", 3, undefined]) {
      expect((await sofia.patch("/me/avatar").send({ avatar })).status).toBe(400);
    }
    expect((await http().patch("/me/avatar").send({ avatar: "luna" })).status).toBe(401);
  });
});
