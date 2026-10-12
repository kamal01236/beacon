// The server-side agent run.
//
// This is where the LLM meets the deterministic brain. The pipeline:
//   1. load the world from Postgres
//   2. for each active item, build its update thread and ask the detector
//      (OpenAI / Ollama / rules) whether the latest update reads as blocked
//   3. install those verdicts as a detection override (lib/detect) and run the
//      EXISTING synchronous brain — getSignals / getRequests / getRun — which
//      now reflects the model's reading without any async refactor
//   4. persist one agent_runs row (trigger, detector, model, the snapshot)
//
// The deterministic attention score still decides severity and ranking; the LLM
// only informs the "reads as blocked" detection, and every verdict it returns
// carries its phrases, so signals stay explainable. If the model is down, each
// item silently falls back to the regex detector.
//
// SERVER ONLY.

import { activeItems, memberById } from "../data";
import { factsFor } from "../facts";
import { setDetectionOverrides, detect, THRESHOLD, causesOf, CAUSES, type Detection, type Hit } from "../detect";
import { getSignals, getRequests, getRun } from "../agent";
import { daysFromToday } from "../demo";
import { loadWorld, recordRun } from "./store";
import { loadConfig, type AgentConfig } from "../config";
import { getProvider, llmDetect, llmCompose, type DetectInput, type ComposeInput } from "../llm";
import type { AgentSignal } from "../agent";
import type { World } from "../data";
import type { Item, ItemStatus } from "../types";

/** Pull a "@Name" out of a template comment so a drafted one keeps addressing the same person. */
const audienceOf = (text: string): string | null => text.match(/@(\w+)/)?.[1] ?? null;

const textOf = (u: { progressText: string | null; blockerText?: string | null }) =>
  [u.progressText, u.blockerText].filter(Boolean).join(" ");

function inputFor(item: Item, w: World): { input: DetectInput; latestText: string } | null {
  const authored = w.updates
    .filter((u) => u.itemId === item.id && u.author && u.progressText)
    .sort((a, b) => a.sprintDay - b.sprintDay);
  if (!authored.length) return null;
  const f = factsFor(item, w);
  return {
    latestText: textOf(authored[authored.length - 1]),
    input: {
      code: item.id.toUpperCase(),
      title: item.title,
      status: item.status,
      priority: item.priority,
      dueInDays: daysFromToday(item.dueDate),
      owner: memberById(item.owner)?.name.split(" ")[0] ?? "unassigned",
      updates: authored.slice(-5).map((u) => ({ day: u.sprintDay, text: textOf(u) })),
      prior: { flagged: false, blockedRaised: f.blocked },
    },
  };
}

export type RunTrigger = "schedule" | "event" | "manual";

export interface RunResult {
  trigger: RunTrigger;
  detector: AgentConfig["detector"];
  provider: string | null;
  model: string | null;
  itemsScanned: number;
  llmCalls: number;
  disagreements: number; // items where the LLM and the rules differed (A/B signal)
  signalsOpen: number;
  composed: number; // comment proposals the model drafted this run (0 unless `compose` is on)
  errors: number;
}

/** Context the model needs to phrase one comment proposal; the template stays the fallback. */
function composeInputFor(signal: AgentSignal, item: Item, change: { label: string; to: string }): ComposeInput {
  return {
    code: item.id.toUpperCase(),
    title: item.title,
    status: item.status,
    owner: memberById(item.owner)?.name.split(" ")[0] ?? "unassigned",
    intent: change.label.replace(/^Comment:\s*/i, ""),
    audience: audienceOf(change.to),
    fallback: change.to,
  };
}

/**
 * Rewrite the `field: "comment"` proposals on these signals so they read
 * naturally, in place. Each call falls back to its own template text, so a
 * model outage leaves every comment exactly as the rules wrote it. Returns how
 * many the model actually drafted. SERVER ONLY — used inside a run.
 */
async function composeSignalComments(
  signals: AgentSignal[],
  world: World,
  provider: Parameters<typeof llmCompose>[1],
  onError: () => void,
): Promise<number> {
  let composed = 0;
  for (const signal of signals) {
    const item = world.items.find((i) => i.id === signal.itemId);
    if (!item) continue;
    for (const p of signal.proposals) {
      if (p.change.field !== "comment" || p.state !== "pending") continue;
      const { text, fromModel } = await llmCompose(composeInputFor(signal, item, p.change), provider, onError);
      p.change.to = text;
      if (fromModel) composed++;
    }
  }
  return composed;
}

export async function runAgent(trigger: RunTrigger = "manual", cfg = loadConfig()): Promise<RunResult> {
  const world = await loadWorld();
  const provider = cfg.detector === "rules" ? null : getProvider(cfg);

  let llmCalls = 0;
  let disagreements = 0;
  let errors = 0;
  const overrides = new Map<string, Detection>();

  if (provider) {
    const items = activeItems(world).filter((i) => !factsFor(i, world).done);
    for (const item of items) {
      const built = inputFor(item, world);
      if (!built) continue;
      llmCalls++;
      const llm = await llmDetect(built.input, provider, () => errors++);
      if (llm.signal !== detect(built.latestText).signal) disagreements++;
      overrides.set(built.latestText, llm);
    }
  }

  // Run the deterministic brain with the model's verdicts in effect, then clear
  // so nothing leaks into a later call on the same process.
  setDetectionOverrides(overrides.size ? overrides : null);
  let run, signals, requests;
  try {
    run = getRun(world);
    signals = getSignals(world);
    requests = getRequests(world);
  } finally {
    setDetectionOverrides(null);
  }

  // Optionally let the model phrase the comment proposals (§4 job 4). Gated by
  // `compose` so default runs are untouched; each comment falls back to its rule
  // template if the model is unavailable, so the snapshot is always approvable.
  let composed = 0;
  if (cfg.compose) {
    const composer = provider ?? getProvider(cfg);
    if (composer?.compose) composed = await composeSignalComments(signals, world, composer, () => errors++);
  }

  const result: RunResult = {
    trigger,
    detector: cfg.detector,
    provider: provider?.name ?? null,
    model: provider?.model ?? null,
    itemsScanned: run.itemsScanned,
    llmCalls,
    disagreements,
    signalsOpen: signals.filter((s) => s.state === "open").length,
    composed,
    errors,
  };

  // Persist the run snapshot (Postgres, or .data/runs.json without a database).
  await recordRun({
    trigger,
    detector: cfg.detector,
    provider: result.provider,
    model: result.model,
    itemsScanned: result.itemsScanned,
    signalsOpen: result.signalsOpen,
    summary: { run, signals, requests, result },
  });

  return result;
}

