import { Sequelize, type Transaction, type TransactionOptions } from "sequelize";
import { sealTransaction } from "./lib/sealing.js";

if (!process.env.DATABASE_URL) {
  throw new Error("Falta DATABASE_URL en las variables de entorno");
}

export const sequelize: Sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  logging: process.env.DB_LOGGING === "true" ? console.log : false,
});

// Cada sequelize.transaction(async (t) => ...) sella las filas protegidas que escribió (DVH y DVV)
// justo antes del commit. Ver lib/sealing.ts.
const managedTransaction = sequelize.transaction.bind(sequelize) as (
  options: TransactionOptions,
  callback: (t: Transaction) => PromiseLike<unknown>
) => Promise<unknown>;

sequelize.transaction = ((
  optionsOrCallback?: TransactionOptions | ((t: Transaction) => PromiseLike<unknown>),
  maybeCallback?: (t: Transaction) => PromiseLike<unknown>
) => {
  const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
  const options = typeof optionsOrCallback === "function" ? {} : (optionsOrCallback ?? {});
  if (!callback) {
    // Sin callback no hay dónde sellar antes del commit. Sequelize la usa por dentro (findOrCreate abre un
    // savepoint dentro de nuestra transacción, con el mismo xid, así que lo sella la de afuera).
    // En el código de la app, usá siempre la forma con callback.
    return managedTransaction(options as TransactionOptions, undefined as never);
  }
  return managedTransaction(options, async (t) => {
    const result = await callback(t);
    await sealTransaction(sequelize, t);
    return result;
  });
}) as typeof sequelize.transaction;
