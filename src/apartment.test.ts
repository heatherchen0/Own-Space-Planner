import { describe, expect, it } from "vitest";

import {
  DEFAULT_APARTMENT,
  buildPlanGeometry,
  createDefaultPlan,
  getApartmentBounds,
  getInferredAreaSqm,
} from "./apartment";
import type { PlanLayout } from "./types";

// These fixtures describe independent synthetic plans.
describe("generic apartment", () => {
  it("starts with an empty 5 by 6 metre rectangle", () => {
    expect(createDefaultPlan()).toEqual({
      apartment: { widthCm: 500, lengthCm: 600, knownAreaSqm: 30 },
      layout: { extent: null, shapes: [], blockedZones: [] },
      furniture: [],
    });
    expect(getInferredAreaSqm(DEFAULT_APARTMENT)).toBe(30);
  });

  it("uses editable dimensions without stretching the supplied layout", () => {
    const apartment = { widthCm: 800, lengthCm: 900, knownAreaSqm: 80 };
    expect(getApartmentBounds(apartment)).toEqual({ x: 0, y: 0, width: 800, height: 900 });
    expect(getInferredAreaSqm(apartment)).toBe(72);
    const layout: PlanLayout = {
      extent: null,
      shapes: [{ type: "line", style: "wall", x1: 10, y1: 20, x2: 300, y2: 20 }],
      blockedZones: [{ id: "fixed-sample", label: "Fixed sample", x: 20, y: 30, width: 40, height: 50 }],
    };
    const geometry = buildPlanGeometry(apartment, layout);
    expect(geometry.shapes).toEqual(layout.shapes);
    expect(geometry.blockedZones).toEqual(layout.blockedZones);
    expect(geometry.drawingBounds).toEqual(geometry.bounds);
  });

  it("includes outside drawing extents without changing placement bounds", () => {
    const layout: PlanLayout = {
      extent: { x: -40, y: -20, width: 620, height: 750 },
      shapes: [],
      blockedZones: [],
    };
    const geometry = buildPlanGeometry(DEFAULT_APARTMENT, layout);
    expect(geometry.bounds).toEqual({ x: 0, y: 0, width: 500, height: 600 });
    expect(geometry.drawingBounds).toEqual({ x: -40, y: -20, width: 620, height: 750 });
  });

  it("keeps the complete shell visible when an extent is smaller", () => {
    const layout: PlanLayout = {
      extent: { x: 100, y: 100, width: 100, height: 100 },
      shapes: [],
      blockedZones: [],
    };
    expect(buildPlanGeometry(DEFAULT_APARTMENT, layout).drawingBounds).toEqual(
      getApartmentBounds(DEFAULT_APARTMENT),
    );
  });

  it("returns independent blank plans for new documents", () => {
    const first = createDefaultPlan();
    const second = createDefaultPlan();
    first.apartment.widthCm = 999;
    first.layout.extent = { x: 0, y: 0, width: 999, height: 800 };
    first.layout.shapes.push({ type: "line", style: "wall", x1: 0, y1: 0, x2: 100, y2: 0 });
    first.layout.blockedZones.push({ id: "sample", label: "Sample", x: 0, y: 0, width: 30, height: 30 });
    first.furniture.push({ id: "sample", label: "Sample", x: 100, y: 100, width: 30, depth: 30, rotation: 0, color: "#abcdef" });
    expect(second).toEqual(createDefaultPlan());
    expect(first.layout).not.toBe(second.layout);
    expect(first.layout.shapes).not.toBe(second.layout.shapes);
    expect(first.layout.blockedZones).not.toBe(second.layout.blockedZones);
    expect(first.furniture).not.toBe(second.furniture);
  });
});
