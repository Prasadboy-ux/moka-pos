import { Schema, model, type ClientSession } from 'mongoose';
import { toApiJson, USERNAME_COLLATION } from './shared.js';

/**
 * Staff accounts. `passwordHash` is `select: false`, so it is absent from query
 * results unless explicitly asked for — the only caller that needs it is the
 * login handler, and the one caller that must never get it is any response.
 *
 * MFA secrets and backup code hashes are also `select: false` so they are never
 * leaked into app code or serialized into JSON.
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
    /**
     * Bumped whenever every outstanding session for this account must stop
     * working: a password change, or an explicit sign-out. The value is carried
     * in the session JWT and compared on every request, so a token issued
     * before the bump is refused even though its signature is still valid.
     *
     * A counter rather than a timestamp because it is exact: two changes in the
     * same millisecond must still invalidate the sessions from the first.
     */
    sessionEpoch: { type: Number, default: 0, required: true },

    /**
     * Multi-Factor Authentication (TOTP) configuration.
     * `mfaSecret` is encrypted at rest via AES-256-GCM.
     * `mfaBackupCodes` stores salted SHA-256 hashes of single-use recovery codes.
     */
    mfaEnabled: { type: Boolean, default: false, required: true },
    mfaSecret: { type: String, select: false },
    mfaBackupCodes: { type: [String], select: false },

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
 * The contract's `User` shape has no password or secret fields at all, so this type cannot
 * accidentally grow one. `passwordHash` and `mfaSecret` are `select: false`.
 */
export type SessionUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
  mfaEnabled?: boolean;
};

export function toSessionUser(user: {
  _id: unknown;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
  mfaEnabled?: boolean;
}): SessionUser {
  return {
    id: String(user._id),
    name: user.name,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    mfaEnabled: Boolean(user.mfaEnabled),
  };
}

export type User = {
  _id: unknown;
  name: string;
  username: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  sessionEpoch: number;
  mfaEnabled: boolean;
  mfaSecret?: string;
  mfaBackupCodes?: string[];
  createdAt: Date;
};

export const UserModel = model('User', userSchema);
