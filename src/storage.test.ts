import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultPlan } from "./apartment";
import { parsePlanFile, serializePlan } from "./planFile";
import {
  clearSavedPlan,
  loadLegacyPlan,
  loadPlan,
  loadPreviousPlan,
  loadUnreadablePlan,
  savePlan,
  savePreviousPlan,
} from "./storage";
import type { FurnitureItem } from "./types";

const STORAGE_KEY = "own-space-planner:v3:plan";
const PREVIOUS_PLAN_KEY = "own-space-planner:v3:previous-plan";
const PREVIOUS_STORAGE_KEY = "own-space-planner:v2:plan";
const LEGACY_STORAGE_KEY = "own-space-planner:v1:furniture";
const UNREADABLE_PLAN_KEY = "own-space-planner:v3:unreadable-plan";

// Independent synthetic fixtures keep personal layouts out of tracked tests.
function sampleFurniture(): FurnitureItem {
  return { id: "sample-chair", label: "Sample chair", x: 150, y: 200, width: 50, depth: 50, rotation: 0, color: "#abcdef" };
}

function legacySource(): string {
  return JSON.stringify({
    format: "own-space-planner",
    version: 1,
    plan: {
      apartment: { templateId: "starter-studio-v1", widthCm: 800, lengthCm: 900, knownAreaSqm: 72 },
      furniture: [sampleFurniture()],
    },
  });
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  failGet = false;
  failSet = false;
  failRemove = false;

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null {
    if (this.failGet) throw new Error("read failed");
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void {
    if (this.failRemove) throw new Error("remove failed");
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.failSet) throw new Error("write failed");
    this.values.set(key, value);
  }
}

let localStorage: MemoryStorage;

