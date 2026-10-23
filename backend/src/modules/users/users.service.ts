import type { ClientSession } from 'mongoose';
import { withTransaction } from '../../db/transaction.js';
import { hashPassword } from '../../lib/password.js';
import { ApiError } from '../../lib/errors.js';
import { isDuplicateKey } from '../../lib/mongo-errors.js';
import { CounterModel } from '../../models/counter.model.js';
import { NAME_COLLATION } from '../../models/shared.js';
import {
  type Role,
  type SessionUser,
  UserModel,
  findByUsername,
  toSessionUser,
} from '../../models/user.model.js';
import type { CreateUserInput, UserInput } from './users.schemas.js';

/** Alphabetical by display name — a staff picker, not a ledger. */
export async function listUsers() {
  const users = await UserModel.find()
    .sort({ name: 1 })
    .collation(NAME_COLLATION);
  return users.map(toSessionUser);
}

export async function getUser(id: string) {
  const user = await UserModel.findById(id);
  if (!user) throw ApiError.notFound('That account no longer exists.');
  return toSessionUser(user);
}

export async function createUser(input: CreateUserInput): Promise<SessionUser> {
  await assertUsernameFree(input.username);

  try {
    const user = await UserModel.create({
      name: input.name,
      username: input.username.trim(),
      passwordHash: await hashPassword(input.password),
      role: input.role,
      isActive: input.isActive,
    });

    return toSessionUser(user);
  } catch (error) {
    // Two creates can both pass the pre-check. The unique index is the real
    // guard; map its duplicate-key error to the same 409 as the pre-check.
    if (isDuplicateKey(error)) throw usernameTaken();
    throw error;
  }
}

export async function updateUser(
  id: string,
  input: UserInput,
): Promise<SessionUser> {
  // Hashing is deliberately outside the transaction: it is CPU work in Node,
  // and holding a database transaction open while it runs would extend every
  // lock the transaction touches.
  const passwordHash = input.password
    ? await hashPassword(input.password)
    : null;

  return withTransaction(async (session) => {
    const user = await UserModel.findById(id).session(session);
    if (!user) throw ApiError.notFound('That account no longer exists.');

    // Only a *different* account holding the name is a clash. Comparing by id
    // is what lets an admin save a user without renaming them.
    const clash = await findByUsername(input.username.trim(), session);
    if (clash && String(clash._id) !== String(user._id)) {
      throw usernameTaken();
    }

    // Demoting or deactivating the last active admin would strand the account
    // with no way to manage users. The guard write serialises these checks, so
    // two admins editing each other cannot both see "one other admin remains"
    // and commit a change that leaves zero.
    const removingAdmin =
      user.role === 'admin' && (input.role !== 'admin' || !input.isActive);
    if (removingAdmin) {
      await lockAdminMutations(session);
      await assertNotLastAdmin(id, session);
    }

    user.name = input.name;
    user.username = input.username.trim();
    user.role = input.role;
    user.isActive = input.isActive;
    if (passwordHash) user.passwordHash = passwordHash;

    try {
      await user.save({ session });
    } catch (error) {
      // Another update can take the name between our check and this write.
      // The unique index is the arbiter; answer 409 instead of a 500.
      if (isDuplicateKey(error)) throw usernameTaken();
      throw error;
    }

    return toSessionUser(user);
  });
}

export async function setUserActive(
  id: string,
  isActive: boolean,
): Promise<SessionUser> {
  return withTransaction(async (session) => {
    const user = await UserModel.findById(id).session(session);
    if (!user) throw ApiError.notFound('That account no longer exists.');

    if (!isActive && user.role === 'admin') {
      await lockAdminMutations(session);
      await assertNotLastAdmin(id, session);
    }

    user.isActive = isActive;
    await user.save({ session });
    return toSessionUser(user);
  });
}

/**
 * A single row every admin-changing transaction writes before it counts.
 *
 * Two transactions that both take this lock cannot run their "are there other
 * admins?" check against the same snapshot. The second waits, then re-reads the
 * first one's committed change during a retry.
 */
async function lockAdminMutations(session: ClientSession): Promise<void> {
  await CounterModel.findOneAndUpdate(
    { _id: 'user-admin-guard' },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', session },
  );
}

/**
 * Refuses to leave the shop with no account that can reach user management.
 *
 * Without this, deactivating or demoting the last admin locks everyone out, and
 * the only way back is editing the database by hand.
 */
async function assertNotLastAdmin(
  excludeId: string,
  session: ClientSession,
): Promise<void> {
  const otherActiveAdmins = await UserModel.countDocuments({
    _id: { $ne: excludeId },
    role: 'admin',
    isActive: true,
  }).session(session);

  if (otherActiveAdmins === 0) {
    throw ApiError.conflict(
      'last-active-admin',
      'This is the last active admin. Promote another account first.',
    );
  }
}

async function assertUsernameFree(username: string): Promise<void> {
  if (await findByUsername(username.trim())) {
    throw usernameTaken();
  }
}

function usernameTaken(): ApiError {
  return ApiError.conflict('username-taken', 'That username is already taken.');
}

export type { Role };
