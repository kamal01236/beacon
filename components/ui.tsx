import Link from "next/link";
import type { Item, Member, ItemStatus, AttentionScore } from "@/lib/types";
import { attentionScore } from "@/lib/priorityScore";

export function Avatar({ member, size }: { member?: Member; size?: "sm" | "lg" }) {
  if (!member) return <span className={`av${size ? " " + size : ""}`}>—</span>;
  const initials = member.name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <span
      className={`av${size ? " " + size : ""}`}
      style={{ background: member.avatarColor }}
      title={member.name}
    >
      {initials}
    </span>
  );
}

export function TypeTag({ item }: { item: Item }) {
  return <span className={`type ${item.type}`}>{item.id.toUpperCase()}</span>;
}

const STATUS: Record<ItemStatus, { cls: string; label: string }> = {
  blocked: { cls: "r", label: "Blocked" },
  overdue: { cls: "a", label: "Overdue" },
  spillover: { cls: "v", label: "Spillover" },
  done: { cls: "g", label: "Done" },
  confirmed: { cls: "g", label: "Confirmed" },
  resolved: { cls: "g", label: "Resolved" },
  in_progress: { cls: "n", label: "In progress" },
  todo: { cls: "n", label: "To do" },
  monitoring: { cls: "a", label: "Monitoring" },
};

export function StatusPill({ status }: { status: ItemStatus }) {
  const s = STATUS[status] ?? { cls: "n", label: status };
  return <span className={`pill ${s.cls}`}>{s.label}</span>;
}

/** The attention score with its explainable reason chips — the core control. */
export function ScoreReasons({
  score,
  showSum = true,
}: {
  score: AttentionScore;
  showSum?: boolean;
}) {
  return (
    <div>
      <span className={`score ${score.band === "high" ? "hi" : score.band === "medium" ? "md" : "lo"}`}>
        {score.value}
      </span>
      <div className="reasons">
        {score.reasons.map((r, i) => (
          <b key={i} className={r.warn ? "w" : ""}>
            {r.label} {r.points >= 0 ? "+" : ""}
            {r.points}
          </b>
        ))}
        {showSum && <span className="sum">= {score.value}</span>}
      </div>
    </div>
  );
}

export function ScoreFor({ item }: { item: Item }) {
  return <ScoreReasons score={attentionScore(item)} />;
}

export function Crumb({ href, label }: { href: string; label: string }) {
  return (
    <Link className="crumb" href={href}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
        <path d="M15 6l-6 6 6 6" />
      </svg>
      {label}
    </Link>
  );
}

/** The AI block: output + confidence + cited source + Accept / Edit / Dismiss. */
export function AiBlock({
  title,
  confidence,
  low,
  cite,
  children,
}: {
  title: string;
  confidence: number;
  low?: boolean;
  cite?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ai">
      <div className="aihead">
        <div className="ct">{title}</div>
        <span className={`conf${low ? " low" : ""}`}>confidence {confidence}%</span>
      </div>
      <div className="aiout">{children}</div>
      {cite && <div className="cite">{cite}</div>}
      <div className="aiact">
        <button className="btn p sm" type="button">{low ? "Review" : "Looks right"}</button>
        <button className="btn s sm" type="button">Edit</button>
        <button className="btn g sm" type="button">Dismiss</button>
      </div>
    </div>
  );
}
