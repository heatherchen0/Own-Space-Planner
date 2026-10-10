import { APARTMENT_LIMITS } from "./apartment";
import type {
  ApartmentSettings,
  FurnitureItem,
  LegacyPlan,
  PlanFileV2,
  PlannerPlan,
} from "./types";

export const PLAN_FILE_FORMAT = "own-space-planner" as const;
export const PLAN_FILE_VERSION = 2 as const;
export const MAX_PLAN_FURNITURE = 200;
export const MAX_PLAN_SHAPES = 500;
export const MAX_PLAN_BLOCKED_ZONES = 500;
export const MAX_PLAN_COORDINATE = 10_000;
export const MAX_PLAN_PATH_LENGTH = 20_000;
export const MAX_PLAN_TEXT_LENGTH = 200;
export const MAX_PLAN_FILE_BYTES = 1024 * 1024;

export type ParsePlanFileResult =
  | { ok: true; plan: PlannerPlan }
  | { ok: false; error: string };

export type ParseLegacyPlanFileResult =
  | { ok: true; plan: LegacyPlan }
  | { ok: false; error: string };

const PLAN_FILE_KEYS = ["format", "version", "plan"] as const;
const APARTMENT_KEYS = ["widthCm", "lengthCm", "knownAreaSqm"] as const;
const FURNITURE_KEYS = [
  "id", "label", "x", "y", "width", "depth", "rotation", "color",
] as const;
const BOUNDS_KEYS = ["x", "y", "width", "height"] as const;
const SHAPE_STYLES = new Set([
  "surface", "wall", "fixture", "clearance", "outdoor", "detail",
  "partition", "dimension", "label", "muted",
]);

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
  return actual.length === expected.length && expected.every(
    (key) => Object.prototype.hasOwnProperty.call(value, key),
  );
}

function numberWithin(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= minimum && value <= maximum;
}

function coordinate(value: unknown): value is number {
  return numberWithin(value, -MAX_PLAN_COORDINATE, MAX_PLAN_COORDINATE);
}

function size(value: unknown): value is number {
  return numberWithin(value, Number.MIN_VALUE, MAX_PLAN_COORDINATE);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 100;
}

function validText(value: unknown, maximum = MAX_PLAN_TEXT_LENGTH): value is string {
  return typeof value === "string" && value.length <= maximum;
}

function validBounds(value: Record<string, unknown>): boolean {
  return coordinate(value.x) && coordinate(value.y) && size(value.width) &&
    size(value.height) && coordinate(value.x + value.width) &&
    coordinate(value.y + value.height);
}

function apartmentValidationError(value: unknown): string | null {
  if (!isRecord(value) || !hasExactKeys(value, APARTMENT_KEYS)) {
    return "plan.apartment must contain exactly widthCm, lengthCm, and knownAreaSqm";
  }
  if (!numberWithin(value.widthCm, APARTMENT_LIMITS.minWidthCm, APARTMENT_LIMITS.maxWidthCm)) {
    return `plan.apartment.widthCm must be between ${APARTMENT_LIMITS.minWidthCm} and ${APARTMENT_LIMITS.maxWidthCm}`;
  }
  if (!numberWithin(value.lengthCm, APARTMENT_LIMITS.minLengthCm, APARTMENT_LIMITS.maxLengthCm)) {
    return `plan.apartment.lengthCm must be between ${APARTMENT_LIMITS.minLengthCm} and ${APARTMENT_LIMITS.maxLengthCm}`;
  }
  if (!numberWithin(value.knownAreaSqm, APARTMENT_LIMITS.minKnownAreaSqm, APARTMENT_LIMITS.maxKnownAreaSqm)) {
    return `plan.apartment.knownAreaSqm must be between ${APARTMENT_LIMITS.minKnownAreaSqm} and ${APARTMENT_LIMITS.maxKnownAreaSqm}`;
  }
  return null;
}

