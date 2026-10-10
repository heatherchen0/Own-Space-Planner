import { describe, expect, it } from "vitest";

import { APARTMENT_LIMITS, createDefaultPlan } from "./apartment";
import {
  MAX_PLAN_BLOCKED_ZONES,
  MAX_PLAN_COORDINATE,
  MAX_PLAN_FILE_BYTES,
  MAX_PLAN_FURNITURE,
  MAX_PLAN_PATH_LENGTH,
  MAX_PLAN_SHAPES,
  MAX_PLAN_TEXT_LENGTH,
  parseLegacyPlanFile,
  parsePlanFile,
  serializePlan,
} from "./planFile";
import type { FurnitureItem, PlanFileV2, PlannerPlan, PlanShape } from "./types";

// Independent synthetic data; no personal apartment geometry belongs in tests.
function sampleFurniture(): FurnitureItem {
  return { id: "sample-desk", label: "Sample desk", x: 120, y: 180, width: 80, depth: 40, rotation: 90, color: "#Aa09Ff" };
}

function samplePlan(): PlannerPlan {
  return {
    apartment: { widthCm: 800, lengthCm: 900, knownAreaSqm: 72 },
    layout: {
      extent: { x: -25, y: -25, width: 850, height: 1000 },
      shapes: [
        { type: "rect", style: "surface", x: 10, y: 20, width: 100, height: 80 },
        { type: "line", style: "wall", x1: 10, y1: 20, x2: 110, y2: 20 },
        { type: "ellipse", style: "detail", cx: 200, cy: 200, rx: 20, ry: 30 },
        { type: "path", style: "fixture", d: "M 40 50 l 10 0 H 80 v 20 C 80 80 90 90 100 100 s 10 10 20 0 Q 140 110 150 100 t 20 0 A 12 8 0 0 1 190 100 z" },
        { type: "text", style: "label", x: 300, y: 300, text: "Synthetic room", rotate: -90 },
      ],
      blockedZones: [{ id: "fixed-fixture", label: "Fixed fixture", x: 10, y: 20, width: 100, height: 80 }],
    },
    furniture: [sampleFurniture()],
  };
}

function planFile(plan: PlannerPlan = samplePlan()): PlanFileV2 {
  return { format: "own-space-planner", version: 2, plan };
}

function parseObject(value: unknown) {
  return parsePlanFile(JSON.stringify(value));
}

function legacyFile() {
  return {
    format: "own-space-planner",
    version: 1,
    plan: {
      apartment: { templateId: "starter-studio-v1", widthCm: 800, lengthCm: 900, knownAreaSqm: 72 },
      furniture: [sampleFurniture()],
    },
  };
}

describe("complete v2 plan files", () => {
  it("round trips fixed geometry, every drawing primitive, and furniture", () => {
    const plan = samplePlan();
    const serialized = serializePlan(plan);
    expect(JSON.parse(serialized)).toEqual(planFile(plan));
    expect(parsePlanFile(serialized)).toEqual({ ok: true, plan });
    expect(parsePlanFile(serializePlan(createDefaultPlan()))).toEqual({ ok: true, plan: createDefaultPlan() });
  });

  it("reports malformed JSON and oversized files without throwing", () => {
    expect(parsePlanFile("{")).toEqual({ ok: false, error: "The selected file is not valid JSON." });
    expect(parsePlanFile(" ".repeat(MAX_PLAN_FILE_BYTES + 1))).toMatchObject({ ok: false });
  });

  it.each([
    { ...planFile(), format: "other-planner" },
    { ...planFile(), version: 99 },
    { ...planFile(), unexpected: true },
    { ...planFile(), plan: { ...samplePlan(), unexpected: true } },
    { ...planFile(), plan: { ...samplePlan(), layout: undefined } },
  ])("rejects unsupported envelopes and plan structure", (value) => {
    expect(parseObject(value)).toMatchObject({ ok: false });
  });

  it("makes an older import explain the explicit layout recovery step", () => {
    expect(parseObject(legacyFile())).toEqual({
      ok: false,
      error: expect.stringMatching(/complete floor plan first.*again to restore its furniture/),
    });
  });

  it("applies the same UTF-8 byte limit to exports and imports", () => {
    const plan = createDefaultPlan();
    plan.layout.shapes = Array.from({ length: MAX_PLAN_SHAPES }, (_, index): PlanShape =>
      index < 250
        ? { type: "path", style: "detail", d: "M0 0 " + "l1 0 ".repeat(690) + "z" }
        : { type: "text", style: "label", x: 0, y: 0, text: "界".repeat(MAX_PLAN_TEXT_LENGTH), rotate: 0 },
    );
    const source = JSON.stringify(planFile(plan), null, 2);
    expect(source.length).toBeLessThan(MAX_PLAN_FILE_BYTES);
    expect(new TextEncoder().encode(source).length).toBeGreaterThan(MAX_PLAN_FILE_BYTES);
    expect(parsePlanFile(source)).toMatchObject({ ok: false, error: expect.stringContaining("1 MB") });
    expect(() => serializePlan(plan)).toThrow(/1 MB/);
  });
});

