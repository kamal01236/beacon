// The API boundary: what it accepts, what it rejects, and what it says when it
// rejects. These are contract tests — a client reads `details` to know which
// field to fix, so the shape of a 400 is part of the API.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MAX_BODY_BYTES,
  PayloadTooLargeError,
  ValidationError,
  arrayOf,
  int,
  nullable,
  object,
  oneOf,
  optional,
  parseBody,
  query,
  str,
  text,
} from "@/lib/validate";

const post = (body: unknown, url = "http://localhost/api/x") =>
  new Request(url, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

test("str: trims, enforces bounds and pattern", () => {
  assert.equal(str()("  hello  ", "f"), "hello");
  assert.throws(() => str()("   ", "f"), ValidationError);
  assert.throws(() => str({ max: 3 })("hello", "f"), ValidationError);
  assert.throws(() => str({ pattern: /^[a-z]+$/ })("REQ-1", "f"), ValidationError);
  assert.throws(() => str()(42, "f"), ValidationError);
});

test("text: allows empty but still bounds length", () => {
  assert.equal(text()("", "f"), "");
  assert.throws(() => text(5)("too long here", "f"), ValidationError);
});

test("int: coerces numeric strings, floors, enforces range", () => {
  assert.equal(int()("7", "f"), 7);
  assert.equal(int()(7.9, "f"), 7);
  assert.throws(() => int({ min: 1 })(0, "f"), ValidationError);
  assert.throws(() => int({ max: 10 })(11, "f"), ValidationError);
  assert.throws(() => int()("abc", "f"), ValidationError);
});

test("oneOf: rejects a value outside the set and names the set", () => {
  const v = oneOf(["cleanup", "summarize"] as const);
  assert.equal(v("cleanup", "mode"), "cleanup");
  try {
    v("delete", "mode");
    assert.fail("expected a ValidationError");
  } catch (err) {
    assert.ok(err instanceof ValidationError);
    assert.match(err.details[0].message, /cleanup, summarize/);
    assert.equal(err.details[0].field, "mode");
  }
});

test("optional falls back; nullable keeps null meaningful", () => {
  assert.equal(optional(int(), 5)(undefined, "f"), 5);
  assert.equal(optional(int(), 5)("", "f"), 5);
  assert.equal(nullable(str())(null, "f"), null);
  assert.equal(nullable(str())("x", "f"), "x");
});

test("arrayOf: element errors are reported with an index", () => {
  assert.deepEqual(arrayOf(int())([1, "2"], "xs"), [1, 2]);
  try {
    arrayOf(int())([1, "nope"], "xs");
    assert.fail("expected a ValidationError");
  } catch (err) {
    assert.ok(err instanceof ValidationError);
    assert.equal(err.details[0].field, "xs[1]");
  }
});

test("object: reports EVERY bad field in one response, and drops unknown keys", () => {
  const V = object<{ a: string; b: number }>({ a: str(), b: int({ min: 0 }) });
  try {
    V({ a: "", b: -1, sneaky: true }, "");
    assert.fail("expected a ValidationError");
  } catch (err) {
    assert.ok(err instanceof ValidationError);
    assert.deepEqual(
      err.details.map((d) => d.field),
      ["a", "b"],
    );
  }
  assert.deepEqual(V({ a: "x", b: 1, sneaky: true }, ""), { a: "x", b: 1 });
});

test("parseBody: an empty body is {} so all-optional routes can be POSTed bare", async () => {
  const V = object<{ trigger: string }>({ trigger: optional(oneOf(["manual", "event"] as const), "manual") });
  assert.deepEqual(await parseBody(new Request("http://x/", { method: "POST" }), V), { trigger: "manual" });
});

test("parseBody: malformed JSON is a field-level 400, not a crash", async () => {
  const V = object<{ a: string }>({ a: str() });
  await assert.rejects(() => parseBody(post("{not json"), V), (err: unknown) => {
    assert.ok(err instanceof ValidationError);
    assert.equal(err.details[0].field, "body");
    return true;
  });
});

test("parseBody: size is measured on the decoded body, not content-length", async () => {
  const V = object<{ a: string }>({ a: text(1_000_000) });
  const big = { a: "x".repeat(DEFAULT_MAX_BODY_BYTES + 10) };
  await assert.rejects(() => parseBody(post(big), V), PayloadTooLargeError);
  // A multi-byte character counts for its encoded size, so the limit cannot be
  // walked past with non-ASCII text.
  const multibyte = { a: "é".repeat(40) };
  await assert.rejects(() => parseBody(post(multibyte), V, 50), PayloadTooLargeError);
});

test("query: validates a search param like any other field", () => {
  const req = new Request("http://x/api/data/retention?days=30");
  assert.equal(query(req, "days", int({ min: 1, max: 3650 })), 30);
  assert.equal(query(new Request("http://x/api/y"), "days", optional(int(), 180)), 180);
  assert.throws(() => query(new Request("http://x/?days=99999"), "days", int({ max: 3650 })), ValidationError);
});
