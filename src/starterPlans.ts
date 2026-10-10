import { createDefaultPlan } from "./apartment";
import type { Bounds, PlanLayout, PlannerPlan, PlanShape } from "./types";

export type StarterPlanDefinition = {
  id: string;
  name: string;
  notation: string;
  description: string;
  widthCm: number;
  lengthCm: number;
  areaSqm: number;
};

// Illustrative room arrangements and inner-shell sizes, not measured homes or
// statistical averages. Every plan is synthetic and contains no loose furniture.
export const STARTER_PLANS: readonly StarterPlanDefinition[] = [
  {
    id: "empty",
    name: "Empty space",
    notation: "Blank",
    description: "A clear rectangle for arranging furniture freely.",
    widthCm: 500,
    lengthCm: 600,
    areaSqm: 30,
  },
  {
    id: "studio-open",
    name: "Open-kitchen studio",
    notation: "1h+kt",
    description: "One living and sleeping room with an open kitchen along the side wall.",
    widthCm: 400,
    lengthCm: 700,
    areaSqm: 28,
  },
  {
    id: "studio-separate",
    name: "Separate-kitchen studio",
    notation: "1h+k",
    description: "One main room with an enclosed kitchen off the entry hall.",
    widthCm: 450,
    lengthCm: 800,
    areaSqm: 36,
  },
  {
    id: "one-bedroom-open",
    name: "One-bedroom · open kitchen",
    notation: "2h+kt",
    description: "An open living and kitchen area beside a separate bedroom.",
    widthCm: 600,
    lengthCm: 750,
    areaSqm: 45,
  },
  {
    id: "one-bedroom-separate",
    name: "One-bedroom · separate kitchen",
    notation: "2h+k",
    description: "An enclosed kitchen, a separate bedroom, and a living room around a central entry.",
    widthCm: 600,
    lengthCm: 900,
    areaSqm: 54,
  },
  {
    id: "two-bedroom",
    name: "Two-bedroom family",
    notation: "3h+kt",
    description: "Two bedrooms open off a shared living area with an open kitchen.",
    widthCm: 700,
    lengthCm: 1000,
    areaSqm: 70,
  },
];

class LayoutBuilder {
  readonly layout: PlanLayout = { extent: null, shapes: [], blockedZones: [] };
  private wallSequence = 0;

  constructor(private readonly width: number, private readonly length: number) {}

  shape(shape: PlanShape): void {
    this.layout.shapes.push(shape);
  }

  label(text: string, x: number, y: number): void {
    this.shape({ type: "text", style: "label", x, y, text, rotate: 0 });
  }

  surface(x: number, y: number, width: number, height: number): void {
    this.shape({ type: "rect", style: "surface", x, y, width, height });
  }

  private block(id: string, label: string, bounds: Bounds): void {
    this.layout.blockedZones.push({ id, label, ...bounds });
  }

  wall(x1: number, y1: number, x2: number, y2: number): void {
    this.shape({ type: "line", style: "wall", x1, y1, x2, y2 });
    // Match the eight-centimetre wall stroke and clip its ends to the shell.
    const vertical = x1 === x2;
    const x = Math.max(0, Math.min(x1, x2) - (vertical ? 4 : 0));
    const y = Math.max(0, Math.min(y1, y2) - (vertical ? 0 : 4));
    const right = Math.min(this.width, Math.max(x1, x2) + (vertical ? 4 : 0));
    const bottom = Math.min(this.length, Math.max(y1, y2) + (vertical ? 0 : 4));
    this.block(`wall-${++this.wallSequence}`, "Interior wall", { x, y, width: right - x, height: bottom - y });
  }

  fixture(id: string, label: string, x: number, y: number, width: number, height: number): void {
    this.surface(x, y, width, height);
    this.block(id, label, { x, y, width, height });
  }

