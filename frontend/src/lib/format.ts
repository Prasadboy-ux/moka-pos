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
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const dayFormatter = new Intl.DateTimeFormat("id-ID", {
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