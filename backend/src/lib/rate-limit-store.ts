import { Schema, model } from 'mongoose';
import type { ClientRateLimitInfo, Store } from 'express-rate-limit';

/**
 * The shared hit-counter collection behind both rate limiters.
 *
 * The default express-rate-limit store is one `Map` per process. On the
 * long-running server that is right, but on the serverless entry every cold
 * start hands out a fresh `Map` with vanish-on-freeze counters, so a limit of
 * "30 sign-ins per 15 minutes" becomes "30 per isolate per 15 minutes" —
 * materially weaker exactly on the deployment this backend ships to. Storing
 * the counters in MongoDB turns the two limiters into one counter even across
 * cold starts and concurrent functions.
 */

const WINDOW_TTL_SECONDS = 0;

/** `_id` is the namespaced limiter key (see `mongoRateLimitStore`). */
const rateLimitSchema = new Schema(
  {
    _id: { type: String, required: true },
    hits: { type: Number, default: 0, required: true },
    resetAt: { type: Date, required: true },
  },
  { collection: 'rate_limits', versionKey: false },
);

/** Counters vanish with their window instead of needing a sweeper job. */
rateLimitSchema.index(
  { resetAt: 1 },
  { expireAfterSeconds: WINDOW_TTL_SECONDS },
);

export const RateLimitModel = model('RateLimit', rateLimitSchema);

/**
 * A process-independent `Store` for express-rate-limit.
 *
 * `increment` is the load-bearing method: one conditional update finds a live
 * window (`resetAt > now`) and bumps it, and the fallback starts a fresh window.
 * All keys are namespaced by `prefix` so the two limiters — which key on the
 * same client IP — can never merge each other's counts in one collection.
 */
export function mongoRateLimitStore(prefix: string, windowMs: number): Store {
  return {
    localKeys: false,
    prefix,

    async increment(key: string): Promise<ClientRateLimitInfo> {
      const namespaced = `${prefix}${key}`;
      const now = new Date();

      const live = await RateLimitModel.findOneAndUpdate(
        { _id: namespaced, resetAt: { $gt: now } },
        { $inc: { hits: 1 } },
        { returnDocument: 'after' },
      ).exec();
      if (live) return { totalHits: live.hits, resetTime: live.resetAt };

      // No live window: open a fresh one. `$set` (not `$setOnInsert`) so two
      // concurrent openers agree rather than resurrect a stale window; the
      // worst case a race can cost is one unclosed tick, not an oversell.
      const resetAt = new Date(now.getTime() + windowMs);
      const fresh = await RateLimitModel.findOneAndUpdate(
        { _id: namespaced },
        { $set: { hits: 1, resetAt } },
        { returnDocument: 'after', upsert: true },
      ).exec();

      return {
        totalHits: fresh?.hits ?? 1,
        resetTime: fresh?.resetAt ?? resetAt,
      };
    },

    async decrement(key: string): Promise<void> {
      // Only the limiter's optional `skip*Requests` paths call this. Floor at
      // zero so a retried decrement cannot go negative and gift free attempts.
      await RateLimitModel.updateOne(
        { _id: `${prefix}${key}`, hits: { $gt: 0 } },
        { $inc: { hits: -1 } },
      ).exec();
    },

    async resetKey(key: string): Promise<void> {
      await RateLimitModel.deleteOne({ _id: `${prefix}${key}` }).exec();
    },

    async resetAll(): Promise<void> {
      await RateLimitModel.deleteMany({}).exec();
    },

    init(): void {
      // Nothing to prepare: the Mongoose model buffers until connected and the
      // TTL index is owned by `syncIndexes`/`autoIndex`.
    },

    shutdown(): void {
      // No timers to stop: the TTL index owns expiry.
    },
  };
}