  private doorClearance(id: string, label: string, bounds: Bounds): void {
    this.shape({ type: "rect", style: "clearance", ...bounds });
    this.block(`door-${id}`, `${label} door clearance`, bounds);
  }

  verticalDoor(id: string, label: string, x: number, y: number, width: number, direction: 1 | -1): void {
    this.doorClearance(id, label, { x: Math.min(x, x + direction * width), y, width, height: width });
    this.shape({ type: "line", style: "clearance", x1: x, y1: y, x2: x + direction * width, y2: y });
    this.shape({ type: "path", style: "clearance", d: `M ${x} ${y + width} A ${width} ${width} 0 0 ${direction === 1 ? 0 : 1} ${x + direction * width} ${y}` });
  }

  horizontalDoor(id: string, label: string, x: number, y: number, width: number): void {
    this.doorClearance(id, label, { x, y, width, height: width });
    this.shape({ type: "line", style: "clearance", x1: x, y1: y, x2: x, y2: y + width });
    this.shape({ type: "path", style: "clearance", d: `M ${x + width} ${y} A ${width} ${width} 0 0 1 ${x} ${y + width}` });
  }

  entrance(x: number): void {
    // The surface stroke creates an actual gap in the canvas's outer wall.
    this.shape({ type: "line", style: "surface", x1: x, y1: 0, x2: x + 90, y2: 0 });
    this.horizontalDoor("entry", "Entry", x, 0, 90);
  }

  bathroom(x: number, width: number, depth: number): void {
    this.surface(x, 0, width, depth);
    this.wall(x, 0, x, 100);
    this.wall(x, 180, x, depth);
    this.wall(x, depth, x + width, depth);
    this.verticalDoor("bathroom", "Bathroom", x, 100, 80, 1);
    this.fixture("shower", "Shower", x + width - 85, 10, 75, 75);
    this.shape({ type: "line", style: "detail", x1: x + width - 85, y1: 10, x2: x + width - 10, y2: 85 });
    this.fixture("basin", "Washbasin", x + 10, 15, 45, 40);
    this.shape({ type: "ellipse", style: "fixture", cx: x + 32.5, cy: 35, rx: 16, ry: 12 });
    this.fixture("wc", "WC", x + width - 70, 115, 45, 65);
    this.shape({ type: "ellipse", style: "fixture", cx: x + width - 47.5, cy: 150, rx: 17, ry: 22 });
    this.label("Bathroom", x + width / 2, depth - 15);
  }

  verticalKitchen(x: number, y: number, height: number): void {
    this.fixture("kitchen-main", "Kitchen cabinetry", x, y, 60, height);
    for (let offset = 60; offset < height; offset += 60) {
      this.shape({ type: "line", style: "detail", x1: x, y1: y + offset, x2: x + 60, y2: y + offset });
    }
    this.shape({ type: "rect", style: "fixture", x: x + 10, y: y + 70, width: 40, height: 40 });
    for (const dx of [18, 42]) {
      for (const dy of [height - 72, height - 48]) {
        this.shape({ type: "ellipse", style: "fixture", cx: x + dx, cy: y + dy, rx: 8, ry: 8 });
      }
    }
  }

  horizontalKitchen(x: number, y: number, width: number): void {
    this.fixture("kitchen-return", "Kitchen cabinetry", x, y, width, 60);
    for (let offset = 60; offset < width; offset += 60) {
      this.shape({ type: "line", style: "detail", x1: x + offset, y1: y, x2: x + offset, y2: y + 60 });
    }
  }
}

function drawOpenStudio(layout: LayoutBuilder): void {
  layout.entrance(100);
  layout.bathroom(220, 180, 220);
  layout.verticalKitchen(0, 120, 240);
  layout.label("Entry", 155, 70);
  layout.label("Kitchen", 120, 300);
  layout.label("Living / sleeping", 230, 495);
}

