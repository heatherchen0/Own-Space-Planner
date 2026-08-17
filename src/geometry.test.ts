import { describe, expect, it } from "vitest";

import {
  boundsContain,
  boundsOverlap,
  clampFurnitureCenter,
  getFurnitureBounds,
  getRotatedFootprint,
  nextRotation,
  normalizeDimension,
  snapTo,
} from "./geometry";
import type { Bounds, FurnitureItem, Rotation } from "./types";

describe("snapTo", () => {
  it("snaps centimetres to the nearest five-centimetre increment by default", () => {
    expect(snapTo(12)).toBe(10);
    expect(snapTo(13)).toBe(15);
    expect(snapTo(-13)).toBe(-15);
  });

  it("accepts a custom increment", () => {
    expect(snapTo(24, 10)).toBe(20);
    expect(snapTo(26, 10)).toBe(30);
  });
});

describe("normalizeDimension", () => {
  it("rounds dimensions and constrains them to the supported range", () => {
    expect(normalizeDimension(42.6, 80)).toBe(43);
    expect(normalizeDimension(2, 80)).toBe(10);
    expect(normalizeDimension(1_500, 80)).toBe(1_000);
  });

  it("uses the fallback for non-finite input", () => {
    expect(normalizeDimension(Number.NaN, 80)).toBe(80);
    expect(normalizeDimension(Number.POSITIVE_INFINITY, 80)).toBe(80);
  });
});

describe("nextRotation", () => {
  it.each<[Rotation, Rotation]>([
    [0, 90],
    [90, 180],
    [180, 270],
    [270, 0],
  ])("rotates %i degrees to %i degrees", (rotation, expected) => {
    expect(nextRotation(rotation)).toBe(expected);
  });
});

describe("getRotatedFootprint", () => {
  it.each<[Rotation, number, number]>([
    [0, 120, 80],
    [90, 80, 120],
    [180, 120, 80],
    [270, 80, 120],
  ])(
    "returns a %i-degree footprint of %i by %i centimetres",
    (rotation, width, height) => {
      expect(getRotatedFootprint(120, 80, rotation)).toEqual({
        width,
        height,
      });
    },
  );
});

describe("clampFurnitureCenter", () => {
  const bounds: Bounds = { x: 100, y: 50, width: 400, height: 300 };
  const item: FurnitureItem = {
    id: "sofa",
    label: "Sofa",
    x: 0,
    y: 0,
    width: 120,
    depth: 80,
    rotation: 0,
    color: "#123456",
  };

  it("leaves an in-bounds centre unchanged", () => {
    expect(clampFurnitureCenter({ x: 300, y: 200 }, item, bounds)).toEqual({
      x: 300,
      y: 200,
    });
  });

  it("keeps the entire unrotated footprint inside every boundary", () => {
    expect(clampFurnitureCenter({ x: 0, y: 0 }, item, bounds)).toEqual({
      x: 160,
      y: 90,
    });
    expect(clampFurnitureCenter({ x: 999, y: 999 }, item, bounds)).toEqual({
      x: 440,
      y: 310,
    });
  });

  it("uses the rotated footprint when clamping", () => {
    const rotatedItem: FurnitureItem = { ...item, rotation: 90 };

    expect(
      clampFurnitureCenter({ x: 0, y: 0 }, rotatedItem, bounds),
    ).toEqual({ x: 140, y: 110 });
    expect(
      clampFurnitureCenter({ x: 999, y: 999 }, rotatedItem, bounds),
    ).toEqual({ x: 460, y: 290 });
  });

  it("centres an item safely when its footprint is larger than the room", () => {
    const oversizedItem: FurnitureItem = {
      ...item,
      width: 700,
      depth: 500,
    };

    expect(
      clampFurnitureCenter({ x: 999, y: -999 }, oversizedItem, bounds),
    ).toEqual({ x: 300, y: 200 });
  });
});

describe("placement bounds", () => {
  const room: Bounds = { x: 0, y: 0, width: 420, height: 745 };
  const item: FurnitureItem = {
    id: "table",
    label: "Table",
    x: 100,
    y: 100,
    width: 120,
    depth: 80,
    rotation: 0,
    color: "#123456",
  };

  it("derives the axis-aligned bounds of rotated furniture", () => {
    expect(getFurnitureBounds(item)).toEqual({
      x: 40,
      y: 60,
      width: 120,
      height: 80,
    });
    expect(getFurnitureBounds({ ...item, rotation: 90 })).toEqual({
      x: 60,
      y: 40,
      width: 80,
      height: 120,
    });
  });

  it("distinguishes contained and oversized rectangles", () => {
    expect(boundsContain(room, getFurnitureBounds(item))).toBe(true);
    expect(
      boundsContain(room, { x: -1, y: 0, width: 100, height: 100 }),
    ).toBe(false);
  });

  it("treats edge contact as clear and positive penetration as overlap", () => {
    const first: Bounds = { x: 0, y: 0, width: 100, height: 100 };
    expect(
      boundsOverlap(first, { x: 100, y: 0, width: 50, height: 50 }),
    ).toBe(false);
    expect(
      boundsOverlap(first, { x: 99, y: 0, width: 50, height: 50 }),
    ).toBe(true);
  });
});
