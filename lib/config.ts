// Runtime configuration for the Beacon backend (agent worker + API).
//
// Everything that decides HOW the agent runs lives here and is driven by
// environment variables, so switching the LLM provider (OpenAI ↔ a locally
// hosted Ollama model), the model name, or the run cadence is a config change,
// never a code change. The defaults make a bare `node agent/run.mjs` on WSL do
// something sensible with no env set (rules-only, 60-minute cadence).
//
// This module is safe to import on the server only. It never runs in the
// browser bundle (the static UI keeps using the rule detector in lib/detect.ts).

import { ACTIVE_SPRINT_ID } from "./demo";

export type LlmProviderName = "openai" | "ollama" | "none";
export type DetectorMode = "rules" | "llm" | "both";

export interface AgentConfig {
  /** Which LLM backend processes update language. "none" = rules only. */
  provider: LlmProviderName;
  /** rules = regex only · llm = model only · both = run both and log for A/B. */
  detector: DetectorMode;
  /** Let the model draft the approve-preview comment (§4 job 4); off = rule templates only. */
  compose: boolean;
  openai: { apiKey: string | null; model: string; baseUrl: string; embedModel: string };
  ollama: { baseUrl: string; model: string; embedModel: string };
  /** Scheduled-run cadence in minutes, from BEACON_AGENT_INTERVAL_MINS. */
  intervalMins: number;
  /**
   * Re-analyse an item the moment a tracker update for it arrives. The webhook
   * receiver that would honour this is Phase 3 (README → Roadmap); today an
   * event-triggered run is anything POSTing /api/agent/run with trigger "event".
   */
  triggerOnEvent: boolean;
  /** The sprint the agent watches. Phase 3 reads this to scope the tracker pull;
   *  the prototype's seed is a single sprint, so ACTIVE_SPRINT_ID is the scope. */
  activeSprintId: string;
  /** "HH:MM-HH:MM" — no scheduled runs inside this window (empty = always on). */
  quietHours: string;
}

const num = (v: string | undefined, fallback: number) => {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const bool = (v: string | undefined, fallback: boolean) =>
  v == null ? fallback : /^(1|true|yes|on)$/i.test(v);

/**
 * Read the config from the environment. A single `env` argument keeps this
 * pure and testable. Provider resolution: an explicit BEACON_LLM_PROVIDER wins;
 * otherwise we infer "openai" when a key is present, else "none".
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const openaiKey = env.OPENAI_API_KEY?.trim() || null;

  const explicit = env.BEACON_LLM_PROVIDER?.trim().toLowerCase() as LlmProviderName | undefined;
  const provider: LlmProviderName =
    explicit === "openai" || explicit === "ollama" || explicit === "none"
      ? explicit
      : openaiKey
        ? "openai"
        : "none";

  const detector = (env.BEACON_DETECTOR?.trim().toLowerCase() as DetectorMode) || (provider === "none" ? "rules" : "both");

  return {
    provider,
    detector: detector === "rules" || detector === "llm" || detector === "both" ? detector : "both",
    compose: bool(env.BEACON_COMPOSE, false),
    openai: {
      apiKey: openaiKey,
      model: env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
      baseUrl: env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
      embedModel: env.OPENAI_EMBED_MODEL?.trim() || "text-embedding-3-small",
    },
    ollama: {
      // Default WSL/localhost Ollama endpoint.
      baseUrl: env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434",
      model: env.OLLAMA_MODEL?.trim() || "llama3.1",
      embedModel: env.OLLAMA_EMBED_MODEL?.trim() || "nomic-embed-text",
    },
    intervalMins: num(env.BEACON_AGENT_INTERVAL_MINS, 60),
    triggerOnEvent: bool(env.BEACON_TRIGGER_ON_EVENT, true),
    activeSprintId: env.BEACON_ACTIVE_SPRINT_ID?.trim() || ACTIVE_SPRINT_ID,
    quietHours: env.BEACON_QUIET_HOURS?.trim() || "",
  };
}
