"use client";

// Client helper for the "Draft with agent" action.
//
// Calls POST /api/agent/compose so the configured model phrases a proposal's
// comment in natural language. Beacon has already decided the INTENT (the
// proposal's label); the model only words it, and the rule template is the
// guaranteed fallback — so the person always has something approvable in the
// box. When there is no backend (the static Pages export) the template comes
// straight back and `source` says "template", so the button never dead-ends.

export interface Composed {
  text: string;
  source: "llm" | "template";
  provider: string | null;
  model: string | null;
}

export async function compose(itemId: string, intent: string, fallback: string): Promise<Composed> {
  try {
    const r = await fetch("/api/agent/compose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, intent, fallback }),
    });
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as Composed;
  } catch {
    return { text: fallback, source: "template", provider: null, model: null };
  }
}
