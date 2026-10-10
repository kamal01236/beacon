// Transient confirmations.
//
// A toast is the receipt for a decision: it names what was recorded and, when
// the decision is reversible, carries the way back. It is the undo that
// reaches the person at the moment of doubt — the Activity log keeps the
// permanent one (components/hic.tsx).
//
// Toasts are UI only: they are never stored, never counted in adoption, and
// never change the world. The event log remains the single source of truth.

export interface Toast {
  id: string;
  title: string;
  message?: string;
  /** Event id this toast can undo, if any. */
  undoId?: string;
  /** The person whose decision it was — undo is recorded as theirs. */
  actor?: string;
  tone?: "ok" | "warn";
  ms: number;
}

const listeners = new Set<() => void>();
let list: Toast[] = [];
const EMPTY: Toast[] = [];
let seq = 0;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  listeners.forEach((l) => l());
}

export function push(t: Omit<Toast, "id" | "ms"> & { ms?: number }): string {
  const id = `t-${(seq++).toString(36)}`;
  const toast: Toast = { ms: t.undoId ? 9000 : 4500, ...t, id };
  // Three at a time is plenty; a burst of decisions shouldn't bury the screen.
  list = [...list, toast].slice(-3);
  emit();
  timers.set(
    id,
    setTimeout(() => dismiss(id), toast.ms),
  );
  return id;
}

export function dismiss(id: string) {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  list = list.filter((t) => t.id !== id);
  emit();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getToasts = (): Toast[] => list;
export const getServerToasts = (): Toast[] => EMPTY;
