/**
 * Sign-in helpers shared by the smoke suites.
 *
 * The login screen no longer carries demo click-to-fill buttons — with real
 * authentication wired up they were credentials printed in the UI. The suites
 * sign in by driving the form itself: pick the role, type the username and
 * password, then let the caller click submit the way it already does.
 */

const CREDENTIALS = {
  admin: { username: "admin", password: "admin123" },
  kasir: { username: "kasir", password: "kasir123" },
};

/**
 * Fills the login form for the given role. Assumes the browser is already on
 * `/login`. The caller submits and waits for the dashboard, because part of
 * some suites' assertions is exactly that redirect.
 */
export async function fillLoginForm(page, role) {
  const creds = CREDENTIALS[role];

  if (!creds) {
    throw new Error(`Unknown role: ${role}`);
  }

  const roleLabel = role === "admin" ? "Admin" : "Cashier";
  // The radio is `sr-only`; its visible label and icon sit over the 1x1 input,
  // so Playwright's hit-target check needs to be bypassed for the click.
  await page.getByRole("radio", { name: roleLabel }).check({ force: true });
  await page.locator("#username").fill(creds.username);
  await page.locator("#password").fill(creds.password);
}
