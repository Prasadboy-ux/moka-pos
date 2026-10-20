import mongoose, { type ClientSession } from 'mongoose';

/**
 * Multi-document transactions.
 *
 * Required for three places, and nowhere else:
 *   - `POST /api/orders`, which writes an order, decrements stock and appends
 *     ledger rows together or not at all.
 *   - `POST /api/stock/adjust`, which changes a level and records why.
 *   - `POST /api/shifts/:id/close`, which sums the shift's cash sales and
 *     stores the reconciliation on the shift itself.
 *
 * Both need every MongoDB deployment this service supports to be a replica set
 * or a sharded cluster. A standalone `mongod` rejects transactions, and the
 * failure is loud on the first sale rather than silent — which is the right way
 * to find out.
 *
 * `withTransaction` (not `startTransaction`) so a transient error retries the
 * whole callback instead of leaving a half-finished sale behind.
 */
export async function withTransaction<T>(
  work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    // Assigned inside the callback, which `withTransaction` has awaited at least
    // once by the time this line runs.
    return result!;
  } finally {
    await session.endSession();
  }
}
