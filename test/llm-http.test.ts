// Model calls are the only thing Beacon does that leaves the process, so the
// rules about deadlines, retries and what is NOT retried are tested with an
// injected fetch — no network, no provider, deterministic.

import { test } from "node:test";
import assert from "node:assert/strict";
import { LlmError, postJson } from "@/lib/llm/http";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** A fetch that replays a scripted list of responses (or throws them). */
function scripted(steps: (Response | Error)[]) {
  const calls: { url: string; body: unknown }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    return step;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const base = { provider: "openai", url: "https://api.example/v1/chat", body: { model: "m" }, sleepImpl: async () => {} };

test("a successful call returns the parsed body on the first attempt", async () => {
  const { fetchImpl, calls } = scripted([json({ choices: [{ message: { content: "{}" } }] })]);
  const res = await postJson<{ choices: unknown[] }>({ ...base, fetchImpl });
  assert.equal(calls.length, 1);
  assert.equal(res.choices.length, 1);
});

test("a 500 is retried and can still succeed", async () => {
  const { fetchImpl, calls } = scripted([json({ error: "boom" }, 500), json({ ok: true })]);
  const res = await postJson<{ ok: boolean }>({ ...base, fetchImpl, retries: 2 });
  assert.equal(res.ok, true);
  assert.equal(calls.length, 2);
});

test("a 429 is retried, and Retry-After is honoured rather than guessed", async () => {
  const waits: number[] = [];
  const { fetchImpl } = scripted([json({}, 429, { "retry-after": "2" }), json({ ok: true })]);
  const res = await postJson<{ ok: boolean }>({
    ...base,
    fetchImpl,
    retries: 1,
    sleepImpl: async (ms) => void waits.push(ms),
  });
  assert.equal(res.ok, true);
  assert.deepEqual(waits, [2000]);
});

test("a 401 is NOT retried — a bad key costs money twice and never succeeds", async () => {
  const { fetchImpl, calls } = scripted([json({ error: "invalid key" }, 401)]);
  await assert.rejects(
    () => postJson({ ...base, fetchImpl, retries: 3 }),
    (err: unknown) => {
      assert.ok(err instanceof LlmError);
      assert.equal(err.meta.status, 401);
      assert.equal(err.meta.attempts, 1);
      return true;
    },
  );
  assert.equal(calls.length, 1);
});

test("a network failure is retried, then reported as an LlmError", async () => {
  const { fetchImpl, calls } = scripted([new Error("ECONNREFUSED")]);
  await assert.rejects(
    () => postJson({ ...base, fetchImpl, retries: 2 }),
    (err: unknown) => {
      assert.ok(err instanceof LlmError);
      assert.equal(err.meta.attempts, 3);
      assert.equal(err.meta.timedOut, false);
      assert.match(err.message, /ECONNREFUSED/);
      return true;
    },
  );
  assert.equal(calls.length, 3);
});

test("a provider that accepts the connection and goes quiet is aborted, not waited on", async () => {
  // Never resolves until aborted — exactly the hang a timeout exists for.
  const hang = (async (_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })) as unknown as typeof fetch;

  const started = Date.now();
  await assert.rejects(
    () => postJson({ ...base, fetchImpl: hang, timeoutMs: 60, retries: 0 }),
    (err: unknown) => {
      assert.ok(err instanceof LlmError);
      assert.equal(err.meta.timedOut, true);
      assert.match(err.message, /timed out/);
      return true;
    },
  );
  assert.ok(Date.now() - started < 5_000, "the call must not outlive its deadline");
});

test("the overall budget caps retries, so backoff cannot multiply the wait", async () => {
  const { fetchImpl, calls } = scripted([json({}, 503)]);
  await assert.rejects(
    () => postJson({ ...base, fetchImpl, retries: 5, budgetMs: 1, sleepImpl: async () => {} }),
    LlmError,
  );
  // The budget is spent, so no retry is attempted.
  assert.equal(calls.length, 1);
});

test("a 200 that is not JSON is treated as an outage, not as an answer", async () => {
  const notJson = (async () => new Response("<html>gateway</html>", { status: 200 })) as unknown as typeof fetch;
  await assert.rejects(
    () => postJson({ ...base, fetchImpl: notJson, retries: 0 }),
    (err: unknown) => {
      assert.ok(err instanceof LlmError);
      assert.match(err.message, /non-JSON/);
      return true;
    },
  );
});

test("every attempt sends JSON with the provider's headers", async () => {
  let seen: Record<string, string> = {};
  const capture = (async (_url: string, init?: RequestInit) => {
    seen = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    return json({ ok: true });
  }) as unknown as typeof fetch;
  await postJson({ ...base, fetchImpl: capture, headers: { authorization: "Bearer k" } });
  assert.equal(seen["content-type"], "application/json");
  assert.equal(seen.authorization, "Bearer k");
});
