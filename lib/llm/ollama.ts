// Ollama provider — a locally hosted model on WSL/localhost (default
// http://localhost:11434). Same interface as the OpenAI provider, so choosing
// it is purely a config switch (BEACON_LLM_PROVIDER=ollama).
//
// Ollama's /api/chat accepts `format: "json"` to force a JSON object, and newer
// builds accept a full JSON schema object in `format`. We pass the schema when
// available and still parse defensively, because a local model is less strict
// than OpenAI's structured outputs — `normalizeDetection` repairs the shape.

import type { AgentConfig } from "../config";
import { SYSTEM_PROMPT, DETECTION_SCHEMA, buildUserMessage, COMPOSE_SYSTEM_PROMPT, COMPOSE_MAX_TOKENS, buildComposeMessage } from "./prompt";
import type { ComposeInput, ComposeResult, DetectInput, EmbedResult, LlmDetection, LlmProvider } from "./types";
import { normalizeDetection } from "./normalize";

export function ollamaProvider(cfg: AgentConfig["ollama"]): LlmProvider {
  const base = cfg.baseUrl.replace(/\/$/, "");

  return {
    name: "ollama",
    model: cfg.model,

    async detect(input: DetectInput): Promise<LlmDetection> {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: cfg.model,
          stream: false,
          options: { temperature: 0 },
          format: DETECTION_SCHEMA, // structured output on recent Ollama; older builds treat truthy format as JSON mode
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserMessage(input) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { message?: { content?: string } };
      return normalizeDetection(JSON.parse(data.message?.content ?? "{}"));
    },

    async embed(text: string): Promise<EmbedResult> {
      const res = await fetch(`${base}/api/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: cfg.embedModel, prompt: text }),
      });
      if (!res.ok) throw new Error(`Ollama embed ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { embedding: number[] };
      return { model: cfg.embedModel, vector: data.embedding ?? [] };
    },

    async compose(input: ComposeInput): Promise<ComposeResult> {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: cfg.model,
          stream: false,
          options: { temperature: 0.3, num_predict: COMPOSE_MAX_TOKENS },
          messages: [
            { role: "system", content: COMPOSE_SYSTEM_PROMPT },
            { role: "user", content: buildComposeMessage(input) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { message?: { content?: string } };
      return { text: (data.message?.content ?? "").trim() };
    },
  };
}
