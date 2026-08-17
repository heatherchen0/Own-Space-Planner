import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { PlanGeometry } from "./apartment";
import { snapTo } from "./geometry";
import type { FurnitureItem, Point } from "./types";

type PlannerCanvasProps = {
  geometry: PlanGeometry;
  items: FurnitureItem[];
  selectedId: string | null;
  conflictingIds: ReadonlySet<string>;
  onSelect: (id: string | null) => void;
  onMove: (id: string, point: Point) => void;
};

type DragState = {
  pointerId: number;
  item: FurnitureItem;
  offsetX: number;
  offsetY: number;
};

function FurnitureShape({
  item,
  isSelected,
  isDragging,
  hasConflict,
  onPointerDown,
  onSelect,
  onNudge,
}: {
  item: FurnitureItem;
  isSelected: boolean;
  isDragging: boolean;
  hasConflict: boolean;
  onPointerDown: (
    event: ReactPointerEvent<SVGGElement>,
    item: FurnitureItem,
  ) => void;
  onSelect: () => void;
  onNudge: (point: Point) => void;
}) {
  return (
    <g
      className={
        "furniture-item" +
        (isSelected ? " is-selected" : "") +
        (isDragging ? " is-dragging" : "") +
        (hasConflict ? " has-conflict" : "")
      }
      transform={
        "translate(" +
        item.x +
        " " +
        item.y +
        ") rotate(" +
        item.rotation +
        ")"
      }
      onPointerDown={(event) => onPointerDown(event, item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
          return;
        }

        const step = event.shiftKey ? 50 : 5;
        const offsets: Record<string, Point> = {
          ArrowLeft: { x: -step, y: 0 },
          ArrowRight: { x: step, y: 0 },
          ArrowUp: { x: 0, y: -step },
          ArrowDown: { x: 0, y: step },
        };
        const offset = offsets[event.key];
        if (offset) {
          event.preventDefault();
          onSelect();
          onNudge({ x: item.x + offset.x, y: item.y + offset.y });
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight R Delete"
      data-item-id={item.id}
      aria-label={
        item.label +
        ", " +
        item.width +
        " by " +
        item.depth +
        " centimetres" +
        (hasConflict ? ", placement conflict" : "")
      }
    >
      <rect
        className="furniture-body"
        x={-item.width / 2}
        y={-item.depth / 2}
        width={item.width}
        height={item.depth}
        rx={4}
        fill={item.color}
      />
      <line
        className="furniture-orientation"
        x1={-item.width / 2 + 8}
        y1={-item.depth / 2 + 8}
        x2={item.width / 2 - 8}
        y2={-item.depth / 2 + 8}
      />
      <g transform={"rotate(" + -item.rotation + ")"}>
        <text className="furniture-label" textAnchor="middle" y={-3}>
          {item.label}
        </text>
        <text className="furniture-size" textAnchor="middle" y={15}>
          {item.width + " × " + item.depth + " cm"}
        </text>
      </g>
      {isSelected && (
        <>
          <rect
            className="selection-outline"
            x={-item.width / 2 - 5}
            y={-item.depth / 2 - 5}
            width={item.width + 10}
            height={item.depth + 10}
            rx={7}
          />
          <circle
            className="selection-handle"
            cx={item.width / 2 + 5}
            cy={item.depth / 2 + 5}
            r={6}
          />
        </>
      )}
    </g>
  );
}

export function PlannerCanvas({
  geometry,
  items,
  selectedId,
  conflictingIds,
  onSelect,
  onMove,
}: PlannerCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function toPlanPoint(event: ReactPointerEvent<SVGSVGElement | SVGGElement>) {
    const svg = svgRef.current;
    if (!svg) {
      return { x: 0, y: 0 };
    }

    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    return matrix
      ? point.matrixTransform(matrix.inverse())
      : { x: event.clientX, y: event.clientY };
  }

  function beginDrag(
    event: ReactPointerEvent<SVGGElement>,
    item: FurnitureItem,
  ) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelect(item.id);
    const point = toPlanPoint(event);
    dragRef.current = {
      pointerId: event.pointerId,
      item,
      offsetX: point.x - item.x,
      offsetY: point.y - item.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(item.id);
  }

  function continueDrag(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const point = toPlanPoint(event);
    const snapped = {
      x: snapTo(point.x - drag.offsetX),
      y: snapTo(point.y - drag.offsetY),
    };
    onMove(drag.item.id, snapped);
  }

  function endDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setDraggingId(null);
  }

  const {
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
  } = geometry;
  const rightDimensionX = bounds.width + 27;
  const rightDimensionLabelX = bounds.width + 38;
  const rightDimensionMidY = bounds.height / 2;
  const scaleY = bounds.height + 135;
  const mainRoomX = Math.max(180, bounds.width - 165);
  const mainRoomY = bounds.height * 0.73;

  return (
    <svg
      ref={svgRef}
      className={
        "planner-canvas" + (draggingId ? " is-dragging" : "")
      }
      data-testid="planner-canvas"
      viewBox={
        "-75 -75 " +
        (bounds.width + 150) +
        " " +
        (bounds.height + 265)
      }
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={() => onSelect(null)}
      onPointerMove={continueDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      aria-label="Two-dimensional apartment floor plan, all geometry in centimetres"
    >
      <title>Interactive apartment plan in centimetres</title>
      <defs>
        <pattern
          id="grid-10"
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
        >
          <path d="M 10 0 L 0 0 0 10" className="grid-line grid-minor" />
        </pattern>
        <pattern
          id="grid-50"
          width="50"
          height="50"
          patternUnits="userSpaceOnUse"
        >
          <rect width="50" height="50" fill="url(#grid-10)" />
          <path d="M 50 0 L 0 0 0 50" className="grid-line grid-medium" />
        </pattern>
        <pattern
          id="grid-100"
          width="100"
          height="100"
          patternUnits="userSpaceOnUse"
        >
          <rect width="100" height="100" fill="url(#grid-50)" />
          <path d="M 100 0 L 0 0 0 100" className="grid-line grid-major" />
        </pattern>
        <pattern
          id="reference-hatch"
          width="12"
          height="12"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="12" className="hatch-line" />
        </pattern>
      </defs>

      <rect
        className="grid-background"
        x="-75"
        y="-75"
        width={bounds.width + 150}
        height={bounds.height + 265}
        fill="url(#grid-100)"
      />

      <g className="plan-dimensions" aria-label="Apartment dimensions">
        <line x1="0" y1="-24" x2={bounds.width} y2="-24" />
        <line x1="0" y1="-31" x2="0" y2="-17" />
        <line
          x1={bounds.width}
          y1="-31"
          x2={bounds.width}
          y2="-17"
        />
        <text x={bounds.width / 2} y="-32" textAnchor="middle">
          {bounds.width + " cm"}
        </text>
        <line
          x1={rightDimensionX}
          y1="0"
          x2={rightDimensionX}
          y2={bounds.height}
        />
        <line
          x1={rightDimensionX - 7}
          y1="0"
          x2={rightDimensionX + 7}
          y2="0"
        />
        <line
          x1={rightDimensionX - 7}
          y1={bounds.height}
          x2={rightDimensionX + 7}
          y2={bounds.height}
        />
        <text
          x={rightDimensionLabelX}
          y={rightDimensionMidY}
          textAnchor="middle"
          transform={
            "rotate(90 " +
            rightDimensionLabelX +
            " " +
            rightDimensionMidY +
            ")"
          }
        >
          {bounds.height + " cm"}
        </text>
      </g>

      <g className="apartment-shell">
        <rect
          x="0"
          y="0"
          width={bounds.width}
          height={bounds.height}
          className="room-fill"
        />
        <rect
          x="0"
          y="0"
          width={bounds.width}
          height={bounds.height}
          className="outer-wall"
        />
      </g>

      <g className="balcony-landmark">
        <rect
          x={balcony.x}
          y={balcony.y}
          width={balcony.width}
          height={balcony.depth}
        />
        <line
          x1={balcony.x}
          y1={balcony.y + 30}
          x2={balcony.x + balcony.width}
          y2={balcony.y + 30}
        />
        <line
          x1={balcony.x}
          y1={balcony.y + 60}
          x2={balcony.x + balcony.width}
          y2={balcony.y + 60}
        />
        <text
          x={balcony.x + balcony.width / 2}
          y={balcony.y + 52}
          textAnchor="middle"
        >
          BALCONY
        </text>
      </g>

      <g className="fixed-landmark bathroom-landmark">
        <rect
          x="5"
          y="5"
          width={bathroom.width - 10}
          height={bathroom.depth - 10}
        />
        <line
          className="interior-wall"
          x1={bathroom.x + bathroom.width}
          y1="0"
          x2={bathroom.x + bathroom.width}
          y2={bathroom.y + bathroom.depth}
        />
        <line
          className="interior-wall"
          x1="0"
          y1={bathroom.y + bathroom.depth}
          x2={bathroom.x + bathroom.width}
          y2={bathroom.y + bathroom.depth}
        />
        <rect className="fixture" x="22" y="25" width="62" height="62" />
        <path className="fixture" d="M 31 28 L 76 83 M 76 28 L 31 83" />
        <ellipse className="fixture" cx="63" cy="156" rx="22" ry="33" />
        <text x="121" y="113" textAnchor="middle">
          BATHROOM
        </text>
      </g>

      <g className="fixed-landmark entry-landmark">
        <rect
          x={entry.x}
          y={entry.y}
          width={entry.width}
          height={entry.depth}
        />
        <text
          x={entry.x + entry.width / 2}
          y={entry.y + 84}
          textAnchor="middle"
        >
          ENTRY
        </text>
        <path
          className="door-swing"
          d={
            "M " +
            entryDoorClearance.x +
            " 0 L " +
            entryDoorClearance.x +
            " " +
            entryDoorClearance.height +
            " A " +
            entryDoorClearance.width +
            " " +
            entryDoorClearance.height +
            " 0 0 0 " +
            (entryDoorClearance.x + entryDoorClearance.width) +
            " 0"
          }
        />
      </g>

      <g className="fixed-landmark storage-landmark">
        <rect
          x={entryStorage.x}
          y={entryStorage.y}
          width={entryStorage.width}
          height={entryStorage.depth}
        />
        <line
          x1={entryStorage.x}
          y1="55"
          x2={entryStorage.x + entryStorage.width}
          y2="55"
        />
        <line
          x1={entryStorage.x}
          y1="108"
          x2={entryStorage.x + entryStorage.width}
          y2="108"
        />
        <text
          className="vertical-label"
          x={entryStorage.x + 39}
          y="82"
          textAnchor="middle"
          transform={
            "rotate(90 " + (entryStorage.x + 39) + " 82)"
          }
        >
          STORAGE
        </text>
      </g>

      <g className="fixed-landmark kitchen-landmark">
        <rect
          x={kitchenRun.x}
          y={kitchenRun.y}
          width={kitchenRun.width}
          height={kitchenRun.depth}
        />
        <rect
          className="fixture"
          x={kitchenRun.x + 11}
          y={kitchenRun.y + 33}
          width="38"
          height="54"
          rx="5"
        />
        <circle
          className="fixture"
          cx={kitchenRun.x + 20}
          cy={kitchenRun.y + 155}
          r="10"
        />
        <circle
          className="fixture"
          cx={kitchenRun.x + 42}
          cy={kitchenRun.y + 155}
          r="10"
        />
        <circle
          className="fixture"
          cx={kitchenRun.x + 20}
          cy={kitchenRun.y + 180}
          r="10"
        />
        <circle
          className="fixture"
          cx={kitchenRun.x + 42}
          cy={kitchenRun.y + 180}
          r="10"
        />
        <text
          x={kitchenRun.x + 30}
          y={kitchenRun.y + 250}
          textAnchor="middle"
          transform={
            "rotate(90 " +
            (kitchenRun.x + 30) +
            " " +
            (kitchenRun.y + 250) +
            ")"
          }
        >
          KITCHEN
        </text>
      </g>

      <g className="reference-partition">
        <rect
          x={referencePartition.x}
          y={referencePartition.y}
          width={referencePartition.width}
          height={referencePartition.depth}
          fill="url(#reference-hatch)"
        />
        <text
          x={referencePartition.x + 27}
          y={referencePartition.y + 79}
          textAnchor="middle"
          transform={
            "rotate(90 " +
            (referencePartition.x + 27) +
            " " +
            (referencePartition.y + 79) +
            ")"
          }
        >
          REFERENCE
        </text>
      </g>

      <g className="default-dimension" aria-label="Default nook width">
        <line
          x1={defaultNook.x}
          y1={defaultNook.y + 38}
          x2={defaultNook.x + defaultNook.width}
          y2={defaultNook.y + 38}
        />
        <line
          x1={defaultNook.x}
          y1={defaultNook.y + 29}
          x2={defaultNook.x}
          y2={defaultNook.y + 47}
        />
        <line
          x1={defaultNook.x + defaultNook.width}
          y1={defaultNook.y + 29}
          x2={defaultNook.x + defaultNook.width}
          y2={defaultNook.y + 47}
        />
        <rect
          x="16"
          y={defaultNook.y + 25}
          width="133"
          height="26"
          rx="5"
        />
        <text x="82.5" y={defaultNook.y + 43} textAnchor="middle">
          165 cm · default
        </text>
        <text
          className="nook-label"
          x="82.5"
          y={defaultNook.y + 68}
          textAnchor="middle"
        >
          OPEN NOOK
        </text>
      </g>

      <text
        className="main-room-label"
        x={mainRoomX}
        y={mainRoomY}
        textAnchor="middle"
      >
        MAIN ROOM
      </text>

      <g className="balcony-door">
        <line
          x1={balconyDoorClearance.x}
          y1={bounds.height}
          x2={balconyDoorClearance.x + balconyDoorClearance.width}
          y2={bounds.height}
        />
        <path
          d={
            "M " +
            balconyDoorClearance.x +
            " " +
            bounds.height +
            " L " +
            balconyDoorClearance.x +
            " " +
            balconyDoorClearance.y +
            " A " +
            balconyDoorClearance.height +
            " " +
            balconyDoorClearance.height +
            " 0 0 1 " +
            (balconyDoorClearance.x + balconyDoorClearance.height) +
            " " +
            bounds.height
          }
        />
        <path
          d={
            "M " +
            (balconyDoorClearance.x + balconyDoorClearance.width) +
            " " +
            bounds.height +
            " L " +
            (balconyDoorClearance.x + balconyDoorClearance.width) +
            " " +
            balconyDoorClearance.y +
            " A " +
            balconyDoorClearance.height +
            " " +
            balconyDoorClearance.height +
            " 0 0 0 " +
            (balconyDoorClearance.x +
              balconyDoorClearance.width -
              balconyDoorClearance.height) +
            " " +
            bounds.height
          }
        />
      </g>

      <g className="furniture-layer">
        {items.map((item) => (
          <FurnitureShape
            key={item.id}
            item={item}
            isSelected={selectedId === item.id}
            isDragging={draggingId === item.id}
            hasConflict={conflictingIds.has(item.id)}
            onPointerDown={beginDrag}
            onSelect={() => onSelect(item.id)}
            onNudge={(point) => onMove(item.id, point)}
          />
        ))}
      </g>

      <g className="scale-bar" transform={"translate(0 " + scaleY + ")"}>
        <text x="0" y="-14">
          Scale
        </text>
        <rect x="0" y="0" width="50" height="12" />
        <rect className="scale-light" x="50" y="0" width="50" height="12" />
        <line x1="0" y1="0" x2="0" y2="18" />
        <line x1="50" y1="0" x2="50" y2="18" />
        <line x1="100" y1="0" x2="100" y2="18" />
        <text x="0" y="34" textAnchor="middle">
          0
        </text>
        <text x="100" y="34" textAnchor="end">
          1 m
        </text>
      </g>
    </svg>
  );
}
