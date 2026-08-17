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
  templateId: "starter-studio-v1";
  widthCm: number;
  lengthCm: number;
  knownAreaSqm: number;
};

export type PlannerPlan = {
  apartment: ApartmentSettings;
  furniture: FurnitureItem[];
};

export type PlanFileV1 = {
  format: "own-space-planner";
  version: 1;
  plan: PlannerPlan;
};
