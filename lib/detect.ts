// Update-language detection — transparent, rule-based.
//
// Reads what people wrote in their stand-up updates and flags wording that
// usually means "blocked but not saying so". Every hit is a named phrase with a
// weight, so a detection is always explainable ("struggling" +3, "not sure how
// to proceed" +3 …). This is the prototype detector; a language model can replace
// it later behind the same Detection shape, judged against the accept/dismiss
// record (lib/adoption.ts).

export interface Hit {
  phrase: string;
  weight: number;
}

export interface Detection {
  score: number; // sum of hit weights
  hits: Hit[]; // distress phrases (positive weight)
  relief: Hit[]; // phrases that lower the score (negative weight)
  signal: boolean; // score >= THRESHOLD
}

export const THRESHOLD = 4;

const DISTRESS: [RegExp, string, number][] = [
  [/\bstruggl\w*/i, "struggling", 3],
  [/\bstuck\b/i, "stuck", 3],
  [/not sure (how|what)/i, "not sure how to proceed", 3],
  [/\bblocked\b|\bblocker\b/i, "says blocked", 3],
  [/need(s)? (someone|help|support)|might need someone/i, "asking for help", 3],
  [/\b(can'?t|cannot|unable to)\b/i, "can't / unable", 2],
  [/still waiting|waiting (on|for)/i, "waiting on others", 2],
  [/escalat\w*/i, "escalated", 2],
  [/contradict\w*/i, "conflicting information", 2],
  [/fails? every time|keeps? failing|always fails/i, "repeated failure", 2],
  [/no response|haven'?t heard/i, "no response", 2],
  [/\bissues?\b|\bproblems?\b/i, "mentions issues", 1],
];

const RELIEF: [RegExp, string, number][] = [
  [/making progress|on track/i, "making progress", -1],
  [/identified the (problem|issue|cause)|working on the fix|\bfixed\b|\bresolved\b|\bunblocked\b/i, "fix in hand", -2],
];

export function detect(text: string | null | undefined): Detection {
  const t = text ?? "";
  const hits: Hit[] = [];
  const relief: Hit[] = [];
  for (const [re, phrase, weight] of DISTRESS) if (re.test(t)) hits.push({ phrase, weight });
  for (const [re, phrase, weight] of RELIEF) if (re.test(t)) relief.push({ phrase, weight });
  const score = [...hits, ...relief].reduce((a, h) => a + h.weight, 0);
  return { score, hits, relief, signal: score >= THRESHOLD };
}

// ---- root-cause categories ------------------------------------------------

export type CauseKey = "external" | "technical" | "requirements" | "capacity";

export const CAUSES: { key: CauseKey; label: string; re: RegExp; action: string }[] = [
  {
    key: "external",
    label: "External dependency",
    re: /\binfra\w*|\bclient\b|credential|vendor|third.party|sandbox|access key|waiting (on|for)|other team/i,
    action: "Flag external dependencies at planning and check them daily — Beacon raises an input request when one goes quiet.",
  },
  {
    key: "technical",
    label: "Technical / documentation gap",
    re: /\bsdk\b|\bdocs?\b|documentation|middleware|\bconfig\b|webhook|signature|\bhmac\b|\bbug\b|\bfails?\b/i,
    action: "Pair early: when update language signals a technical struggle, bring in someone who has solved it before (Beacon suggests who).",
  },
  {
    key: "requirements",
    label: "Unclear requirements",
    re: /unclear|ambiguous|acceptance criteria|not sure what|\bscope\b/i,
    action: "Run the clarity check before a story enters the sprint; don't start below 6/10.",
  },
  {
    key: "capacity",
    label: "Capacity / ownership",
    re: /no owner|overload|no time|unavailab\w*|also working/i,
    action: "Cap work in progress per person and make sure every item has an owner before it starts.",
  },
];

export function causesOf(text: string | null | undefined): CauseKey[] {
  const t = text ?? "";
  return CAUSES.filter((c) => c.re.test(t)).map((c) => c.key);
}