beforeEach(() => {
  localStorage = new MemoryStorage();
  vi.stubGlobal("window", { localStorage });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("complete v3 browser storage", () => {
  it("saves and loads the complete v2 format, including fixed geometry", () => {
    const plan = createDefaultPlan();
    plan.layout.extent = { x: -10, y: 0, width: 600, height: 800 };
    plan.layout.shapes.push({ type: "line", style: "wall", x1: 10, y1: 20, x2: 100, y2: 20 });
    plan.layout.blockedZones.push({ id: "fixed", label: "Sample fixed area", x: 10, y: 20, width: 90, height: 20 });
    plan.furniture.push(sampleFurniture());
    expect(savePlan(plan)).toBe(true);
    expect(loadPlan()).toEqual(plan);
    expect(parsePlanFile(localStorage.getItem(STORAGE_KEY) ?? "")).toEqual({ ok: true, plan });
  });

  it("does not overwrite a valid saved plan when new data is invalid or a write fails", () => {
    const initial = createDefaultPlan();
    expect(savePlan(initial)).toBe(true);
    const source = localStorage.getItem(STORAGE_KEY);
    const invalid = createDefaultPlan();
    invalid.furniture = [{ ...sampleFurniture(), color: "beige" }];
    expect(savePlan(invalid)).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(source);
    localStorage.failSet = true;
    const changed = createDefaultPlan();
    changed.apartment.widthCm = 800;
    expect(savePlan(changed)).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(source);
  });

  it("returns null for corrupt or inaccessible storage without modifying it", () => {
    localStorage.setItem(STORAGE_KEY, "not json");
    expect(loadPlan()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("not json");
    localStorage.failGet = true;
    expect(loadPlan()).toBeNull();
    expect(loadLegacyPlan()).toBeNull();
    expect(loadPreviousPlan()).toBeNull();
  });

  it("preserves unreadable current data verbatim before replacing it", () => {
    const source = '{"unfinished personal backup":';
    localStorage.setItem(STORAGE_KEY, source);
    expect(savePlan(createDefaultPlan())).toBe(true);
    expect(localStorage.getItem(UNREADABLE_PLAN_KEY)).toBe(source);
    expect(loadUnreadablePlan()).toBe(source);
    expect(loadPlan()).toEqual(createDefaultPlan());
  });

  it("refuses to replace unreadable data when preserving it fails", () => {
    const source = "unreadable original";
    localStorage.setItem(STORAGE_KEY, source);
    localStorage.failSet = true;
    expect(savePlan(createDefaultPlan())).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(source);
    expect(localStorage.getItem(UNREADABLE_PLAN_KEY)).toBeNull();
  });

  it("keeps the earliest unreadable backup when a different unreadable save appears", () => {
    localStorage.setItem(UNREADABLE_PLAN_KEY, "earliest source");
    localStorage.setItem(STORAGE_KEY, "different unreadable source");
    expect(savePlan(createDefaultPlan())).toBe(false);
    expect(loadUnreadablePlan()).toBe("earliest source");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("different unreadable source");
  });

  it("refuses to overwrite current data if reading it is inaccessible", () => {
    expect(savePlan(createDefaultPlan())).toBe(true);
    localStorage.failGet = true;
    expect(savePlan(createDefaultPlan())).toBe(false);
    localStorage.failGet = false;
    expect(loadPlan()).toEqual(createDefaultPlan());
  });

  it("loads valid v2-format data from the previous key without migrating or removing it", () => {
    const plan = createDefaultPlan();
    plan.furniture = [sampleFurniture()];
    const source = serializePlan(plan);
    localStorage.setItem(PREVIOUS_STORAGE_KEY, source);
    expect(loadPlan()).toEqual(plan);
    expect(loadLegacyPlan()).toBeNull();
    expect(localStorage.getItem(PREVIOUS_STORAGE_KEY)).toBe(source);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("prefers the current full plan over an older full plan", () => {
    const previous = createDefaultPlan();
    previous.apartment.widthCm = 800;
    localStorage.setItem(PREVIOUS_STORAGE_KEY, serializePlan(previous));
    const current = createDefaultPlan();
    expect(savePlan(current)).toBe(true);
    expect(loadPlan()).toEqual(current);
  });

  it("clears only the current value, retaining recovery and original legacy data", () => {
    localStorage.setItem(STORAGE_KEY, "current");
    localStorage.setItem(PREVIOUS_PLAN_KEY, "previous-plan");
    localStorage.setItem(PREVIOUS_STORAGE_KEY, "older-plan");
    localStorage.setItem(LEGACY_STORAGE_KEY, "older-furniture");
    expect(clearSavedPlan()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(PREVIOUS_PLAN_KEY)).toBe("previous-plan");
    expect(localStorage.getItem(PREVIOUS_STORAGE_KEY)).toBe("older-plan");
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe("older-furniture");
  });

  it("reports failed removal and leaves all recovery values available", () => {
    localStorage.setItem(STORAGE_KEY, "current");
    localStorage.setItem(PREVIOUS_STORAGE_KEY, legacySource());
    localStorage.failRemove = true;
    expect(clearSavedPlan()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("current");
    expect(loadLegacyPlan()).not.toBeNull();
  });
});

describe("previous-plan recovery slot", () => {
  it("round trips a full backup independently of current and older values", () => {
    const previous = createDefaultPlan();
    previous.layout.shapes = [{ type: "text", style: "label", x: 10, y: 10, text: "Sample", rotate: 0 }];
    previous.furniture = [sampleFurniture()];
    expect(savePreviousPlan(previous)).toBe(true);
    expect(savePlan(createDefaultPlan())).toBe(true);
    expect(loadPreviousPlan()).toEqual(previous);
    expect(loadPlan()).toEqual(createDefaultPlan());
    expect(clearSavedPlan()).toBe(true);
    expect(loadPreviousPlan()).toEqual(previous);
  });

  it("reports failed or invalid backups without destroying the existing backup", () => {
    const previous = createDefaultPlan();
    expect(savePreviousPlan(previous)).toBe(true);
    const source = localStorage.getItem(PREVIOUS_PLAN_KEY);
    const invalid = createDefaultPlan();
    invalid.apartment.widthCm = 0;
    expect(savePreviousPlan(invalid)).toBe(false);
    expect(localStorage.getItem(PREVIOUS_PLAN_KEY)).toBe(source);
    localStorage.failSet = true;
    expect(savePreviousPlan(createDefaultPlan())).toBe(false);
    expect(localStorage.getItem(PREVIOUS_PLAN_KEY)).toBe(source);
  });

  it("rejects a corrupt or furniture-only previous backup", () => {
    localStorage.setItem(PREVIOUS_PLAN_KEY, "not json");
    expect(loadPreviousPlan()).toBeNull();
    localStorage.setItem(PREVIOUS_PLAN_KEY, legacySource());
    expect(loadPreviousPlan()).toBeNull();
  });
});

describe("explicit legacy recovery", () => {
  it("preserves old full-plan source and returns only its dimensions and furniture", () => {
    const source = legacySource();
    localStorage.setItem(PREVIOUS_STORAGE_KEY, source);
    expect(loadPlan()).toBeNull();
    expect(loadLegacyPlan()).toEqual({
      source,
      plan: { apartment: { widthCm: 800, lengthCm: 900, knownAreaSqm: 72 }, furniture: [sampleFurniture()] },
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(PREVIOUS_STORAGE_KEY)).toBe(source);
  });

  it("leaves old furniture unchanged even while saves or removals fail", () => {
    const source = JSON.stringify([sampleFurniture()]);
    localStorage.setItem(LEGACY_STORAGE_KEY, source);
    localStorage.failSet = true;
    localStorage.failRemove = true;
    expect(loadPlan()).toBeNull();
    expect(loadLegacyPlan()).toEqual({ source, plan: { furniture: [sampleFurniture()] } });
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(source);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("prefers an older full-plan backup and falls back to valid furniture when it is corrupt", () => {
    const furnitureSource = JSON.stringify([sampleFurniture()]);
    localStorage.setItem(LEGACY_STORAGE_KEY, furnitureSource);
    localStorage.setItem(PREVIOUS_STORAGE_KEY, legacySource());
    expect(loadLegacyPlan()?.source).toBe(legacySource());
    localStorage.setItem(PREVIOUS_STORAGE_KEY, "not json");
    expect(loadLegacyPlan()).toEqual({ source: furnitureSource, plan: { furniture: [sampleFurniture()] } });
    expect(localStorage.getItem(PREVIOUS_STORAGE_KEY)).toBe("not json");
  });

  it("does not recover invalid furniture or rewrite any old key", () => {
    const source = JSON.stringify([{ ...sampleFurniture(), color: "tan" }]);
    localStorage.setItem(LEGACY_STORAGE_KEY, source);
    expect(loadPlan()).toBeNull();
    expect(loadLegacyPlan()).toBeNull();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(source);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
