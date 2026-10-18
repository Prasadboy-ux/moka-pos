import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const results = [];
const consoleErrors = [];

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();

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

  await page.goto(`${BASE}/dashboard/reports`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Revenue per day", { timeout: 15000 });
  await page.waitForTimeout(800);

  const text = await page.locator("main").innerText();
  check("report renders", /Revenue per day/.test(text));
  check("period is stated", /to .* 2026/.test(text), text.match(/\d+ \w+ 2026 to \d+ \w+ 2026/)?.[0] ?? "");
  check("kpi cards present", /Average order/.test(text) && /Items sold/.test(text));
  check("delta shown", /vs previous period|No comparable period|Level with/.test(text));
  check("category split present", /Revenue by category/.test(text) && /Coffee/.test(text));
  check("top products present", /Top products/.test(text) && /Iced/.test(text));
  check("cashier performance present", /Cashier performance/.test(text) && /Siti Rahayu/.test(text));
  check("payment mix present", /Payment mix/.test(text) && /QRIS/.test(text));

  // ------------------------------------------------------------- presets
  const revenueFor = async () => {
    const all = await page.locator("main").innerText();
    return Number(all.match(/Revenue\s*\n\s*Rp\s*([\d.]+)/)?.[1]?.replace(/\./g, "") ?? "0");
  };

  const sevenDay = await revenueFor();
  await page.getByRole("button", { name: "Today" }).click();
  await page.waitForTimeout(1200);
  const today = await revenueFor();
  check("preset narrows the period", today !== sevenDay && today >= 0, `7d=${sevenDay} today=${today}`);

  await page.getByRole("button", { name: "Last 30 days" }).click();
  await page.waitForTimeout(1200);
  const thirty = await revenueFor();
  check("30 day preset is larger than today", thirty >= today, `today=${today} 30d=${thirty}`);

  // ------------------------------------------------------- monthly buckets
  // A long range has to switch the chart to months, and cover the whole span
  // rather than silently trimming it to the last fortnight.
  await page.getByRole("button", { name: "Last 12 months" }).click();
  await page.waitForSelector("text=Revenue per month", { timeout: 15000 });
  const monthly = await page.locator("main").innerText();
  check("long range switches the chart to months", /Revenue per month/.test(monthly));
  check("monthly chart still shows the best month", /best month in the period/.test(monthly));

  const monthBars = await page.locator('li:has-text("transactions")').count();
  check("monthly chart covers twelve periods", monthBars === 12, `bars=${monthBars}`);

  // A month bucket labels "Oct 2026", never "1 Oct 2026" — the yyyy-mm key
  // pinned to day one would otherwise render as a full date. Scoped to the
  // trend list because the page header legitimately prints the range's start
  // date as "1 Nov 2025".
  const trendList = page.locator("main ul").filter({ hasText: "transactions" }).first();
  const trendText = await trendList.innerText();
  check("month buckets are labelled as months", !/\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/.test(trendText), trendText.split("\n")[0]);

  const twelveMonth = await revenueFor();
  check("12 month revenue covers at least 30 days", twelveMonth >= thirty, `30d=${thirty} 12m=${twelveMonth}`);

  await page.getByRole("button", { name: "Last 7 days" }).click();
  await page.waitForTimeout(1200);
  check("short range returns to daily buckets", /Revenue per day/.test(await page.locator("main").innerText()));

  // -------------------------------------------------- empty period state
  await page.locator("#report-from").fill("2020-01-01");
  await page.locator("#report-to").fill("2020-01-07");
  await page.waitForTimeout(1200);
  const emptyText = await page.locator("main").innerText();
  check("empty period reports zero rather than failing", /Rp\s*0/.test(emptyText));
  check("empty period says so", /No sales in this period/.test(emptyText));

  // back to a populated range for the export
  await page.getByRole("button", { name: "Last 7 days" }).click();
  await page.waitForTimeout(1200);

  // ---------------------------------------------------------------- export
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByRole("button", { name: "Export CSV" }).click(),
  ]);
  check("CSV downloads", Boolean(download), download.suggestedFilename());
  check("filename carries the range", /moka-sales-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv/.test(download.suggestedFilename()));

  const stream = await download.createReadStream();
  let csv = "";
  for await (const chunk of stream) csv += chunk;
  check("CSV has the summary block", csv.includes("Summary") && csv.includes("Revenue"));
  check("CSV has cashier rows", csv.includes("By cashier") && csv.includes("Siti Rahayu"));
  check("CSV quotes and escapes", csv.includes('"Coffee"'));

  // ------------------------------------------------------- cashier blocked
  // Only the session is dropped. The mock database also lives in localStorage, so
  // clearing the whole thing would wipe accounts and stock created earlier.
  await page.evaluate(() => window.localStorage.removeItem("moka-pos.auth"));
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /kasir \/ kasir123/ }).click();
  await page.locator("#password").fill("kasir123");
  await page.getByRole("button", { name: /Sign in as/i }).click();
  await page.waitForURL("**/dashboard/pos", { timeout: 15000 });
  await page.goto(`${BASE}/dashboard/reports`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  check("cashier bounced off /dashboard/reports", page.url().includes("/dashboard/pos"), page.url());
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