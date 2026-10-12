// Load the base snapshot (the fixed "Jira export" for the prototype) into
// Postgres: members, items, updates from /data/*.json. Idempotent — safe to
// re-run; it upserts the snapshot and never touches the events log.
//
//   node scripts/seed-db.mjs            # create schema + load snapshot
//   node scripts/seed-db.mjs --reset    # also TRUNCATE events (fresh decisions)
//
// Reads DATABASE_URL from .env.local (see .env.example).

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const json = async (name) => JSON.parse(await readFile(join(root, "data", name), "utf8"));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local and set it (see BACKEND-PLAN.md §7).");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const reset = process.argv.includes("--reset");

try {
  const schema = await readFile(join(root, "db", "schema.sql"), "utf8");
  await pool.query(schema);
  console.log("✓ schema ready");

  const [members, items, updates, kb] = await Promise.all([
    json("members.json"),
    json("items.json"),
    json("updates.json"),
    json("kb.json"),
  ]);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const m of members) {
      await client.query("INSERT INTO members (id, data) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data", [m.id, m]);
    }
    for (const it of items) {
      await client.query(
        "INSERT INTO items (id, sprint_id, data) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET sprint_id = EXCLUDED.sprint_id, data = EXCLUDED.data",
        [it.id, it.sprintId, it],
      );
    }
    for (const u of updates) {
      await client.query(
        "INSERT INTO updates (id, item_id, sprint_id, data) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data",
        [u.id, u.itemId, u.sprintId, u],
      );
    }
    for (const a of kb) {
      // embedding stays NULL here — Phase 3 fills it (see db/schema.sql).
      await client.query(
        "INSERT INTO knowledge_base (id, author, data) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET author = EXCLUDED.author, data = EXCLUDED.data",
        [a.id, a.author, a],
      );
    }
    if (reset) {
      await client.query("TRUNCATE events");
      console.log("✓ events truncated (--reset)");
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  console.log(`✓ seeded ${members.length} members, ${items.length} items, ${updates.length} updates, ${kb.length} runbooks`);
} finally {
  await pool.end();
}
