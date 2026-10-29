import { describe, expect, it } from "vitest";
import { UniqueConstraintError } from "sequelize";
import { Constellation, Product, Star } from "../src/models/index.js";

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