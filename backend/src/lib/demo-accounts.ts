import { env } from '../config/env.js';
import { verifyPassword } from './password.js';
import { findByUsername } from '../models/user.model.js';

/**
 * Accounts created by `seed.ts` with publicly documented passwords. The login
 * page no longer advertises them by default, but a deployment that still has
 * one of these credentials is an account takeover waiting to happen.
 */
const DEMO_ACCOUNTS = [
  { username: 'admin', password: 'admin123' },
  { username: 'kasir', password: 'kasir123' },
  { username: 'kasir2', password: 'kasir123' },
] as const;

/**
 * Refuses to start a production process while a seeded demo password still
 * works. Called once after the database connects, on both entrypoints.
 *
 * This is a startup check rather than a request check on purpose: by the time
 * the first request arrives, the window to fail safely has already closed.
 * Outside production it is a no-op, because local development and the e2e
 * suite rely on those accounts.
 */
export async function assertNoDemoAccounts(): Promise<void> {
  if (env().NODE_ENV !== 'production') return;

  const compromised: string[] = [];

  for (const demo of DEMO_ACCOUNTS) {
    const user = await findByUsername(demo.username).select('+passwordHash');
    // A deactivated account cannot sign in, so its password no longer works.
    // Checking `isActive` also keeps the error message's "or deactivate the
    // accounts" advice truthful.
    if (!user || !user.isActive) continue;

    if (await verifyPassword(demo.password, user.passwordHash)) {
      compromised.push(demo.username);
    }
  }

  if (compromised.length > 0) {
    throw new Error(
      `Refusing to start in production: demo account(s) ${compromised.join(
        ', ',
      )} still use the seeded password. Change those passwords (or deactivate the accounts) before deploying.`,
    );
  }
}
