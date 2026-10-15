// OpenAI provider. Uses the Chat Completions API with a strict JSON-schema
// response format, so the model is forced to return exactly the `LlmDetection`
// shape. No SDK — one POST through lib/llm/http.ts, so there is nothing extra to
// install, every call carries a deadline and bounded retries, and the same code
// works against any OpenAI-compatible endpoint (set OPENAI_BASE_URL).

import type { AgentConfig } from "../config";
import {
  SYSTEM_PROMPT,
  DETECTION_SCHEMA,
  buildUserMessage,
  COMPOSE_SYSTEM_PROMPT,
  COMPOSE_MAX_TOKENS,
  buildComposeMessage,
  CLEANUP_SYSTEM_PROMPT,
  SUMMARIZE_SYSTEM_PROMPT,
  SUMMARIZE_SCHEMA,
  SUMMARIZE_MAX_TOKENS,
  buildSummarizeMessage,
} from "./prompt";
import type {
  ComposeInput,
  ComposeResult,
  DetectInput,
  EmbedResult,
  LlmDetection,
  LlmProvider,
  SummarizeInput,
  SummarizeResult,
} from "./types";
import { normalizeDetection, normalizeSummarize } from "./normalize";
import { LlmError, postJson } from "./http";

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}
interface EmbedResponse {
  data?: { embedding?: number[] }[];
}

/** The model is told to return JSON; a body that will not parse is an outage. */
function parseJson(provider: string, raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new LlmError(provider, "model returned a body that is not JSON", { attempts: 1, timedOut: false, elapsedMs: 0 });
  }
}

export function openaiProvider(cfg: AgentConfig["openai"]): LlmProvider {
  if (!cfg.apiKey) throw new Error("OPENAI_API_KEY is not set");
  const headers = { authorization: `Bearer ${cfg.apiKey}` };
  const chatUrl = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const embedUrl = `${cfg.baseUrl.replace(/\/$/, "")}/embeddings`;
  const content = (res: ChatResponse) => res.choices?.[0]?.message?.content ?? "";

  return {
    name: "openai",
    model: cfg.model,

    async detect(input: DetectInput): Promise<LlmDetection> {
      const res = await postJson<ChatResponse>({
        provider: "openai",
        url: chatUrl,
        headers,
        body: {
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
        },
      });
      return normalizeDetection(parseJson("openai", content(res)));
    },

    async embed(text: string): Promise<EmbedResult> {
      const res = await postJson<EmbedResponse>({
        provider: "openai",
        url: embedUrl,
        headers,
        body: { model: cfg.embedModel, input: text },
      });
      return { model: cfg.embedModel, vector: res.data?.[0]?.embedding ?? [] };
    },

    async compose(input: ComposeInput): Promise<ComposeResult> {
      const res = await postJson<ChatResponse>({
        provider: "openai",
        url: chatUrl,
        headers,
        body: {
          model: cfg.model,
          temperature: 0.3,
          max_tokens: COMPOSE_MAX_TOKENS,
          messages: [
            { role: "system", content: COMPOSE_SYSTEM_PROMPT },
            { role: "user", content: buildComposeMessage(input) },
          ],
        },
      });
      return { text: content(res).trim() };
    },

    async summarize(input: SummarizeInput): Promise<SummarizeResult> {
      const cleanup = input.mode === "cleanup";
      const res = await postJson<ChatResponse>({
        provider: "openai",
        url: chatUrl,
        headers,
        body: {
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
        },
      });
      const text = content(res);
      if (cleanup) return { text: text.trim(), proposedStatus: null, questions: [] };
      return normalizeSummarize(parseJson("openai", text), input.statusOptions);
    },
  };
}
