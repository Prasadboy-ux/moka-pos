import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = "C:/Users/DELL/AppData/Local/Temp/opencode";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /admin \/ admin123/ }).click();
await page.locator("#password").fill("admin123");
await page.getByRole("button", { name: /Sign in as/i }).click();
await page.waitForURL("**/dashboard", { timeout: 15000 });

await page.goto(`${BASE}/dashboard/inventory`, { waitUntil: "networkidle" });
await page.waitForSelector("table tbody tr");
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/stock.png`, fullPage: true });

await page.getByRole("tab", { name: "Movements" }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/stock-movements.png` });

await browser.close();
console.log("screenshots written");