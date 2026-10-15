// GET /api/health — liveness and readiness in one place.
//
// What a platform needs to decide whether to send traffic here, and what an
// operator needs to see first during an incident (docs/OPERATIONS.md):
//
//   status    "ok"       everything the request path needs is working
//             "degraded" serving, but on a fallback: a database was configured
//                        and is unreachable, so decisions are going to .data/
//             "error"    the store could not be read at all — do not send traffic
//   store     which backend is live, and why the probe failed if it did
//   detector  which detector and model a run would use right now; whether a
//             provider is configured at all (rules-only is a valid state, not
//             a fault — Beacon is designed to work with no model available)
//
// It never reports the key itself, only whether one is present.
//
// `?deep=1` additionally reads the world, which exercises the store and the
// reducer end to end. The plain form stays cheap enough for a 10-second probe.

import { ok, route } from "@/lib/server/http";
import { loadWorld, storeHealth } from "@/lib/server/store";
import { loadConfig } from "@/lib/config";
import { VERSION } from "@/lib/version";
import { query, optional, oneOf } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const startedAt = Date.now();

export const GET = route("GET /api/health", async ({ req }) => {
  const deep = query(req, "deep", optional(oneOf(["0", "1", "true", "false"] as const), "0"));
  const cfg = loadConfig();
  const store = await storeHealth();

  let world: { items: number; updates: number; events: number } | null = null;
  let worldError: string | null = null;
  if (deep === "1" || deep === "true") {
    try {
      const w = await loadWorld();
      world = { items: w.items.length, updates: w.updates.length, events: w.events.length };
    } catch (err) {
      worldError = err instanceof Error ? err.message : String(err);
    }
  }

  const status = worldError ? "error" : store.databaseUrlSet && store.backend === "file" ? "degraded" : "ok";

  return ok(
    {
      status,
      version: VERSION,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      store,
      detector: {
        mode: cfg.detector,
        provider: cfg.provider,
        model: cfg.provider === "openai" ? cfg.openai.model : cfg.provider === "ollama" ? cfg.ollama.model : null,
        /** A model is optional by design; false means runs use the rule detector. */
        providerConfigured: cfg.provider !== "none",
        compose: cfg.compose,
      },
      agent: { intervalMins: cfg.intervalMins, quietHours: cfg.quietHours || null, activeSprintId: cfg.activeSprintId },
      world,
      worldError,
    },
    // A degraded store still serves; an unreadable one must fail the probe.
    status === "error" ? 503 : 200,
  );
});
