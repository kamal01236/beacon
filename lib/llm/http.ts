// Every model call goes through here.
//
// A provider call is the one piece of Beacon that reaches outside the process,
// so it is the one piece that must never be able to hang the request that made
// it. `postJson` gives all provider calls the same three properties:
//
//   • a deadline      an AbortController per attempt AND an overall budget, so
//                     a provider that accepts the connection and then goes
//                     quiet cannot hold a stand-up update open forever
//   • bounded retries a transient failure (network, 429, 5xx, 408) is retried
//                     with exponential backoff and jitter; a 4xx that means
//                     "your request is wrong" (401, 403, 404, 422) is not,
//                     because retrying it just spends money twice
//   • one error type  LlmError, carrying status/attempts/whether it timed out,
//                     so the caller can log precisely and fall back
//
// Falling back is the caller's job and already exists: lib/llm/index.ts returns
// the rule detector's verdict, and lib/server/agent.ts the rule template, so a
// provider outage degrades Beacon rather than breaking it.

export class LlmError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly meta: { status?: number; attempts: number; timedOut: boolean; elapsedMs: number },
  ) {
    super(message);
    this.name = "LlmError";
  }
}

const num = (raw: string | undefined, fallback: number, min: number, max: number): number => {
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

/** Per-attempt timeout. One stand-up update must not wait longer than this. */
export const timeoutMs = (): number => num(process.env.BEACON_LLM_TIMEOUT_MS, 20_000, 1_000, 120_000);
/** Retries AFTER the first attempt. */
export const maxRetries = (): number => num(process.env.BEACON_LLM_RETRIES, 2, 0, 5);
/** Ceiling across all attempts, so retries cannot multiply the wait. */
export const budgetMs = (): number => num(process.env.BEACON_LLM_BUDGET_MS, 45_000, 1_000, 300_000);

/** 4xx statuses where the request itself is the problem — retrying cannot help. */
const PERMANENT = new Set([400, 401, 403, 404, 405, 413, 422]);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Exponential backoff with full jitter, honouring Retry-After when given. */
function backoffMs(attempt: number, retryAfter: string | null): number {
  const header = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(header) && header >= 0) return Math.min(header * 1000, 10_000);
  const base = Math.min(500 * 2 ** attempt, 8_000);
  return Math.round(base * (0.5 + Math.random() / 2));
}

export interface PostJsonOptions {
  /** Provider name, for the error message and the log. */
  provider: string;
  url: string;
  body: unknown;
  headers?: Record<string, string>;
  /** Overrides for tests; defaults come from the environment. */
  timeoutMs?: number;
  retries?: number;
  budgetMs?: number;
  /** Injected in tests so this module can be exercised without a network. */
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}

/**
 * POST JSON and parse the JSON response, with a deadline and bounded retries.
 * Throws `LlmError` on every failure path — including a body that is not JSON,
 * which for a model endpoint means the same thing as an outage.
 */
export async function postJson<T>(options: PostJsonOptions): Promise<T> {
  const {
    provider,
    url,
    body,
    headers = {},
    timeoutMs: perAttempt = timeoutMs(),
    retries = maxRetries(),
    budgetMs: budget = budgetMs(),
    fetchImpl = fetch,
    sleepImpl = sleep,
  } = options;

  const started = Date.now();
  const elapsed = () => Date.now() - started;
  let attempts = 0;
  let last: { status?: number; message: string; timedOut: boolean } = { message: "no attempt made", timedOut: false };

  while (attempts <= retries) {
    attempts++;
    const controller = new AbortController();
    // Never let one attempt run past what is left of the overall budget.
    const slice = Math.max(1, Math.min(perAttempt, budget - elapsed()));
    const timer = setTimeout(() => controller.abort(), slice);
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 500);
        last = { status: res.status, message: `${provider} ${res.status}: ${detail}`, timedOut: false };
        if (PERMANENT.has(res.status)) break;
        const wait = backoffMs(attempts, res.headers.get("retry-after"));
        if (attempts > retries || elapsed() + wait >= budget) break;
        await sleepImpl(wait);
        continue;
      }

      try {
        return (await res.json()) as T;
      } catch {
        // A 200 that is not JSON is a broken provider, not a usable answer.
        last = { status: res.status, message: `${provider} returned a non-JSON body`, timedOut: false };
        break;
      }
    } catch (err) {
      const aborted = err instanceof Error && (err.name === "AbortError" || /abort/i.test(err.message));
      last = {
        message: aborted ? `${provider} timed out after ${slice}ms` : `${provider} request failed: ${err instanceof Error ? err.message : String(err)}`,
        timedOut: aborted,
      };
      const wait = backoffMs(attempts, null);
      if (attempts > retries || elapsed() + wait >= budget) break;
      await sleepImpl(wait);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new LlmError(provider, last.message, {
    status: last.status,
    attempts,
    timedOut: last.timedOut,
    elapsedMs: elapsed(),
  });
}