function furnitureValidationError(value: unknown): string | null {
  if (!isRecord(value) || !hasExactKeys(value, FURNITURE_KEYS)) {
    return "each furniture item must contain exactly the supported furniture properties";
  }
  if (!validId(value.id)) return "each furniture id must be non-empty and at most 100 characters";
  if (!validText(value.label, 100)) return "each furniture label must be at most 100 characters";
  if (!coordinate(value.x) || !coordinate(value.y)) {
    return `furniture coordinates must be finite and between -${MAX_PLAN_COORDINATE} and ${MAX_PLAN_COORDINATE}`;
  }
  if (!numberWithin(value.width, 10, 1000) || !numberWithin(value.depth, 10, 1000)) {
    return "furniture width and depth must be between 10 and 1000 centimetres";
  }
  if (![0, 90, 180, 270].includes(value.rotation as number)) {
    return "furniture rotation must be 0, 90, 180, or 270";
  }
  if (typeof value.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value.color)) {
    return "furniture color must be a six-digit hexadecimal colour such as #c08457";
  }
  return null;
}

// Accept drawing commands and bounded numbers, never arbitrary SVG markup.
// Command arities and resulting points are checked before reaching the renderer.
function validPath(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PLAN_PATH_LENGTH) {
    return false;
  }
  const tokenPattern = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
  const matches = [...value.matchAll(tokenPattern)];
  let tokenEnd = 0;
  let previousWasNumber = false;
  for (const match of matches) {
    const separator = value.slice(tokenEnd, match.index);
    const isNumber = !/^[A-Za-z]$/.test(match[0]);
    if (!/^[\s,]*$/.test(separator) || (separator.match(/,/g)?.length ?? 0) > 1 ||
      (separator.includes(",") && (!previousWasNumber || !isNumber))) return false;
    tokenEnd = match.index + match[0].length;
    previousWasNumber = isNumber;
  }
  if (!/^\s*$/.test(value.slice(tokenEnd))) return false;
  const tokens = matches.map((match) => match[0]);
  if (!/^[Mm]$/.test(tokens[0] ?? "")) return false;
  const arities: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  let index = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  while (index < tokens.length) {
    const command = tokens[index++]!;
    if (!/^[MmLlHhVvCcSsQqTtAaZz]$/.test(command)) return false;
    const kind = command.toUpperCase();
    const arity = arities[kind]!;
    const values: number[] = [];
    while (index < tokens.length && !/^[A-Za-z]$/.test(tokens[index]!)) {
      const value = Number(tokens[index++]!);
      if (!coordinate(value)) return false;
      values.push(value);
    }
    if (kind === "Z") {
      if (values.length !== 0) return false;
      x = startX;
      y = startY;
      continue;
    }
    if (values.length === 0 || values.length % arity !== 0) return false;
    const relative = command === command.toLowerCase();
    for (let offset = 0; offset < values.length; offset += arity) {
      const group = values.slice(offset, offset + arity);
      const baseX = relative ? x : 0;
      const baseY = relative ? y : 0;
      if (kind === "H") {
        x = baseX + group[0]!;
      } else if (kind === "V") {
        y = baseY + group[0]!;
      } else if (kind === "A") {
        if (group[0]! < 0 || group[1]! < 0 || !numberWithin(group[2], -360, 360) ||
          ![0, 1].includes(group[3]!) || ![0, 1].includes(group[4]!)) return false;
        x = baseX + group[5]!;
        y = baseY + group[6]!;
      } else {
        for (let pair = 0; pair < group.length; pair += 2) {
          if (!coordinate(baseX + group[pair]!) || !coordinate(baseY + group[pair + 1]!)) {
            return false;
          }
        }
        x = baseX + group[group.length - 2]!;
        y = baseY + group[group.length - 1]!;
      }
      if (!coordinate(x) || !coordinate(y)) return false;
      if (kind === "M" && offset === 0) {
        startX = x;
        startY = y;
      }
    }
  }
  return true;
}

