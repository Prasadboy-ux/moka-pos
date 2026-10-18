/**
 * Two locales on purpose, and they are not interchangeable.
 *
 * Money stays `id-ID` because rupiah is the actual currency and the local
 * grouping is the one an Indonesian customer reads without translating. Dates
 * are `en-GB` because every label in this app is English, and an English UI that
 * printed "18 Okt 2026" mixed two languages on the same screen. `en-GB` rather
 * than `en-US` because day-first ordering keeps the shape staff already know.
 */

const idrFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatIDR(value: number): string {
  return idrFormatter.format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

export function formatDateTime(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Day-level formatting for report axes and ranges.
 *
 * A bare `yyyy-mm-dd` is parsed as UTC midnight, which renders as the previous
 * day for anyone west of Greenwich, so the string is pinned to local time
 * first.
 */
export function formatDate(value: Date | string): string {
  const date =
    typeof value === "string"
      ? new Date(`${value}T00:00:00`)
      : value;
  return dayFormatter.format(date);
}

const monthFormatter = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
});

/**
 * Month-level formatting for report axes. Takes the bare `yyyy-mm` key a
 * month bucket carries and pins it to the first of the month in local time, so
 * it is not read as UTC midnight like the day keys are.
 */
export function formatMonth(value: string): string {
  return monthFormatter.format(new Date(`${value}-01T00:00:00`));
}
