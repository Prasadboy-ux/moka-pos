import { spawn, spawnSync, execFile } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { connect } from "node:net";

/**
 * Runs the browser smoke suite against a freshly started stack.
 *
 * The suite itself (`smoke-all.mjs`) expects MongoDB, the API and the built
 * frontend to be listening already. Locally that was three terminals plus a
 * seed; in CI it would be the same thing written in YAML. This script keeps
 * the sequence in one place and, more importantly, owns the teardown: a failed
 * suite must not leave a mongod or a Next server behind.
 *
 * Both projects must be built first (`npm run build` in backend and frontend).
 * `API_PROXY_TARGET` is only read by `next.config.ts` at build time, so this
 * script checks it is set rather than pretending a runtime default is enough.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, "..");
const BACKEND = resolve(FRONTEND, "..", "backend");
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const IS_WINDOWS = process.platform === "win32";

const BACKEND_URL = "http://127.0.0.1:3001";
const FRONTEND_URL = "http://127.0.0.1:3000";

/**
 * Pin the mongod cache instead of letting mongodb-memory-server infer it.
 * `INIT_CWD` is the frontend directory here (the script is launched by an npm
 * script in `frontend`), so the library's "nearest node_modules" probe lands in
 * the frontend and falls back to the home cache. The e2e job caches that same
 * home path, so use it explicitly and both jobs share one download.
 */
const MONGO_DOWNLOAD_DIR = join(homedir(), ".cache", "mongodb-binaries");

/** @type {import("node:child_process").ChildProcess[]} */
const children = [];

function log(message) {
  process.stdout.write(`[smoke-ci] ${message}\n`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: process.env,
    ...options,
  });

  children.push(child);
  return child;
}

function tcpOpen(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(1000);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function requireFreePort(port, label) {
  if (await tcpOpen(port)) {
    throw new Error(
      `${label} port ${port} is already in use. Stop the running server before ` +
        "`npm run smoke:ci`; this script starts and stops its own stack.",
    );
  }
}

async function waitForPort(port, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await tcpOpen(port)) return;
    await delay(500);
  }

  throw new Error(`${label} did not listen on port ${port} within ${timeoutMs / 1000}s.`);
}

async function waitForHttp(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastFailure = "no response";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastFailure = `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }

  throw new Error(`${label} did not answer ${url} within ${timeoutMs / 1000}s (${lastFailure}).`);
}

/**
 * The local Mongo helper may bind a different port when 27019 is taken, and it
 * writes the real URI to `.mongo-uri` and `backend/.env`. Reading the file back
 * is the only way to know where this run actually listens.
 */
async function startMongo() {
  const uriFile = join(BACKEND, ".mongo-uri");
  rmSync(uriFile, { force: true });

  start(process.execPath, ["scripts/local-mongo.mjs"], {
    cwd: BACKEND,
    env: { ...process.env, MONGOMS_DOWNLOAD_DIR: MONGO_DOWNLOAD_DIR },
  });
  log("mongo starting (a cold cache downloads mongod first)");

  // A cold CI cache can spend several minutes downloading a mongod archive
  // before the replica set reports a URI, so this budget is much larger than
  // the start timeout used once the binary is cached.
  const deadline = Date.now() + 600_000;

  while (Date.now() < deadline) {
    if (existsSync(uriFile)) {
      const match = readFileSync(uriFile, "utf8").match(/:(\d+)\//);
      if (match) {
        const port = Number(match[1]);
        await waitForPort(port, 30_000, "MongoDB");
        log(`mongo ready on ${port}`);
        return port;
      }
    }
    await delay(500);
  }

  throw new Error("MongoDB did not publish its URI within 600s.");
}

function runSeed() {
  log("seeding");
  const result = spawnSync(NPM, ["run", "seed"], {
    cwd: BACKEND,
    env: process.env,
    stdio: "inherit",
    shell: IS_WINDOWS,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Seed exited with code ${result.status ?? "unknown"}.`);
  }
}

function startBackend() {
  if (!existsSync(join(BACKEND, "dist", "server.js"))) {
    throw new Error("backend/dist/server.js is missing. Run `npm run build` in backend first.");
  }

  // Smoke fixtures sign in with seeded admin accounts. Without this override
  // the API forces them through first-time MFA enrolment and every suite stops
  // at the login screen. The dedicated MFA suite turns enforcement back on.
  start(process.execPath, ["dist/server.js"], {
    cwd: BACKEND,
    env: {
      ...process.env,
      MFA_ENFORCE_ADMIN: process.env.MFA_ENFORCE_ADMIN ?? "false",
    },
  });
  log("api starting");
}

function startFrontend() {
  if (!existsSync(join(FRONTEND, ".next", "BUILD_ID"))) {
    throw new Error("frontend/.next/BUILD_ID is missing. Run `npm run build` in frontend first.");
  }

  // `next start` is started as a node script rather than through npm so the
  // teardown can signal the actual server process, not a shell that may leave
  // a grandchild listening on 3000.
  const require = createRequire(join(FRONTEND, "package.json"));
  const nextBin = require.resolve("next/dist/bin/next");

  start(process.execPath, [nextBin, "start"], {
    cwd: FRONTEND,
    env: {
      ...process.env,
      API_PROXY_TARGET: process.env.API_PROXY_TARGET ?? "http://localhost:3001",
    },
  });
  log("web starting");
}

async function runSmoke() {
  log("running smoke suites");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(HERE, "smoke-all.mjs")], {
      cwd: FRONTEND,
      env: process.env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Smoke suite exited with ${code ?? signal}.`));
    });
  });
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;

  if (IS_WINDOWS) {
    try {
      await promisify(execFile)("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    } catch {
      // Already gone between the check and taskkill.
    }
    return;
  }

  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  if (child.exitCode === null) child.kill("SIGKILL");
}

async function main() {
  if (!process.env.API_PROXY_TARGET) {
    log("API_PROXY_TARGET is unset; the frontend build must have baked in a rewrite target");
  }

  await requireFreePort(3000, "frontend");
  await requireFreePort(3001, "backend");

  await startMongo();
  runSeed();
  startBackend();
  await waitForHttp(`${BACKEND_URL}/api/health`, 60_000, "API");

  startFrontend();
  await waitForHttp(`${FRONTEND_URL}/login`, 120_000, "Frontend");

  await runSmoke();
  log("all suites passed");
}

try {
  await main();
} catch (error) {
  process.exitCode = 1;
  console.error(`[smoke-ci] ${error instanceof Error ? error.message : String(error)}`);
} finally {
  for (const child of children.reverse()) await stop(child);
  log("stack stopped");
}