describe("bounded apartment and furniture data", () => {
  it.each([
    { templateId: "unexpected" },
    { widthCm: APARTMENT_LIMITS.minWidthCm - 1 },
    { widthCm: APARTMENT_LIMITS.maxWidthCm + 1 },
    { lengthCm: APARTMENT_LIMITS.minLengthCm - 1 },
    { lengthCm: APARTMENT_LIMITS.maxLengthCm + 1 },
    { knownAreaSqm: APARTMENT_LIMITS.minKnownAreaSqm - 1 },
    { knownAreaSqm: APARTMENT_LIMITS.maxKnownAreaSqm + 1 },
    { widthCm: Number.POSITIVE_INFINITY },
  ])("rejects unsupported apartment data %o", (change) => {
    const plan = samplePlan();
    Object.assign(plan.apartment, change);
    expect(parseObject(planFile(plan))).toMatchObject({ ok: false });
  });

  it.each([
    { id: "" }, { id: "x".repeat(101) }, { label: "x".repeat(101) },
    { x: Number.NaN }, { y: Number.NEGATIVE_INFINITY },
    { x: MAX_PLAN_COORDINATE + 1 }, { y: -MAX_PLAN_COORDINATE - 1 },
    { width: 9 }, { width: 1001 }, { depth: 9 }, { depth: 1001 },
    { rotation: 45 }, { color: "#fff" }, { color: "#gggggg" }, { unexpected: true },
  ])("rejects unsupported furniture data %o", (change) => {
    const plan = samplePlan();
    Object.assign(plan.furniture[0]!, change);
    expect(parseObject(planFile(plan))).toMatchObject({ ok: false });
  });

  it("rejects duplicate ids and too many furniture items", () => {
    const plan = samplePlan();
    plan.furniture.push(sampleFurniture());
    expect(parseObject(planFile(plan))).toMatchObject({ ok: false });
    plan.furniture = Array.from({ length: MAX_PLAN_FURNITURE + 1 }, (_, index) => ({ ...sampleFurniture(), id: `item-${index}` }));
    expect(parseObject(planFile(plan))).toMatchObject({ ok: false });
  });

  it("accepts boundary dimensions, bounded outside coordinates, and hex case", () => {
    const plan = samplePlan();
    Object.assign(plan.furniture[0]!, { x: -MAX_PLAN_COORDINATE, y: MAX_PLAN_COORDINATE, width: 10, depth: 1000 });
    expect(parseObject(planFile(plan))).toMatchObject({ ok: true });
  });

  it("rejects invalid in-memory values before export", () => {
    const plan = samplePlan();
    plan.furniture[0]!.x = Number.NaN;
    expect(() => serializePlan(plan)).toThrow(/Cannot export invalid plan/);
  });
});

