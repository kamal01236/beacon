// OpenAI provider. Uses the Chat Completions API with a strict JSON-schema
// response format, so the model is forced to return exactly the `LlmDetection`
// shape. No SDK — one `fetch`, so there is nothing extra to install and the same
// code works against any OpenAI-compatible endpoint (set OPENAI_BASE_URL).

import type { AgentConfig } from "../config";
import { SYSTEM_PROMPT, DETECTION_SCHEMA, buildUserMessage, COMPOSE_SYSTEM_PROMPT, COMPOSE_MAX_TOKENS, buildComposeMessage, CLEANUP_SYSTEM_PROMPT, SUMMARIZE_SYSTEM_PROMPT, SUMMARIZE_SCHEMA, SUMMARIZE_MAX_TOKENS, buildSummarizeMessage } from "./prompt";
import type { ComposeInput, ComposeResult, DetectInput, EmbedResult, LlmDetection, LlmProvider, SummarizeInput, SummarizeResult } from "./types";
import { normalizeDetection, normalizeSummarize } from "./normalize";

export function openaiProvider(cfg: AgentConfig["openai"]): LlmProvider {
  if (!cfg.apiKey) throw new Error("OPENAI_API_KEY is not set");
  const headers = { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` };

  return {
    name: "openai",
    model: cfg.model,

    async detect(input: DetectInput): Promise<LlmDetection> {
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserMessage(input) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "beacon_detection", strict: true, schema: DETECTION_SCHEMA },
          },
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      const raw = data.choices?.[0]?.message?.content ?? "{}";
      return normalizeDetection(JSON.parse(raw));
    },

    async embed(text: string): Promise<EmbedResult> {
      const res = await fetch(`${cfg.baseUrl}/embeddings`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: cfg.embedModel, input: text }),
      });
      if (!res.ok) throw new Error(`OpenAI embed ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { data: { embedding: number[] }[] };
      return { model: cfg.embedModel, vector: data.data?.[0]?.embedding ?? [] };
    },

    async compose(input: ComposeInput): Promise<ComposeResult> {
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0.3,
          max_tokens: COMPOSE_MAX_TOKENS,
          messages: [
            { role: "system", content: COMPOSE_SYSTEM_PROMPT },
            { role: "user", content: buildComposeMessage(input) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      return { text: (data.choices?.[0]?.message?.content ?? "").trim() };
    },

    async summarize(input: SummarizeInput): Promise<SummarizeResult> {
      const cleanup = input.mode === "cleanup";
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0.2,
          max_tokens: SUMMARIZE_MAX_TOKENS,
          messages: [
            { role: "system", content: cleanup ? CLEANUP_SYSTEM_PROMPT : SUMMARIZE_SYSTEM_PROMPT },
            { role: "user", content: buildSummarizeMessage(input) },
          ],
          ...(cleanup
            ? {}
            : {
                response_format: {
                  type: "json_schema",
                  json_schema: { name: "beacon_summary", strict: true, schema: SUMMARIZE_SCHEMA },
                },
              }),
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      const content = data.choices?.[0]?.message?.content ?? "";
      if (cleanup) return { text: content.trim(), proposedStatus: null, questions: [] };
      return normalizeSummarize(JSON.parse(content || "{}"), input.statusOptions);
    },
  };
}
