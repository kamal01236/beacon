// A faked Jira Cloud REST API, served from the seed JSON.
//
// This is the ingestion seam a real Beacon would hit: Jira (or Azure DevOps)
// owns the backlog, Beacon reads it over REST and maps each issue onto our
// domain `Item`. Here nothing talks to Atlassian — `jiraSearch()` reads
// data/*.json off disk and returns a response shaped like Jira's
// `GET /rest/api/3/search`, and `jiraSearchToBase()` adapts it back. So the
// prototype exercises the exact fetch → adapt → World flow end to end, with
// only the network call faked. Swap `jiraSearch()` for a real `fetch()` against
// Atlassian and the rest of the system is unchanged.
//
// The full domain objects ride along in Jira custom fields (customfield_10100 =
// the raw Item, customfield_10200 = that item's raw updates), the way teams
// stash structured data on an issue. The adapter restores them losslessly, so
// the board shows exactly what the seed holds while the standard Jira fields
// (summary, status, assignee, priority, duedate, comments) stay realistic and
// inspectable at GET /api/jira/search.
//
// SERVER ONLY.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Item, Update, Member } from "../types";

const dataDir = join(process.cwd(), "data");
const readJson = <T>(name: string): T => JSON.parse(readFileSync(join(dataDir, name), "utf8")) as T;

// Our item statuses → a plausible Jira status name + category.
const STATUS: Record<string, { name: string; category: "new" | "indeterminate" | "done" }> = {
  todo: { name: "To Do", category: "new" },
  ready: { name: "Ready", category: "new" },
  in_progress: { name: "In Progress", category: "indeterminate" },
  blocked: { name: "Blocked", category: "indeterminate" },
  in_review: { name: "In Review", category: "indeterminate" },
  done: { name: "Done", category: "done" },
  confirmed: { name: "Done", category: "done" },
  resolved: { name: "Resolved", category: "done" },
  cancelled: { name: "Cancelled", category: "done" },
};

const ISSUETYPE: Record<string, string> = {
  requirement: "Story",
  bug: "Bug",
  task: "Task",
  spike: "Spike",
  risk: "Risk",
};

export interface JiraIssue {
  id: string;
  key: string; // e.g. "REQ-001"
  self: string;
  fields: Record<string, unknown>;
}
export interface JiraSearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

/** The faked `GET /rest/api/3/search` payload, built from the seed JSON. */
export function jiraSearch(): JiraSearchResponse {
  const items = readJson<Item[]>("items.json");
  const updates = readJson<Update[]>("updates.json");
  const members = readJson<Member[]>("members.json");
  const memberById = new Map(members.map((m) => [m.id, m]));
  const updatesByItem = new Map<string, Update[]>();
  for (const u of updates) (updatesByItem.get(u.itemId) ?? updatesByItem.set(u.itemId, []).get(u.itemId)!).push(u);

  const author = (id: string | null | undefined) => {
    const m = id ? memberById.get(id) : undefined;
    return m ? { accountId: m.id, displayName: m.name } : null;
  };

  const issues: JiraIssue[] = items.map((it) => {
    const own = updatesByItem.get(it.id) ?? [];
    const st = STATUS[it.status] ?? { name: it.status, category: "indeterminate" as const };
    return {
      id: it.id,
      key: it.id.toUpperCase(),
      self: `https://beacon.atlassian.net/rest/api/3/issue/${it.id}`,
      fields: {
        summary: it.title,
        description: it.description ?? null,
        issuetype: { name: ISSUETYPE[it.type] ?? "Story" },
        status: { name: st.name, statusCategory: { key: st.category } },
        assignee: author(it.owner),
        priority: { name: (it.priority ?? "medium").replace(/^\w/, (c) => c.toUpperCase()) },
        duedate: it.dueDate ?? null,
        // a blocked issue carries its blocker as a flag + the latest note
        customfield_10001: it.status === "blocked" ? it.blocker ?? null : null,
        comment: {
          total: own.length,
          comments: own.map((u) => ({
            id: u.id,
            author: author(u.author),
            created: u.date,
            body: [u.progressText, u.blockerText ? `BLOCKER: ${u.blockerText}` : null, u.nextAction ? `NEXT: ${u.nextAction}` : null]
              .filter(Boolean)
              .join("\n"),
          })),
        },
        // Round-trip payload: the exact domain objects, restored by the adapter.
        customfield_10100: it,
        customfield_10200: own,
      },
    };
  });

  return { startAt: 0, maxResults: issues.length, total: issues.length, issues };
}

/** Adapt a (faked) Jira search response back into our base snapshot. */
export function jiraSearchToBase(res: JiraSearchResponse): { items: Item[]; updates: Update[] } {
  const items: Item[] = [];
  const updates: Update[] = [];
  for (const issue of res.issues) {
    const raw = issue.fields.customfield_10100 as Item | undefined;
    if (raw) items.push(raw);
    const ups = (issue.fields.customfield_10200 as Update[] | undefined) ?? [];
    for (const u of ups) updates.push(u);
  }
  return { items, updates };
}

/** Convenience: fetch (fake) Jira and adapt it — the server's base snapshot. */
export function loadJiraBase(): { items: Item[]; updates: Update[] } {
  return jiraSearchToBase(jiraSearch());
}
