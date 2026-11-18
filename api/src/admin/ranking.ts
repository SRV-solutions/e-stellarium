import { QueryTypes, type Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { GlintEvent, Season, SeasonSnapshot, User } from "../models/index.js";
import { HttpError } from "../lib/errors.js";
import { isUuid } from "../lib/uuid.js";
import { notify } from "../lib/notify.js";
import { writeAudit, type AuditContext } from "../lib/audit.js";
import { awardGlints, spendGlints } from "../games/glints.js";
import { BOARDS, currentSeason, snapshotRows, type Board, type RankingPeriod } from "../games/ranking.js";
import { SETTINGS } from "../games/economy.js";
import { issueCoupon, parseReason } from "./coupons.js";
import { prizeEmail } from "../lib/email.js";
import { roleKeyOf } from "../lib/permissions.js";

// El ranking en el panel: ver las tablas con nombres, premiar a jugadores (ranking:award) y cerrar la
// temporada (ranking:reset). Cerrar no borra nada: es una fecha de corte (ver games/ranking.ts).

export const MAX_PRIZE_PEOPLE = 25;
const MAX_PRIZE_GLINTS = 5000;
const MAX_COUPON_DAYS = 365;
const MAX_COUPON_PERCENT = SETTINGS["coupon.first_percent"].max;

export function parseRankingQuery(query: Record<string, unknown>): { board: Board; period: RankingPeriod | undefined } {
  const board = query.board ?? "xp";
  if (typeof board !== "string" || !(BOARDS as readonly string[]).includes(board)) {
    throw new HttpError(400, `La tabla tiene que ser una de: ${BOARDS.join(", ")}.`);
  }
  const period = query.period;
  if (period !== undefined && period !== "week" && period !== "season" && period !== "all") {
    throw new HttpError(400, "El período tiene que ser week, season o all.");
  }
  return { board: board as Board, period: period as RankingPeriod | undefined };
}

export type NewPrize = {
  requestId: string; // lo genera el navegador al abrir el diálogo: un doble clic no premia dos veces
  board: Board;
  userIds: string[];
  glints: number | null;
  coupon: { percent: number; validDays: number } | null;
  reason: string;
  notify: boolean;
};

export function parseNewPrize(body: unknown): NewPrize {
  const { requestId, board, userIds, glints, coupon, reason, notify } = (body ?? {}) as Record<string, unknown>;
  if (typeof requestId !== "string" || !isUuid(requestId)) throw new HttpError(400, "Falta el identificador del premio.");
  if (typeof board !== "string" || !(BOARDS as readonly string[]).includes(board)) throw new HttpError(400, "Tabla inválida.");
  if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > MAX_PRIZE_PEOPLE) {
    throw new HttpError(400, `Elegí entre 1 y ${MAX_PRIZE_PEOPLE} alumnos.`);
  }
  if (!userIds.every((id) => typeof id === "string" && isUuid(id)) || new Set(userIds).size !== userIds.length) {
    throw new HttpError(400, "La lista de alumnos no es válida.");
  }
  let glintAmount: number | null = null;
  if (glints !== undefined && glints !== null) {
    if (!Number.isInteger(glints) || (glints as number) < 1 || (glints as number) > MAX_PRIZE_GLINTS) {
      throw new HttpError(400, `Los destellos van de 1 a ${MAX_PRIZE_GLINTS}.`);
    }
    glintAmount = glints as number;
  }
  let couponInput: NewPrize["coupon"] = null;
  if (coupon !== undefined && coupon !== null) {
    const { percent, validDays } = coupon as Record<string, unknown>;
    if (!Number.isInteger(percent) || (percent as number) < 1 || (percent as number) > MAX_COUPON_PERCENT) {
      throw new HttpError(400, `El descuento va de 1 a ${MAX_COUPON_PERCENT} %.`);
    }
    if (!Number.isInteger(validDays) || (validDays as number) < 1 || (validDays as number) > MAX_COUPON_DAYS) {
      throw new HttpError(400, `Vale entre 1 y ${MAX_COUPON_DAYS} días.`);
    }
    couponInput = { percent: percent as number, validDays: validDays as number };
  }
  if (glintAmount === null && couponInput === null) throw new HttpError(400, "Elegí al menos un premio.");
  return {
    requestId,
    board: board as Board,
    userIds: userIds as string[],
    glints: glintAmount,
    coupon: couponInput,
    reason: parseReason(reason),
    notify: notify !== false,
  };
}

export type PrizeMail = { email: string; mail: ReturnType<typeof prizeEmail> | null; coupon: { code: string; percent: number; expiresAt: Date } | null; name: string };

