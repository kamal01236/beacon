// The HTTP contract every /api route shares.
//
// Before this existed each route repeated its own try/catch and returned
// whatever `String(err)` produced — so a connection string or a stack trace
// could end up in a response body, and no two routes failed the same way.
// `route()` makes that one decision in one place:
//
//   • one error envelope      { error, code, requestId } on every failure
//   • no internal detail      a 500 returns a generic message and logs the real
//                             one against the requestId (unless
//                             BEACON_VERBOSE_ERRORS=true, which local runs set)
//   • a request id            returned as x-request-id and in the body, so a
//                             report ("it failed at 10:04") maps to a log line
//   • one access log line     method, route, status, duration, outcome
//   • no caching              API responses are per-request state
//   • a spend/abuse ceiling   the model-calling routes are rate limited
//
// Success bodies are returned UNCHANGED, so the browser helpers that read them
// (lib/events.ts, lib/analyze.ts, lib/summarize.ts, components/*) are
// unaffected — and `error` stays a plain human-readable string for that reason.
//
// SERVER ONLY.

import { NextResponse } from "next/server";
import { PayloadTooLargeError, ValidationError } from "../validate";
import { log } from "./log";

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

/** A dependency we call (a model provider, Postgres) failed or timed out. */
export class UpstreamError extends Error {
  constructor(
    readonly upstream: string,
    message: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export class RateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("too many requests");
    this.name = "RateLimitError";
  }
}

// ---- rate limiting ---------------------------------------------------------
//
// A fixed-window counter in process memory. This is the simplest thing that
// bounds model spend and accidental loops on a single-process deployment, and
// it is honest about its limit: it does NOT hold across replicas or restarts.
// A multi-replica pilot needs a shared counter (Redis); that is phase 4, listed
// in docs/PRODUCTION-READINESS.md rather than implied here.

interface Window {
  count: number;
  resetAt: number;
}
const windows = new Map<string, Window>();

export interface RateLimit {
  /** Requests allowed per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/** Model-calling routes: enough for a demo or a working session, not a loop. */
export const LLM_RATE_LIMIT: RateLimit = { max: 30, windowMs: 60_000 };
/** Write routes: generous for a team, still bounded. */
export const WRITE_RATE_LIMIT: RateLimit = { max: 120, windowMs: 60_000 };

export function checkRateLimit(key: string, limit: RateLimit, now = Date.now()): void {
  const w = windows.get(key);
  if (!w || now >= w.resetAt) {
    windows.set(key, { count: 1, resetAt: now + limit.windowMs });
    return;
  }
  w.count++;
  if (w.count > limit.max) throw new RateLimitError(Math.max(1, Math.ceil((w.resetAt - now) / 1000)));
}

/** Drop expired windows so a long-lived process does not grow a key per caller. */
function sweepWindows(now = Date.now()): void {
  if (windows.size < 1_000) return;
  for (const [k, w] of windows) if (now >= w.resetAt) windows.delete(k);
}

/** Test seam: forget every counted window. */
export function resetRateLimits(): void {
  windows.clear();
}

/**
 * Who the limit counts against. There is no authentication yet (phase 4), so
 * this is the proxy-forwarded client address — good enough to stop a runaway
 * client, and explicitly not an identity.
 */
function callerKey(req: Request | undefined, name: string): string {
  const h = req?.headers;
  const ip = h?.get("x-forwarded-for")?.split(",")[0]?.trim() || h?.get("x-real-ip")?.trim() || "local";
  return `${name}:${ip}`;
}

// ---- responses -------------------------------------------------------------

const noStore = { "cache-control": "no-store, max-age=0" };

/** A success response. The body is exactly `data` — no envelope. */
export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: noStore });
}

export interface ApiErrorBody {
  /** Human-readable, safe to show in the UI. */
  error: string;
  /** Stable machine code — what a client should branch on. */
  code: string;
  /** Correlates this response with the server log line that explains it. */
  requestId: string;
  /** Field-level reasons, present on a validation failure. */
  details?: { field: string; message: string }[];
}

