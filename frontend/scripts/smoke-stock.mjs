import { chromium } from "playwright";

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
  results.push({ name, ok: Boolean(condition), detail });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

const cellValue = async (label) => {
  const cell = page.locator("table tbody tr").filter({ hasText: label }).first();
  return (await cell.innerText()).replace(/\s+/g, " ");
};

try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /admin \/ admin123/ }).click();
  await page.locator("#password").fill("admin123");
  await page.getByRole("button", { name: /Sign in as/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 15000 });

  // ------------------------------------------------------------ stock screen
  await page.goto(`${BASE}/dashboard/inventory`, { waitUntil: "networkidle" });
  await page.waitForSelector("table tbody tr", { timeout: 15000 });

  const stockText = await page.locator("main").innerText();
  check("ingredients tab renders", /Fresh Milk/.test(stockText));
  check("reorder points shown", /Reorder at/i.test(stockText));
  check("stock value cards render", /Ingredient cost value/.test(stockText));

  const milkBefore = await cellValue("Fresh Milk");
  check("ingredient row shows level and unit", /\d[\d.]*\s*ml/.test(milkBefore), milkBefore);

  // ---------------------------------------------------------- adjust stock
  await page
    .locator("table tbody tr")
    .filter({ hasText: "Fresh Milk" })
    .getByRole("button", { name: "Adjust" })
    .click();
  await page.waitForSelector('[role="dialog"]');
  check("adjust dialog names the item", (await page.locator('[role="dialog"]').innerText()).includes("Fresh Milk"));

  // waste is blocked when it would go negative
  await page.locator("#adjust-reason").click();
  await page.waitForTimeout(250);
  await page.getByRole("option", { name: "Waste" }).click();
  await page.locator("#adjust-qty").fill("99999999");
  await page.getByRole("button", { name: "Record movement" }).click();
  await page.waitForTimeout(900);
  const dialogText = await page.locator('[role="dialog"]').innerText();
  check("over-withdrawal is refused", /only .* on hand/i.test(dialogText), dialogText.match(/Cannot remove[^\n]*/)?.[0] ?? "");

  // a real purchase lands
  await page.locator("#adjust-reason").click();
  await page.waitForTimeout(250);
  await page.getByRole("option", { name: "Purchase" }).click();
  await page.locator("#adjust-qty").fill("1000");
  await page.getByLabel("Note (optional)").fill("Smoke test delivery");
  await page.getByRole("button", { name: "Record movement" }).click();
  await page.waitForTimeout(1200);

  const afterPurchase = await cellValue("Fresh Milk");
  check("purchase raises the level", afterPurchase !== milkBefore, `${milkBefore} -> ${afterPurchase}`);

  // ------------------------------------------------------------- movements
  await page.getByRole("tab", { name: "Movements" }).click();
  await page.waitForTimeout(600);
  const movementText = await page.locator("table").first().innerText();
  check("movement ledger recorded the purchase", /Purchase/.test(movementText));
  check("movement carries the note", /Smoke test delivery/.test(movementText));
  check("movement shows a signed change", /\+\s*1[\d.]*\s*ml/.test(movementText), movementText.match(/Change[\s\S]{0,40}/)?.[0]?.replace(/\n/g, " ") ?? "");

  // filter the ledger
  await page.getByRole("combobox").last().click();
  await page.waitForTimeout(250);
  await page.getByRole("option", { name: "Sales" }).click();
  await page.waitForTimeout(600);
  // No sale has happened yet, so this filter legitimately has nothing to show.
  const salesOnlyText = await page.locator("main").innerText();
  check("ledger filters by type", !/Smoke test delivery/.test(salesOnlyText), salesOnlyText.includes("No movements yet") ? "empty state shown" : "rows shown");

  await page.getByRole("combobox").last().click();
  await page.waitForTimeout(250);
  await page.getByRole("option", { name: "All movements" }).click();
  await page.waitForTimeout(400);

  // ------------------------------------------- a sale decrements stock
  await page.goto(`${BASE}/dashboard/pos`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  await page.getByRole("button", { name: /Add Iced Americano/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^Charge|Checkout/ }).first().click().catch(() => {});
  await page.waitForTimeout(400);

  const checkoutOpen = (await page.locator('[role="dialog"]').count()) > 0;
  check("checkout opens from the cart", checkoutOpen);

  if (checkoutOpen) {
    // keep paying enough for cash
    const total = await page.locator('[role="dialog"] dl').last().innerText();
    const totalValue = Number(total.match(/Total\s*Rp\s*([\d.]+)/)?.[1]?.replace(/\./g, "") ?? "0");
    await page.locator("#cash-given").fill(String(totalValue));
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /Complete sale/ }).click();
    await page.waitForTimeout(1500);

    const receiptText = await page.locator("body").innerText();
    check("sale issues a receipt", /Receipt|MOKA-/.test(receiptText));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    await page.goto(`${BASE}/dashboard/inventory`, { waitUntil: "networkidle" });
    await page.waitForSelector("table tbody tr");
    await page.getByRole("tab", { name: "Movements" }).click();
    await page.waitForTimeout(700);
    const ledger = await page.locator("table").first().innerText();
    check("the sale wrote ledger movements", /Sale/.test(ledger), ledger.match(/\+?[\d.]*\s*(ml|gram)\s*(added|removed)?/)?.[0] ?? "");
  }

  // ----------------------------------------------- counted product tab
  await page.getByRole("tab", { name: "Counted products" }).click();
  await page.waitForTimeout(500);
  const productTab = await page.locator("table").first().innerText();
  check("counted products tab lists packaged stock", /Ceramic Mug/.test(productTab));
  check("recipe items are excluded from this tab", !/Iced Americano/.test(productTab));

  // ------------------------------------------------------- cashier blocked
  // Only the session is dropped. The mock database also lives in localStorage, so
  // clearing the whole thing would wipe accounts and stock created earlier.
  await signOut(page);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /kasir \/ kasir123/ }).click();
  await page.locator("#password").fill("kasir123");
  await page.getByRole("button", { name: /Sign in as/i }).click();
  await page.waitForURL("**/dashboard/pos", { timeout: 15000 });
  await page.goto(`${BASE}/dashboard/inventory`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  check("cashier bounced off /dashboard/inventory", page.url().includes("/dashboard/pos"), page.url());
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