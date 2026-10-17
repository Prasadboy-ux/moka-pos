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

await page.goto(`${BASE}/dashboard/users`, { waitUntil: "networkidle" });
await page.waitForSelector("table tbody tr");
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/users.png`, fullPage: true });

await browser.close();
console.log("screenshots written");