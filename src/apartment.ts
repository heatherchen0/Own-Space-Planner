import type {
  ApartmentSettings,
  Bounds,
  FurnitureItem,
  PlannerPlan,
} from "./types";

// All plan coordinates and dimensions are centimetres.
export const DEFAULT_APARTMENT: ApartmentSettings = {
  templateId: "starter-studio-v1",
  widthCm: 420,
  lengthCm: 750,
  knownAreaSqm: 33,
};

export const APARTMENT_LIMITS = {
  minWidthCm: 380,
  maxWidthCm: 3000,
  minLengthCm: 560,
  maxLengthCm: 3000,
  minKnownAreaSqm: 5,
  maxKnownAreaSqm: 1000,
} as const;

export type TemplateRect = {
  x: number;
  y: number;
  width: number;
  depth: number;
};

export type PlanGeometry = {
  bounds: Bounds;
  bathroom: TemplateRect;
  entry: TemplateRect;
  defaultNook: { x: number; y: number; width: number };
  referencePartition: TemplateRect;
  entryStorage: TemplateRect;
  kitchenRun: TemplateRect;
  entryDoorClearance: Bounds;
  balconyDoorClearance: Bounds;
  balcony: TemplateRect;
  blockedZones: Array<Bounds & { id: string; label: string }>;
};

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

export function buildPlanGeometry(apartment: ApartmentSettings): PlanGeometry {
  const bounds = getApartmentBounds(apartment);
  const bathroom: TemplateRect = {
    x: 0,
    y: 0,
    width: 220,
    depth: 235,
  };
  const entryStorage: TemplateRect = {
    x: bounds.width - 70,
    y: 0,
    width: 70,
    depth: 160,
  };
  const entry: TemplateRect = {
    x: bathroom.width,
    y: 0,
    width: entryStorage.x - bathroom.width,
    depth: 160,
  };
  const defaultNook = {
    x: 0,
    y: bathroom.depth,
    width: 165,
  };
  const referencePartition: TemplateRect = {
    x: defaultNook.width,
    y: bathroom.depth,
    width: 55,
    depth: 155,
  };
  const kitchenRun: TemplateRect = {
    x: bounds.width - 60,
    y: 160,
    width: 60,
    depth: 330,
  };
  const entryDoorClearance: Bounds = {
    x: entry.x + 25,
    y: 0,
    width: 62,
    height: 62,
  };
  const balconyDoorClearance: Bounds = {
    x: (bounds.width - 170) / 2,
    y: bounds.height - 70,
    width: 170,
    height: 70,
  };
  const balcony: TemplateRect = {
    x: 40,
    y: bounds.height,
    width: bounds.width - 80,
    depth: 90,
  };

  const blockedZones: PlanGeometry["blockedZones"] = [
    {
      id: "bathroom",
      label: "Bathroom",
      x: bathroom.x,
      y: bathroom.y,
      width: bathroom.width,
      height: bathroom.depth,
    },
    {
      id: "entry-storage",
      label: "Entry storage",
      x: entryStorage.x,
      y: entryStorage.y,
      width: entryStorage.width,
      height: entryStorage.depth,
    },
    {
      id: "kitchen-run",
      label: "Kitchen run",
      x: kitchenRun.x,
      y: kitchenRun.y,
      width: kitchenRun.width,
      height: kitchenRun.depth,
    },
    {
      id: "entry-door-clearance",
      label: "Entry door clearance",
      ...entryDoorClearance,
    },
    {
      id: "balcony-door-clearance",
      label: "Balcony door clearance",
      ...balconyDoorClearance,
    },
  ];

  return {
    bounds,
    bathroom,
    entry,
    defaultNook,
    referencePartition,
    entryStorage,
    kitchenRun,
    entryDoorClearance,
    balconyDoorClearance,
    balcony,
    blockedZones,
  };
}

export const DEFAULT_FURNITURE: FurnitureItem[] = [
  {
    id: "starter-bed",
    label: "Bed",
    x: 250,
    y: 600,
    width: 140,
    depth: 200,
    rotation: 90,
    color: "#d8c7a4",
  },
  {
    id: "starter-sofa",
    label: "Sofa",
    x: 245,
    y: 485,
    width: 185,
    depth: 85,
    rotation: 0,
    color: "#a9c4bb",
  },
  {
    id: "starter-table",
    label: "Table",
    x: 255,
    y: 315,
    width: 110,
    depth: 70,
    rotation: 0,
    color: "#c7b7d8",
  },
];

export function createDefaultPlan(): PlannerPlan {
  return {
    apartment: { ...DEFAULT_APARTMENT },
    furniture: DEFAULT_FURNITURE.map((item) => ({ ...item })),
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
    x: 95,
    y: 350,
    width: 100,
    depth: 60,
    rotation: 0,
    color: "#e4b9a6",
  };
}