function errorResponse(status: number, body: ApiErrorBody, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...noStore, ...headers, "x-request-id": body.requestId } });
}

const verboseErrors = (): boolean =>
  /^(1|true|yes|on)$/i.test(process.env.BEACON_VERBOSE_ERRORS ?? "") || process.env.NODE_ENV !== "production";

interface Mapped {
  status: number;
  code: string;
  message: string;
  details?: { field: string; message: string }[];
  headers?: Record<string, string>;
  /** Expected failures are logged at warn; anything unmapped is a real error. */
  level: "warn" | "error";
}

function mapError(err: unknown): Mapped {
  if (err instanceof ValidationError)
    return { status: 400, code: "VALIDATION_FAILED", message: err.message, details: err.details, level: "warn" };
  if (err instanceof PayloadTooLargeError)
    return { status: 413, code: "PAYLOAD_TOO_LARGE", message: err.message, level: "warn" };
  if (err instanceof NotFoundError) return { status: 404, code: "NOT_FOUND", message: err.message, level: "warn" };
  if (err instanceof RateLimitError)
    return {
      status: 429,
      code: "RATE_LIMITED",
      message: "Too many requests — try again shortly.",
      headers: { "retry-after": String(err.retryAfterSeconds) },
      level: "warn",
    };
  if (err instanceof UpstreamError)
    return { status: 502, code: "UPSTREAM_UNAVAILABLE", message: `${err.upstream} is unavailable.`, level: "warn" };
  return {
    status: 500,
    code: "INTERNAL",
    // The real message is logged against the request id, not returned — unless
    // this is a local/dev run, where seeing it immediately is the point.
    message: verboseErrors()
      ? `Internal error: ${err instanceof Error ? err.message : String(err)}`
      : "Something went wrong. Quote the requestId if you report this.",
    level: "error",
  };
}

// ---- the wrapper -----------------------------------------------------------

export interface Ctx {
  req: Request;
  requestId: string;
  route: string;
}

export interface RouteOptions {
  /** Apply a rate limit to this route (model-calling and write routes do). */
  limit?: RateLimit;
}

/**
 * Wrap one route handler. Next calls the export with (request, context); the
 * handler receives a `Ctx` carrying the request and its id.
 *
 *   export const POST = route(
 *     "POST /api/agent/analyze",
 *     async ({ req }) => ok(await analyzeDraft(...)),
 *     { limit: LLM_RATE_LIMIT },
 *   );
 */
export function route(
  name: string,
  handler: (ctx: Ctx) => Promise<NextResponse> | NextResponse,
  options: RouteOptions = {},
) {
  // Typed as a required Request because that is what Next's generated route
  // types demand; tolerant of a missing one at runtime so a direct call in a
  // test does not have to invent a URL for a handler that ignores it.
  return async (req: Request): Promise<NextResponse> => {
    const started = Date.now();
    const requestId = req?.headers.get("x-request-id")?.slice(0, 64) || randomId();
    const request = req ?? new Request("http://localhost/");
    try {
      if (options.limit) {
        sweepWindows(started);
        checkRateLimit(callerKey(req, name), options.limit, started);
      }
      const res = await handler({ req: request, requestId, route: name });
      res.headers.set("x-request-id", requestId);
      log.info("request", { route: name, status: res.status, ms: Date.now() - started, requestId });
      return res;
    } catch (err) {
      const m = mapError(err);
      log[m.level]("request failed", {
        route: name,
        status: m.status,
        code: m.code,
        ms: Date.now() - started,
        requestId,
        err: err instanceof Error ? err.message : String(err),
        stack: m.level === "error" && err instanceof Error ? err.stack?.split("\n").slice(0, 4).join(" | ") : undefined,
      });
      return errorResponse(m.status, { error: m.message, code: m.code, requestId, details: m.details }, m.headers);
    }
  };
}

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
