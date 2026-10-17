import { chromium } from "playwright";

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

try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /admin \/ admin123/ }).click();
  await page.locator("#password").fill("admin123");
  await page.getByRole("button", { name: /Sign in as/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 15000 });

  await page.goto(`${BASE}/dashboard/users`, { waitUntil: "networkidle" });
  await page.waitForSelector("table tbody tr", { timeout: 15000 });

  const text = await page.locator("main").innerText();
  check("accounts listed", /Budi Santoso/.test(text) && /Siti Rahayu/.test(text) && /Andi Wijaya/.test(text));
  check("usernames shown", /kasir2/.test(text));
  check("roles shown", /Admin/.test(text) && /Cashier/.test(text));
  check("deactivated account flagged", /Deactivated/.test(text));
  check("current user marked", /\byou\b/.test(text));

  // ------------------------------------------------------------- filtering
  await page.getByRole("combobox").first().click();
  await page.waitForTimeout(250);
  await page.getByRole("option", { name: "Cashiers" }).click();
  await page.waitForTimeout(400);
  const cashiersOnly = await page.locator("table").innerText();
  check("role filter works", !/Budi Santoso/.test(cashiersOnly), cashiersOnly.match(/Siti Rahayu/)?.[0] ?? "");

  await page.getByLabel("Search by name or username").fill("andi");
  await page.waitForTimeout(600);
  const searched = await page.locator("main").innerText();
  check("search by name works", /Andi Wijaya/.test(searched));
  await page.getByLabel("Clear search").click();
  await page.waitForTimeout(300);
  await page.getByRole("combobox").first().click();
  await page.waitForTimeout(250);
  await page.getByRole("option", { name: "All roles" }).click();
  await page.waitForTimeout(400);

  // ------------------------------------------------------ create validation
  await page.getByRole("button", { name: "New account" }).click();
  await page.waitForSelector('[role="dialog"]');
  await page.locator("#user-name").fill("Dewi Lestari");
  await page.locator("#user-username").fill("dewi");
  await page.locator("#user-password").fill("123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForTimeout(500);
  let dialogText = await page.locator('[role="dialog"]').innerText();
  check("short password rejected", /At least 6 characters/.test(dialogText));

  await page.locator("#user-password").fill("dewi123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForTimeout(1300);
  check("account created", (await page.locator('[role="dialog"]').count()) === 0);
  const afterCreate = await page.locator("body").innerText();
  check("new account appears", /Dewi Lestari/.test(afterCreate));
  check("toast confirms", /Account created/.test(afterCreate));

  // ------------------------------------------------ duplicate username blocked
  await page.getByRole("button", { name: "New account" }).click();
  await page.waitForSelector('[role="dialog"]');
  await page.locator("#user-name").fill("Someone Else");
  await page.locator("#user-username").fill("DEWI");
  await page.locator("#user-password").fill("dewi456");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForTimeout(700);
  dialogText = await page.locator('[role="dialog"]').innerText();
  check("duplicate username refused case-insensitively", /already taken/i.test(dialogText), dialogText.match(/[^\n]*already taken[^\n]*/i)?.[0] ?? "");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // ------------------------------------- new cashier can sign in, then is blocked
  // Only the session is dropped. The mock database also lives in localStorage, so
  // clearing the whole thing would wipe accounts and stock created earlier.
  await page.evaluate(() => window.localStorage.removeItem("moka-pos.auth"));
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /kasir \/ kasir123/ }).click().catch(() => {});
  await page.locator("#username").fill("dewi");
  await page.locator("#password").fill("dewi123");
  await page.getByRole("button", { name: /Sign in as/i }).click();
  await page.waitForURL("**/dashboard/pos", { timeout: 15000 });
  check("created cashier can sign in", page.url().includes("/dashboard/pos"));
  await page.goto(`${BASE}/dashboard/users`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  check("new cashier still blocked from /dashboard/users", page.url().includes("/dashboard/pos"));

  // -------------------------------------------- deactivation stops sign-in
  // Only the session is dropped. The mock database also lives in localStorage, so
  // clearing the whole thing would wipe accounts and stock created earlier.
  await page.evaluate(() => window.localStorage.removeItem("moka-pos.auth"));
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /admin \/ admin123/ }).click();
  await page.locator("#password").fill("admin123");
  await page.getByRole("button", { name: /Sign in as/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 15000 });

  await page.goto(`${BASE}/dashboard/users`, { waitUntil: "networkidle" });
  await page.waitForSelector("table tbody tr");
  await page.getByRole("button", { name: /Actions for Dewi Lestari/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole("menuitem", { name: "Deactivate" }).click();
  await page.waitForSelector('[role="alertdialog"]');
  await page.locator('[role="alertdialog"] button').last().click();
  await page.waitForTimeout(1300);
  const afterDeactivate = await page.locator("main").innerText();
  check("account shows as deactivated", /Deactivated/.test(afterDeactivate));

  // Only the session is dropped. The mock database also lives in localStorage, so
  // clearing the whole thing would wipe accounts and stock created earlier.
  await page.evaluate(() => window.localStorage.removeItem("moka-pos.auth"));
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#username").fill("dewi");
  await page.locator("#password").fill("dewi123");
  await page.getByRole("button", { name: /Sign in as/i }).click();
  await page.waitForTimeout(1500);
  const loginText = await page.locator("body").innerText();
  check("deactivated account cannot sign in", /deactivated/i.test(loginText), loginText.match(/[^\n]*deactivated[^\n]*/i)?.[0] ?? "");

  // ------------------------------------- last admin cannot be deactivated
  // Only the session is dropped. The mock database also lives in localStorage, so
  // clearing the whole thing would wipe accounts and stock created earlier.
  await page.evaluate(() => window.localStorage.removeItem("moka-pos.auth"));
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /admin \/ admin123/ }).click();
  await page.locator("#password").fill("admin123");
  await page.getByRole("button", { name: /Sign in as/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  await page.goto(`${BASE}/dashboard/users`, { waitUntil: "networkidle" });
  await page.waitForSelector("table tbody tr");
  await page.getByRole("button", { name: /Actions for Budi Santoso/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole("menuitem", { name: "Deactivate" }).click();
  await page.waitForSelector('[role="alertdialog"]');
  await page.locator('[role="alertdialog"] button').last().click();
  await page.waitForTimeout(1300);
  const lastAdminText = await page.locator("body").innerText();
  check("last active admin cannot be deactivated", /last active admin/i.test(lastAdminText), lastAdminText.match(/[^\n]*last active admin[^\n]*/i)?.[0] ?? "");
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