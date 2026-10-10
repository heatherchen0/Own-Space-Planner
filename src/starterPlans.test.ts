import { describe, expect, it } from "vitest";

import { createDefaultPlan, getApartmentBounds } from "./apartment";
import { isPlannerPlan, parsePlanFile, serializePlan } from "./planFile";
import { STARTER_PLANS, createStarterPlan } from "./starterPlans";
import type { Bounds, PlannerPlan, Point } from "./types";

function overlaps(first: Bounds, second: Bounds): boolean {
  return first.x < second.x + second.width && first.x + first.width > second.x &&
    first.y < second.y + second.height && first.y + first.height > second.y;
}

// Door sweeps reserve furniture clearance; a person may still walk through them.
// Wall/fixture cells are expanded to ten-centimetre cells so thin walls cannot be
// skipped by the circulation check.
function reachableCells(plan: PlannerPlan, start: Point): Set<string> {
  const step = 10;
  const columns = plan.apartment.widthCm / step;
  const rows = plan.apartment.lengthCm / step;
  const obstacles = plan.layout.blockedZones.filter((zone) => !zone.id.startsWith("door-"));
  const key = (x: number, y: number) => `${x},${y}`;
  const open = (x: number, y: number) => x >= 0 && x < columns && y >= 0 && y < rows &&
    !obstacles.some((zone) => overlaps(zone, { x: x * step, y: y * step, width: step, height: step }));
  const queue = [{ x: Math.floor(start.x / step), y: Math.floor(start.y / step) }];
  const visited = new Set<string>();
  if (!open(queue[0]!.x, queue[0]!.y)) return visited;
  visited.add(key(queue[0]!.x, queue[0]!.y));
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const x = current.x + dx;
      const y = current.y + dy;
      const position = key(x, y);
      if (!visited.has(position) && open(x, y)) {
        visited.add(position);
        queue.push({ x, y });
      }
    }
  }
  return visited;
}

describe("starter catalog", () => {
  it("offers a blank option and five distinct synthetic apartment patterns", () => {
    expect(STARTER_PLANS).toHaveLength(6);
    expect(STARTER_PLANS[0]).toMatchObject({ id: "empty", name: "Empty space" });
    expect(new Set(STARTER_PLANS.map((definition) => definition.id)).size).toBe(6);
    expect(STARTER_PLANS.slice(1).map((definition) => definition.notation)).toEqual(
      ["1h+kt", "1h+k", "2h+kt", "2h+k", "3h+kt"],
    );
    expect(createStarterPlan("empty")).toEqual(createDefaultPlan());
    expect(new Set(STARTER_PLANS.slice(1).map((definition) => serializePlan(createStarterPlan(definition.id)))).size).toBe(5);
  });

  it("rejects unknown identifiers rather than silently replacing a plan", () => {
    expect(() => createStarterPlan("unknown-layout")).toThrow(RangeError);
  });
});

describe.each(STARTER_PLANS)("$name", (definition) => {
  it("matches its dimensions and example area and round trips without loose furniture", () => {
    const plan = createStarterPlan(definition.id);
    expect(plan.apartment).toEqual({ widthCm: definition.widthCm, lengthCm: definition.lengthCm, knownAreaSqm: definition.areaSqm });
    expect(definition.widthCm * definition.lengthCm / 10_000).toBe(definition.areaSqm);
    expect(plan.furniture).toEqual([]);
    expect(isPlannerPlan(plan)).toBe(true);
    expect(parsePlanFile(serializePlan(plan))).toEqual({ ok: true, plan });
  });

  it("keeps all collision zones within the apartment shell", () => {
    const plan = createStarterPlan(definition.id);
    const bounds = getApartmentBounds(plan.apartment);
    for (const zone of plan.layout.blockedZones) {
      expect(zone.x).toBeGreaterThanOrEqual(bounds.x);
      expect(zone.y).toBeGreaterThanOrEqual(bounds.y);
      expect(zone.x + zone.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(zone.y + zone.height).toBeLessThanOrEqual(bounds.y + bounds.height);
      expect(zone.width).toBeGreaterThan(0);
      expect(zone.height).toBeGreaterThan(0);
    }
  });

  it("returns independent shapes, blocked zones, and apartment settings on every call", () => {
    const first = createStarterPlan(definition.id);
    const second = createStarterPlan(definition.id);
    const original = serializePlan(second);
    expect(first.layout).not.toBe(second.layout);
    expect(first.layout.shapes).not.toBe(second.layout.shapes);
    expect(first.layout.blockedZones).not.toBe(second.layout.blockedZones);
    first.layout.shapes.forEach((shape, index) => expect(shape).not.toBe(second.layout.shapes[index]));
    first.layout.blockedZones.forEach((zone, index) => expect(zone).not.toBe(second.layout.blockedZones[index]));
    first.apartment.widthCm += 100;
    if (first.layout.shapes[0]) first.layout.shapes[0].style = "muted";
    if (first.layout.blockedZones[0]) first.layout.blockedZones[0].label = "Changed only in this copy";
    first.layout.shapes.push({ type: "line", style: "detail", x1: 10, y1: 10, x2: 20, y2: 20 });
    first.layout.blockedZones.push({ id: "added-copy", label: "Added only in this copy", x: 10, y: 10, width: 10, height: 10 });
    expect(serializePlan(second)).toBe(original);
    expect(serializePlan(createStarterPlan(definition.id))).toBe(original);
  });
});

describe.each(STARTER_PLANS.filter((definition) => definition.id !== "empty"))("circulation in $name", (definition) => {
  it("connects every labelled room to the entry through actual wall gaps", () => {
    const plan = createStarterPlan(definition.id);
    const labels = plan.layout.shapes.filter((shape) => shape.type === "text");
    const entry = labels.find((shape) => shape.text === "Entry");
    expect(entry).toBeDefined();
    const reachable = reachableCells(plan, entry!);
    for (const label of labels) {
      expect(reachable.has(`${Math.floor(label.x / 10)},${Math.floor(label.y / 10)}`), `${label.text} should be reachable from the entry`).toBe(true);
    }
    expect(labels.some((shape) => shape.text === "Bathroom")).toBe(true);
    expect(labels.some((shape) => shape.text === "Kitchen")).toBe(true);
    expect(plan.layout.blockedZones.some((zone) => zone.id === "door-entry")).toBe(true);
  });

  it("keeps living and bedroom floor areas available for furniture", () => {
    const plan = createStarterPlan(definition.id);
    const roomLabels = plan.layout.shapes.filter((shape) => shape.type === "text" && /^(Living|Bedroom)/.test(shape.text));
    expect(roomLabels.length).toBeGreaterThan(0);
    for (const label of roomLabels) {
      if (label.type !== "text") throw new Error("Expected a room label");
      const footprint = { x: label.x - 50, y: label.y - 50, width: 100, height: 100 };
      expect(plan.layout.blockedZones.some((zone) => overlaps(zone, footprint)), `${label.text} should have clear usable floor`).toBe(false);
    }
  });
});
