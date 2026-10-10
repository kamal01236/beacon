"use client";

// The receipt layer. Every decision recorded through useActor().act() surfaces
// here with its undo — the human-in-control loop closed at the point of action
// rather than only in the Activity log.

import { useSyncExternalStore } from "react";
import { dismiss, getServerToasts, getToasts, subscribe } from "@/lib/toast";
import { undo } from "@/lib/events";

export function Toaster() {
  const toasts = useSyncExternalStore(subscribe, getToasts, getServerToasts);
  if (toasts.length === 0) return null;

  return (
    // polite, so a screen reader hears the confirmation without losing focus
    <div className="toasts" role="status" aria-live="polite" aria-label="Recent decisions">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.undoId ? " undoable" : ""}${t.tone === "warn" ? " warn" : ""}`}>
          <div className="tbody">
            <div className="tt">{t.title}</div>
            {t.message && <div className="tm">{t.message}</div>}
            {t.undoId && t.actor && (
              <div style={{ marginTop: 7 }}>
                <button
                  className="link"
                  type="button"
                  onClick={() => {
                    undo(t.undoId!, t.actor!);
                    dismiss(t.id);
                  }}
                >
                  Undo
                </button>
              </div>
            )}
          </div>
          <button className="tx" type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
