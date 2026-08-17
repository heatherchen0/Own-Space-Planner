import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultPlan } from "./apartment";
import { parsePlanFile } from "./planFile";
import { clearSavedPlan, loadPlan, savePlan } from "./storage";

const STORAGE_KEY = "own-space-planner:v2:plan";
const LEGACY_STORAGE_KEY = "own-space-planner:v1:furniture";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  failSet = false;
  failRemove = false;

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    if (this.failRemove) {
      throw new Error("remove failed");
    }
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failSet) {
      throw new Error("set failed");
    }
    this.values.set(key, value);
  }
}

let localStorage: MemoryStorage;

beforeEach(() => {
  localStorage = new MemoryStorage();
  vi.stubGlobal("window", { localStorage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("v2 plan storage", () => {
  it("saves and loads the complete plan", () => {
    const plan = createDefaultPlan();
    plan.apartment.widthCm = 500;

    expect(savePlan(plan)).toBe(true);
    expect(loadPlan()).toEqual(plan);

    const persisted = localStorage.getItem(STORAGE_KEY);
    expect(persisted).not.toBeNull();
    expect(parsePlanFile(persisted ?? "")).toEqual({ ok: true, plan });
  });

  it("rejects invalid plans before writing them", () => {
    const plan = createDefaultPlan();
    plan.furniture[0]!.color = "beige";

    expect(savePlan(plan)).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("returns null for corrupt current storage", () => {
    localStorage.setItem(STORAGE_KEY, "not json");

    expect(loadPlan()).toBeNull();
  });

  it("clears both current and legacy values", () => {
    localStorage.setItem(STORAGE_KEY, "current");
    localStorage.setItem(LEGACY_STORAGE_KEY, "legacy");

    expect(clearSavedPlan()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });
});

describe("v1 migration", () => {
  it("combines legacy furniture with the default apartment and persists v2", () => {
    const furniture = createDefaultPlan().furniture.slice(0, 1);
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(furniture));

    const migrated = loadPlan();

    expect(migrated).toEqual({
      ...createDefaultPlan(),
      furniture,
    });
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("keeps the legacy value when the v2 write fails", () => {
    const legacy = JSON.stringify(createDefaultPlan().furniture.slice(0, 1));
    localStorage.setItem(LEGACY_STORAGE_KEY, legacy);
    localStorage.failSet = true;

    expect(loadPlan()?.furniture).toHaveLength(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(legacy);
  });

  it("does not migrate malformed legacy furniture", () => {
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify([{ ...createDefaultPlan().furniture[0], color: "tan" }]),
    );

    expect(loadPlan()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
  });
});
