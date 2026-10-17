import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Runs every smoke script in turn against an already-running server.
 *
 * Sequential on purpose: each script signs in, changes data, and signs in again,
 * so running them concurrently would have them fighting over one session.
 *
 * Start the server first (`npm run build && npm run start`).
 */

const HERE = dirname(fileURLToPath(import.meta.url));

const SUITES = [
  ["products", "smoke-products.mjs"],
  ["stock", "smoke-stock.mjs"],
  ["reports", "smoke-reports.mjs"],
  ["users", "smoke-users.mjs"],
  ["journey", "smoke-journey.mjs"],
  ["a11y", "smoke-a11y.mjs"],
];

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(HERE, file)], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("close", (code) => resolve({ code, out }));
  });
}

const summaries = [];
let failed = 0;

for (const [name, file] of SUITES) {
  process.stdout.write(`\n=== ${name} ===\n`);
  const { code, out } = await run(file);
  process.stdout.write(out);

  const passed = out.match(/(\d+)\/(\d+) passed/);
  summaries.push({
    name,
    ok: code === 0,
    result: passed ? `${passed[1]}/${passed[2]}` : "errored",
  });
  if (code !== 0) failed += 1;
}

process.stdout.write("\n=== summary ===\n");
for (const summary of summaries) {
  process.stdout.write(
    `${summary.ok ? "PASS" : "FAIL"}  ${summary.name.padEnd(10)} ${summary.result}\n`,
  );
}

process.stdout.write(
  `\n${summaries.length - failed}/${summaries.length} suites passed\n`,
);
process.exit(failed > 0 ? 1 : 0);