// A 404 inside the app shell.
//
// This matters more than it looks: item and member detail pages are generated
// per id (generateStaticParams), so a stale link, a deleted item or a typo is a
// normal event rather than an exception. Landing in the app with a way back is
// the difference between "that link is old" and "Beacon is broken".

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="ct">Not found</div>
      <p className="muted" style={{ margin: "8px 0 14px" }}>
        That page does not exist here. If you followed a link to an item, it may have been renamed in the tracker, or it
        belongs to a sprint this instance does not hold.
      </p>
      <div className="btnrow">
        <Link className="btn p" href="/overview">
          Go to Overview
        </Link>
        <Link className="btn s" href="/board">
          Open the board
        </Link>
      </div>
    </div>
  );
}
