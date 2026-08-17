import { createDefaultPlan } from "./apartment";
import {
  isFurnitureItem,
  parsePlanFile,
  serializePlan,
  validateFurnitureList,
} from "./planFile";
import type { FurnitureItem, PlannerPlan } from "./types";

const STORAGE_KEY = "own-space-planner:v2:plan";
const LEGACY_STORAGE_KEY = "own-space-planner:v1:furniture";

// Kept as a re-export for callers that validated v1 furniture through storage.
export { isFurnitureItem };

function parseLegacyFurniture(source: string): FurnitureItem[] | null {
  try {
    const parsed: unknown = JSON.parse(source);
    return validateFurnitureList(parsed) === null
      ? (parsed as FurnitureItem[])
      : null;
  } catch {
    return null;
  }
}

export function loadPlan(): PlannerPlan | null {
  try {
    const current = window.localStorage.getItem(STORAGE_KEY);
    if (current) {
      const result = parsePlanFile(current);
      if (result.ok) {
        return result.plan;
      }
    }

    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy) {
      return null;
    }

    const furniture = parseLegacyFurniture(legacy);
    if (!furniture) {
      return null;
    }

    const migrated: PlannerPlan = {
      ...createDefaultPlan(),
      furniture,
    };

    // Keep the v1 value if writing v2 fails so the migration can be retried.
    if (savePlan(migrated)) {
      try {
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        // The valid v2 value is already durable; a stale v1 value is harmless.
      }
    }

    return migrated;
  } catch {
    return null;
  }
}

export function savePlan(plan: PlannerPlan): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializePlan(plan));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedPlan(): boolean {
  let cleared = true;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    cleared = false;
  }

  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    cleared = false;
  }

  return cleared;
}
