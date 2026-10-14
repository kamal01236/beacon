"use client";

// Client helper for the single-field update composer's "Clean up" and
// "Summarize" actions.
//
// Calls POST /api/agent/summarize so the configured model (OpenAI / Ollama)
// either tidies the person's note or folds it with the agent's seed + recent
// thread into one coherent update with a proposed status and any clarifying
// questions. When there is no backend (the static Pages export) or the model is
// unreachable, it falls back to a light local cleanup, so both buttons always
// work — `source` says which produced the result.

import type { ItemStatus } from "./types";

export interface Summary {
  text: string;
  proposedStatus: ItemStatus | null;
  questions: string[];
  source: "llm" | "rules" | "rules-local";
  provider: string | null;
  model: string | null;
}

/** Light, meaning-preserving cleanup — the browser fallback when no backend. */
function localCleanup(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const cased = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(cased) ? cased : `${cased}.`;
}

export async function summarizeUpdate(
  itemId: string,
  mode: "cleanup" | "summarize",
  raw: string,
  seed?: string | null,
): Promise<Summary> {
  try {
    const r = await fetch("/api/agent/summarize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, mode, raw, seed }),
    });
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as Summary;
  } catch {
    return {
      text: localCleanup(raw) || localCleanup(seed ?? ""),
      proposedStatus: null,
      questions: [],
      source: "rules-local",
      provider: null,
      model: null,
    };
  }
}
