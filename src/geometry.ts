import type { Bounds, FurnitureItem, Point, Rotation } from "./types";

export const CM_PER_MINOR_GRID = 10;
export const CM_PER_SNAP = 5;

export function snapTo(value: number, increment = CM_PER_SNAP): number {
  return Math.round(value / increment) * increment;
}

export function normalizeDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(10, Math.min(1000, Math.round(value)));
}

export function nextRotation(rotation: Rotation): Rotation {
  return ((rotation + 90) % 360) as Rotation;
}

export function getRotatedFootprint(
  width: number,
  depth: number,
  rotation: Rotation,
): { width: number; height: number } {
  const isQuarterTurn = rotation === 90 || rotation === 270;
  return {
    width: isQuarterTurn ? depth : width,
    height: isQuarterTurn ? width : depth,
  };
}

export function clampFurnitureCenter(
  point: Point,
  item: FurnitureItem,
  bounds: Bounds,
): Point {
  const footprint = getRotatedFootprint(
    item.width,
    item.depth,
    item.rotation,
  );
  return {
    x: clampAxis(point.x, bounds.x, bounds.width, footprint.width),
    y: clampAxis(point.y, bounds.y, bounds.height, footprint.height),
  };
}

function clampAxis(
  value: number,
  boundsStart: number,
  boundsSize: number,
  itemSize: number,
): number {
  if (itemSize >= boundsSize) {
    return boundsStart + boundsSize / 2;
  }

  const halfSize = itemSize / 2;
  return Math.max(
    boundsStart + halfSize,
    Math.min(boundsStart + boundsSize - halfSize, value),
  );
}

export function getFurnitureBounds(item: FurnitureItem): Bounds {
  const footprint = getRotatedFootprint(
    item.width,
    item.depth,
    item.rotation,
  );

  return {
    x: item.x - footprint.width / 2,
    y: item.y - footprint.height / 2,
    width: footprint.width,
    height: footprint.height,
  };
}

export function boundsContain(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function boundsOverlap(first: Bounds, second: Bounds): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

export function formatMetres(centimetres: number): string {
  return (centimetres / 100).toFixed(2) + " m";
}
