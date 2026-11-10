import { describe, expect, it } from "vitest";
import { UniqueConstraintError } from "sequelize";
import { Constellation, Product, Star, StarCompletion, User } from "../src/models/index.js";
import { createPythonStar, createQuestion, enrolledStudent, http } from "./helpers.js";

async function createPythonConstellation() {
  const product = await Product.findOne({ where: { key: "python" } });
  return Constellation.create({ productId: product!.id, name: "Constelación Python" });
}

describe("constelaciones y estrellas", () => {
  it("permite una sola constelación por curso", async () => {
    const constellation = await createPythonConstellation();

    await expect(
      Constellation.create({ productId: constellation.productId, name: "Otra" })
    ).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it("no permite dos estrellas en la misma posición", async () => {
    const { id } = await createPythonConstellation();
    await Star.create({ constellationId: id, position: 1, title: "Variables" });

    await expect(
      Star.create({ constellationId: id, position: 1, title: "Tipos de datos" })
    ).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it("permite un solo examen por constelación", async () => {
    const { id } = await createPythonConstellation();
    await Star.create({ constellationId: id, position: 1, title: "Variables" });
    await Star.create({ constellationId: id, position: 2, title: "Condicionales" });
    await Star.create({ constellationId: id, position: 3, title: "Examen final", kind: "exam" });

    await expect(
      Star.create({ constellationId: id, position: 4, title: "Otro examen", kind: "exam" })
    ).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it("borra las estrellas al borrar la constelación", async () => {
    const constellation = await createPythonConstellation();
    await Star.create({ constellationId: constellation.id, position: 1, title: "Variables" });

    await constellation.destroy();

    expect(await Star.count()).toBe(0);
  });

  it("no permite borrar un curso que tiene constelación", async () => {
    const constellation = await createPythonConstellation();
    const product = await Product.findByPk(constellation.productId);

    await expect(product!.destroy()).rejects.toThrow(/constellations_product_id_fkey/);
    expect(await Product.findByPk(constellation.productId)).not.toBeNull();
  });
});

describe("GET /constellations", () => {
  it("pide sesión", async () => {
    expect((await http().get("/constellations")).status).toBe(401);
  });

  it("muestra las estrellas completadas y cuáles se pueden abrir", async () => {
    const { constellation, star } = await createPythonStar();
    const second = await Star.create({ constellationId: constellation.id, position: 2, title: "Condicionales" });
    await Star.create({ constellationId: constellation.id, position: 3, title: "Bucles" });
    const agent = await enrolledStudent();
    const user = await User.findOne({ where: { email: "alumno@test.com" } });
    await StarCompletion.create({ userId: user!.id, starId: star.id });

    const res = await agent.get("/constellations");

    expect(res.status).toBe(200);
    expect(res.body.constellations).toHaveLength(1);
    const [python] = res.body.constellations;
    expect(python).toMatchObject({ course: { key: "python" }, completedStars: 1, totalStars: 3 });
    expect(python.stars.map((s: { title: string; completed: boolean; unlocked: boolean }) => [s.title, s.completed, s.unlocked]))
      .toEqual([
        ["Variables", true, true],
        ["Condicionales", false, true],
        ["Bucles", false, false],
      ]);
    expect(second.id).toBe(python.stars[1].id);
  });

  it("trae los módulos y la letra y el módulo de cada estrella", async () => {
    const { constellation, star } = await createPythonStar();
    await constellation.update({ modules: [{ number: 1, title: "Primeros pasos", classes: "1 y 2" }] });
    await star.update({ module: 1 });
    await Star.create({ constellationId: constellation.id, position: 2, title: "Condicionales", module: 1 });
    await Star.create({ constellationId: constellation.id, position: 3, title: "Examen", kind: "exam" });
    const agent = await enrolledStudent();

    const [python] = (await agent.get("/constellations")).body.constellations;

    expect(python.modules).toEqual([{ number: 1, title: "Primeros pasos" }]);
    expect(python.stars.map((s: { letter: string; module: number | null }) => [s.letter, s.module])).toEqual([
      ["α¹", 1],
      ["α²", 1],
      ["Ω", null],
    ]);
  });

  it("no muestra constelaciones sin publicar ni de cursos que el alumno no tiene", async () => {
    await createPythonStar({ published: false });
    const other = await Product.findOne({ where: { key: "fundamentos-backend" } });
    await Constellation.create({ productId: other!.id, name: "Constelación JavaScript", published: true });
    const agent = await enrolledStudent(["python"]);

    const res = await agent.get("/constellations");

    expect(res.body.constellations).toEqual([]);
  });

    it("cuenta solo las preguntas publicadas de cada estrella", async () => {
    const { product, star } = await createPythonStar();
    await createQuestion({ productId: product.id, starId: star.id, position: 1 });
    await createQuestion({ productId: product.id, starId: star.id, position: 2 });
    await createQuestion({ productId: product.id, starId: star.id, position: 3, status: "draft" });
    const agent = await enrolledStudent();

    const res = await agent.get("/constellations");

    expect(res.body.constellations[0].stars[0]).toMatchObject({ title: "Variables", questionCount: 2 });
  });
});