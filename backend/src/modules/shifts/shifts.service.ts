import { Types } from 'mongoose';
import { ApiError } from '../../lib/errors.js';
import { roundIDR } from '../../lib/money.js';
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
 * Records only. Nothing gates on them yet — a shift is not yet a precondition for
 * selling, and cash reconciliation is explicitly out of scope: closing stores a
 * counted float and no code compares it against cash sales inside the shift.
 *
 * They exist now because the reports screen splits takings per shift, and
 * retrofitting that onto orders sold before shifts existed is harder than having
 * the record from the start.
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

  return ShiftModel.create({
    userId: cashier.id,
    // Denormalised so the shift list still reads after the person leaves.
    userName: cashier.name,
    openedAt: new Date(),
    openingFloat: roundIDR(input.openingFloat),
    closedAt: null,
    closingCounted: null,
    status: 'open',
  });
}

export async function closeShift(id: string, input: CloseShiftInput) {
  const shift = await ShiftModel.findById(id);
  if (!shift) throw ApiError.notFound('That shift no longer exists.');

  if (shift.status === 'closed') {
    throw ApiError.conflict(
      'already-closed-shift',
      'That shift is already closed.',
    );
  }

  shift.status = 'closed';
  shift.closedAt = new Date();
  shift.closingCounted = roundIDR(input.counted);

  await shift.save();
  return shift;
}
