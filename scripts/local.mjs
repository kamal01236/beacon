// One-command local deploy for WSL/localhost.
//
//   node scripts/local.mjs            # DB + build + server + agent, free port
//   node scripts/local.mjs --dev      # next dev (hot reload) instead of build+start
//   node scripts/local.mjs --port 4000
//   node scripts/local.mjs --no-agent # app only, skip the agent worker
//   node scripts/local.mjs --no-db    # no Postgres: faked Jira + .data/ file store
//
// It:
//   1. ensures .env.local exists (copied from .env.example) — your keys live
//      ONLY there, and .env.local is gitignored. Nothing here writes a tracked file.
//   2. picks a free port: BEACON_PORT if set & free, else the first free port
//      from 3000 up. Fully configurable.
//   3. makes sure Postgres is reachable (starts a docker container if one is
//      available and nothing answers), then seeds the base snapshot. If Postgres
//      is unreachable and Docker is not installed — or with --no-db — it falls
//      back to the NO-DATABASE mode the server itself supports (base snapshot
//      from the faked Jira, event + run logs under .data/), instead of failing.
//   4. builds + starts the Next server (backend API + UI) and the agent worker,
//      prints every URL you need, and shuts both down cleanly on Ctrl-C.

import { spawn, execSync } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, copyFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const DEV = has("--dev");
const NO_AGENT = has("--no-agent");
const NO_DB = has("--no-db");
const children = [];
let shuttingDown = false;

const log = (m) => console.log(`\x1b[36m[local]\x1b[0m ${m}`);
const warn = (m) => console.log(`\x1b[33m[local]\x1b[0m ${m}`);
const die = (m) => { console.error(`\x1b[31m[local] ${m}\x1b[0m`); process.exit(1); };
const sh = (cmd) => { try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" }).trim(); } catch { return null; } };

// ---- 1. env bootstrap (secrets stay in .env.local) ------------------------
const envLocal = join(root, ".env.local");
if (!existsSync(envLocal)) {
  copyFileSync(join(root, ".env.example"), envLocal);
  warn(".env.local created from the template. Add your OPENAI_API_KEY there if you want the LLM detector (rules work without it). It is gitignored.");
}
// override:true so values in .env.local win over any stale same-named variable
// already in the machine/user environment (e.g. an old OPENAI_API_KEY). The
// spawned server + agent inherit this corrected process.env.
dotenv.config({ path: envLocal, override: true });

// ---- 2. port selection ----------------------------------------------------
const portFree = (p) =>
  new Promise((res) => {
    const s = createServer();
    s.once("error", () => res(false));
    s.once("listening", () => s.close(() => res(true)));
    s.listen(p, "0.0.0.0");
  });

async function choosePort() {
  const want = Number(argVal("--port") || process.env.BEACON_PORT || 0);
  if (want) {
    if (await portFree(want)) return want;
    warn(`port ${want} is in use — picking the next free one.`);
  }
  for (let p = 3000; p < 3100; p++) if (await portFree(p)) return p;
  die("no free port found in 3000-3099.");
}

// ---- 3. Postgres ----------------------------------------------------------
async function pgReachable() {
  if (!process.env.DATABASE_URL) return false;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 1500 });
  try { await pool.query("SELECT 1"); return true; } catch { return false; } finally { await pool.end().catch(() => {}); }
}

