import { chromium } from "playwright";
import { fillLoginForm } from "./auth.mjs";

/**
 * One sale, followed all the way round the app.
 *
 * The per-screen suites each verify a screen in isolation. This one covers the
 * joins between them, which is where a data layer swap would actually break:
 * complete a sale at the till, then confirm the money, the stock movement, the
 * low-stock warning, and the report all moved.
 */

const BASE = "http://localhost:3000";
const API = "http://localhost:3001";

/**
 * Signs out for real.
 *
 * This used to clear `moka-pos.auth` from localStorage, because the mock kept
 * the session in the browser. The session is now an httpOnly cookie the page
 * cannot read or clear, so the only way to become signed out is to ask the
 * server to drop it.
 */
async function signOut(page) {
  await page.evaluate((api) => {
    return fetch(`${api}/api/auth/logout`, { method: "POST", credentials: "include" });
  }, API);
}
const results = [];
const consoleErrors = [];

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok, detail });
  return ok;
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

const revenueToday = async () => {
  const text = await page.locator("main").innerText();
  return Number(text.match(/REVENUE TODAY\s*\n\s*Rp\s*([\d.]+)/)?.[1]?.replace(/\./g, "") ?? "0");
};

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await fillLoginForm(page, "kasir");
  await page.getByRole("button", { name: /Sign in as/i }).click();
  await page.waitForURL("**/dashboard/pos", { timeout: 15000 });
  check("cashier signed in", page.url().includes("/dashboard/pos"));

  // ------------------------------------------------------ the till gate
  /**
   * Normalise first: a previous run that died mid-suite can leave this
   * cashier's shift open, and the gate below can only be asserted on a till
   * that has none. Closed through the API, the same public endpoint the app
   * uses — counted 0, because the point is only the state, not the money.
   */
  await page.evaluate(async (api) => {
    const response = await fetch(`${api}/api/shifts/current`, { credentials: "include" });
    const shift = response.ok ? await response.json() : null;
    if (!shift) return;
    await fetch(`${api}/api/shifts/${shift.id}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ counted: 0 }),
    });
  }, API);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  check(
    "the till refuses to sell without an open shift",
    (await page.locator("main button[aria-label^='Add ']").count()) === 0,
  );
  check(
    "the gate offers the one action available",
    await page.getByRole("button", { name: "Open shift" }).isVisible(),
  );

  await page.getByRole("button", { name: "Open shift" }).click();
  await page.locator("#opening-float").fill("500000");
  await page.getByRole("dialog").getByRole("button", { name: "Open shift" }).click();
  await page.getByText(/Shift open since/).waitFor({ timeout: 10000 });
  check("opening a shift unblocks the till", true);

  await page.waitForTimeout(800);
  const tileCount = await page.locator("main button[aria-label^='Add ']").count();
  check("POS renders sellable tiles", tileCount > 0, `${tileCount} tiles`);

  // ------------------------------------------- the stepper cannot oversell
  /**
   * Asked of the API rather than hard-coding a product name: the seed is fixture
   * data, and a test that pins a product name breaks the moment the menu is
   * reworked. The counted product with the smallest stock is used so the loop
   * below stays short.
   *
   * This previously read `localStorage["moka-pos.db"]` — the mock's private
   * store. That was the abstraction leaking: the test depended on how the data
   * happened to be stored rather than on what the app does. Fetching the same
   * public endpoint the app itself uses keeps the intent and drops the coupling,
   * and the session cookie is sent automatically because `credentials` is set.
   */
  const counted = await page.evaluate(async (api) => {
    const response = await fetch(`${api}/api/products`, { credentials: "include" });
    if (!response.ok) return null;

    const products = await response.json();
    const candidates = products
      .filter(
        (p) =>
          p.stockMode === "direct" &&
          p.isActive &&
          typeof p.stock === "number" &&
          p.stock > 0,
      )
      .sort((a, b) => a.stock - b.stock);

    const product = candidates[0];
    return product ? { id: product.id, name: product.name, stock: product.stock } : null;
  }, API);

  if (check("a counted product is available to test the limit against", counted !== null, counted ? `${counted.name}: ${counted.stock} in stock` : "none seeded")) {
    const tile = page.getByRole("button", { name: new RegExp(`^Add ${escape(counted.name)},`) });

    await tile.click();
    await page.waitForTimeout(300);

    // Two taps past the shelf. Before the clamp this produced a cart the
    // repository then refused at save time, after the customer had paid.
    const plus = page.getByRole("button", { name: new RegExp(`^Increase ${escape(counted.name)}$`) });
    for (let i = 0; i < counted.stock + 2; i += 1) {
      await plus.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(60);
    }

    const cartText = await page.locator("main").innerText();
    const qtyReadout = page.locator(`[data-cart-qty="${counted.id}"]`);
    const cartQty = Number((await qtyReadout.innerText()).trim());

    check(
      "stepper stops at the shelf",
      cartQty === counted.stock,
      `qty=${cartQty} stock=${counted.stock}`,
    );
    check("the limit is explained, not silent", /All remaining stock is in this order/.test(cartText));
    check("the stepper disables itself at the limit", await plus.isDisabled().catch(() => false));

    await page.getByRole("button", { name: "Clear" }).click();
    await page.waitForSelector('[role="alertdialog"]');
    await page.locator('[role="alertdialog"] button').last().click();
    await page.waitForTimeout(600);
    check("cart is empty before the real sale", /Order is empty/.test(await page.locator("main").innerText()));
  }

  // ------------------------------------------------------------- sell 2 cups
  for (let i = 0; i < 2; i++) {
    await page.locator("main button[aria-label^='Add ']:not([disabled])").first().click();
    await page.waitForTimeout(250);
  }
  await page.getByRole("button", { name: /Charge|Checkout/ }).first().click().catch(() => {});
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });

  const summary = await page.locator('[role="dialog"] dl').innerText();
  const total = Number(summary.match(/Total\s*Rp\s*([\d.]+)/)?.[1]?.replace(/\./g, "") ?? "0");
  check("checkout totals the cart", total > 0, `Rp ${total}`);

  // ---------------------------------------------- customer details are optional
  check(
    "customer details stay collapsed by default",
    (await page.locator("#customer-phone").count()) === 0,
  );

  await page.getByRole("button", { name: /Customer details/ }).click();
  await page.waitForTimeout(300);
  check("customer fields appear on request", (await page.locator("#customer-phone").count()) === 1);

  // Typed the way a customer would actually say it, with spaces and punctuation.
  await page.locator("#customer-name").fill("Dewi Lestari");
  await page.locator("#customer-phone").fill("0812 3450-1122");
  await page.waitForTimeout(300);
  check(
    "the number is normalised before it is stored",
    /6281234501122/.test(await page.locator('[role="dialog"]').innerText()),
  );

  await page.locator("#cash-given").fill(String(total));
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /Complete sale/ }).click();
  await page.waitForTimeout(1500);

  const receipt = await page.locator("body").innerText();
  const receiptNo = receipt.match(/MOKA-\d+/)?.[0] ?? "";
  check("receipt issued with a receipt number", receiptNo !== "", receiptNo);
  check("the customer is named on the receipt", /Dewi Lestari/.test(receipt));

  // ------------------------------------------------- the receipt can be sent
  const wa = page.getByRole("link", { name: /Send WhatsApp/ });
  check("receipt can be sent on WhatsApp", (await wa.count()) === 1);
  check(
    "the send link addresses the normalised number",
    (await wa.getAttribute("href"))?.includes("/6281234501122") === true,
    (await wa.getAttribute("href"))?.slice(0, 40) ?? "",
  );

  // -------------------------------------------------------------- walk-in sale
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await page.locator("main button[aria-label^='Add ']:not([disabled])").first().click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Charge|Checkout/ }).first().click().catch(() => {});
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  const walkInSummary = await page.locator('[role="dialog"] dl').innerText();
  const walkInTotal = Number(
    walkInSummary.match(/Total\s*Rp\s*([\d.]+)/)?.[1]?.replace(/\./g, "") ?? "0",
  );
  await page.locator("#cash-given").fill(String(walkInTotal));
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /Complete sale/ }).click();
  await page.waitForTimeout(1500);

  check(
    "a sale with no customer offers nothing to send",
    (await page.getByRole("link", { name: /Send WhatsApp/ }).count()) === 0,
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);

  const cartAfter = await page.locator("main").innerText();
  // The Charge button always renders "Charge Rp 0" while disabled, so the
  // empty state in the cart panel is the thing to assert on.
  check("cart cleared after the sale", /Order is empty/.test(cartAfter));

  // -------------------------------------- close the shift, reconcile the drawer
  /**
   * The float opened with, plus both cash sales just rung up, is exactly what
   * the drawer should hold — so a counted amount equal to it must come back
   * balanced. The arithmetic belongs to the server; this only checks that the
   * number it judged against is the right one.
   */
  const expectedCash = 500000 + total + walkInTotal;
  await page.getByRole("button", { name: "Close shift" }).first().click();
  await page.locator("#counted").fill(String(expectedCash));
  await page.getByRole("dialog").getByRole("button", { name: "Close shift" }).click();
  // The close is a real transaction and can take a couple of seconds; wait for
  // the result phase instead of assuming a fixed delay is enough.
  await page
    .getByRole("dialog")
    .getByText(/Drawer (not )?balanced/)
    .waitFor({ timeout: 15000 })
    .catch(() => undefined);
  const drawer = await page.getByRole("dialog").innerText();
  check(
    "closing the shift reconciles the drawer",
    /Drawer balanced/.test(drawer),
    drawer.match(/Variance[^\n]*/)?.[0] ?? drawer.slice(0, 80),
  );

  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Open shift" }).waitFor({ timeout: 5000 });
  check("a closed till returns to the gate", true);

  // ------------------------------------------- admin sees it on the dashboard
  await signOut(page);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await fillLoginForm(page, "admin");
  await page.getByRole("button", { name: /Sign in as/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  await page.waitForTimeout(1400);

  const dashboard = await page.locator("main").innerText();
  check("dashboard counts the new sale", /REVENUE TODAY/.test(dashboard) && /transactions/.test(dashboard));
  check("recent transactions list it", /MOKA-\d+/.test(dashboard));

  // The dashboard aggregates every cashier, so today's takings must cover at
  // least the sale just made on top of the seeded history.
  const todayRevenue = await revenueToday();
  check(
    "dashboard revenue covers the new sale",
    todayRevenue >= total,
    `Rp ${todayRevenue} >= Rp ${total}`,
  );

  // --------------------------------------------------- movement for the sale
  await page.goto(`${BASE}/dashboard/inventory`, { waitUntil: "networkidle" });
  await page.waitForSelector("table tbody tr");
  await page.getByRole("tab", { name: "Movements" }).click();
  await page.waitForTimeout(800);
  const ledger = await page.locator("main").innerText();
  check("ledger holds a Sale entry", /Sale/.test(ledger));
  // The first tile is a counted product, so its unit is pcs; recipes use ml/gram.
  check("sale movements are negative", /-\s*[\d.]+\s*(pcs|ml|gram)/.test(ledger), ledger.match(/-\s*[\d.]+\s*(pcs|ml|gram)/)?.[0] ?? "");
  check("the cashier is credited", /Siti Rahayu/.test(ledger));

  // -------------------------------------------------------- report includes it
  await page.goto(`${BASE}/dashboard/reports`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Today" }).click();
  await page.waitForTimeout(1400);
  const report = await page.locator("main").innerText();
  check("today's report has transactions", /Transactions/.test(report));
  check("top products populated for today", !/No sales in this period/.test(report));
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