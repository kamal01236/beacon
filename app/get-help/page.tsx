"use client";

import Link from "next/link";
import { PERSONA, itemsOwnedBy, code } from "@/lib/data";
import { byAttention } from "@/lib/priorityScore";
import { factsFor } from "@/lib/facts";
import { kbFor, helperFor, proposal } from "@/lib/agent";
import { useWorld } from "@/lib/useWorld";
import { Crumb, AiBlock } from "@/components/ui";
import { Feedback, ProposalRow } from "@/components/hic";

export default function GetHelpPage() {
  const w = useWorld();
  const mine = byAttention(itemsOwnedBy(PERSONA.member.memberId, w), w).filter((i) => !factsFor(i, w).done);
  // the item that most needs help: blocked first, then one whose wording reads as blocked, then the top-ranked
  const item = mine.find((i) => factsFor(i, w).blocked) ?? mine.find((i) => factsFor(i, w).languageNow) ?? mine[0];

  if (!item) {
    return (
      <>
        <h1 className="h1">Get help</h1>
        <div className="state" style={{ marginTop: 14 }}><div className="st">Nothing open</div><div className="sx">You have no open items in this sprint.</div></div>
      </>
    );
  }

  const f = factsFor(item, w);
  const kb = kbFor(item, w);
  const helper = helperFor(item, w);
  const pair = helper && !helper.alreadyPairing
    ? proposal(`help-${item.id}-pair`, item.id, "get-help", {
        field: "comment",
        label: `Comment: ask ${helper.member.name.split(" ")[0]} to pair`,
        to: `@${helper.member.name.split(" ")[0]} could you pair with me on this? You ${helper.why}.`,
      }, w)
    : null;

  return (
    <>
      <Crumb href="/my-work" label="My work" />
      <h1 className="h1">Get help — {code(item)}</h1>
      <div className="sub">{item.title}{item.blocker ? ` · ${item.blocker}` : f.languageNow ? ` · your day-${f.languageNow.day} update reads as blocked` : ""}</div>

      {kb ? (
        <div style={{ marginTop: 16 }}>
          <AiBlock
            title={`Suggested reference: ${kb.article.title}`}
            tag={`matched ${kb.matched.length} of ${kb.article.tags.length} tags`}
            cite={`Matched on: ${kb.matched.join(", ")} · from the team knowledge base`}
            footer={<Feedback target={`runbook ${kb.article.id} for ${code(item)}`} w={w} label="Did this help?" />}
          >
            <p style={{ margin: 0 }}>{kb.article.summary}</p>
            <ol style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {kb.article.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </AiBlock>
        </div>
      ) : (
        <div className="state" style={{ marginTop: 16 }}>
          <div className="st">No matching runbook</div>
          <div className="sx">Nothing in the knowledge base shares two or more tags with this item&apos;s title, blocker or recent update.</div>
        </div>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="ct">Who could help</div>
        {helper ? (
          <>
            <div className="sub" style={{ marginTop: 6 }}><b>{helper.member.name}</b> — {helper.why}.{helper.alreadyPairing && " Already pairing with you, per your latest update."}</div>
            {pair && (
              <div className="props">
                <div className="fl" style={{ marginBottom: 0 }}>Nothing is sent until you approve</div>
                <ProposalRow p={pair} w={w} />
              </div>
            )}
          </>
        ) : (
          <div className="sub" style={{ marginTop: 6 }}>No teammate matches yet.</div>
        )}
        <Link className="btn s sm" href={`/item/${item.id}`} style={{ marginTop: 12 }}>Open {code(item)}</Link>
      </div>
    </>
  );
}
