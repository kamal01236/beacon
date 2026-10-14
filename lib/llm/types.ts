// The LLM seam. One provider interface, two implementations (OpenAI and a
// locally hosted Ollama model), both returning the SAME structured shape so the
// rest of Beacon never knows or cares which one ran.
//
// The output deliberately mirrors lib/detect.ts `Detection` (named phrases with
// weights, a summed score, a threshold decision) so a model verdict stays as
// explainable as a regex one — it always comes with the evidence that produced
// it. The model fills this schema in; it never free-types a verdict.

/** What the agent sends the model about ONE item (its own update thread only). */
export interface DetectInput {
  code: string; // e.g. "REQ-001"
  title: string;
  status: string;
  priority: string;
  dueInDays: number;
  owner: string; // first name only — no other PII leaves the box
  /** This item's updates this sprint, oldest first (last ~5). The trajectory is the signal. */
  updates: { day: number; text: string }[];
  /** What the last run already knew, so the model does not re-flag settled noise. */
  prior?: { flagged: boolean; blockedRaised: boolean };
}

export interface Phrase {
  phrase: string;
  weight: number;
}

/** The structured verdict every provider must return. Maps 1:1 to `Detection`. */
export interface LlmDetection {
  signal: boolean; // reads as a hidden blocker
  score: number; // sum of hit + relief weights (threshold is lib/detect THRESHOLD)
  hits: Phrase[]; // distress phrases found, each with a positive weight
  relief: Phrase[]; // reassuring phrases found, each with a negative weight
  rationale: string; // one sentence a human can read
}

export interface EmbedResult {
  model: string;
  vector: number[];
}

/**
 * What the agent sends the model to DRAFT a short comment that helps move an
 * item forward (§4 job 4). The model only rephrases a known INTENT into natural
 * language — it is not asked to decide anything. `fallback` is the deterministic
 * rule template, used verbatim whenever the model is unavailable, so the comment
 * is always something a human can approve.
 */
export interface ComposeInput {
  code: string; // e.g. "REQ-001"
  title: string;
  status: string;
  owner: string; // first name only — no other PII leaves the box
  intent: string; // what the comment should accomplish (from the signal's rule template)
  audience?: string | null; // first name to address, if any (becomes "@Name")
  fallback: string; // the rule template text — the guaranteed result if the model is down
}

export interface ComposeResult {
  text: string; // one or two plain-text sentences
}

/**
 * What the agent sends the model for the single-field update composer. The
 * person writes (or dictates) one free-text note; the model either just cleans
 * it up ("cleanup") or folds it together with the agent's seed suggestion and
 * the recent update thread into one coherent stand-up update ("summarize"). It
 * never decides anything that posts — a person confirms the result first.
 */
export interface SummarizeInput {
  mode: "cleanup" | "summarize";
  code: string; // e.g. "REQ-001"
  title: string;
  status: string; // the item's current status
  owner: string; // first name only — no other PII leaves the box
  raw: string; // what the person typed or dictated (may be messy / grammatically rough)
  seed?: string | null; // the agent's suggested draft, if any (summarize mode)
  /** This item's recent updates, oldest first, for context (summarize mode). */
  prior?: { day: number; text: string }[];
  /** The valid status values the model may propose (summarize mode). */
  statusOptions?: string[];
}

export interface SummarizeResult {
  text: string; // the cleaned / summarized update, plain text
  proposedStatus?: string | null; // one of statusOptions, or null if unsure (summarize mode)
  questions: string[]; // clarifying questions, empty if the update already reads clearly
}

export interface LlmProvider {
  readonly name: string; // "openai" | "ollama"
  readonly model: string;
  detect(input: DetectInput): Promise<LlmDetection>;
  embed?(text: string): Promise<EmbedResult>;
  /** Draft a short, plain-text comment from a known intent. Optional: a provider without it falls back to the template. */
  compose?(input: ComposeInput): Promise<ComposeResult>;
  /** Clean up or summarize a free-text update. Optional: a provider without it falls back to rule-based cleanup. */
  summarize?(input: SummarizeInput): Promise<SummarizeResult>;
}
