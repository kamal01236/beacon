// Logs are the one place where every value in the system eventually appears, so
// redaction is tested rather than assumed. A connection string in a Postgres
// error message is the realistic case, not a hypothetical one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { redact } from "@/lib/server/log";

test("keys are redacted by field name, at any depth", () => {
  const out = redact({
    ok: "visible",
    apiKey: "sk-abcdef0123456789",
    nested: { DATABASE_URL: "postgres://u:p@h/db", authorization: "Bearer x" },
  }) as Record<string, unknown>;
  assert.equal(out.ok, "visible");
  assert.equal(out.apiKey, "[redacted]");
  const nested = out.nested as Record<string, unknown>;
  assert.equal(nested.DATABASE_URL, "[redacted]");
  assert.equal(nested.authorization, "[redacted]");
});

test("credentials inside a free-text message are redacted too", () => {
  const line = redact("connect failed: postgres://beacon:s3cret@db:5432/beacon refused") as string;
  assert.doesNotMatch(line, /s3cret/);
  assert.match(line, /postgres:\/\/\[redacted\]@db:5432/);
});

test("an API key or bearer token pasted into a field is never logged whole", () => {
  assert.equal(redact("key is sk-ABCDEFGH12345678 ok"), "key is [redacted] ok");
  assert.equal(redact("authorization: Bearer eyJhbGciOiJIUzI1NiJ9"), "authorization: Bearer [redacted]");
});

test("redaction stops at a sane depth and does not dump huge arrays", () => {
  const deep = { a: { b: { c: { d: { e: { secret: "keep-going" } } } } } };
  assert.doesNotThrow(() => redact(deep));
  const long = redact(Array.from({ length: 100 }, (_, i) => i)) as unknown[];
  assert.equal(long.length, 20);
});
