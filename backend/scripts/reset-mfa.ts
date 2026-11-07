import 'dotenv/config';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { findByUsername } from '../src/models/user.model.js';

/**
 * Emergency MFA reset for an operator with database access.
 *
 * Use this when the only admin has lost the authenticator and every recovery
 * code. It clears the secret and codes and revokes existing sessions. The next
 * sign-in starts enrolment again. The password is unchanged.
 *
 *   npm run mfa:reset -- admin
 *   npm run mfa:reset -- admin --dry-run
 */

/** Hides credentials so the operator can confirm the target database safely. */
function redactUri(uri: string): string {
  return uri.replace(/\/\/([^:@/]+):([^@/]+)@/, '//***:***@');
}

const USAGE =
  'Usage: npm run mfa:reset -- <username> [--dry-run]\n' +
  '  --dry-run, -n   Report what would change without writing.';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-n');
  const username = args.find((arg) => !arg.startsWith('-'))?.trim();

  if (!username) throw new Error(USAGE);

  console.log(`[mfa] database: ${redactUri(env().MONGODB_URI)}`);

  await connectDatabase(env().MONGODB_URI);

  const user = await findByUsername(username).select(
    '+mfaSecret +mfaBackupCodes',
  );

  if (!user) throw new Error(`No account named "${username}".`);

  if (!user.mfaEnabled) {
    console.log(`[mfa] ${user.username} is not enrolled; nothing to reset.`);
    return;
  }

  const codeCount = user.mfaBackupCodes?.length ?? 0;

  if (dryRun) {
    console.log(
      `[mfa] would clear 2FA for ${user.username} (${codeCount} recovery code${
        codeCount === 1 ? '' : 's'
      } stored) and revoke its sessions.`,
    );
    console.log('[mfa] dry run: nothing was written.');
    return;
  }

  user.mfaEnabled = false;
  user.mfaSecret = undefined;
  user.mfaBackupCodes = [];
  user.sessionEpoch = (user.sessionEpoch ?? 0) + 1;
  await user.save();

  console.log(`[mfa] cleared 2FA for ${user.username}.`);
  console.log('[mfa] password unchanged; existing sessions are now invalid.');
  console.log(
    '[mfa] next sign-in will ask for a new authenticator and issue 8 new recovery codes.',
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      `[mfa] reset failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase().catch(() => undefined));
