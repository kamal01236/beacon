"use client";

// The last resort: an error thrown by the root layout itself, where the app
// shell (and therefore the stylesheet, the nav and app/error.tsx) is not
// available. This component replaces the whole document, so it carries its own
// <html>/<body> and inline styling and assumes nothing about the app.
//
// If a person ever sees this, the deploy is broken rather than one screen.

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0F2A4A",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          padding: 24,
        }}
      >
        <main style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 10px" }}>Beacon could not start</h1>
          <p style={{ opacity: 0.8, lineHeight: 1.5, margin: "0 0 18px" }}>
            This is a problem with the running build, not with your data. No decisions were lost — the log is
            append-only and is stored outside the app.
          </p>
          <button
            onClick={reset}
            style={{
              font: "inherit",
              padding: "10px 16px",
              borderRadius: 8,
              border: 0,
              background: "#0E6A6A",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest ? <p style={{ opacity: 0.6, fontSize: 12, marginTop: 16 }}>Reference {error.digest}</p> : null}
        </main>
      </body>
    </html>
  );
}
