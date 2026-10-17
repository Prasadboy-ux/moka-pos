import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const results = [];
const consoleErrors = [];

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

try {
  // ---------------------------------------------------------------- sign in
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /admin \/ admin123/ }).click();
  await page.locator("#password").fill("admin123");
  await page.getByRole("button", { name: /Sign in as Admin/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  check("admin lands on /dashboard", page.url().endsWith("/dashboard"));

  // ------------------------------------------------------------- products
  await page.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
  await page.waitForSelector("table tbody tr", { timeout: 15000 });

  const rowCount = await page.locator("table tbody tr").count();
  check("product table renders rows", rowCount > 0, `${rowCount} rows on page 1`);

  const bodyText = await page.locator("main").innerText();
  check("heading is the real screen, not the placeholder", bodyText.includes("Product management"));
  check("page 1 holds seeded products", bodyText.includes("Avocado Toast") && bodyText.includes("Coffee Bean Bag 250g"));
  const totalRows = await page.locator("main").innerText();
  check("pagination reports the full catalogue", /of\s+20/i.test(totalRows), totalRows.match(/Showing[^\\n]*/)?.[0] ?? "");
  check("recipe item shows servings", /servings/i.test(bodyText));
  check("low stock badge appears", /min \d/i.test(bodyText));
  check("cost column present", bodyText.includes("margin"));

  // images actually decoded
  const brokenImages = await page.evaluate(() =>
    Array.from(document.images).filter((img) => !img.complete || img.naturalWidth === 0).length,
  );
  check("no broken thumbnails", brokenImages === 0, `${brokenImages} broken`);

  // ------------------------------------------------------------- filtering
  await page.getByLabel("Search products").fill("boba");
  await page.waitForTimeout(500);
  const bobaRows = await page.locator("table tbody tr").count();
  check("search filters the table", bobaRows > 0 && bobaRows < rowCount, `${bobaRows} for "boba"`);
  await page.getByLabel("Clear search").click();
  await page.waitForTimeout(300);

  const chip = page.getByRole("button", { name: /^Retail \d+$/ });
  await chip.click();
  await page.waitForTimeout(300);
  const retailRows = await page.locator("table tbody tr").count();
  check("category chip filters", retailRows > 0, `${retailRows} retail`);
  await chip.click();
  await page.waitForTimeout(300);

  // ----------------------------------------------------------- sorting
  const firstBefore = await page.locator("table tbody tr").first().innerText();
  void firstBefore;
  await page.getByRole("button", { name: /^Product/ }).click();
  await page.waitForTimeout(300);
  const firstAsc = await page.locator("table tbody tr").first().innerText();
  await page.getByRole("button", { name: /^Product/ }).click();
  await page.waitForTimeout(300);
  const firstDesc = await page.locator("table tbody tr").first().innerText();
  check("sorting reorders rows", firstAsc !== firstDesc, `asc≠desc`);

  // -------------------------------------------------- edit dialog / recipe
  await page.locator("table tbody tr").first().getByRole("button").first().click();
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  check("row click opens the edit dialog", await page.getByText("Edit product").isVisible());
  check("dialog is populated", (await page.locator("#product-name").inputValue()).length > 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // --------------------------------------------------- create + validation
  await page.getByRole("button", { name: "New product" }).click();
  await page.waitForSelector('[role="dialog"]');
  await page.getByLabel("Name").fill("Z");
  await page.getByRole("button", { name: "Create product" }).click();
  await page.waitForTimeout(400);
  const validationText = await page.locator('[role="dialog"]').innerText();
  check("zod blocks a too-short name", /too short/i.test(validationText));

  await page.getByLabel("Name").fill("Test Cold Brew");
  await page.getByLabel("Price (Rp)").fill("30000");
  // No illustration picked yet -> required error
  await page.getByRole("button", { name: "Create product" }).click();
  await page.waitForTimeout(400);
  const validationText2 = await page.locator('[role="dialog"]').innerText();
  check("illustration is required", /illustration/i.test(validationText2));

  // pick illustration from the select
  await page.locator("#product-image").click();
  await page.waitForTimeout(300);
  await page.getByRole("option").first().click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Create product" }).click();
  await page.waitForTimeout(1200);

  const dialogGone = (await page.locator('[role="dialog"]').count()) === 0;
  check("valid product saves", dialogGone);
  const afterCreate = await page.locator("body").innerText();
  check("new product listed after save", afterCreate.includes("Test Cold Brew"));
  check("toast confirms the save", /Product created/i.test(afterCreate));

  // ------------------------------------------------- appears on the POS
  await page.goto(`${BASE}/dashboard/pos`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const posText = await page.locator("main").innerText();
  check("created product shows on the POS", posText.includes("Test Cold Brew"));

  // -------------------------------------------------- archive it again
  await page.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
  await page.getByLabel("Search products").fill("Test Cold Brew");
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Actions for Test Cold Brew/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.waitForSelector('[role="alertdialog"]');
  check("archive asks for confirmation", (await page.locator('[role="alertdialog"]').count()) === 1);
  await page.locator('[role="alertdialog"] button').last().click();
  await page.waitForTimeout(1200);
  const afterArchive = await page.locator("main").innerText();
  check("archived product is gone from the listed view", !afterArchive.includes("Test Cold Brew"));

  // switch the status filter to Hidden
  await page.getByRole("combobox").last().click();
  await page.waitForTimeout(300);
  await page.getByRole("option", { name: "Hidden" }).click();
  await page.waitForTimeout(500);
  const hiddenView = await page.locator("main").innerText();
  check("archived product is still recoverable under Hidden", hiddenView.includes("Test Cold Brew"));

  // ---------------------------------------------------- cashier blocked
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /kasir \/ kasir123/ }).click();
  await page.locator("#password").fill("kasir123");
  await page.getByRole("button", { name: /Sign in as/i }).click();
  await page.waitForURL("**/dashboard/pos", { timeout: 15000 });
  check("cashier lands on the POS", page.url().includes("/dashboard/pos"));

  await page.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  check("cashier bounced off /dashboard/products", page.url().includes("/dashboard/pos"), page.url());
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