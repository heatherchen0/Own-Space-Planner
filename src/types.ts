export type Rotation = 0 | 90 | 180 | 270;

export type FurnitureItem = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  rotation: Rotation;
  color: string;
};

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type ApartmentSettings = {
  widthCm: number;
  lengthCm: number;
  knownAreaSqm: number;
};

export type PlanShapeStyle =
  | "surface"
  | "wall"
  | "fixture"
  | "clearance"
  | "outdoor"
  | "detail"
  | "partition"
  | "dimension"
  | "label"
  | "muted";

export type PlanShape = { style: PlanShapeStyle } & (
  | { type: "rect"; x: number; y: number; width: number; height: number }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { type: "path"; d: string }
  | { type: "text"; x: number; y: number; text: string; rotate: number }
);

export type PlanBlockedZone = Bounds & { id: string; label: string };

export type PlanLayout = {
  extent: Bounds | null;
  shapes: PlanShape[];
  blockedZones: PlanBlockedZone[];
};

export type PlannerPlan = {
  apartment: ApartmentSettings;
  layout: PlanLayout;
  furniture: FurnitureItem[];
};

export type PlanFileV2 = {
  format: "own-space-planner";
  version: 2;
  plan: PlannerPlan;
};

export type LegacyPlan = {
  apartment?: ApartmentSettings;
  furniture: FurnitureItem[];
};
