import { Types } from 'mongoose';
import { withTransaction } from '../../db/transaction.js';
import { ApiError } from '../../lib/errors.js';
import { roundIDR } from '../../lib/money.js';
import { isDuplicateKey } from '../../lib/mongo-errors.js';
import { OrderModel } from '../../models/order.model.js';
import { ShiftModel } from '../../models/shift.model.js';
import { type SessionUser } from '../../models/user.model.js';
import type {
  CloseShiftInput,
  OpenShiftInput,
  ShiftQuery,
} from './shifts.schemas.js';

/**
 * Cash shifts.
 *
 * A shift gates selling — `POST /api/orders` refuses without one — and closing
 * it reconciles the drawer: cash sales inside the shift are summed, compared
 * against the counted float, and the three figures are stored on the shift.
 * They are snapshots, not derivations: a later edit to order history must not
 * rewrite yesterday's variance.
 */

export async function currentShift(cashier: SessionUser) {
  const shift = await ShiftModel.findOne({
    userId: new Types.ObjectId(cashier.id),
    status: 'open',
  });

  // `null`, not a 404. "You have no open shift" is a normal state the POS asks
  // about on every load, not a missing resource.
  return shift ?? null;
}

export async function listShifts(query: ShiftQuery) {
  const filter: Record<string, unknown> = {};
  if (query.cashierId) filter.userId = new Types.ObjectId(query.cashierId);

  return ShiftModel.find(filter).sort({ openedAt: -1, _id: -1 });
}

export async function openShift(input: OpenShiftInput, cashier: SessionUser) {
  const alreadyOpen = await ShiftModel.findOne({
    userId: new Types.ObjectId(cashier.id),
    status: 'open',
  });

  if (alreadyOpen) {
    throw ApiError.conflict(
      'already-open-shift',
      'You already have an open shift.',
    );
  }

  try {
    return await ShiftModel.create({
      userId: cashier.id,
      // Denormalised so the shift list still reads after the person leaves.
      userName: cashier.name,
      openedAt: new Date(),
      openingFloat: roundIDR(input.openingFloat),
      closedAt: null,
      closingCounted: null,
      status: 'open',
    });
  } catch (error) {
    // Two taps can both pass the check above. The partial unique index picks a
    // winner; the loser gets the same response as the ordinary already-open case.
    if (isDuplicateKey(error)) {
      throw ApiError.conflict(
        'already-open-shift',
        'You already have an open shift.',
      );
    }
    throw error;
  }
}

export async function closeShift(
  id: string,
  input: CloseShiftInput,
  user: SessionUser,
) {
  const counted = roundIDR(input.counted);

  return withTransaction(async (session) => {
    const shift = await ShiftModel.findById(id).session(session);
    if (!shift) throw ApiError.notFound('That shift no longer exists.');

    // A cashier closes their own till; an admin closes any — a manager
    // counting down a drawer at close of day is the case this exists for.
    if (user.role !== 'admin' && String(shift.userId) !== user.id) {
      throw ApiError.forbidden(
        'You can only close your own shift. Ask an administrator to close this one.',
      );
    }

    if (shift.status === 'closed') {
      throw ApiError.conflict(
        'already-closed-shift',
        'That shift is already closed.',
      );
    }

    // Cash only: non-cash takings never touch the drawer. `total` is the amount
    // that entered it — the change went back to the customer.
    const [totals] = (await OrderModel.aggregate([
      {
        $match: {
          shiftId: shift._id,
          paymentMethod: 'cash',
        },
      },
      { $group: { _id: null, sum: { $sum: '$total' } } },
    ]).session(session)) as { sum: number }[];

    const cashSales = roundIDR(totals?.sum ?? 0);
    const expectedCash = roundIDR(shift.openingFloat + cashSales);

    // Conditional on `open`, so a concurrent double-close has one winner even
    // though both callers already saw the shift open a moment ago.
    const closed = await ShiftModel.findOneAndUpdate(
      { _id: shift._id, status: 'open' },
      {
        $set: {
          status: 'closed',
          closedAt: new Date(),
          closingCounted: counted,
          cashSales,
          expectedCash,
          variance: roundIDR(counted - expectedCash),
        },
      },
      { returnDocument: 'after', session },
    );
    if (!closed) {
      throw ApiError.conflict(
        'already-closed-shift',
        'That shift is already closed.',
      );
    }

    return closed;
  });
}
