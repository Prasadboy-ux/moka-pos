import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = "C:/Users/DELL/AppData/Local/Temp/opencode";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /admin \/ admin123/ }).click();
await page.locator("#password").fill("admin123");
await page.getByRole("button", { name: /Sign in as/i }).click();
await page.waitForURL("**/dashboard", { timeout: 15000 });

await page.goto(`${BASE}/dashboard/reports`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Revenue per day");
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/reports.png`, fullPage: true });
await browser.close();
console.log("screenshots written");