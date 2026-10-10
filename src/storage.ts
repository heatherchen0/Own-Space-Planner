import { parseLegacyPlanFile, parsePlanFile, serializePlan } from "./planFile";
import type { LegacyPlan, PlannerPlan } from "./types";

const STORAGE_KEY = "own-space-planner:v3:plan";
const PREVIOUS_STORAGE_KEY = "own-space-planner:v2:plan";
const LEGACY_STORAGE_KEY = "own-space-planner:v1:furniture";
const PREVIOUS_PLAN_KEY = "own-space-planner:v3:previous-plan";
const UNREADABLE_PLAN_KEY = "own-space-planner:v3:unreadable-plan";

export { isFurnitureItem } from "./planFile";

function readStoredValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function loadPlan(): PlannerPlan | null {
  for (const key of [STORAGE_KEY, PREVIOUS_STORAGE_KEY]) {
    const source = readStoredValue(key);
    if (!source) continue;
    const result = parsePlanFile(source);
    if (result.ok) return result.plan;
  }
  return null;
}

export function loadLegacyPlan(): { source: string; plan: LegacyPlan } | null {
  for (const key of [PREVIOUS_STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    const source = readStoredValue(key);
    if (!source) continue;
    const result = parseLegacyPlanFile(source);
    if (result.ok) return { source, plan: result.plan };
  }
  return null;
}

export function savePlan(plan: PlannerPlan): boolean {
  try {
    const source = serializePlan(plan);
    const current = window.localStorage.getItem(STORAGE_KEY);
    if (current !== null && !parsePlanFile(current).ok) {
      // Preserve the exact source for recovery before replacing unreadable data.
      const preserved = window.localStorage.getItem(UNREADABLE_PLAN_KEY);
      if (preserved !== null && preserved !== current) return false;
      if (preserved === null) window.localStorage.setItem(UNREADABLE_PLAN_KEY, current);
    }
    window.localStorage.setItem(STORAGE_KEY, source);
    return true;
  } catch {
    return false;
  }
}

export function loadUnreadablePlan(): string | null {
  return readStoredValue(UNREADABLE_PLAN_KEY);
}

export function loadPreviousPlan(): PlannerPlan | null {
  const source = readStoredValue(PREVIOUS_PLAN_KEY);
  if (!source) return null;
  const result = parsePlanFile(source);
  return result.ok ? result.plan : null;
}

export function savePreviousPlan(plan: PlannerPlan): boolean {
  try {
    window.localStorage.setItem(PREVIOUS_PLAN_KEY, serializePlan(plan));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedPlan(): boolean {
  try {
    // Older keys remain available for explicit recovery and backup.
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