// ---- re-analyze one edited draft -------------------------------------------
//
// Powers the "Re-analyze with agent" button: a person edits the comment /
// blocker text in the approve-or-post context, and the SAME detector the run
// uses (OpenAI / Ollama, else rules) re-reads that exact text in the item's
// context and says, in plain words, whether it still reads as a real blocker.
// Nothing is written — this only informs the person before they submit.

export interface AnalyzeResult {
  verdict: "blocked" | "clear";
  signal: boolean;
  score: number;
  threshold: number;
  hits: Hit[];
  relief: Hit[];
  rationale: string;
  answer: string; // one human-readable sentence
  causes: string[];
  provider: string | null;
  model: string | null;
}

export async function analyzeDraft(
  itemId: string,
  text: string,
  status?: ItemStatus,
  cfg = loadConfig(),
): Promise<AnalyzeResult> {
  const world = await loadWorld();
  const item = world.items.find((i) => i.id === itemId) ?? null;
  const provider = cfg.detector === "rules" ? null : getProvider(cfg);

  let det: Detection;
  let rationale = "";
  let providerName: string | null = null;
  let model: string | null = null;

  if (provider && item) {
    const built = inputFor(item, world);
    const base: DetectInput = built?.input ?? {
      code: item.id.toUpperCase(),
      title: item.title,
      status: status ?? item.status,
      priority: item.priority,
      dueInDays: daysFromToday(item.dueDate),
      owner: memberById(item.owner)?.name.split(" ")[0] ?? "unassigned",
      updates: [],
      prior: { flagged: false, blockedRaised: factsFor(item, world).blocked },
    };
    // The edited text becomes the newest update in the thread.
    const input: DetectInput = { ...base, status: status ?? base.status, updates: [...base.updates, { day: 9999, text }] };
    try {
      const llm = await provider.detect(input);
      det = { score: llm.score, hits: llm.hits, relief: llm.relief, signal: llm.signal };
      rationale = llm.rationale || "";
      providerName = provider.name;
      model = provider.model;
    } catch {
      det = detect(text); // model unreachable → rules, so the button never dead-ends
    }
  } else {
    det = detect(text);
  }

  const causes = causesOf(text).map((k) => CAUSES.find((c) => c.key === k)!.label);
  if (!rationale) {
    const phr = [...det.hits, ...det.relief].map((h) => `${h.phrase} ${h.weight > 0 ? "+" : ""}${h.weight}`).join(", ");
    rationale = phr
      ? `Language weight ${det.score} (threshold ${THRESHOLD}) from: ${phr}.`
      : `No blocker wording detected (score ${det.score}, threshold ${THRESHOLD}).`;
  }
  const answer = det.signal
    ? `This still reads as a real blocker. ${rationale}${causes.length ? ` Likely cause: ${causes.join(", ")}.` : ""} After you submit, the owner is asked to confirm before anyone else is alerted.`
    : `This no longer reads as blocked. ${rationale} You can submit it as a normal update.`;

  return {
    verdict: det.signal ? "blocked" : "clear",
    signal: det.signal,
    score: det.score,
    threshold: THRESHOLD,
    hits: det.hits,
    relief: det.relief,
    rationale,
    answer,
    causes,
    provider: providerName,
    model,
  };
}

// ---- draft one comment on demand (§4 job 4) --------------------------------
//
// Powers the "Draft with agent" action in the approve-a-comment UI: given the
// intent Beacon already decided (a proposal's label) and the rule template as a
// fallback, the model phrases a short, plain-text comment for the person to edit
// and approve. Writes nothing. If no model is configured or it errors, the
// template comes straight back, so the action never dead-ends.

export interface ComposeCommentResult {
  text: string;
  source: "llm" | "template";
  provider: string | null;
  model: string | null;
}

export async function composeComment(
  itemId: string,
  intent: string,
  fallback: string,
  audience?: string | null,
  cfg = loadConfig(),
): Promise<ComposeCommentResult> {
  const world = await loadWorld();
  const item = world.items.find((i) => i.id === itemId) ?? null;
  const provider = getProvider(cfg);
  if (!item || !provider?.compose) return { text: fallback, source: "template", provider: null, model: null };

  const input: ComposeInput = {
    code: item.id.toUpperCase(),
    title: item.title,
    status: item.status,
    owner: memberById(item.owner)?.name.split(" ")[0] ?? "unassigned",
    intent: intent.replace(/^Comment:\s*/i, ""),
    audience: audience ?? audienceOf(fallback),
    fallback,
  };
  const { text, fromModel } = await llmCompose(input, provider);
  return {
    text,
    source: fromModel ? "llm" : "template",
    provider: fromModel ? provider.name : null,
    model: fromModel ? provider.model : null,
  };
}
