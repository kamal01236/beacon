import Link from "next/link";
import type { Item, Member, ItemStatus, AttentionScore } from "@/lib/types";

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
  cancelled: { cls: "n", label: "Cancelled" },
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
  if (score.reasons.length === 0) return <div className="reasons"><span className="sum">Done — no attention needed</span></div>;
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

/**
 * A generated summary block. It is assembled from data by rules, so it carries
 * what it was built from (`cite`) rather than a confidence number.
 */
export function AiBlock({
  title,
  tag = "generated from data",
  cite,
  children,
  footer,
}: {
  title: string;
  tag?: string;
  cite?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="ai">
      <div className="aihead">
        <div className="ct">{title}</div>
        <span className="conf fact">{tag}</span>
      </div>
      <div className="aiout">{children}</div>
      {cite && <div className="cite">{cite}</div>}
      {footer}
    </div>
  );
}
