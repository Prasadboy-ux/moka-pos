import { NAV_ITEMS, type NavItem } from "@/lib/nav";
import type { Role } from "@/types/auth";

/**
 * Matches a pathname to its nav entry using prefix rules.
 *
 * "/dashboard" only ever matches exactly, otherwise "/dashboard" would swallow
 * every child route and nothing below it could highlight. All other entries
 * match the exact path or anything nested beneath it, so a future
 * "/dashboard/pos/orders/42" still resolves to the POS entry.
 */
export function matchNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) =>
    item.href === "/dashboard"
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return matchNavItem(pathname)?.href === item.href;
}

/**
 * Route-level permission check used by the dashboard layout guard.
 *
 * A pathname with no nav entry is an unlisted route. Admins may reach those
 * (new screens can ship without a nav change); cashiers may not, because every
 * cashier-facing surface must be listed explicitly.
 */
export function canAccess(role: Role, pathname: string): boolean {
  const item = matchNavItem(pathname);
  if (!item) return role === "admin";
  return item.roles.includes(role);
}

/** First route a role is allowed to land on. */
export function homeForPathname(pathname: string, role: Role): string | null {
  if (canAccess(role, pathname)) return null;
  const fallback = NAV_ITEMS.find((item) => item.roles.includes(role));
  return fallback?.href ?? null;
}