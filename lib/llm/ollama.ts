// Ollama provider — a locally hosted model on WSL/localhost (default
// http://localhost:11434). Same interface as the OpenAI provider, so choosing
// it is purely a config switch (BEACON_LLM_PROVIDER=ollama), and the same
// deadline/retry rules apply (lib/llm/http.ts) — a local model that is still
// loading a 7B file is exactly the case a per-attempt timeout exists for.
//
// Ollama's /api/chat accepts `format: "json"` to force a JSON object, and newer
// builds accept a full JSON schema object in `format`. We pass the schema when
// available and still parse defensively, because a local model is less strict
// than OpenAI's structured outputs — `normalizeDetection` repairs the shape.

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
  message?: { content?: string };
}
interface EmbedResponse {
  embedding?: number[];
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new LlmError("ollama", "model returned a body that is not JSON", { attempts: 1, timedOut: false, elapsedMs: 0 });
  }
}

export function ollamaProvider(cfg: AgentConfig["ollama"]): LlmProvider {
  const base = cfg.baseUrl.replace(/\/$/, "");
  const chatUrl = `${base}/api/chat`;
  const content = (res: ChatResponse) => res.message?.content ?? "";

  return {
    name: "ollama",
    model: cfg.model,

    async detect(input: DetectInput): Promise<LlmDetection> {
      const res = await postJson<ChatResponse>({
        provider: "ollama",
        url: chatUrl,
        body: {
          model: cfg.model,
          stream: false,
          options: { temperature: 0 },
          format: DETECTION_SCHEMA, // structured output on recent Ollama; older builds treat truthy format as JSON mode
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserMessage(input) },
          ],
        },
      });
      return normalizeDetection(parseJson(content(res)));
    },

    async embed(text: string): Promise<EmbedResult> {
      const res = await postJson<EmbedResponse>({
        provider: "ollama",
        url: `${base}/api/embeddings`,
        body: { model: cfg.embedModel, prompt: text },
      });
      return { model: cfg.embedModel, vector: res.embedding ?? [] };
    },

    async compose(input: ComposeInput): Promise<ComposeResult> {
      const res = await postJson<ChatResponse>({
        provider: "ollama",
        url: chatUrl,
        body: {
          model: cfg.model,
          stream: false,
          options: { temperature: 0.3, num_predict: COMPOSE_MAX_TOKENS },
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
        provider: "ollama",
        url: chatUrl,
        body: {
          model: cfg.model,
          stream: false,
          options: { temperature: 0.2, num_predict: SUMMARIZE_MAX_TOKENS },
          ...(cleanup ? {} : { format: SUMMARIZE_SCHEMA }),
          messages: [
            { role: "system", content: cleanup ? CLEANUP_SYSTEM_PROMPT : SUMMARIZE_SYSTEM_PROMPT },
            { role: "user", content: buildSummarizeMessage(input) },
          ],
        },
      });
      const text = content(res);
      if (cleanup) return { text: text.trim(), proposedStatus: null, questions: [] };
      return normalizeSummarize(parseJson(text), input.statusOptions);
    },
  };
}
