import Link from "next/link";
import { itemById, storyForItem } from "@/lib/data";
import { Crumb } from "@/components/ui";

export default function GetHelpPage() {
  const item = itemById("req-001")!;

  return (
    <>
      <Crumb href="/my-work" label="My work" />
      <h1 className="h1">Get help — {item.id.toUpperCase()}</h1>
      <div className="sub">{item.title} · {item.blocker}</div>

      <div className="ai" style={{ marginTop: 16 }}>
        <div className="aihead">
          <div className="ct">Suggested next step</div>
          <span className="conf">confidence 86%</span>
        </div>
        <div className="aiout">
          This looks like the common Express + Stripe pitfall: the JSON body parser consumes the raw
          request body before the webhook signature check runs, so verification always fails. Mount
          the Stripe webhook route with <code>express.raw(&#123; type: &apos;application/json&apos; &#125;)</code> <i>before</i> the
          global <code>express.json()</code> middleware.
        </div>
        <div className="cite">Grounded in: internal runbook &ldquo;Stripe webhooks&rdquo; · Stripe docs on signature verification</div>
        <div className="aiact">
          <button className="btn p sm" type="button">Pair with James</button>
          <button className="btn s sm" type="button">Open runbook</button>
          <button className="btn g sm" type="button">Not helpful</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="ct">What Beacon will do</div>
        <div className="sub" style={{ marginTop: 6 }}>
          If you accept, Beacon drafts a blocker note on {item.id.toUpperCase()}, suggests James as helper
          (he resolved a similar issue in Sprint 1), and previews the Jira comment before anything is written.
        </div>
        <Link className="btn s sm" href={`/item/${item.id}`} style={{ marginTop: 10 }}>Open the item</Link>
      </div>
    </>
  );
}
