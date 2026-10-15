// The HTTP contract: one error envelope, no internal detail in production, a
// request id on every response, and a rate limit that actually limits.
//
// These are the guarantees the UI and an operator both rely on, so they are
// tested at the wrapper rather than through each of the nine routes.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  LLM_RATE_LIMIT,
  NotFoundError,
  RateLimitError,
  UpstreamError,
  checkRateLimit,
  ok,
  resetRateLimits,
  route,
} from "@/lib/server/http";
import { ValidationError } from "@/lib/validate";

const req = (headers: Record<string, string> = {}) => new Request("http://localhost/api/x", { headers });

const quiet = { level: process.env.BEACON_LOG_LEVEL, verbose: process.env.BEACON_VERBOSE_ERRORS, env: process.env.NODE_ENV };

// NODE_ENV is declared read-only by the Next type definitions, but these tests
// exist precisely to check the production behaviour, so they set it through a
// mutable view of the same object.
const env = process.env as Record<string, string | undefined>;

beforeEach(() => {
  resetRateLimits();
  // The wrapper logs every request; tests do not need the noise.
  process.env.BEACON_LOG_LEVEL = "error";
});
afterEach(() => {
  process.env.BEACON_LOG_LEVEL = quiet.level ?? "";
  if (quiet.verbose === undefined) delete process.env.BEACON_VERBOSE_ERRORS;
  else process.env.BEACON_VERBOSE_ERRORS = quiet.verbose;
  if (quiet.env === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = quiet.env;
});

test("a success body is returned unchanged, with no-store and a request id", async () => {
  const handler = route("GET /api/x", () => ok({ hello: "world" }));
  const res = await handler(req());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { hello: "world" });
  assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  assert.ok(res.headers.get("x-request-id"));
});

test("an inbound x-request-id is kept, so a client can correlate its own call", async () => {
  const handler = route("GET /api/x", () => ok({}));
  const res = await handler(req({ "x-request-id": "trace-abc" }));
  assert.equal(res.headers.get("x-request-id"), "trace-abc");
});

test("known failures map to their status and a stable code", async () => {
  const cases: [Error, number, string][] = [
    [new ValidationError([{ field: "itemId", message: "must not be empty" }]), 400, "VALIDATION_FAILED"],
    [new NotFoundError("item req-999"), 404, "NOT_FOUND"],
    [new RateLimitError(12), 429, "RATE_LIMITED"],
    [new UpstreamError("openai", "timed out"), 502, "UPSTREAM_UNAVAILABLE"],
  ];
  for (const [err, status, code] of cases) {
    const res = await route("GET /api/x", () => {
      throw err;
    })(req());
    assert.equal(res.status, status);
    const body = await res.json();
    assert.equal(body.code, code);
    assert.equal(typeof body.error, "string");
    assert.ok(body.requestId);
  }
});

test("a validation failure lists the offending fields", async () => {
  const res = await route("POST /api/x", () => {
    throw new ValidationError([
      { field: "mode", message: "must be one of: cleanup, summarize" },
      { field: "raw", message: "expected a string" },
    ]);
  })(req());
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.deepEqual(
    body.details.map((d: { field: string }) => d.field),
    ["mode", "raw"],
  );
});

test("a 429 says how long to wait", async () => {
  const res = await route("GET /api/x", () => {
    throw new RateLimitError(7);
  })(req());
  assert.equal(res.headers.get("retry-after"), "7");
});

test("an unexpected error never leaks its message in production", async () => {
  env.NODE_ENV = "production";
  delete process.env.BEACON_VERBOSE_ERRORS;
  const res = await route("GET /api/x", () => {
    throw new Error("postgres://user:pa55word@db:5432/beacon refused");
  })(req());
  const body = await res.json();
  assert.equal(res.status, 500);
  assert.equal(body.code, "INTERNAL");
  assert.doesNotMatch(body.error, /pa55word|postgres/);
  // The request id is what ties the safe message to the full server log line.
  assert.ok(body.requestId);
});

test("an unexpected error IS shown outside production, where that is the point", async () => {
  env.NODE_ENV = "development";
  const res = await route("GET /api/x", () => {
    throw new Error("kb.json missing");
  })(req());
  assert.match((await res.json()).error, /kb\.json missing/);
});

test("the rate limit counts per route+caller and then rejects", () => {
  const limit = { max: 3, windowMs: 60_000 };
  const key = "POST /api/agent/analyze:203.0.113.9";
  for (let i = 0; i < 3; i++) checkRateLimit(key, limit, 1_000);
  assert.throws(() => checkRateLimit(key, limit, 1_000), RateLimitError);
  // A different caller is unaffected.
  checkRateLimit("POST /api/agent/analyze:198.51.100.2", limit, 1_000);
  // And the window rolls over.
  checkRateLimit(key, limit, 61_001);
});

test("a rate-limited route returns 429 for the same caller", async () => {
  const handler = route("POST /api/agent/analyze", () => ok({}), { limit: { max: 1, windowMs: 60_000 } });
  const caller = req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
  assert.equal((await handler(caller)).status, 200);
  const second = await handler(req({ "x-forwarded-for": "203.0.113.9" }));
  assert.equal(second.status, 429);
  assert.equal((await second.json()).code, "RATE_LIMITED");
});

test("the model-calling limit is a real ceiling, not a placeholder", () => {
  assert.ok(LLM_RATE_LIMIT.max > 0 && LLM_RATE_LIMIT.max <= 60);
  assert.equal(LLM_RATE_LIMIT.windowMs, 60_000);
});
