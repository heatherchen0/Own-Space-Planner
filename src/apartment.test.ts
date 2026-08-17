import { describe, expect, it } from "vitest";

import {
  APARTMENT_LIMITS,
  DEFAULT_APARTMENT,
  DEFAULT_FURNITURE,
  buildPlanGeometry,
  createDefaultPlan,
  getApartmentBounds,
  getInferredAreaSqm,
} from "./apartment";
import type { ApartmentSettings } from "./types";

function apartmentWithSize(
  widthCm: number,
  lengthCm: number,
): ApartmentSettings {
  return {
    ...DEFAULT_APARTMENT,
    widthCm,
    lengthCm,
  };
}

describe("apartment measurements", () => {
  it("defines the starter apartment as 420 by 750 cm with 31.5 m² inferred", () => {
    expect(DEFAULT_APARTMENT).toEqual({
      templateId: "starter-studio-v1",
      widthCm: 420,
      lengthCm: 750,
      knownAreaSqm: 33,
    });
    expect(getInferredAreaSqm(DEFAULT_APARTMENT)).toBe(31.5);
  });

  it("derives placement bounds from the adjustable apartment size", () => {
    expect(getApartmentBounds(DEFAULT_APARTMENT)).toEqual({
      x: 0,
      y: 0,
      width: 420,
      height: 750,
    });

    const largerApartment = apartmentWithSize(600, 900);
    expect(largerApartment.widthCm).toBeLessThanOrEqual(
      APARTMENT_LIMITS.maxWidthCm,
    );
    expect(largerApartment.lengthCm).toBeLessThanOrEqual(
      APARTMENT_LIMITS.maxLengthCm,
    );
    expect(getApartmentBounds(largerApartment)).toEqual({
      x: 0,
      y: 0,
      width: 600,
      height: 900,
    });
    expect(getInferredAreaSqm(largerApartment)).toBe(54);
  });
});

describe.each([
  {
    name: "default size",
    apartment: apartmentWithSize(420, 750),
    storageX: 350,
    kitchenX: 360,
    balconyDoorX: 125,
    balconyDoorY: 680,
    balconyY: 750,
    balconyWidth: 340,
  },
  {
    name: "larger valid size",
    apartment: apartmentWithSize(600, 900),
    storageX: 530,
    kitchenX: 540,
    balconyDoorX: 215,
    balconyDoorY: 830,
    balconyY: 900,
    balconyWidth: 520,
  },
])("plan geometry at $name", (expected) => {
  const geometry = buildPlanGeometry(expected.apartment);

  it("right-anchors entry storage and the kitchen run", () => {
    expect(geometry.entryStorage).toEqual({
      x: expected.storageX,
      y: 0,
      width: 70,
      depth: 160,
    });
    expect(geometry.kitchenRun).toEqual({
      x: expected.kitchenX,
      y: 160,
      width: 60,
      depth: 330,
    });
    expect(geometry.entryStorage.x + geometry.entryStorage.width).toBe(
      expected.apartment.widthCm,
    );
    expect(geometry.kitchenRun.x + geometry.kitchenRun.width).toBe(
      expected.apartment.widthCm,
    );
  });

  it("centres the balcony door clearance on the bottom wall", () => {
    expect(geometry.balconyDoorClearance).toEqual({
      x: expected.balconyDoorX,
      y: expected.balconyDoorY,
      width: 170,
      height: 70,
    });
    expect(
      geometry.balconyDoorClearance.x +
        geometry.balconyDoorClearance.width / 2,
    ).toBe(expected.apartment.widthCm / 2);
    expect(
      geometry.balconyDoorClearance.y +
        geometry.balconyDoorClearance.height,
    ).toBe(expected.apartment.lengthCm);
  });

  it("places and stretches the balcony with the apartment", () => {
    expect(geometry.balcony).toEqual({
      x: 40,
      y: expected.balconyY,
      width: expected.balconyWidth,
      depth: 90,
    });
  });

  it("builds collision zones from the resolved geometry", () => {
    expect(geometry.blockedZones).toEqual([
      {
        id: "bathroom",
        label: "Bathroom",
        x: 0,
        y: 0,
        width: 220,
        height: 235,
      },
      {
        id: "entry-storage",
        label: "Entry storage",
        x: expected.storageX,
        y: 0,
        width: 70,
        height: 160,
      },
      {
        id: "kitchen-run",
        label: "Kitchen run",
        x: expected.kitchenX,
        y: 160,
        width: 60,
        height: 330,
      },
      {
        id: "entry-door-clearance",
        label: "Entry door clearance",
        x: 245,
        y: 0,
        width: 62,
        height: 62,
      },
      {
        id: "balcony-door-clearance",
        label: "Balcony door clearance",
        x: expected.balconyDoorX,
        y: expected.balconyDoorY,
        width: 170,
        height: 70,
      },
    ]);
  });
});

describe("createDefaultPlan", () => {
  it("returns independent apartment, furniture array, and item copies", () => {
    const first = createDefaultPlan();
    const second = createDefaultPlan();

    expect(first).not.toBe(second);
    expect(first.apartment).not.toBe(second.apartment);
    expect(first.furniture).not.toBe(second.furniture);
    expect(first.furniture).toEqual(second.furniture);
    first.furniture.forEach((item, index) => {
      expect(item).not.toBe(second.furniture[index]);
    });

    first.apartment.widthCm = 999;
    const firstFurnitureItem = first.furniture[0];
    expect(firstFurnitureItem).toBeDefined();
    if (!firstFurnitureItem) {
      throw new Error("The default plan should contain starter furniture");
    }
    firstFurnitureItem.label = "Changed bed";
    first.furniture.push({ ...firstFurnitureItem, id: "extra-item" });

    expect(second.apartment).toEqual(DEFAULT_APARTMENT);
    expect(second.furniture).toEqual(DEFAULT_FURNITURE);
  });
});
