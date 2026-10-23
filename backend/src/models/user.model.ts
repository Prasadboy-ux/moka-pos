import { Schema, model, type ClientSession } from 'mongoose';
import { toApiJson, USERNAME_COLLATION } from './shared.js';

/**
 * Staff accounts. `passwordHash` is `select: false`, so it is absent from query
 * results unless explicitly asked for — the only caller that needs it is the
 * login handler, and the one caller that must never get it is any response.
 *
 * There is no delete. Orders reference the cashier by id, so an account leaves
 * by being deactivated.
 */
const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 40,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'kasir'], required: true },
    isActive: { type: Boolean, default: true, required: true },
    createdAt: { type: Date, default: Date.now, required: true },
  },
  { toJSON: toApiJson, collection: 'users' },
);

userSchema.index(
  { username: 1 },
  { unique: true, collation: USERNAME_COLLATION },
);

/**
 * Case-insensitive username lookup.
 *
 * Always use this instead of `findOne({ username })`. A bare find is an exact
 * match, so it would miss `ADMIN` for the account stored as `admin`, while the
 * unique index would still refuse to create a duplicate.
 */
export function findByUsername(username: string, session?: ClientSession) {
  const query = UserModel.findOne({ username }).collation(USERNAME_COLLATION);
  return session ? query.session(session) : query;
}

export type Role = 'admin' | 'kasir';

/**
 * What the API is willing to say about a user.
 *
 * The contract's `User` shape has no password field at all, so this type cannot
 * accidentally grow one. `passwordHash` is `select: false`, meaning it is not
 * even loaded onto the document for a normal query — this is the second lock on
 * the same door.
 */
export type SessionUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
};

export function toSessionUser(user: {
  _id: unknown;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
}): SessionUser {
  return {
    id: String(user._id),
    name: user.name,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
  };
}

export type User = {
  _id: unknown;
  name: string;
  username: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
};

export const UserModel = model('User', userSchema);
