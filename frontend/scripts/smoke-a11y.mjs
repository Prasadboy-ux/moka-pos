import { chromium } from "playwright";
import { fillLoginForm } from "./auth.mjs";

/**
 * Guards on the interface-guideline pass.
 *
 * The behaviours here are easy to regress silently: URL state disappears when a
 * state hook is reintroduced, the clear confirmation disappears when someone
 * re-adds an immediate destructive button, and `lang` / skip link / theme colour
 * are one-line edits nobody re-reads.
 */

const BASE = "http://localhost:3000";
// Same-origin: the Next rewrite forwards `/api/*` to the backend. A direct
// `http://localhost:3001` fetch would be cross-origin and is blocked by the
// page's `connect-src 'self'` policy.
const API = "";
const results = [];
const consoleErrors = [];

/**
 * Opens a shift for whoever is signed in.
 *
 * The POS grid only renders with an open shift (the till gate), so any suite
 * asserting on the grid needs one first. Asked of the API exactly the way the
 * app does it, and idempotent: an already-open shift is left alone.
 */
async function ensureShift(page) {
  await page.evaluate(async (api) => {
    const current = await fetch(`${api}/api/shifts/current`, { credentials: "include" });
    if (current.ok && (await current.json())) return;
    await fetch(`${api}/api/shifts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ openingFloat: 500000 }),
    });
  }, API);
}

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  const text = msg.text();
  // The browser logs expected 401s (auth probe on the login page, before a
  // session exists) 409s (the deliberate no-open-shift gate probe), and 422s (server-side refusals the suite asserts by message, like an over-withdrawal) as
  // resource errors. All are asserted explicitly elsewhere in the
  // suite, so they are filtered here to keep this check about real bugs.
  if (text.includes("Failed to load resource") && /status of (401|409|422)/.test(text)) {
    return;
  }
  consoleErrors.push(text);
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

try {
  // ------------------------------------------------------- document level
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });

  const lang = await page.getAttribute("html", "lang");
  check("html lang is the UI language", lang === "en", `lang="${lang}"`);

  const themeColor = await page
    .locator('meta[name="theme-color"]')
    .getAttribute("content");
  check("theme-color matches the page background", themeColor === "#ffffff", themeColor ?? "missing");

  const skip = page.locator('a[href="#main"]');
  check("skip link exists", (await skip.count()) === 1);

  await fillLoginForm(page, "admin");
  await page.getByRole("button", { name: /Sign in as/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 15000 });

  // skip link reaches the main landmark. Re-navigated first: focus is still on
  // the sign-in form after the redirect, and Tab moves relative to wherever it
  // already is rather than from the top of the document.
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press("Tab");
  const firstStop = await page.evaluate(() => document.activeElement?.textContent?.trim());
  check("skip link is the first tab stop", firstStop === "Skip to content", firstStop ?? "none");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  check("main landmark exists for the skip link", (await page.locator("main#main").count()) === 1);

  // ------------------------------------------------ reduced motion honoured
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
  await page.waitForSelector("table tbody tr");
  const animationDuration = await page.evaluate(() => {
    const button = document.querySelector("table tbody tr button");
    return button ? getComputedStyle(button).transitionDuration : null;
  });
  check(
    "transitions collapse under prefers-reduced-motion",
    animationDuration !== null && parseFloat(animationDuration) < 0.05,
    animationDuration ?? "no transition found",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // ---------------------------------------------------------- URL: filters
  await page.getByRole("button", { name: /^Retail \d+$/ }).click();
  await page.waitForTimeout(400);
  check("category filter is in the URL", page.url().includes("cat="), page.url().split("?")[1] ?? "no query");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("table tbody tr");
  await page.waitForTimeout(500);
  const pressedChip = await page
    .getByRole("button", { name: /^Retail \d+$/ })
    .getAttribute("aria-pressed");
  check("category filter survives a reload", pressedChip === "true", `aria-pressed=${pressedChip}`);

  // ------------------------------------------------------- URL: report range
  await page.goto(`${BASE}/dashboard/reports`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Revenue per day");
  await page.getByRole("button", { name: "Today" }).click();
  await page.waitForTimeout(900);
  check("report range is in the URL", /from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/.test(page.url()), page.url().split("?")[1] ?? "");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("text=Revenue per day");
  await page.waitForTimeout(700);
  const fromValue = await page.locator("#report-from").inputValue();
  const toValue = await page.locator("#report-to").inputValue();
  check("report range survives a reload", fromValue === toValue, `${fromValue} .. ${toValue}`);

  // --------------------------------------------------- URL: stock tab
  await page.goto(`${BASE}/dashboard/inventory`, { waitUntil: "networkidle" });
  await page.waitForSelector("table tbody tr");
  await page.getByRole("tab", { name: "Movements" }).click();
  await page.waitForTimeout(600);
  check("stock tab is in the URL", page.url().includes("tab=movements"), page.url().split("?")[1] ?? "");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const selectedTab = await page.getByRole("tab", { selected: true }).innerText();
  check("stock tab survives a reload", selectedTab === "Movements", selectedTab);

  // ---------------------------------------------- clear order is confirmed
  await ensureShift(page);
  await page.goto(`${BASE}/dashboard/pos`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  await page.locator("main button[aria-label^='Add ']:not([disabled])").first().click();
  await page.waitForTimeout(400);
  check("cart has a line", (await page.locator("main").innerText()).includes("Current order"));

  await page.getByRole("button", { name: "Clear" }).click();
  await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 });
  check("clear asks for confirmation", (await page.locator('[role="alertdialog"]').count()) === 1);

  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(500);
  // The stepper labels are aria-labels, not visible text, so assert on what the
  // cart actually renders: the line item name and a non-empty order total.
  const afterCancel = await page.locator("main").innerText();
  check(
    "cancelling keeps the order",
    !afterCancel.includes("Order is empty") && /Subtotal \(1 item\)/.test(afterCancel),
    afterCancel.match(/Subtotal[^\n]*/)?.[0] ?? "",
  );

  await page.getByRole("button", { name: "Clear" }).click();
  await page.waitForSelector('[role="alertdialog"]');
  await page.locator('[role="alertdialog"] button').last().click();
  await page.waitForTimeout(800);
  check("confirming empties the cart", (await page.locator("main").innerText()).includes("Order is empty"));

  // ---------------------------------------------------- receipt print target
  await page.locator("main button[aria-label^='Add ']:not([disabled])").first().click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^Charge|Checkout/ }).first().click();
  await page.waitForSelector('[role="dialog"]');
  const summary = await page.locator('[role="dialog"] dl').innerText();
  const total = Number(summary.match(/Total\s*Rp\s*([\d.]+)/)?.[1]?.replace(/\./g, "") ?? "0");
  await page.locator("#cash-given").fill(String(total));
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /Complete sale/ }).click();
  await page.waitForTimeout(1500);

  check("receipt is the print target", (await page.locator("[data-receipt]").count()) === 1);

  /**
   * The print layout is asserted on measured geometry, not on the stylesheet
   * source. Hiding the page is the easy half; the receipt also has to land
   * inside the sheet, which fails if the dialog's own centring survives into
   * print — and that centring is the CSS `translate` property, which a
   * `transform: none` override does not touch.
   */
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  const printGeometry = await page.evaluate(() => {
    const receipt = document.querySelector("[data-receipt]");
    if (!receipt) return { missing: true };
    const box = receipt.getBoundingClientRect();

    const leaks = [];
    for (const el of document.querySelectorAll("body *")) {
      if (receipt.contains(el) || el.contains(receipt)) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      leaks.push(el.tagName.toLowerCase());
      if (leaks.length > 3) break;
    }

    const shell = document.querySelector('[data-slot="dialog-content"]');
    return {
      missing: false,
      top: Math.round(box.top),
      left: Math.round(box.left),
      right: Math.round(box.right),
      shellTranslate: shell ? getComputedStyle(shell).translate : "no shell",
      leaks,
    };
  });

  check("receipt exists as a print target", printGeometry.missing === false);
  check(
    "dialog centring is cancelled for print",
    String(printGeometry.shellTranslate).includes("0"),
    `translate=${printGeometry.shellTranslate}`,
  );
  check(
    "receipt prints inside the page",
    printGeometry.top >= 0 && printGeometry.left >= 0 && printGeometry.right <= 1280,
    `top=${printGeometry.top} left=${printGeometry.left} right=${printGeometry.right}`,
  );
  check("nothing else prints", printGeometry.leaks.length === 0, printGeometry.leaks.join(", "));
  await page.emulateMedia({ media: "screen" });
} catch (error) {
  check("script completed without throwing", false, String(error).slice(0, 300));
} finally {
  check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length > 0 ? 1 : 0);
}