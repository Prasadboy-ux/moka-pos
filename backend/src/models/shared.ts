import type { SchemaOptions } from 'mongoose';

/**
 * Every schema in this service serialises the same way, declared once so a new
 * model cannot forget. `_id` leaves the API as `id` (the frontend treats ids as
 * opaque strings), `__v` never appears, and nothing else internal leaks.
 */
export const toApiJson = {
  virtuals: true,
  versionKey: false,
  transform: (
    _doc: unknown,
    ret: Record<string, unknown>,
  ): Record<string, unknown> => {
    const { _id, ...rest } = ret;
    return { id: String(_id), ...rest };
  },
} satisfies SchemaOptions['toJSON'];

/**
 * Usernames are unique case-insensitively. A collation index does this at the
 * database level, so a `Kasir` and a `kasir` cannot both exist no matter how
 * concurrent the writes are — a check-then-insert in application code would race.
 *
 * Queries must carry the *same* collation to use the index and to match
 * case-insensitively, so lookups go through the model's `byUsername` static
 * rather than a bare `findOne`.
 */
export const USERNAME_COLLATION = { locale: 'en', strength: 2 } as const;
