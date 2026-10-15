// Request validation — small, dependency-free, and shared by every route.
//
// WHY NOT A SCHEMA LIBRARY: the API surface is eight routes with simple bodies,
// and the browser bundle must stay free of server-only dependencies. These
// combinators give the two things a validator is actually for — a 400 that says
// which field is wrong, and a typed value afterwards — without adding a package
// to the client's dependency tree.
//
// Every route parses its body through `parseBody`, so a malformed or oversized
// request is rejected the same way everywhere (lib/server/http.ts turns a
// ValidationError into a 400 with field-level details).

/** Thrown by a validator. `details` lists one entry per bad field. */
export class ValidationError extends Error {
  readonly details: { field: string; message: string }[];
  constructor(details: { field: string; message: string }[]) {
    super(details.map((d) => `${d.field}: ${d.message}`).join("; ") || "invalid request");
    this.name = "ValidationError";
    this.details = details;
  }
}

/** Thrown when a body is larger than a route allows. */
export class PayloadTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super(`request body exceeds ${limitBytes} bytes`);
    this.name = "PayloadTooLargeError";
  }
}

export type Validator<T> = (value: unknown, field: string) => T;

const fail = (field: string, message: string): never => {
  throw new ValidationError([{ field, message }]);
};

const missing = (v: unknown) => v === undefined || v === null || v === "";

export function str(opts: { min?: number; max?: number; pattern?: RegExp; trim?: boolean } = {}): Validator<string> {
  const { min = 1, max = 10_000, pattern, trim = true } = opts;
  return (v, field) => {
    if (typeof v !== "string") return fail(field, "expected a string");
    const s = trim ? v.trim() : v;
    if (s.length < min) return fail(field, min === 1 ? "must not be empty" : `must be at least ${min} characters`);
    if (s.length > max) return fail(field, `must be at most ${max} characters`);
    if (pattern && !pattern.test(s)) return fail(field, "has an unexpected format");
    return s;
  };
}

/** A string that may be empty (but must still be a string, and still bounded). */
export const text = (max = 10_000): Validator<string> => str({ min: 0, max });

export function int(opts: { min?: number; max?: number } = {}): Validator<number> {
  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = opts;
  return (v, field) => {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n !== "number" || !Number.isFinite(n)) return fail(field, "expected a number");
    const i = Math.floor(n);
    if (i < min) return fail(field, `must be at least ${min}`);
    if (i > max) return fail(field, `must be at most ${max}`);
    return i;
  };
}

export function oneOf<const T extends readonly string[]>(values: T): Validator<T[number]> {
  return (v, field) => {
    if (typeof v !== "string" || !values.includes(v)) return fail(field, `must be one of: ${values.join(", ")}`);
    return v as T[number];
  };
}

/** Accept undefined/null/"" and return `fallback`; otherwise validate. */
export function optional<T>(inner: Validator<T>, fallback: T): Validator<T> {
  return (v, field) => (missing(v) ? fallback : inner(v, field));
}

/** Like `optional`, but keeps null as a meaningful value. */
export function nullable<T>(inner: Validator<T>): Validator<T | null> {
  return (v, field) => (missing(v) ? null : inner(v, field));
}

export function arrayOf<T>(inner: Validator<T>, opts: { max?: number } = {}): Validator<T[]> {
  const { max = 100 } = opts;
  return (v, field) => {
    if (!Array.isArray(v)) return fail(field, "expected an array");
    if (v.length > max) return fail(field, `must have at most ${max} entries`);
    return v.map((x, i) => inner(x, `${field}[${i}]`));
  };
}

/** Passed through unchanged — for payloads whose shape a domain type already owns. */
export const anyObject = (): Validator<Record<string, unknown>> => (v, field) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return fail(field, "expected an object");
  return v as Record<string, unknown>;
};

export type Shape<T> = { [K in keyof T]: Validator<T[K]> };

/**
 * Validate an object against a shape, collecting EVERY bad field rather than
 * stopping at the first — one round trip tells the caller everything that is
 * wrong. Unknown keys are dropped, never forwarded.
 */
export function object<T extends Record<string, unknown>>(shape: Shape<T>): Validator<T> {
  return (v, field) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return fail(field || "body", "expected an object");
    const src = v as Record<string, unknown>;
    const out = {} as T;
    const details: { field: string; message: string }[] = [];
    for (const key of Object.keys(shape) as (keyof T & string)[]) {
      try {
        out[key] = shape[key](src[key], field ? `${field}.${key}` : key);
      } catch (err) {
        if (err instanceof ValidationError) details.push(...err.details);
        else throw err;
      }
    }
    if (details.length) throw new ValidationError(details);
    return out;
  };
}

/** The largest JSON body any route accepts unless it says otherwise. */
export const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

/**
 * Read, size-check and validate a JSON request body.
 *
 * The size check happens on the decoded text rather than trusting
 * content-length, so a lying header cannot get a large body past it. An empty
 * body is treated as `{}` so routes whose fields are all optional (a run
 * trigger, a retention window) can be POSTed with no body at all.
 */
export async function parseBody<T extends Record<string, unknown>>(
  req: Request,
  validator: Validator<T>,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<T> {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > maxBytes) throw new PayloadTooLargeError(maxBytes);
  let parsed: unknown;
  try {
    parsed = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    throw new ValidationError([{ field: "body", message: "expected valid JSON" }]);
  }
  return validator(parsed, "");
}

/** Validate one query-string parameter. */
export function query<T>(req: Request, name: string, validator: Validator<T>): T {
  return validator(new URL(req.url).searchParams.get(name), name);
}
