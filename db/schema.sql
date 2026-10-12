-- Beacon prototype schema (PostgreSQL).
--
-- Two kinds of table:
--   BASE SNAPSHOT  — members, items, updates: what we imported from the tracker
--                    (a fixed Jira export for the prototype). Rarely changes.
--   SOURCE OF TRUTH — events: the append-only log of human decisions. The world
--                    every screen renders is  base snapshot + events applied
--                    (lib/world.ts buildWorldFrom), exactly as the browser
--                    prototype layers localStorage events on the seed.
--   AGENT OUTPUT   — agent_runs: one row per run, holding the signals/requests
--                    the agent produced and which detector (rules/LLM) it used.
--
-- Everything is keyed implicitly to one team (multi-team is out of scope for the
-- prototype — see DEPLOYMENT-AND-RUNTIME.md). JSONB is used where the shape maps
-- to an existing TypeScript type so the API can round-trip it unchanged.

CREATE TABLE IF NOT EXISTS members (
  id    TEXT PRIMARY KEY,
  data  JSONB NOT NULL            -- the full Member (members.json shape)
);

CREATE TABLE IF NOT EXISTS items (
  id         TEXT PRIMARY KEY,
  sprint_id  TEXT NOT NULL,
  data       JSONB NOT NULL       -- the full Item (items.json shape), as imported
);
CREATE INDEX IF NOT EXISTS items_sprint_idx ON items (sprint_id);

CREATE TABLE IF NOT EXISTS updates (
  id        TEXT PRIMARY KEY,
  item_id   TEXT NOT NULL,
  sprint_id TEXT NOT NULL,
  data      JSONB NOT NULL        -- the full Update (updates.json shape)
);
CREATE INDEX IF NOT EXISTS updates_item_idx ON updates (item_id);

-- The knowledge base (runbooks) the agent matches against a struggling item to
-- suggest "this has been solved before" and who authored the fix. `data` is the
-- full KbArticle (data/kb.json shape: title, author, tags[], summary, steps[]).
--
-- `embedding` is nullable and JSONB for now so a BARE Postgres seeds without the
-- pgvector extension. Today kbFor() matches by tag overlap; Phase 3 fills this
-- column (text-embedding-3-small / nomic-embed-text) and semantic match replaces
-- the overlap. To upgrade in Phase 3: `CREATE EXTENSION vector;` then
-- `ALTER TABLE knowledge_base ALTER COLUMN embedding TYPE vector(1536)
--  USING embedding::text::vector;` — no row reload needed.
CREATE TABLE IF NOT EXISTS knowledge_base (
  id        TEXT PRIMARY KEY,
  author    TEXT NOT NULL,        -- member id who wrote the runbook (the SME)
  data      JSONB NOT NULL,       -- the full KbArticle (kb.json shape)
  embedding JSONB                 -- NULL until Phase 3; becomes vector(1536)
);
CREATE INDEX IF NOT EXISTS kb_author_idx ON knowledge_base (author);

-- The append-only human-decision log. `at` and `actor` are promoted to columns
-- for ordering and filtering; the rest of each BeaconEvent lives in payload.
CREATE TABLE IF NOT EXISTS events (
  id       TEXT PRIMARY KEY,
  at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor    TEXT NOT NULL,
  kind     TEXT NOT NULL,
  payload  JSONB NOT NULL         -- the full BeaconEvent (lib/events.ts union)
);
CREATE INDEX IF NOT EXISTS events_at_idx ON events (at);

-- One row per agent run (scheduled | event | manual). Signals/requests are stored
-- as a snapshot so the UI can show "what the last run found" without recomputing,
-- and so we can compare the rule detector against the LLM over time.
CREATE TABLE IF NOT EXISTS agent_runs (
  id          BIGSERIAL PRIMARY KEY,
  ran_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  trigger     TEXT NOT NULL,       -- schedule | event | manual
  detector    TEXT NOT NULL,       -- rules | llm | both
  provider    TEXT,                -- openai | ollama | null
  model       TEXT,
  items_scanned INT NOT NULL,
  signals_open  INT NOT NULL,
  summary     JSONB NOT NULL       -- { run, signals, requests } for the UI
);