function drawSeparateStudio(layout: LayoutBuilder): void {
  layout.entrance(180);
  layout.bathroom(270, 180, 220);
  layout.verticalKitchen(0, 60, 240);
  layout.horizontalKitchen(60, 0, 120);
  layout.wall(180, 0, 180, 170);
  layout.wall(180, 260, 180, 300);
  layout.wall(0, 300, 180, 300);
  layout.verticalDoor("kitchen", "Kitchen", 180, 170, 90, -1);
  layout.label("Kitchen", 110, 125);
  layout.label("Entry", 225, 70);
  layout.label("Living / sleeping", 245, 555);
}

function drawOneBedroomOpen(layout: LayoutBuilder): void {
  layout.entrance(280);
  layout.bathroom(420, 180, 220);
  layout.verticalKitchen(0, 0, 300);
  layout.wall(360, 300, 600, 300);
  layout.wall(360, 300, 360, 400);
  layout.wall(360, 490, 360, 750);
  layout.verticalDoor("bedroom", "Bedroom", 360, 400, 90, 1);
  layout.label("Entry", 330, 100);
  layout.label("Kitchen", 145, 180);
  layout.label("Living / dining", 180, 505);
  layout.label("Bedroom", 485, 590);
}

function drawOneBedroomSeparate(layout: LayoutBuilder): void {
  layout.entrance(280);
  layout.bathroom(420, 180, 220);
  layout.verticalKitchen(0, 60, 240);
  layout.horizontalKitchen(60, 0, 200);
  layout.wall(260, 0, 260, 140);
  layout.wall(260, 230, 260, 300);
  layout.wall(0, 300, 260, 300);
  layout.verticalDoor("kitchen", "Kitchen", 260, 140, 90, -1);
  layout.wall(0, 560, 100, 560);
  layout.wall(190, 560, 300, 560);
  layout.wall(300, 560, 300, 900);
  layout.horizontalDoor("bedroom", "Bedroom", 100, 560, 90);
  layout.label("Kitchen", 150, 125);
  layout.label("Entry", 335, 100);
  layout.label("Living / dining", 435, 540);
  layout.label("Bedroom", 150, 755);
}

function drawTwoBedroom(layout: LayoutBuilder): void {
  layout.entrance(380);
  layout.bathroom(500, 200, 230);
  layout.verticalKitchen(0, 60, 240);
  layout.horizontalKitchen(60, 0, 220);
  layout.wall(0, 620, 120, 620);
  layout.wall(210, 620, 490, 620);
  layout.wall(580, 620, 700, 620);
  layout.wall(350, 620, 350, 1000);
  layout.horizontalDoor("bedroom-1", "Bedroom 1", 120, 620, 90);
  layout.horizontalDoor("bedroom-2", "Bedroom 2", 490, 620, 90);
  layout.label("Kitchen", 155, 180);
  layout.label("Entry", 430, 100);
  layout.label("Living / dining", 350, 440);
  layout.label("Bedroom 1", 175, 835);
  layout.label("Bedroom 2", 525, 835);
}

export function createStarterPlan(id: string): PlannerPlan {
  const definition = STARTER_PLANS.find((entry) => entry.id === id);
  if (!definition) throw new RangeError(`Unknown starter plan: ${id}`);
  if (id === "empty") return createDefaultPlan();
  const layout = new LayoutBuilder(definition.widthCm, definition.lengthCm);
  switch (id) {
    case "studio-open": drawOpenStudio(layout); break;
    case "studio-separate": drawSeparateStudio(layout); break;
    case "one-bedroom-open": drawOneBedroomOpen(layout); break;
    case "one-bedroom-separate": drawOneBedroomSeparate(layout); break;
    case "two-bedroom": drawTwoBedroom(layout); break;
    default: throw new RangeError(`Unknown starter plan: ${id}`);
  }
  return {
    apartment: { widthCm: definition.widthCm, lengthCm: definition.lengthCm, knownAreaSqm: definition.areaSqm },
    layout: layout.layout,
    furniture: [],
  };
}
