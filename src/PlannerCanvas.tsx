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

function LayoutShape({ shape }: { shape: PlanGeometry["shapes"][number] }) {
  const className = "layout-" + shape.style;

  switch (shape.type) {
    case "rect":
      return (
        <rect
          className={className}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
        />
      );
    case "line":
      return (
        <line
          className={className}
          x1={shape.x1}
          y1={shape.y1}
          x2={shape.x2}
          y2={shape.y2}
        />
      );
    case "ellipse":
      return (
        <ellipse
          className={className}
          cx={shape.cx}
          cy={shape.cy}
          rx={shape.rx}
          ry={shape.ry}
        />
      );
    case "path":
      return <path className={className} d={shape.d} />;
    case "text":
      return (
        <text
          className={className}
          x={shape.x}
          y={shape.y}
          textAnchor="middle"
          transform={
            "rotate(" + shape.rotate + " " + shape.x + " " + shape.y + ")"
          }
        >
          {shape.text}
        </text>
      );
  }
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

  const { bounds, drawingBounds, shapes } = geometry;
  const rightDimensionX = drawingBounds.x + drawingBounds.width + 27;
  const rightDimensionLabelX = rightDimensionX + 11;
  const rightDimensionMidY = bounds.y + bounds.height / 2;
  const topDimensionY = drawingBounds.y - 24;
  const scaleY = drawingBounds.y + drawingBounds.height + 45;
  const viewX = drawingBounds.x - 75;
  const viewY = drawingBounds.y - 75;
  const viewWidth = Math.max(100, drawingBounds.width) + 150;
  const viewHeight = drawingBounds.height + 175;

  return (
    <svg
      ref={svgRef}
      className={"planner-canvas" + (draggingId ? " is-dragging" : "")}
      data-testid="planner-canvas"
      viewBox={viewX + " " + viewY + " " + viewWidth + " " + viewHeight}
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
          id="layout-hatch"
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
        x={viewX}
        y={viewY}
        width={viewWidth}
        height={viewHeight}
        fill="url(#grid-100)"
      />

      <g className="plan-dimensions" aria-label="Apartment dimensions">
        <line
          x1={bounds.x}
          y1={topDimensionY}
          x2={bounds.x + bounds.width}
          y2={topDimensionY}
        />
        <line
          x1={bounds.x}
          y1={topDimensionY - 7}
          x2={bounds.x}
          y2={topDimensionY + 7}
        />
        <line
          x1={bounds.x + bounds.width}
          y1={topDimensionY - 7}
          x2={bounds.x + bounds.width}
          y2={topDimensionY + 7}
        />
        <text
          x={bounds.x + bounds.width / 2}
          y={topDimensionY - 8}
          textAnchor="middle"
        >
          {bounds.width + " cm"}
        </text>
        <line
          x1={rightDimensionX}
          y1={bounds.y}
          x2={rightDimensionX}
          y2={bounds.y + bounds.height}
        />
        <line
          x1={rightDimensionX - 7}
          y1={bounds.y}
          x2={rightDimensionX + 7}
          y2={bounds.y}
        />
        <line
          x1={rightDimensionX - 7}
          y1={bounds.y + bounds.height}
          x2={rightDimensionX + 7}
          y2={bounds.y + bounds.height}
        />
        <text
          x={rightDimensionLabelX}
          y={rightDimensionMidY}
          textAnchor="middle"
          transform={
            "rotate(90 " + rightDimensionLabelX + " " + rightDimensionMidY + ")"
          }
        >
          {bounds.height + " cm"}
        </text>
      </g>

      <g className="apartment-shell">
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          className="room-fill"
        />
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          className="outer-wall"
        />
      </g>

      <g className="layout-layer" aria-label="Imported floor plan features">
        {shapes.map((shape, index) => (
          <LayoutShape key={index} shape={shape} />
        ))}
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

      <g
        className="scale-bar"
        transform={"translate(" + drawingBounds.x + " " + scaleY + ")"}
      >
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
