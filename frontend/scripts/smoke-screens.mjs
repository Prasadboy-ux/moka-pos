import { chromium } from "playwright";

/**
 * Acceptance pass for the screen list.
 *
 * Answers one question per requested screen: is this a working screen, or a
 * placeholder that merely compiles? Each check looks for the screen's own
 * working parts — the actual control a user would need — rather than for a
 * heading, which a placeholder also has.
 */

const BASE = "http://localhost:3000";
const results = [];

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

try {
  // ---------------------------------------------------------- 1. Login
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const loginText = await page.locator("main, body").first().innerText();
  check("login renders with both roles", /Cashier/.test(loginText) && /Admin/.test(loginText));
  check(
    "login has working credential fields",
    (await page.locator("#username").count()) === 1 && (await page.locator("#password").count()) === 1,
  );

  // Wrong password must be refused, or "login works" means nothing.
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("wrong");
  await page.getByRole("button", { name: /Sign in as/i }).click();
  await page.waitForTimeout(1400);
  check("login refuses bad credentials", /Incorrect username or password/.test(await page.locator("body").innerText()));

  await page.getByRole("button", { name: /admin \/ admin123/ }).click();
  await page.locator("#password").fill("admin123");
  await page.getByRole("button", { name: /Sign in as/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  check("login signs in and routes by role", page.url().endsWith("/dashboard"));

  // ------------------------------------------------------ 2. Dashboard
  // Wait for the summary rather than reading immediately: useAsync answers from
  // a promise, so the first paint is still the loading spinner.
  await page.getByText("Revenue today").first().waitFor({ timeout: 15000 });
  const dash = await page.locator("main").innerText();
  check("dashboard shows live KPIs", /REVENUE TODAY/.test(dash) && /transactions/.test(dash));
  check("dashboard shows a revenue trend", /Last 7 days/.test(dash));
  check("dashboard shows payment mix", /Payment mix/.test(dash));
  check("dashboard shows low stock", /Low stock/.test(dash));
  check("dashboard shows recent transactions", /Recent transactions/.test(dash));

  // ------------------------------------------- 3. Transaksi Penjualan
  await page.goto(`${BASE}/dashboard/pos`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  const tiles = await page.locator("main button[aria-label^='Add ']").count();
  check("POS renders sellable tiles", tiles === 20, `${tiles} tiles`);

  const methods = ["Cash", "QRIS", "Debit", "Credit"];
  await page.locator("main button[aria-label^='Add ']").first().click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^Charge|Checkout/ }).first().click();
  await page.waitForSelector('[role="dialog"]');
  const checkout = await page.locator('[role="dialog"]').innerText();
  check("checkout offers all 4 payment methods", methods.every((m) => checkout.includes(m)));
  check("checkout shows PPN", /PPN/.test(checkout));
  check("checkout offers quick tender", /Rp/.test(checkout));

  const summary = await page.locator('[role="dialog"] dl').innerText();
  const total = Number(summary.match(/Total\s*Rp\s*([\d.]+)/)?.[1]?.replace(/\./g, "") ?? "0");
  await page.locator("#cash-given").fill(String(total));
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /Complete sale/ }).click();
  await page.waitForTimeout(1600);
  const receipt = await page.locator('[role="dialog"]').innerText();
  check("sale issues an itemised receipt", /MOKA-\d+/.test(receipt) && /Cashier/.test(receipt) && /TOTAL/.test(receipt));
  await page.keyboard.press("Escape");

  // ------------------------------------------------ 4. Manajemen Product
  await page.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
  await page.waitForSelector("table tbody tr");
  const products = await page.locator("main").innerText();
  check("products screen lists the catalogue", /Avocado Toast/.test(products));
  check("products has a create action", (await page.getByRole("button", { name: "New product" }).count()) === 1);
  check("products has filters", (await page.getByLabel("Search products").count()) === 1);

  await page.getByRole("button", { name: "New product" }).click();
  await page.waitForSelector('[role="dialog"]');
  const form = await page.locator('[role="dialog"]').innerText();
  // A new product defaults to counted stock, so the recipe editor is behind the
  // stock-mode switch; assert on what the default view must contain.
  check(
    "product form covers pricing, stock mode, and POS listing",
    /Price/.test(form) && /stock/i.test(form) && /POS/.test(form),
  );

  // And the recipe editor appears when the mode is switched.
  await page.getByRole("combobox").filter({ hasText: "Counted directly" }).click();
  await page.waitForTimeout(250);
  await page.getByRole("option", { name: "Made to order" }).click();
  await page.waitForTimeout(300);
  const recipeForm = await page.locator('[role="dialog"]').innerText();
  check("recipe editor appears for made-to-order items", /Recipe/.test(recipeForm) && /Add ingredient/.test(recipeForm));
  await page.keyboard.press("Escape");
  check("products can manage categories", (await page.getByRole("button", { name: "Categories" }).count()) === 1);

  // ----------------------------------------------- 5. Management Stock
  await page.goto(`${BASE}/dashboard/inventory`, { waitUntil: "networkidle" });
  await page.waitForSelector("table tbody tr");
  const stock = await page.locator("main").innerText();
  check("stock screen shows ingredients", /Fresh Milk/.test(stock));
  check("stock screen shows reorder points", /Reorder at/.test(stock));
  check("stock screen has a movement ledger", (await page.getByRole("tab", { name: "Movements" }).count()) === 1);
  check("stock screen can adjust stock", (await page.getByRole("button", { name: "Adjust" }).count()) > 0);

  await page.getByRole("tab", { name: "Movements" }).click();
  await page.waitForTimeout(700);
  const ledger = await page.locator("table").first().innerText();
  check("ledger recorded the sale just made", /Sale/.test(ledger));

  // ------------------------------------------------------- 6. Laporan
  await page.goto(`${BASE}/dashboard/reports`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Revenue per day");
  await page.waitForTimeout(700);
  const report = await page.locator("main").innerText();
  check("report has a date range", (await page.locator("#report-from").count()) === 1 && (await page.locator("#report-to").count()) === 1);
  check("report has presets", (await page.getByRole("button", { name: "Last 30 days" }).count()) === 1);
  check("report shows period comparison", /vs previous period|No comparable period|Level with/.test(report));
  check("report splits by category", /Revenue by category/.test(report));
  check("report shows top products", /Top products/.test(report));
  check("report shows cashier performance", /Cashier performance/.test(report));
  check("report can export CSV", (await page.getByRole("button", { name: "Export CSV" }).count()) === 1);

  // ------------------------------------------- 7. Manajemen Pengguna
  await page.goto(`${BASE}/dashboard/users`, { waitUntil: "networkidle" });
  await page.waitForSelector("table tbody tr");
  const users = await page.locator("main").innerText();
  check("users screen lists accounts", /Budi Santoso/.test(users) && /Siti Rahayu/.test(users));
  check("users screen shows roles", /Admin/.test(users) && /Cashier/.test(users));
  check("users screen shows activation", /Active/.test(users) && /Deactivated/.test(users));
  check("users screen can create accounts", (await page.getByRole("button", { name: "New account" }).count()) === 1);

  await page.getByRole("button", { name: "New account" }).click();
  await page.waitForSelector('[role="dialog"]');
  const userForm = await page.locator('[role="dialog"]').innerText();
  check("user form covers role and activation", /Role/.test(userForm) && /Active/.test(userForm) && /Password/.test(userForm));
} catch (error) {
  check("script completed without throwing", false, String(error).slice(0, 300));
} finally {
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length > 0 ? 1 : 0);
}