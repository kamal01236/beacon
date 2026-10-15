// Structured logging.
//
// One JSON object per line on stdout/stderr: that is what a log shipper, a
// container platform and `grep` all read without extra tooling, and it keeps a
// request's id attached to every line it produced. Human-readable `pretty` mode
// stays the default for a terminal, so local runs are still readable; set
// BEACON_LOG_FORMAT=json (or run with NODE_ENV=production) for machine output.
//
// SERVER ONLY. Nothing here reaches the browser bundle.

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const envLevel = (): LogLevel => {
  const raw = process.env.BEACON_LOG_LEVEL?.trim().toLowerCase();
  return raw === "debug" || raw === "info" || raw === "warn" || raw === "error" ? raw : "info";
};

const asJson = (): boolean => {
  const raw = process.env.BEACON_LOG_FORMAT?.trim().toLowerCase();
  if (raw === "json") return true;
  if (raw === "pretty") return false;
  return process.env.NODE_ENV === "production";
};

/** Redact anything that looks like a credential before it reaches a log line. */
const SECRET_KEY = /(key|token|secret|password|authorization|cookie|connectionstring|database_url)/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (typeof value === "string") {
    return (
      value
        // An OpenAI-style key pasted into a field, never logged whole.
        .replace(/\b(sk|rk)-[A-Za-z0-9_-]{8,}/g, "[redacted]")
        // Credentials inside a URL — a failing Postgres driver puts the whole
        // connection string in its error message, and that message is logged.
        .replace(/\/\/[^\s/:@]+:[^\s/:@]+@/g, "//[redacted]@")
        // "Bearer <token>" arriving from an upstream error body.
        .replace(/\b[Bb]earer\s+[A-Za-z0-9._-]{8,}/g, "Bearer [redacted]")
    );
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
  if (LEVELS[level] < LEVELS[envLevel()]) return;
  const safe = redact(fields) as Record<string, unknown>;
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (asJson()) {
    sink(JSON.stringify({ ts: new Date().toISOString(), level, svc: "beacon", msg, ...safe }));
    return;
  }
  const tail = Object.entries(safe)
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" ");
  sink(`[beacon] ${level.toUpperCase()} ${msg}${tail ? ` ${tail}` : ""}`);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};
