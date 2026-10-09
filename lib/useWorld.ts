"use client";

import { useMemo, useSyncExternalStore } from "react";
import { subscribe, getEvents, getServerEvents, record, type Draft, type NewEvent } from "./events";
import { buildWorld } from "./world";
import { PERSONA, type World } from "./data";
import { useRole } from "@/components/RoleProvider";

/** The seed + this session's recorded decisions. Server render and first paint use the plain seed. */
export function useWorld(): World {
  const events = useSyncExternalStore(subscribe, getEvents, getServerEvents);
  return useMemo(() => buildWorld(events), [events]);
}

/** Every recorded event, including undone ones — for the activity log. */
export function useAllEvents() {
  return useSyncExternalStore(subscribe, getEvents, getServerEvents);
}

/** Who is acting, and whether their role may record decisions (the manager view is read-only). */
export function useActor() {
  const { role } = useRole();
  const p = PERSONA[role];
  return {
    role,
    memberId: p.memberId,
    canAct: p.canAct,
    act: (e: Draft) => (p.canAct ? record({ ...e, actor: p.memberId } as NewEvent) : null),
  };
}