// Returns true if a Postgres is ready to use, false to run in no-database mode.
// It never exits the process: the server supports both backends (lib/server/
// store.ts), so an unreachable DB with no Docker is a fallback, not an error.
async function ensurePostgres() {
  if (await pgReachable()) { log("Postgres: reachable."); return true; }
  const hasDocker = !!sh("docker --version");
  if (!hasDocker) {
    warn(
      "Postgres is not reachable and Docker is not installed — running in NO-DATABASE mode\n" +
        "  (base snapshot from the faked Jira, event + run logs under .data/).\n" +
        "  To use Postgres instead: start it and set DATABASE_URL in .env.local\n" +
        "  (WSL: sudo service postgresql start), or install Docker and re-run — see BACKEND-PLAN.md §7.",
    );
    return false;
  }
  log("Postgres not answering — starting a docker container 'beacon-db'…");
  const exists = sh('docker ps -a --filter name=^/beacon-db$ --format "{{.Names}}"');
  if (exists === "beacon-db") sh("docker start beacon-db");
  else sh("docker run --name beacon-db -e POSTGRES_PASSWORD=beacon -e POSTGRES_DB=beacon -p 5432:5432 -d postgres:16");
  for (let i = 0; i < 30; i++) {
    if (await pgReachable()) { log("Postgres: up."); return true; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  warn("started the container but Postgres never became reachable — falling back to NO-DATABASE mode. Check `docker logs beacon-db`.");
  return false;
}

// ---- process helpers ------------------------------------------------------
function run(name, cmd, cmdArgs, env) {
  const child = spawn(cmd, cmdArgs, { cwd: root, env: { ...process.env, ...env }, shell: true });
  const tag = `\x1b[35m[${name}]\x1b[0m `;
  const pipe = (stream) => stream.on("data", (d) => process.stdout.write(d.toString().replace(/^/gm, tag)));
  pipe(child.stdout); pipe(child.stderr);
  child.on("exit", (code) => { if (!shuttingDown) warn(`${name} exited (${code}).`); });
  children.push(child);
  return child;
}

function waitForHttp(url, tries = 60) {
  return new Promise((resolve, reject) => {
    const tick = async (n) => {
      try { const r = await fetch(url); if (r.ok || r.status === 404) return resolve(); } catch {}
      if (n <= 0) return reject(new Error(`timed out waiting for ${url}`));
      setTimeout(() => tick(n - 1), 1000);
    };
    tick(tries);
  });
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log("shutting down…");
  for (const c of children) c.kill("SIGTERM");
  setTimeout(() => process.exit(0), 800);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ---- main -----------------------------------------------------------------
(async () => {
  const port = await choosePort();
  const useDb = NO_DB ? false : await ensurePostgres();

  if (useDb) {
    log("seeding the base snapshot (/data → Postgres)…");
    const seed = run("seed", "npm", ["run", "db:seed"]);
    await new Promise((res) => seed.on("exit", res));
  } else {
    // No-database mode: make sure the child processes don't try a dead DB —
    // store.ts reads the faked Jira and writes the event/run logs to .data/.
    if (NO_DB) log("no-database mode (--no-db): faked Jira + .data/ file store.");
    delete process.env.DATABASE_URL;
  }

  if (!DEV) {
    log("building the server app (this includes the /api backend)…");
    const build = run("build", "npm", ["run", "build"]);
    const code = await new Promise((res) => build.on("exit", res));
    if (code !== 0) die("build failed — see the [build] output above.");
  }

  const base = `http://localhost:${port}`;
  log(`starting the ${DEV ? "dev" : "production"} server on ${base} …`);
  run("server", "npx", DEV ? ["next", "dev", "-p", String(port)] : ["next", "start", "-p", String(port)], { PORT: String(port) });

  await waitForHttp(base).catch((e) => die(e.message));

  if (!NO_AGENT) {
    log("starting the agent worker…");
    run("agent", "node", ["agent/run.mjs"], { BEACON_URL: base });
  }

  const llm = process.env.OPENAI_API_KEY ? "OpenAI" : (process.env.BEACON_LLM_PROVIDER === "ollama" ? "Ollama (local)" : "rules only (no LLM key set)");
  const store = useDb ? "Postgres" : "no-DB (faked Jira + .data/)";
  console.log(
    `\n\x1b[32m━━ Beacon is running ━━\x1b[0m\n` +
      `  App / UI        ${base}\n` +
      `  World API       ${base}/api/world\n` +
      `  Base snapshot   ${base}/api/base\n` +
      `  Faked Jira      ${base}/api/jira/search    (the raw ingest payload)\n` +
      `  Events API      ${base}/api/events        (POST { draft, actor })\n` +
      `  Agent run       ${base}/api/agent/run      (POST { trigger })\n` +
      `  Store           ${store}\n` +
      `  Detector        ${llm}\n` +
      `  Agent worker    ${NO_AGENT ? "off (--no-agent)" : `on, every ${process.env.BEACON_AGENT_INTERVAL_MINS || 60} min`}\n` +
      `\n  Ctrl-C to stop everything.\n`,
  );
})().catch((e) => die(e.stack || String(e)));
