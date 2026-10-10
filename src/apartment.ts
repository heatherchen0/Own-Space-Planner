import type {
  ApartmentSettings,
  Bounds,
  FurnitureItem,
  PlanLayout,
  PlannerPlan,
} from "./types";

// All plan coordinates and dimensions are centimetres.
export const DEFAULT_APARTMENT: ApartmentSettings = {
  widthCm: 500,
  lengthCm: 600,
  knownAreaSqm: 30,
};

export const APARTMENT_LIMITS = {
  minWidthCm: 100,
  maxWidthCm: 3000,
  minLengthCm: 100,
  maxLengthCm: 3000,
  minKnownAreaSqm: 5,
  maxKnownAreaSqm: 1000,
} as const;

export type PlanGeometry = {
  bounds: Bounds;
  drawingBounds: Bounds;
  shapes: PlanLayout["shapes"];
  blockedZones: PlanLayout["blockedZones"];
};

export const DEFAULT_FURNITURE: FurnitureItem[] = [];

export function getApartmentBounds(apartment: ApartmentSettings): Bounds {
  return {
    x: 0,
    y: 0,
    width: apartment.widthCm,
    height: apartment.lengthCm,
  };
}

export function getInferredAreaSqm(apartment: ApartmentSettings): number {
  return (apartment.widthCm * apartment.lengthCm) / 10_000;
}

export function buildPlanGeometry(
  apartment: ApartmentSettings,
  layout: PlanLayout,
): PlanGeometry {
  const bounds = getApartmentBounds(apartment);
  const extent = layout.extent;
  const x = Math.min(bounds.x, extent?.x ?? bounds.x);
  const y = Math.min(bounds.y, extent?.y ?? bounds.y);
  const right = Math.max(
    bounds.x + bounds.width,
    extent ? extent.x + extent.width : bounds.x + bounds.width,
  );
  const bottom = Math.max(
    bounds.y + bounds.height,
    extent ? extent.y + extent.height : bounds.y + bounds.height,
  );

  return {
    bounds,
    drawingBounds: { x, y, width: right - x, height: bottom - y },
    shapes: layout.shapes,
    blockedZones: layout.blockedZones,
  };
}

export function createDefaultPlan(): PlannerPlan {
  return {
    apartment: { ...DEFAULT_APARTMENT },
    layout: { extent: null, shapes: [], blockedZones: [] },
    furniture: [],
  };
}

export function createFurniture(sequence: number): FurnitureItem {
  return {
    id:
      "furniture-" +
      Date.now().toString(36) +
      "-" +
      sequence.toString(36),
    label: "New furniture",
    x: 250,
    y: 300,
    width: 100,
    depth: 60,
    rotation: 0,
    color: "#e4b9a6",
  };
}
