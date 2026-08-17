import { describe, expect, it } from "vitest";

import { APARTMENT_LIMITS, createDefaultPlan } from "./apartment";
import {
  MAX_PLAN_FURNITURE,
  parsePlanFile,
  serializePlan,
} from "./planFile";
import type { PlanFileV1, PlannerPlan } from "./types";

function planFile(plan: PlannerPlan = createDefaultPlan()): PlanFileV1 {
  return {
    format: "own-space-planner",
    version: 1,
    plan,
  };
}

function parseObject(value: unknown) {
  return parsePlanFile(JSON.stringify(value));
}

describe("plan file round trip", () => {
  it("serializes a versioned envelope and parses it without losing data", () => {
    const plan = createDefaultPlan();
    const serialized = serializePlan(plan);

    expect(JSON.parse(serialized)).toEqual(planFile(plan));
    expect(parsePlanFile(serialized)).toEqual({ ok: true, plan });
  });

  it("reports malformed JSON without throwing", () => {
    expect(parsePlanFile("{")).toEqual({
      ok: false,
      error: "The selected file is not valid JSON.",
    });
  });

  it("rejects a different format or unsupported version", () => {
    expect(parseObject({ ...planFile(), format: "other-planner" })).toMatchObject(
      { ok: false },
    );
    expect(parseObject({ ...planFile(), version: 2 })).toMatchObject({
      ok: false,
    });
  });

  it("rejects unknown properties instead of silently ignoring them", () => {
    expect(parseObject({ ...planFile(), unexpected: true })).toMatchObject({
      ok: false,
    });
    expect(
      parseObject({
        ...planFile(),
        plan: { ...createDefaultPlan(), unexpected: true },
      }),
    ).toMatchObject({ ok: false });
  });
});

describe("apartment validation", () => {
  it.each([
    ["template", { templateId: "future-template" }],
    ["small width", { widthCm: APARTMENT_LIMITS.minWidthCm - 1 }],
    ["large width", { widthCm: APARTMENT_LIMITS.maxWidthCm + 1 }],
    ["small length", { lengthCm: APARTMENT_LIMITS.minLengthCm - 1 }],
    ["large length", { lengthCm: APARTMENT_LIMITS.maxLengthCm + 1 }],
    ["small known area", { knownAreaSqm: APARTMENT_LIMITS.minKnownAreaSqm - 1 }],
    ["large known area", { knownAreaSqm: APARTMENT_LIMITS.maxKnownAreaSqm + 1 }],
    ["non-finite width", { widthCm: Number.POSITIVE_INFINITY }],
  ])("rejects an invalid %s", (_description, apartmentChange) => {
    const plan = createDefaultPlan();
    Object.assign(plan.apartment, apartmentChange);

    expect(parseObject(planFile(plan))).toMatchObject({ ok: false });
  });
});

describe("furniture validation", () => {
  it.each([
    ["empty id", { id: "" }],
    ["long id", { id: "x".repeat(101) }],
    ["long label", { label: "x".repeat(101) }],
    ["non-finite x", { x: Number.NaN }],
    ["non-finite y", { y: Number.NEGATIVE_INFINITY }],
    ["small width", { width: 9 }],
    ["large width", { width: 1001 }],
    ["small depth", { depth: 9 }],
    ["large depth", { depth: 1001 }],
    ["unsupported rotation", { rotation: 45 }],
    ["short hex colour", { color: "#fff" }],
    ["invalid hex colour", { color: "#gggggg" }],
  ])("rejects an invalid %s", (_description, furnitureChange) => {
    const plan = createDefaultPlan();
    Object.assign(plan.furniture[0]!, furnitureChange);

    expect(parseObject(planFile(plan))).toMatchObject({ ok: false });
  });

  it("rejects duplicate ids", () => {
    const plan = createDefaultPlan();
    plan.furniture[1]!.id = plan.furniture[0]!.id;

    expect(parseObject(planFile(plan))).toMatchObject({ ok: false });
  });

  it("rejects more than 200 items", () => {
    const item = createDefaultPlan().furniture[0]!;
    const plan = createDefaultPlan();
    plan.furniture = Array.from(
      { length: MAX_PLAN_FURNITURE + 1 },
      (_, index) => ({ ...item, id: `item-${index}` }),
    );

    expect(parseObject(planFile(plan))).toMatchObject({ ok: false });
  });

  it("accepts boundary dimensions, arbitrary finite coordinates, and hex case", () => {
    const plan = createDefaultPlan();
    Object.assign(plan.furniture[0]!, {
      x: -10_000,
      y: 10_000,
      width: 10,
      depth: 1000,
      color: "#Aa09Ff",
    });

    expect(parseObject(planFile(plan))).toMatchObject({ ok: true });
  });

  it("makes serialization fail fast for an invalid in-memory plan", () => {
    const plan = createDefaultPlan();
    plan.furniture[0]!.color = "not-a-colour";

    expect(() => serializePlan(plan)).toThrow(/Cannot export invalid plan/);
  });
});
