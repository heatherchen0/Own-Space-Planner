import { APARTMENT_LIMITS } from "./apartment";
import type {
  ApartmentSettings,
  FurnitureItem,
  PlanFileV1,
  PlannerPlan,
} from "./types";

export const PLAN_FILE_FORMAT = "own-space-planner" as const;
export const PLAN_FILE_VERSION = 1 as const;
export const MAX_PLAN_FURNITURE = 200;

export type ParsePlanFileResult =
  | { ok: true; plan: PlannerPlan }
  | { ok: false; error: string };

const PLAN_FILE_KEYS = ["format", "version", "plan"] as const;
const PLAN_KEYS = ["apartment", "furniture"] as const;
const APARTMENT_KEYS = [
  "templateId",
  "widthCm",
  "lengthCm",
  "knownAreaSqm",
] as const;
const FURNITURE_KEYS = [
  "id",
  "label",
  "x",
  "y",
  "width",
  "depth",
  "rotation",
  "color",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function apartmentValidationError(value: unknown): string | null {
  if (!isRecord(value) || !hasExactKeys(value, APARTMENT_KEYS)) {
    return "plan.apartment must contain exactly the supported apartment settings";
  }

  if (value.templateId !== "starter-studio-v1") {
    return 'plan.apartment.templateId must be "starter-studio-v1"';
  }

  if (
    !isFiniteNumber(value.widthCm) ||
    value.widthCm < APARTMENT_LIMITS.minWidthCm ||
    value.widthCm > APARTMENT_LIMITS.maxWidthCm
  ) {
    return `plan.apartment.widthCm must be between ${APARTMENT_LIMITS.minWidthCm} and ${APARTMENT_LIMITS.maxWidthCm}`;
  }

  if (
    !isFiniteNumber(value.lengthCm) ||
    value.lengthCm < APARTMENT_LIMITS.minLengthCm ||
    value.lengthCm > APARTMENT_LIMITS.maxLengthCm
  ) {
    return `plan.apartment.lengthCm must be between ${APARTMENT_LIMITS.minLengthCm} and ${APARTMENT_LIMITS.maxLengthCm}`;
  }

  if (
    !isFiniteNumber(value.knownAreaSqm) ||
    value.knownAreaSqm < APARTMENT_LIMITS.minKnownAreaSqm ||
    value.knownAreaSqm > APARTMENT_LIMITS.maxKnownAreaSqm
  ) {
    return `plan.apartment.knownAreaSqm must be between ${APARTMENT_LIMITS.minKnownAreaSqm} and ${APARTMENT_LIMITS.maxKnownAreaSqm}`;
  }

  return null;
}

function furnitureValidationError(
  value: unknown,
  index: number,
): string | null {
  const path = `plan.furniture[${index}]`;

  if (!isRecord(value) || !hasExactKeys(value, FURNITURE_KEYS)) {
    return `${path} must contain exactly the supported furniture properties`;
  }

  if (
    typeof value.id !== "string" ||
    value.id.trim().length === 0 ||
    value.id.length > 100
  ) {
    return `${path}.id must be a non-empty string of at most 100 characters`;
  }

  if (typeof value.label !== "string" || value.label.length > 100) {
    return `${path}.label must be a string of at most 100 characters`;
  }

  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    return `${path} coordinates must be finite numbers`;
  }

  if (
    !isFiniteNumber(value.width) ||
    value.width < 10 ||
    value.width > 1000 ||
    !isFiniteNumber(value.depth) ||
    value.depth < 10 ||
    value.depth > 1000
  ) {
    return `${path} width and depth must be between 10 and 1000 centimetres`;
  }

  if (
    value.rotation !== 0 &&
    value.rotation !== 90 &&
    value.rotation !== 180 &&
    value.rotation !== 270
  ) {
    return `${path}.rotation must be 0, 90, 180, or 270`;
  }

  if (
    typeof value.color !== "string" ||
    !/^#[0-9a-fA-F]{6}$/.test(value.color)
  ) {
    return `${path}.color must be a six-digit hexadecimal colour such as #c08457`;
  }

  return null;
}

export function isApartmentSettings(
  value: unknown,
): value is ApartmentSettings {
  return apartmentValidationError(value) === null;
}

export function isFurnitureItem(value: unknown): value is FurnitureItem {
  return furnitureValidationError(value, 0) === null;
}

export function validateFurnitureList(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return "plan.furniture must be an array";
  }

  if (value.length > MAX_PLAN_FURNITURE) {
    return `plan.furniture cannot contain more than ${MAX_PLAN_FURNITURE} items`;
  }

  const ids = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const error = furnitureValidationError(item, index);
    if (error) {
      return error;
    }

    const id = (item as FurnitureItem).id;
    if (ids.has(id)) {
      return `${String(id)} is used by more than one furniture item`;
    }
    ids.add(id);
  }

  return null;
}

export function planValidationError(value: unknown): string | null {
  if (!isRecord(value) || !hasExactKeys(value, PLAN_KEYS)) {
    return "plan must contain exactly apartment and furniture";
  }

  const apartmentError = apartmentValidationError(value.apartment);
  if (apartmentError) {
    return apartmentError;
  }

  return validateFurnitureList(value.furniture);
}

export function isPlannerPlan(value: unknown): value is PlannerPlan {
  return planValidationError(value) === null;
}

function planFileValidationError(value: unknown): string | null {
  if (!isRecord(value) || !hasExactKeys(value, PLAN_FILE_KEYS)) {
    return "the file must contain exactly format, version, and plan";
  }

  if (value.format !== PLAN_FILE_FORMAT) {
    return `format must be "${PLAN_FILE_FORMAT}"`;
  }

  if (value.version !== PLAN_FILE_VERSION) {
    return `version ${String(value.version)} is not supported`;
  }

  return planValidationError(value.plan);
}

export function parsePlanFile(source: string): ParsePlanFileResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { ok: false, error: "The selected file is not valid JSON." };
  }

  const error = planFileValidationError(parsed);
  if (error) {
    return { ok: false, error: `Invalid plan file: ${error}.` };
  }

  return { ok: true, plan: (parsed as PlanFileV1).plan };
}

export function serializePlan(plan: PlannerPlan): string {
  const error = planValidationError(plan);
  if (error) {
    throw new TypeError(`Cannot export invalid plan: ${error}.`);
  }

  const file: PlanFileV1 = {
    format: PLAN_FILE_FORMAT,
    version: PLAN_FILE_VERSION,
    plan,
  };

  return JSON.stringify(file, null, 2);
}
