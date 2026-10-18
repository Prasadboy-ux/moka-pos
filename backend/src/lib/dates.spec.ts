import { describe, expect, it } from 'vitest';
import {
  dayRange,
  isDayString,
  nextDayStartUtc,
  startOfDayUtc,
  zoneOffsetMs,
} from './dates.js';

const JAKARTA = 'Asia/Jakarta';
const UTC = 'UTC';

describe('isDayString', () => {
  it('accepts a well-formed day', () => {
    expect(isDayString('2026-10-17')).toBe(true);
    expect(isDayString('2024-02-29')).toBe(true); // leap year
  });

  it('rejects malformed input', () => {
    expect(isDayString('2026-13-01')).toBe(false);
    expect(isDayString('2026-02-31')).toBe(false);
    expect(isDayString('2023-02-29')).toBe(false);
    expect(isDayString('17-10-2026')).toBe(false);
    expect(isDayString('')).toBe(false);
  });
});

describe('zoneOffsetMs', () => {
  it('reports zero for UTC', () => {
    expect(zoneOffsetMs(new Date('2026-10-17T00:00:00Z'), UTC)).toBe(0);
  });

  it('reports the whole-hour offset for Jakarta, which has no DST', () => {
    expect(zoneOffsetMs(new Date('2026-01-17T00:00:00Z'), JAKARTA)).toBe(
      7 * 60 * 60 * 1000,
    );
    expect(zoneOffsetMs(new Date('2026-07-17T00:00:00Z'), JAKARTA)).toBe(
      7 * 60 * 60 * 1000,
    );
  });
});

describe('startOfDayUtc', () => {
  it('moves midnight back by the zone offset', () => {
    expect(startOfDayUtc('2026-10-17', JAKARTA).toISOString()).toBe(
      '2026-10-16T17:00:00.000Z',
    );
  });

  it('is a no-op in UTC', () => {
    expect(startOfDayUtc('2026-10-17', UTC).toISOString()).toBe(
      '2026-10-17T00:00:00.000Z',
    );
  });

  it('rolls the month over', () => {
    expect(startOfDayUtc('2026-11-01', JAKARTA).toISOString()).toBe(
      '2026-10-31T17:00:00.000Z',
    );
  });

  it('rolls the year over', () => {
    expect(startOfDayUtc('2027-01-01', JAKARTA).toISOString()).toBe(
      '2026-12-31T17:00:00.000Z',
    );
  });
});

describe('nextDayStartUtc', () => {
  it('rolls a 30-day month', () => {
    expect(nextDayStartUtc('2026-04-30', JAKARTA).toISOString()).toBe(
      '2026-04-30T17:00:00.000Z',
    );
  });

  it('rolls a 31-day month into the next', () => {
    expect(nextDayStartUtc('2026-05-31', JAKARTA).toISOString()).toBe(
      '2026-05-31T17:00:00.000Z',
    );
  });
});

describe('dayRange', () => {
  it('returns undefined when neither bound is given', () => {
    expect(dayRange(undefined, undefined, JAKARTA)).toBeUndefined();
  });

  it('treats an empty string as absent, not as a bound matching nothing', () => {
    expect(dayRange('', '', JAKARTA)).toBeUndefined();
  });

  /**
   * The regression this whole file exists for. A range ending "today" in
   * Jakarta must include 23:30 local, which is 16:30 UTC the same day.
   */
  it('includes the final evening of the `to` day', () => {
    const range = dayRange('2026-10-17', '2026-10-17', JAKARTA)!;

    expect(range.$gte!.toISOString()).toBe('2026-10-16T17:00:00.000Z');
    expect(range.$lt!.toISOString()).toBe('2026-10-17T17:00:00.000Z');

    // A sale at 20:00 WIB on the 17th is 13:00 UTC on the 17th.
    const lateEveningSale = new Date('2026-10-17T13:00:00Z');
    expect(lateEveningSale.getTime()).toBeGreaterThanOrEqual(
      range.$gte!.getTime(),
    );
    expect(lateEveningSale.getTime()).toBeLessThan(range.$lt!.getTime());

    // A sale at 21:00 WIB on the 18th must be excluded.
    const nextDaySale = new Date('2026-10-18T13:00:00Z');
    expect(nextDaySale.getTime()).toBeGreaterThanOrEqual(range.$lt!.getTime());
  });

  it('covers the whole day with no millisecond gap', () => {
    const range = dayRange('2026-10-17', '2026-10-17', JAKARTA)!;
    // 23:59:59.999 WIB on the 17th is 16:59:59.999 UTC, still inside the bound.
    const lastMillisecond = new Date('2026-10-17T16:59:59.999Z');
    expect(lastMillisecond.getTime()).toBeLessThan(range.$lt!.getTime());
  });

  it('is open ended at either side', () => {
    expect(dayRange('2026-10-01', undefined, JAKARTA)).toEqual({
      $gte: new Date('2026-09-30T17:00:00.000Z'),
    });
    expect(dayRange(undefined, '2026-10-01', JAKARTA)).toEqual({
      $lt: new Date('2026-10-01T17:00:00.000Z'),
    });
  });
});
