import { chromium } from "playwright";
import { fillLoginForm } from "./auth.mjs";

const BASE = "http://localhost:3000";

const results = [];
const consoleErrors = [];

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  const text = msg.text();
  // The throttled login probe below deliberately produces a 429; the auth probe
  // produces the ordinary 401 for a browser with no session.
  if (text.includes("Failed to load resource") && /status of (401|429)/.test(text)) {
    return;
  }
  consoleErrors.push(text);
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

let releaseHydration;
let hydrationStarted;
const hydrationStartedPromise = new Promise((resolve) => {
  hydrationStarted = resolve;
});
let hydrationBlocked = false;

try {
  // Hold `/auth/me` open. The login form must not be usable until it answers,
  // otherwise a late 401 can wipe the session the user just created.
  await page.route("**/api/auth/me", async (route) => {
    hydrationBlocked = true;
    hydrationStarted();
    await new Promise((resolve) => {
      releaseHydration = resolve;
    });
    await route.continue();
  });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });

  const checking = page.getByRole("button", { name: /Checking station session/i });
  await checking.waitFor({ timeout: 15000 });
  check("login waits for the session probe", await checking.isDisabled());

  // The button renders before the effect fires; wait for the request itself
  // rather than sampling the flag in the same tick as the first paint.
  await Promise.race([
    hydrationStartedPromise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("session probe never started")), 5000),
    ),
  ]);
  check("session probe is actually in flight", hydrationBlocked);

  if (releaseHydration) releaseHydration();
  const signIn = page.getByRole("button", { name: /Sign in as/i });
  await signIn.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForFunction(
    () => !document.querySelector('button[type="submit"]')?.hasAttribute("disabled"),
    undefined,
    { timeout: 15000 },
  );
  check("login enables after the session probe finishes", await signIn.isEnabled());

  await page.unroute("**/api/auth/me");

  // One deterministic 429, then let the retry reach the real API.
  let rateLimited = false;
  await page.route("**/api/auth/login", async (route) => {
    if (route.request().method() === "OPTIONS" || rateLimited) {
      await route.continue();
      return;
    }
    rateLimited = true;
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": BASE,
        "Access-Control-Allow-Credentials": "true",
      },
      body: JSON.stringify({
        error: "rate_limited",
        message: "Too many sign-in attempts. Please wait and try again.",
      }),
    });
  });

  await fillLoginForm(page, "kasir");
  await signIn.click();
  const rateLimitMessage = page.getByText(/Too many sign-in attempts/i);
  await rateLimitMessage.waitFor({ timeout: 15000 });
  check("rate-limit response reaches the form", await rateLimitMessage.isVisible());

  await signIn.click();
  await page.waitForURL("**/dashboard/pos", { timeout: 15000 });
  check("sign-in still works after a handled refusal", page.url().includes("/dashboard/pos"));
} catch (error) {
  check("script completed without throwing", false, String(error).slice(0, 300));
} finally {
  check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
  await browser.close();

  const failed = results.filter((result) => !result.ok);
  for (const result of results) {
    console.log(
      `${result.ok ? "PASS" : "FAIL"}  ${result.name}${result.detail ? `  (${result.detail})` : ""}`,
    );
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length > 0 ? 1 : 0);
}