function shapeValidationError(value: unknown): string | null {
  if (!isRecord(value) || typeof value.style !== "string" || !SHAPE_STYLES.has(value.style)) {
    return "each layout shape must have a supported style";
  }
  switch (value.type) {
    case "rect":
      if (!hasExactKeys(value, ["type", "style", ...BOUNDS_KEYS]) || !validBounds(value)) {
        return "rect shapes must have bounded x, y, width, and height";
      }
      break;
    case "line":
      if (!hasExactKeys(value, ["type", "style", "x1", "y1", "x2", "y2"]) ||
        ![value.x1, value.y1, value.x2, value.y2].every(coordinate)) {
        return "line shapes must have bounded x1, y1, x2, and y2";
      }
      break;
    case "ellipse":
      if (!hasExactKeys(value, ["type", "style", "cx", "cy", "rx", "ry"]) ||
        !coordinate(value.cx) || !coordinate(value.cy) || !size(value.rx) || !size(value.ry) ||
        !coordinate(value.cx - value.rx) || !coordinate(value.cx + value.rx) ||
        !coordinate(value.cy - value.ry) || !coordinate(value.cy + value.ry)) {
        return "ellipse shapes must have bounded centers and positive radii";
      }
      break;
    case "path":
      if (!hasExactKeys(value, ["type", "style", "d"]) || !validPath(value.d)) {
        return "path shapes must contain only valid, bounded SVG drawing commands";
      }
      break;
    case "text":
      if (!hasExactKeys(value, ["type", "style", "x", "y", "text", "rotate"]) ||
        !coordinate(value.x) || !coordinate(value.y) || !validText(value.text) ||
        !numberWithin(value.rotate, -360, 360)) {
        return `text shapes require bounded x, y, rotation, and at most ${MAX_PLAN_TEXT_LENGTH} characters`;
      }
      break;
    default:
      return "layout shapes must use rect, line, ellipse, path, or text";
  }
  return null;
}

export function layoutValidationError(value: unknown): string | null {
  if (!isRecord(value) || !hasExactKeys(value, ["extent", "shapes", "blockedZones"])) {
    return "plan.layout must contain exactly extent, shapes, and blockedZones";
  }
  if (value.extent !== null && (!isRecord(value.extent) ||
    !hasExactKeys(value.extent, BOUNDS_KEYS) || !validBounds(value.extent))) {
    return "plan.layout.extent must be null or bounded x, y, width, and height";
  }
  if (!Array.isArray(value.shapes) || value.shapes.length > MAX_PLAN_SHAPES) {
    return `plan.layout.shapes must be an array of at most ${MAX_PLAN_SHAPES} shapes`;
  }
  for (let index = 0; index < value.shapes.length; index += 1) {
    const error = shapeValidationError(value.shapes[index]);
    if (error) return `plan.layout.shapes[${index}]: ${error}`;
  }
  if (!Array.isArray(value.blockedZones) || value.blockedZones.length > MAX_PLAN_BLOCKED_ZONES) {
    return `plan.layout.blockedZones must be an array of at most ${MAX_PLAN_BLOCKED_ZONES} zones`;
  }
  const ids = new Set<string>();
  for (const zone of value.blockedZones) {
    if (!isRecord(zone) || !hasExactKeys(zone, [...BOUNDS_KEYS, "id", "label"]) ||
      !validBounds(zone) || !validId(zone.id) || !validText(zone.label)) {
      return "blocked zones require bounded dimensions, an id, and a label";
    }
    if (ids.has(zone.id)) return `${zone.id} is used by more than one blocked zone`;
    ids.add(zone.id);
  }
  return null;
}

export function isApartmentSettings(value: unknown): value is ApartmentSettings {
  return apartmentValidationError(value) === null;
}

export function isFurnitureItem(value: unknown): value is FurnitureItem {
  return furnitureValidationError(value) === null;
}

export function validateFurnitureList(value: unknown): string | null {
  if (!Array.isArray(value)) return "plan.furniture must be an array";
  if (value.length > MAX_PLAN_FURNITURE) {
    return `plan.furniture cannot contain more than ${MAX_PLAN_FURNITURE} items`;
  }
  const ids = new Set<string>();
  for (const item of value) {
    const error = furnitureValidationError(item);
    if (error) return error;
    const id = (item as FurnitureItem).id;
    if (ids.has(id)) return `${id} is used by more than one furniture item`;
    ids.add(id);
  }
  return null;
}

