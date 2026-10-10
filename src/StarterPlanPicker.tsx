import { useEffect, useId, useMemo, useRef } from "react";
import { buildPlanGeometry } from "./apartment";
import { createStarterPlan, STARTER_PLANS } from "./starterPlans";
import type { PlanShape } from "./types";

type StarterPlanPickerProps = {
  onChoose: (id: string) => void;
  onClose: () => void;
};

function ThumbnailShape({ shape }: { shape: PlanShape }) {
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
      return null;
  }
}

function StarterThumbnail({ id }: { id: string }) {
  const geometry = useMemo(() => {
    const plan = createStarterPlan(id);
    return buildPlanGeometry(plan.apartment, plan.layout);
  }, [id]);
  const { bounds, drawingBounds, shapes } = geometry;
  const margin = 25;

  return (
    <svg
      className="starter-thumbnail"
      viewBox={
        drawingBounds.x - margin + " " +
        (drawingBounds.y - margin) + " " +
        (drawingBounds.width + margin * 2) + " " +
        (drawingBounds.height + margin * 2)
      }
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        className="room-fill"
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
      />
      <rect
        className="outer-wall"
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
      />
      {shapes.map((shape, index) => (
        <ThumbnailShape key={index} shape={shape} />
      ))}
    </svg>
  );
}

export function StarterPlanPicker({ onChoose, onClose }: StarterPlanPickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement;
    if (!dialog.open) dialog.showModal();

    return () => {
      if (dialog.open) dialog.close();
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="starter-picker"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="starter-picker-header">
        <div>
          <h2 id={titleId}>Choose a starter plan</h2>
          <p id={descriptionId}>
            Helsinki-inspired examples. Dimensions are illustrative; use your own measurements.
            <span className="starter-picker-detail">
              Furniture starts empty; wall layouts are fixed.
            </span>
          </p>
        </div>
        <button
          type="button"
          className="starter-picker-close"
          aria-label="Close starter plans"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <div className="starter-picker-grid">
        {STARTER_PLANS.map((definition) => (
          <button
            key={definition.id}
            type="button"
            className="starter-card"
            aria-label={"Use " + definition.name}
            aria-describedby={titleId + "-" + definition.id}
            onClick={() => onChoose(definition.id)}
          >
            <StarterThumbnail id={definition.id} />
            <span className="starter-card-content" id={titleId + "-" + definition.id}>
              <span className="starter-card-heading">
                <span className="starter-card-name">{definition.name}</span>
                <span className="starter-card-area">{definition.areaSqm + " m²"}</span>
              </span>
              <span className="starter-card-notation">
                {definition.notation}
                {" · " + definition.widthCm + " × " + definition.lengthCm + " cm"}
              </span>
              <span className="starter-card-description">{definition.description}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="starter-picker-footer">
        <p>
          <strong>Reading the names:</strong> h = rooms, including the living room;
          k = separate kitchen; kt = open cooking space.
        </p>
        <p>
          Original example drawings inspired by apartment types listed by{" "}
          <a
            href="https://www.hekaoy.fi/kohde/kauppakartanonkatu-10/"
            target="_blank"
            rel="noreferrer"
          >
            Heka
          </a>
          {" and the "}
          <a
            href="https://asuntotuotanto.hel.fi/fi/asuntohaku/hitas/asunto-oy-helsingin-koskelanpiha-kunnalliskodintie-9"
            target="_blank"
            rel="noreferrer"
          >
            City of Helsinki
          </a>
          .
        </p>
      </div>
    </dialog>
  );
}
