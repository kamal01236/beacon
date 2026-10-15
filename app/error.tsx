"use client";

// What a person sees when a screen throws.
//
// Without this file, an exception in any page unmounts the route and Next shows
// its own blank error page — the nav disappears and the only way out is the
// browser's back button. An app that a team keeps open all day has to fail
// inside its own shell: the error is contained to the one screen, the rest of
// the app stays reachable, and there is a retry that re-renders rather than
// reloading everything.
//
// It deliberately does NOT show the stack. The message is what a teammate can
// act on; `digest` is the id that matches the server log line
// (lib/server/log.ts), which is what an operator needs.

import { useEffect } from "react";

export default function ScreenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Client-side errors never reach the server logger, so put it where a
    // browser console or an error-reporting hook (phase 4) can pick it up.
    console.error("[beacon] screen error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="ct">This screen could not load</div>
      <p className="muted" style={{ margin: "8px 0 14px" }}>
        The rest of Beacon is still working — the board, your updates and the activity log are unaffected. Nothing was
        written while this screen was failing.
      </p>
      <div className="btnrow">
        <button className="btn p" onClick={reset}>
          Try this screen again
        </button>
      </div>
      {error.digest ? (
        <p className="muted" style={{ marginTop: 14, fontSize: "var(--t-meta)" }}>
          Reference <code>{error.digest}</code> — quote it if you report this.
        </p>
      ) : null}
    </div>
  );
}