export function planValidationError(value: unknown): string | null {
  if (!isRecord(value) || !hasExactKeys(value, ["apartment", "layout", "furniture"])) {
    return "plan must contain exactly apartment, layout, and furniture";
  }
  return apartmentValidationError(value.apartment) ??
    layoutValidationError(value.layout) ?? validateFurnitureList(value.furniture);
}

export function isPlannerPlan(value: unknown): value is PlannerPlan {
  return planValidationError(value) === null;
}

function readJson(source: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (source.length > MAX_PLAN_FILE_BYTES || new TextEncoder().encode(source).length > MAX_PLAN_FILE_BYTES) {
    return { ok: false, error: "Plan files cannot exceed 1 MB." };
  }
  try {
    return { ok: true, value: JSON.parse(source) };
  } catch {
    return { ok: false, error: "The selected file is not valid JSON." };
  }
}

export function parsePlanFile(source: string): ParsePlanFileResult {
  const result = readJson(source);
  if (!result.ok) return result;
  const value = result.value;
  if (!isRecord(value) || !hasExactKeys(value, PLAN_FILE_KEYS)) {
    return { ok: false, error: "Invalid plan file: the file must contain exactly format, version, and plan." };
  }
  if (value.format !== PLAN_FILE_FORMAT) {
    return { ok: false, error: `Invalid plan file: format must be "${PLAN_FILE_FORMAT}".` };
  }
  if (value.version === 1) {
    return {
      ok: false,
      error: "This older file contains furniture and dimensions but no floor layout. Import a complete floor plan first, then import this older file again to restore its furniture.",
    };
  }
  if (value.version !== PLAN_FILE_VERSION) {
    return { ok: false, error: `Invalid plan file: version ${String(value.version)} is not supported.` };
  }
  const error = planValidationError(value.plan);
  return error ? { ok: false, error: `Invalid plan file: ${error}.` } :
    { ok: true, plan: value.plan as PlannerPlan };
}

export function parseLegacyPlanFile(source: string): ParseLegacyPlanFileResult {
  const result = readJson(source);
  if (!result.ok) return result;
  const value = result.value;
  if (Array.isArray(value)) {
    const error = validateFurnitureList(value);
    return error ? { ok: false, error: `Invalid older furniture: ${error}.` } :
      { ok: true, plan: { furniture: value as FurnitureItem[] } };
  }
  if (!isRecord(value) || !hasExactKeys(value, PLAN_FILE_KEYS) ||
    value.format !== PLAN_FILE_FORMAT || value.version !== 1 ||
    !isRecord(value.plan) || !hasExactKeys(value.plan, ["apartment", "furniture"]) ||
    !isRecord(value.plan.apartment) ||
    !hasExactKeys(value.plan.apartment, ["templateId", ...APARTMENT_KEYS]) ||
    value.plan.apartment.templateId !== "starter-studio-v1") {
    return { ok: false, error: "The selected file is not a supported older plan or furniture backup." };
  }
  const apartment = {
    widthCm: value.plan.apartment.widthCm,
    lengthCm: value.plan.apartment.lengthCm,
    knownAreaSqm: value.plan.apartment.knownAreaSqm,
  };
  const error = apartmentValidationError(apartment) ?? validateFurnitureList(value.plan.furniture);
  return error ? { ok: false, error: `Invalid older plan: ${error}.` } : {
    ok: true,
    plan: { apartment: apartment as ApartmentSettings, furniture: value.plan.furniture as FurnitureItem[] },
  };
}

export function serializePlan(plan: PlannerPlan): string {
  const error = planValidationError(plan);
  if (error) throw new TypeError(`Cannot export invalid plan: ${error}.`);
  const file: PlanFileV2 = { format: PLAN_FILE_FORMAT, version: PLAN_FILE_VERSION, plan };
  const source = JSON.stringify(file, null, 2);
  if (source.length > MAX_PLAN_FILE_BYTES || new TextEncoder().encode(source).length > MAX_PLAN_FILE_BYTES) {
    throw new TypeError("Cannot export invalid plan: file exceeds 1 MB.");
  }
  return source;
}
