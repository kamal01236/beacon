// The LLM entry point the agent worker uses.
//
//   getProvider(cfg)   -> the configured provider, or null for rules-only
//   llmDetect(...)      -> a `Detection` (lib/detect shape) produced by the
//                          model, with a GUARANTEED fallback to the rule-based
//                          detector if the model errors, is unreachable, or is
//                          not configured. The agent therefore never breaks
//                          because the LLM is down — it degrades to regex.
//
// Because the return type is exactly `Detection`, the worker can drop these
// results straight into the existing detection override (lib/detect) and the
// whole deterministic brain (facts → score → signals) runs unchanged.

import { detect, type Detection } from "../detect";
import type { AgentConfig } from "../config";
import { openaiProvider } from "./openai";
import { ollamaProvider } from "./ollama";
import type { ComposeInput, DetectInput, LlmProvider } from "./types";

export type { ComposeInput, ComposeResult, DetectInput, LlmDetection, LlmProvider } from "./types";

export function getProvider(cfg: AgentConfig): LlmProvider | null {
  try {
    if (cfg.provider === "openai") return openaiProvider(cfg.openai);
    if (cfg.provider === "ollama") return ollamaProvider(cfg.ollama);
  } catch {
    return null; // misconfigured (e.g. no key) → fall back to rules
  }
  return null;
}

const latestText = (input: DetectInput) => input.updates[input.updates.length - 1]?.text ?? "";

/**
 * Run the model detector for one item and return a `Detection`. On any failure
 * we log once and fall back to the rule detector over the latest update text,
 * so the caller always gets a usable result.
 */
export async function llmDetect(
  input: DetectInput,
  provider: LlmProvider | null,
  onError?: (err: unknown) => void,
): Promise<Detection> {
  if (!provider) return detect(latestText(input));
  try {
    const d = await provider.detect(input);
    return { score: d.score, hits: d.hits, relief: d.relief, signal: d.signal };
  } catch (err) {
    onError?.(err);
    return detect(latestText(input));
  }
}

/**
 * Draft a short comment for a known intent, with a GUARANTEED fallback to the
 * rule template (`input.fallback`): if no provider, no `compose` capability, an
 * error, or an empty result, the caller gets the deterministic template back —
 * so an approvable comment always exists. Returns the text and whether the model
 * actually produced it, for A/B and for showing the person which ran.
 */
export async function llmCompose(
  input: ComposeInput,
  provider: LlmProvider | null,
  onError?: (err: unknown) => void,
): Promise<{ text: string; fromModel: boolean }> {
  if (!provider?.compose) return { text: input.fallback, fromModel: false };
  try {
    const { text } = await provider.compose(input);
    const clean = text.trim();
    return clean ? { text: clean, fromModel: true } : { text: input.fallback, fromModel: false };
  } catch (err) {
    onError?.(err);
    return { text: input.fallback, fromModel: false };
  }
}
