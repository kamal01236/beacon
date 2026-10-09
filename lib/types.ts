// Domain types for the Beacon seed data. These mirror the JSON under /data.

export type Role = "facilitator" | "manager" | "member";

export type ItemType = "requirement" | "action" | "decision" | "risk";
export type ItemStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "done"
  | "overdue"
  | "spillover"
  | "confirmed"
  | "resolved"
  | "monitoring"
  | "cancelled";

export interface Member {
  id: string;
  name: string;
  role: string; // job title, e.g. "Backend Developer"
  title: string;
  email: string;
  points: number;
  badges: string[];
  avatarColor: string;
  kudosReceived: number;
  kudosGiven: number;
}

export interface Sprint {
  id: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: "completed" | "active" | "planned";
  velocityGoal: number;
  velocityActual: number | null;
  client: string;
  project: string;
  metrics: Record<string, number | string>;
}

export interface Item {
  id: string;
  sprintId: string;
  type: ItemType;
  title: string;
  description: string;
  owner: string | null;
  ownerAssignedDate?: string;
  dueDate: string;
  priority: "low" | "medium" | "high";
  status: ItemStatus;
  blocker: string | null;
  dependsOn: string[];
  clientImpact: boolean;
  spillover: boolean;
  spilloverNote?: string;
  clarityScore: number | null;
  completedDate?: string;
  resolvedDate?: string;
  blockerRaisedDate?: string; // when the blocker was formally raised in the tracker
  mitigationPlan?: string;
}

export interface Update {
  id: string;
  itemId: string;
  sprintId: string;
  author: string | null; // null on a "missing" placeholder (no update was posted)
  date: string;
  sprintDay: number;
  statusRaw?: string | null;
  statusStructured: ItemStatus | "missing";
  progressText: string | null;
  nextAction: string | null;
  blockerText?: string | null;
  aiStructured?: boolean;
  submittedOnTime?: boolean;
  source?: "seed" | "beacon"; // "beacon" = posted through Beacon in this session
}

export interface Kudos {
  id: string;
  from: string;
  to: string;
  message: string;
  date: string;
  sprintId: string;
  itemId: string | null;
  badgeAwarded: string | null;
  pointsAwarded: number;
}

export interface Story {
  id: string;
  itemId: string;
  clarityScore: number;
  scoreBreakdown: Record<string, boolean>;
  originalDescription: string;
  missing: string[];
  aiSuggestedRewrite: string;
  reviewedBy: string | null;
  rewriteApplied: boolean;
}

// A single explainable contribution to an item's attention score.
export interface ScoreReason {
  rule: string; // the scoring rule that produced it (see RULES in priorityScore.ts)
  label: string; // human text, e.g. "Blocked for 2 days"
  points: number; // signed contribution
  warn: boolean; // true for blocker / overdue / risk drivers (rendered in red)
}

export interface AttentionScore {
  value: number; // == sum of reason points (always explainable)
  band: "high" | "medium" | "low";
  reasons: ScoreReason[];
}
