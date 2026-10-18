import { Schema, model } from 'mongoose';
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
export function findByUsername(username: string) {
  return UserModel.findOne({ username }).collation(USERNAME_COLLATION);
}

export type User = {
  _id: unknown;
  name: string;
  username: string;
  passwordHash: string;
  role: 'admin' | 'kasir';
  isActive: boolean;
  createdAt: Date;
};

export const UserModel = model('User', userSchema);
