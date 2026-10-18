import { hashPassword } from '../../lib/password.js';
import { ApiError } from '../../lib/errors.js';
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

  const user = await UserModel.create({
    name: input.name,
    username: input.username.trim(),
    passwordHash: await hashPassword(input.password),
    role: input.role,
    isActive: input.isActive,
  });

  return toSessionUser(user);
}

export async function updateUser(
  id: string,
  input: UserInput,
): Promise<SessionUser> {
  const user = await UserModel.findById(id);
  if (!user) throw ApiError.notFound('That account no longer exists.');

  // Only a *different* account holding the name is a clash. Comparing by id is
  // what lets an admin save a user without renaming them.
  const clash = await findByUsername(input.username.trim());
  if (clash && String(clash._id) !== String(user._id)) {
    throw usernameTaken();
  }

  // Demoting the last active admin would strand the account with no way to
  // manage users, so it is checked alongside deactivation.
  if (user.role === 'admin' && input.role !== 'admin') {
    await assertNotLastAdmin(id);
  }

  user.name = input.name;
  user.username = input.username.trim();
  user.role = input.role;
  user.isActive = input.isActive;

  // Absent or blank means unchanged, so an edit form can be saved without
  // retyping a password it has no way to display.
  if (input.password) {
    user.passwordHash = await hashPassword(input.password);
  }

  await user.save();
  return toSessionUser(user);
}

export async function setUserActive(
  id: string,
  isActive: boolean,
): Promise<SessionUser> {
  const user = await UserModel.findById(id);
  if (!user) throw ApiError.notFound('That account no longer exists.');

  if (!isActive && user.role === 'admin') {
    await assertNotLastAdmin(id);
  }

  user.isActive = isActive;
  await user.save();
  return toSessionUser(user);
}

/**
 * Refuses to leave the shop with no account that can reach user management.
 *
 * Without this, deactivating or demoting the last admin locks everyone out, and
 * the only way back is editing the database by hand.
 */
async function assertNotLastAdmin(excludeId: string): Promise<void> {
  const otherActiveAdmins = await UserModel.countDocuments({
    _id: { $ne: excludeId },
    role: 'admin',
    isActive: true,
  });

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