// Da el premio a cada uno, todo en la misma transacción: si falla uno, no se premia a nadie.
// Se bloquea a cada alumno (en orden, para que dos premios a la vez no se traben entre sí).
export async function awardPrizes(t: Transaction, ctx: AuditContext, input: NewPrize) {
  const users = await User.findAll({
    where: { id: input.userIds },
    order: [["id", "ASC"]],
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (users.length !== input.userIds.length) throw new HttpError(404, "Alguno de los alumnos ya no existe.");
  for (const user of users) {
    if (user.deletedAt) throw new HttpError(409, `${user.name} está dado de baja.`);
    if ((await roleKeyOf(user, t)) !== "student") throw new HttpError(409, `${user.name} no es alumno.`);
  }

  const given: PrizeMail[] = [];
  for (const user of users) {
    let glintsGiven = 0;
    if (input.glints !== null) {
      glintsGiven = await awardGlints(user, "ranking_prize", input.requestId, input.glints, t);
      if (glintsGiven === 0) throw new HttpError(409, "Ese premio ya se dio.");
      await writeAudit(t, {
        ...ctx,
        action: "ranking.glints_award",
        targetType: "user",
        targetId: user.id,
        before: { glints: 0 },
        after: { glints: glintsGiven, board: input.board, reason: input.reason, requestId: input.requestId },
        reversible: true,
      });
      await notify(t, [user.id], {
        kind: "prize",
        title: `Ganaste ${glintsGiven} destellos en el ranking`,
        body: `${input.reason}. Ya están en tu saldo.`,
        link: "/shop",
        emailSent: input.notify,
      });
    }
    let coupon: PrizeMail["coupon"] = null;
    if (input.coupon) {
      const issued = await issueCoupon(t, ctx, {
        email: user.email,
        percent: input.coupon.percent,
        validDays: input.coupon.validDays,
        reason: `Ranking · ${input.reason}`,
        notify: input.notify,
      });
      coupon = { code: issued.coupon.code, percent: issued.coupon.percent, expiresAt: issued.coupon.expiresAt };
    }
    given.push({
      email: user.email,
      name: user.name,
      mail: glintsGiven > 0 ? prizeEmail(user.name, glintsGiven, input.reason) : null,
      coupon,
    });
  }
  return given;
}

// Revertir un premio de destellos desde la bitácora: los saca, si el alumno todavía los tiene
export async function currentPrizeGlints(t: Transaction, userId: string, requestId: string) {
  const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!user) throw new HttpError(404, "El alumno de ese registro ya no existe.");
  const prize = await GlintEvent.findOne({ where: { userId, reason: "ranking_prize", referenceId: requestId }, transaction: t });
  const undone = prize
    ? await GlintEvent.findOne({ where: { userId, reason: "ranking_prize_undo", referenceId: prize.id }, transaction: t })
    : null;
  return { glints: prize && !undone ? prize.amount : 0 };
}

export async function undoPrizeGlints(t: Transaction, ctx: AuditContext, userId: string, requestId: string, revertsId: number) {
  const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!user) throw new HttpError(404, "El alumno de ese registro ya no existe.");
  const prize = await GlintEvent.findOne({ where: { userId, reason: "ranking_prize", referenceId: requestId }, transaction: t });
  if (!prize) throw new HttpError(409, "Ese premio ya no existe.");
  if (user.glints < prize.amount) {
    throw new HttpError(409, `Ya gastó parte de esos destellos: tiene ${user.glints} y el premio fue de ${prize.amount}.`);
  }
  await spendGlints(user, "ranking_prize_undo", prize.id, prize.amount, t);
  await writeAudit(t, {
    ...ctx,
    action: "audit.revert",
    targetType: "user",
    targetId: userId,
    before: { glints: prize.amount },
    after: { glints: 0 },
    reversible: false,
    revertsId,
  });
}

// ---------- Temporadas ----------

export function parseSeasonClose(body: unknown): { seasonId: string; name: string } {
  const { seasonId, name } = (body ?? {}) as Record<string, unknown>;
  if (typeof seasonId !== "string" || !isUuid(seasonId)) throw new HttpError(400, "Falta la temporada que se cierra.");
  if (typeof name !== "string" || !name.trim()) throw new HttpError(400, "Escribí el nombre de la temporada que arranca.");
  if (name.trim().length > 60) throw new HttpError(400, "El nombre es muy largo (hasta 60 letras).");
  return { seasonId, name: name.trim() };
}

// Cierra la temporada abierta: guarda la foto del top 10 de las seis tablas y abre la siguiente con la misma
// fecha de corte. No borra ni cambia nada de los alumnos.
export async function closeSeason(t: Transaction, ctx: AuditContext, input: { seasonId: string; name: string }) {
  // Bloquea la fila: dos cierres a la vez van en fila, y el segundo ya no encuentra la abierta
  const open = await Season.findOne({ where: { endedAt: null }, transaction: t, lock: t.LOCK.UPDATE });
  if (!open || open.id !== input.seasonId) throw new HttpError(409, "Esa temporada ya se cerró. Recargá la pantalla.");

  const now = new Date();
  const rows = await snapshotRows(open.id, open, now);
  await SeasonSnapshot.bulkCreate(rows, { transaction: t });
  await open.update({ endedAt: now, closedBy: ctx.actorId }, { transaction: t });
  const next = await Season.create({ name: input.name, startedAt: now }, { transaction: t });
  await writeAudit(t, {
    ...ctx,
    action: "ranking.season_close",
    targetType: "season",
    targetId: open.id,
    before: { season: open.name },
    after: { closed: open.name, next: next.name, nextId: next.id },
    reversible: false,
  });
  return { closed: open, next };
}

// Las temporadas cerradas con su foto (la más nueva primero) y la abierta
export async function listSeasons() {
  const seasons = await sequelize.query<{ id: string; name: string; started_at: Date; ended_at: Date | null; closed_by: string | null }>(
    `SELECT s.id, s.name, s.started_at, s.ended_at, u.name AS closed_by
       FROM seasons s LEFT JOIN users u ON u.id = s.closed_by
      ORDER BY s.started_at DESC`,
    { type: QueryTypes.SELECT }
  );
  const snapshots = await SeasonSnapshot.findAll({ order: [["position", "ASC"]] });
  return {
    current: await currentSeason().then((s) => ({ id: s.id, name: s.name, startedAt: s.startedAt })),
    past: seasons
      .filter((s) => s.ended_at)
      .map((s) => ({
        id: s.id,
        name: s.name,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        closedBy: s.closed_by,
        boards: Object.fromEntries(
          BOARDS.map((board) => [
            board,
            snapshots
              .filter((r) => r.seasonId === s.id && r.board === board)
              .map((r) => ({ position: r.position, alias: r.alias, name: r.name, value: r.value })),
          ])
        ),
      })),
  };
}
