"use client";

// Client helper for the "Re-analyze with agent" action.
//
// Calls POST /api/agent/analyze so the configured model (OpenAI / Ollama, else
// rules) re-reads an edited comment/blocker in the item's context and returns a
// plain-language verdict. When there is no backend (the static Pages export) it
// falls back to the local rule detector, so the button always works — it just
// says which detector produced the answer (`source`).

import { detect, THRESHOLD, causesOf, CAUSES } from "./detect";
import type { Hit } from "./detect";
import type { ItemStatus } from "./types";

export interface Analysis {
  verdict: "blocked" | "clear";
  signal: boolean;
  score: number;
  threshold: number;
  hits: Hit[];
  relief: Hit[];
  rationale: string;
  answer: string;
  causes: string[];
  provider: string | null;
  model: string | null;
  source: "agent" | "rules-local";
}

export async function analyze(itemId: string, text: string, status?: ItemStatus): Promise<Analysis> {
  try {
    const r = await fetch("/api/agent/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, text, status }),
    });
    if (!r.ok) throw new Error(String(r.status));
    const a = await r.json();
    return { ...a, source: "agent" };
  } catch {
    return { ...localAnalyze(text), source: "rules-local" };
  }
}

function localAnalyze(text: string): Omit<Analysis, "source"> {
  const d = detect(text);
  const causes = causesOf(text).map((k) => CAUSES.find((c) => c.key === k)!.label);
  const phr = [...d.hits, ...d.relief].map((h) => `${h.phrase} ${h.weight > 0 ? "+" : ""}${h.weight}`).join(", ");
  const rationale = phr
    ? `Language weight ${d.score} (threshold ${THRESHOLD}) from: ${phr}.`
    : `No blocker wording detected (score ${d.score}, threshold ${THRESHOLD}).`;
  const answer = d.signal
    ? `This still reads as a real blocker. ${rationale}${causes.length ? ` Likely cause: ${causes.join(", ")}.` : ""}`
    : `This no longer reads as blocked. ${rationale} You can submit it as a normal update.`;
  return {
    verdict: d.signal ? "blocked" : "clear",
    signal: d.signal,
    score: d.score,
    threshold: THRESHOLD,
    hits: d.hits,
    relief: d.relief,
    rationale,
    answer,
    causes,
    provider: null,
    model: null,
  };
}
