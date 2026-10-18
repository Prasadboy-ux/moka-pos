/**
 * Day boundaries for reports.
 *
 * Timestamps are stored and transmitted as UTC, but a shop's "Tuesday" is not a
 * UTC day. Parsing `to=2026-10-17` as a bare date yields midnight *UTC* at the
 * start of that day, so a range ending today silently drops everything after
 * 00:00 — in Asia/Jakarta, seven hours of the day that is about to close.
 *
 * The fix is two-part, and both parts matter:
 *   - resolve the calendar day in the shop's timezone, not the server's; and
 *   - treat `to` as inclusive by using `< start of the next day` rather than
 *     `<= 23:59:59.999`, which drops the final millisecond.
 */

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DayRange = { $gte?: Date; $lt?: Date };

export function isDayString(value: string): boolean {
  const match = DAY_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number) as unknown as number[];
  // Reject 2026-02-31 and friends, which the pattern alone would accept.
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function splitDay(day: string): { year: number; month: number; date: number } {
  const match = DAY_PATTERN.exec(day);
  if (!match) throw new TypeError(`Not a yyyy-mm-dd day: ${day}`);
  const [, year, month, date] = match.map(Number) as unknown as number[];
  return { year: year!, month: month!, date: date! };
}

/**
 * How far ahead of UTC `timeZone` is at the given instant, in milliseconds.
 *
 * Derived through `Intl` rather than a fixed +7 so the store's zone is
 * configuration, not an assumption. Returns 0 for an unusable zone rather than
 * throwing, because a bad `STORE_TIMEZONE` should not take the API down.
 */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Some ICU versions render midnight as hour 24.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );

  return asUtc - instant.getTime();
}

/** Start of the given calendar day in `timeZone`, as a UTC instant. */
export function startOfDayUtc(day: string, timeZone: string): Date {
  const { year, month, date } = splitDay(day);
  const asUtc = Date.UTC(year, month - 1, date);

  // Two passes: the first uses the offset at a provisional instant, the second
  // corrects it. This is what makes it correct across a DST boundary rather than
  // merely correct in Indonesia, which has no DST.
  let guess = new Date(asUtc);
  for (let pass = 0; pass < 2; pass += 1) {
    guess = new Date(asUtc - zoneOffsetMs(guess, timeZone));
  }
  return guess;
}

/** Start of the *next* day in `timeZone`. Use as an exclusive upper bound. */
export function nextDayStartUtc(day: string, timeZone: string): Date {
  const { year, month, date } = splitDay(day);
  // Date.UTC rolls month and year over on its own when given day 32+.
  const asUtc = Date.UTC(year, month - 1, date + 1);

  let guess = new Date(asUtc);
  for (let pass = 0; pass < 2; pass += 1) {
    guess = new Date(asUtc - zoneOffsetMs(guess, timeZone));
  }
  return guess;
}

/**
 * Turns the contract's inclusive `from`/`to` pair into a Mongo range filter.
 *
 * Both are optional. Returning `undefined` for "neither given" lets a caller
 * pass the result straight to a query without branching, and keeps an empty
 * `from=` string from becoming a filter that matches nothing.
 */
export function dayRange(
  from: string | undefined,
  to: string | undefined,
  timeZone: string,
): DayRange | undefined {
  if (!from && !to) return undefined;

  const range: DayRange = {};
  if (from) range.$gte = startOfDayUtc(from, timeZone);
  // Inclusive `to` expressed as an exclusive start-of-next-day bound.
  if (to) range.$lt = nextDayStartUtc(to, timeZone);
  return range;
}
