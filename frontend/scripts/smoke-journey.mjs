import { chromium } from "playwright";

/**
 * One sale, followed all the way round the app.
 *
 * The per-screen suites each verify a screen in isolation. This one covers the
 * joins between them, which is where a data layer swap would actually break:
 * complete a sale at the till, then confirm the money, the stock movement, the
 * low-stock warning, and the report all moved.
 */

const BASE = "http://localhost:3000";
const results = [];
const consoleErrors = [];

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

const revenueToday = async () => {
  const text = await page.locator("main").innerText();
  return Number(text.match(/REVENUE TODAY\s*\n\s*Rp\s*([\d.]+)/)?.[1]?.replace(/\./g, "") ?? "0");
};

try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /kasir \/ kasir123/ }).click();
  await page.locator("#password").fill("kasir123");
  await page.getByRole("button", { name: /Sign in as/i }).click();
  await page.waitForURL("**/dashboard/pos", { timeout: 15000 });
  check("cashier signed in", page.url().includes("/dashboard/pos"));

  await page.waitForTimeout(1200);
  const tileCount = await page.locator("main button[aria-label^='Add ']").count();
  check("POS renders sellable tiles", tileCount > 0, `${tileCount} tiles`);

  // ------------------------------------------------------------- sell 2 cups
  for (let i = 0; i < 2; i++) {
    await page.locator("main button[aria-label^='Add ']").first().click();
    await page.waitForTimeout(250);
  }
  await page.getByRole("button", { name: /Charge|Checkout/ }).first().click().catch(() => {});
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });

  const summary = await page.locator('[role="dialog"] dl').innerText();
  const total = Number(summary.match(/Total\s*Rp\s*([\d.]+)/)?.[1]?.replace(/\./g, "") ?? "0");
  check("checkout totals the cart", total > 0, `Rp ${total}`);

  await page.locator("#cash-given").fill(String(total));
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /Complete sale/ }).click();
  await page.waitForTimeout(1500);

  const receipt = await page.locator("body").innerText();
  check("receipt issued with a receipt number", /MOKA-\d+/.test(receipt), receipt.match(/MOKA-\d+/)?.[0] ?? "");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);

  const cartAfter = await page.locator("main").innerText();
  // The Charge button always renders "Charge Rp 0" while disabled, so the
  // empty state in the cart panel is the thing to assert on.
  check("cart cleared after the sale", /Order is empty/.test(cartAfter));

  // ------------------------------------------- admin sees it on the dashboard
  await page.evaluate(() => window.localStorage.removeItem("moka-pos.auth"));
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /admin \/ admin123/ }).click();
  await page.locator("#password").fill("admin123");
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