describe("fixed layout validation", () => {
  it.each([
    { type: "rect", style: "surface", x: 0, y: 0, width: -1, height: 10 },
    { type: "rect", style: "surface", x: 9999, y: 0, width: 10, height: 10 },
    { type: "line", style: "wall", x1: 0, y1: 0, x2: 1e100, y2: 0 },
    { type: "ellipse", style: "detail", cx: 0, cy: 0, rx: 0, ry: 10 },
    { type: "ellipse", style: "detail", cx: 9999, cy: 0, rx: 10, ry: 10 },
    { type: "text", style: "label", x: 0, y: 0, text: "x".repeat(MAX_PLAN_TEXT_LENGTH + 1), rotate: 0 },
    { type: "text", style: "label", x: 0, y: 0, text: "Sample", rotate: 361 },
    { type: "text", style: "label", x: 0, y: 0, text: "Sample" },
    { type: "rect", style: "url(external)", x: 0, y: 0, width: 10, height: 10 },
    { type: "image", style: "detail", href: "external" },
    { type: "line", style: "wall", x1: 0, y1: 0, x2: 10, y2: 0, onload: "alert(1)" },
  ])("rejects unsupported shape values %o", (shape) => {
    const plan = samplePlan();
    plan.layout.shapes = [shape as PlanShape];
    expect(parseObject(planFile(plan))).toMatchObject({ ok: false });
  });

  it.each([
    "", "M", "L 10 10", "M 0 0 L 10", "M 0 0 Z 5", "M 1e99 0", "M 0 0 l 10000 0 l 1 0",
    "M,0 0", "M 0,,0", "M 0 0,", "M 0 0, L 1 1",
    "M 0 0 A -1 5 0 0 1 10 10", "M 0 0 A 5 5 0 2 1 10 10",
    '<svg onload="alert(1)">', "M0 0 javascript:alert(1)",
    "M 0 0 " + "L 1 1 ".repeat(MAX_PLAN_PATH_LENGTH),
  ])("rejects malformed, excessive, or non-drawing paths", (d) => {
    const plan = samplePlan();
    plan.layout.shapes = [{ type: "path", style: "detail", d }];
    expect(parseObject(planFile(plan))).toMatchObject({ ok: false });
  });

  it("accepts scientific notation and all supported style categories", () => {
    const plan = samplePlan();
    plan.layout.shapes = ["surface", "wall", "fixture", "clearance", "outdoor", "detail", "partition", "dimension", "label", "muted"].map(
      (style) => ({ type: "path", style, d: "M 1e2 .5 l +10 -0.5 z" }) as PlanShape,
    );
    expect(parseObject(planFile(plan))).toMatchObject({ ok: true });
  });

  it("rejects unsupported extents, layout keys, and excessive shapes", () => {
    const plan = samplePlan();
    plan.layout.extent = { x: 0, y: 0, width: 0, height: 10 };
    expect(parseObject(planFile(plan))).toMatchObject({ ok: false });
    plan.layout.extent = null;
    plan.layout.shapes = Array.from({ length: MAX_PLAN_SHAPES + 1 }, () => ({ type: "path", style: "detail", d: "M 0 0 L 1 1" }));
    expect(parseObject(planFile(plan))).toMatchObject({ ok: false });
    expect(parseObject(planFile({ ...samplePlan(), layout: { ...samplePlan().layout, unexpected: true } } as PlannerPlan))).toMatchObject({ ok: false });
  });

  it("rejects invalid and duplicate blocked zones and excessive zone counts", () => {
    const plan = samplePlan();
    plan.layout.blockedZones[0]!.width = -1;
    expect(parseObject(planFile(plan))).toMatchObject({ ok: false });
    plan.layout.blockedZones = [...samplePlan().layout.blockedZones, ...samplePlan().layout.blockedZones];
    expect(parseObject(planFile(plan))).toMatchObject({ ok: false });
    plan.layout.blockedZones = Array.from({ length: MAX_PLAN_BLOCKED_ZONES + 1 }, (_, index) => ({ id: `zone-${index}`, label: "Sample", x: 0, y: 0, width: 10, height: 10 }));
    expect(parseObject(planFile(plan))).toMatchObject({ ok: false });
  });
});

describe("explicit older-plan recovery", () => {
  it("returns old dimensions and furniture without inventing geometry", () => {
    expect(parseLegacyPlanFile(JSON.stringify(legacyFile()))).toEqual({
      ok: true,
      plan: { apartment: { widthCm: 800, lengthCm: 900, knownAreaSqm: 72 }, furniture: [sampleFurniture()] },
    });
  });

  it("accepts a validated furniture-only backup", () => {
    expect(parseLegacyPlanFile(JSON.stringify([sampleFurniture()]))).toEqual({ ok: true, plan: { furniture: [sampleFurniture()] } });
  });

  it("rejects corrupt, newer, unknown, and invalid old data", () => {
    const invalid = legacyFile();
    invalid.plan.furniture[0]!.color = "beige";
    const invalidApartment = legacyFile();
    invalidApartment.plan.apartment.widthCm = 0;
    const wrongTemplate = legacyFile();
    wrongTemplate.plan.apartment.templateId = "unknown";
    for (const source of ["{", JSON.stringify(planFile()), JSON.stringify(invalid), JSON.stringify(invalidApartment), JSON.stringify(wrongTemplate), JSON.stringify([{ ...sampleFurniture(), unexpected: true }])]) {
      expect(parseLegacyPlanFile(source)).toMatchObject({ ok: false });
    }
  });
});
