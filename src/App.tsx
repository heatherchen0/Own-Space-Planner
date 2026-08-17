import {
  useEffect,
  useId,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  APARTMENT_LIMITS,
  buildPlanGeometry,
  createDefaultPlan,
  createFurniture,
  getApartmentBounds,
  getInferredAreaSqm,
} from "./apartment";
import {
  boundsContain,
  boundsOverlap,
  clampFurnitureCenter,
  getFurnitureBounds,
  nextRotation,
} from "./geometry";
import {
  MAX_PLAN_FURNITURE,
  parsePlanFile,
  serializePlan,
} from "./planFile";
import { PlannerCanvas } from "./PlannerCanvas";
import { clearSavedPlan, loadPlan, savePlan } from "./storage";
import type {
  ApartmentSettings,
  FurnitureItem,
  PlannerPlan,
  Point,
} from "./types";

const MAX_IMPORT_BYTES = 1024 * 1024;

type SaveStatus = "saving" | "saved" | "error";
type PlanNotice = { kind: "success" | "error"; text: string };

function isInteractiveControl(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "input, textarea, select, button, a[href], [contenteditable]:not([contenteditable='false'])",
      ),
    )
  );
}

function clampPlanFurniture(plan: PlannerPlan): PlannerPlan {
  const bounds = getApartmentBounds(plan.apartment);
  return {
    apartment: { ...plan.apartment },
    furniture: plan.furniture.map((item) => ({
      ...item,
      ...clampFurnitureCenter(item, item, bounds),
    })),
  };
}

function formatArea(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onDraftChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onDraftChange: (id: string, dirty: boolean) => void;
  onCommit: (value: number) => void;
}) {
  const inputId = useId();
  const errorId = inputId + "-error";
  const skipBlurCommitRef = useRef(false);
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(String(value));
    setError(null);
    onDraftChange(inputId, false);
  }, [inputId, onDraftChange, value]);

  useEffect(
    () => () => onDraftChange(inputId, false),
    [inputId, onDraftChange],
  );

  function normalizedDraft(source: string): number | null {
    const parsed = Number(source);
    if (
      source.trim() === "" ||
      !Number.isFinite(parsed) ||
      parsed < min ||
      parsed > max
    ) {
      return null;
    }

    return step >= 1
      ? Math.round(parsed)
      : Number((Math.round(parsed / step) * step).toFixed(6));
  }

  function commitDraft() {
    const normalized = normalizedDraft(draft);
    if (normalized === null) {
      setError(`Enter a value from ${min} to ${max} ${unit}.`);
      onDraftChange(inputId, true);
      return;
    }

    setDraft(String(normalized));
    setError(null);
    onDraftChange(inputId, false);
    if (normalized !== value) {
      onCommit(normalized);
    }
  }

  return (
    <div className="number-field">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          const nextDraft = event.target.value;
          const normalized = normalizedDraft(nextDraft);
          setDraft(nextDraft);
          setError(null);
          onDraftChange(inputId, normalized === null);
          if (normalized !== null && normalized !== value) {
            onCommit(normalized);
          }
        }}
        onBlur={() => {
          if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false;
            return;
          }
          commitDraft();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            skipBlurCommitRef.current = true;
            setDraft(String(value));
            setError(null);
            onDraftChange(inputId, false);
            event.currentTarget.blur();
          }
        }}
      />
      {error && (
        <span className="field-error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export default function App() {
  const [plan, setPlan] = useState<PlannerPlan>(() =>
    clampPlanFurniture(loadPlan() ?? createDefaultPlan()),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    () => plan.furniture[0]?.id ?? null,
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saving");
  const [planNotice, setPlanNotice] = useState<PlanNotice | null>(null);
  const [dirtyDraftIds, setDirtyDraftIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const sequenceRef = useRef(plan.furniture.length);
  const importInputRef = useRef<HTMLInputElement>(null);

  const items = plan.furniture;
  const geometry = useMemo(
    () => buildPlanGeometry(plan.apartment),
    [plan.apartment],
  );
  const inferredAreaSqm = getInferredAreaSqm(plan.apartment);
  const hasDirtyDraft = dirtyDraftIds.size > 0;

  const handleDraftChange = useCallback((id: string, dirty: boolean) => {
    setDirtyDraftIds((current) => {
      const alreadyDirty = current.has(id);
      if (alreadyDirty === dirty) {
        return current;
      }

      const next = new Set(current);
      if (dirty) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const conflictingIds = useMemo(() => {
    const conflicts = new Set<string>();
    const itemBounds = items.map((item) => ({
      item,
      bounds: getFurnitureBounds(item),
    }));

    for (const entry of itemBounds) {
      if (
        !boundsContain(geometry.bounds, entry.bounds) ||
        geometry.blockedZones.some((zone) =>
          boundsOverlap(entry.bounds, zone),
        )
      ) {
        conflicts.add(entry.item.id);
      }
    }

    for (let index = 0; index < itemBounds.length; index += 1) {
      for (let other = index + 1; other < itemBounds.length; other += 1) {
        const first = itemBounds[index];
        const second = itemBounds[other];
        if (first && second && boundsOverlap(first.bounds, second.bounds)) {
          conflicts.add(first.item.id);
          conflicts.add(second.item.id);
        }
      }
    }

    return conflicts;
  }, [geometry, items]);

  useEffect(() => {
    setSaveStatus("saving");
    setSaveStatus(savePlan(plan) ? "saved" : "error");
  }, [plan]);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if (
        isInteractiveControl(event.target) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        deleteSelected();
      }

      if (event.key.toLowerCase() === "r" && selectedId) {
        event.preventDefault();
        rotateSelected();
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  });

  function updateItem(id: string, patch: Partial<FurnitureItem>) {
    setPlan((current) => {
      const bounds = getApartmentBounds(current.apartment);
      return {
        ...current,
        furniture: current.furniture.map((item) => {
          if (item.id !== id) {
            return item;
          }

          const updated = { ...item, ...patch };
          return {
            ...updated,
            ...clampFurnitureCenter(updated, updated, bounds),
          };
        }),
      };
    });
  }

  function moveItem(id: string, point: Point) {
    updateItem(id, point);
  }

  function updateApartment(patch: Partial<ApartmentSettings>) {
    setPlan((current) =>
      clampPlanFurniture({
        apartment: { ...current.apartment, ...patch },
        furniture: current.furniture,
      }),
    );
  }

  function addFurniture() {
    if (items.length >= MAX_PLAN_FURNITURE) {
      setPlanNotice({
        kind: "error",
        text: `A plan can contain up to ${MAX_PLAN_FURNITURE} furniture items.`,
      });
      return;
    }

    sequenceRef.current += 1;
    const item = createFurniture(sequenceRef.current);
    setPlan((current) => ({
      ...current,
      furniture: [...current.furniture, item],
    }));
    setSelectedId(item.id);
  }

  function rotateSelected() {
    if (!selectedId) {
      return;
    }

    const item = items.find((candidate) => candidate.id === selectedId);
    if (item) {
      updateItem(item.id, { rotation: nextRotation(item.rotation) });
    }
  }

  function deleteSelected() {
    if (!selectedId) {
      return;
    }

    setPlan((current) => ({
      ...current,
      furniture: current.furniture.filter((item) => item.id !== selectedId),
    }));
    setSelectedId(null);
  }

  function resetPlan() {
    const shouldReset = window.confirm(
      "Reset the apartment settings and furniture to the starter plan?",
    );
    if (!shouldReset) {
      return;
    }

    clearSavedPlan();
    const defaultPlan = createDefaultPlan();
    sequenceRef.current = defaultPlan.furniture.length;
    setPlan(defaultPlan);
    setSelectedId(defaultPlan.furniture[0]?.id ?? null);
    setPlanNotice({ kind: "success", text: "Starter plan restored." });
  }

  function exportPlan() {
    try {
      const blob = new Blob([serializePlan(plan)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        "own-space-plan-" + new Date().toISOString().slice(0, 10) + ".json";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setPlanNotice({
        kind: "success",
        text: "Plan exported as a JSON file.",
      });
    } catch {
      setPlanNotice({
        kind: "error",
        text: "The plan could not be exported.",
      });
    }
  }

  async function importPlan(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }

    if (file.size > MAX_IMPORT_BYTES) {
      setPlanNotice({
        kind: "error",
        text: "That file is too large. Plan files must be 1 MB or smaller.",
      });
      return;
    }

    try {
      const result = parsePlanFile(await file.text());
      if (!result.ok) {
        setPlanNotice({ kind: "error", text: result.error });
        return;
      }

      if (!window.confirm("Replace the current plan with this imported plan?")) {
        return;
      }

      const importedPlan = clampPlanFurniture(result.plan);
      sequenceRef.current = importedPlan.furniture.length;
      setPlan(importedPlan);
      setSelectedId(importedPlan.furniture[0]?.id ?? null);
      setPlanNotice({ kind: "success", text: "Plan imported." });
    } catch {
      setPlanNotice({
        kind: "error",
        text: "The selected file could not be read.",
      });
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="draft-badge">WORKING DRAFT · v0.2</div>
          <h1>Own Space Planner</h1>
          <p>A local-first 2D planner. Geometry is stored in centimetres.</p>
        </div>
        <div
          className={
            "save-status save-status-" +
            (hasDirtyDraft ? "saving" : saveStatus)
          }
          aria-live="polite"
        >
          <span className="save-dot" />
          {hasDirtyDraft && "An input has not been applied"}
          {!hasDirtyDraft && saveStatus === "saving" && "Saving locally…"}
          {!hasDirtyDraft && saveStatus === "saved" &&
            "Saved locally in this browser"}
          {!hasDirtyDraft && saveStatus === "error" &&
            "Could not save — keep this tab open and check browser storage"}
        </div>
      </header>

      <main className="workspace">
        <section className="canvas-panel" aria-labelledby="plan-heading">
          <div className="canvas-toolbar">
            <div>
              <h2 id="plan-heading">Default floor plan</h2>
              <p>Drag furniture. Movement snaps to 5 cm.</p>
            </div>
            <div className="toolbar-actions">
              <button
                className="primary-button"
                onClick={addFurniture}
                disabled={items.length >= MAX_PLAN_FURNITURE}
                title={
                  items.length >= MAX_PLAN_FURNITURE
                    ? `Maximum ${MAX_PLAN_FURNITURE} furniture items reached`
                    : undefined
                }
              >
                + Add furniture
              </button>
              <button onClick={exportPlan}>Export plan</button>
              <button onClick={() => importInputRef.current?.click()}>
                Import plan
              </button>
              <input
                id="plan-import-input"
                ref={importInputRef}
                className="visually-hidden"
                type="file"
                accept=".json,application/json"
                tabIndex={-1}
                aria-hidden="true"
                onChange={importPlan}
              />
              <button onClick={resetPlan}>Reset starter plan</button>
            </div>
          </div>
          {planNotice && (
            <div
              className={"plan-notice plan-notice-" + planNotice.kind}
              role={planNotice.kind === "error" ? "alert" : "status"}
            >
              {planNotice.text}
            </div>
          )}
          <div className="canvas-frame">
            <PlannerCanvas
              geometry={geometry}
              items={items}
              selectedId={selectedId}
              conflictingIds={conflictingIds}
              onSelect={setSelectedId}
              onMove={moveItem}
            />
          </div>
          <div className="canvas-legend" aria-label="Drawing legend">
            <span>
              <i className="legend-swatch default-swatch" />
              Default dimension
            </span>
            <span>
              <i className="legend-swatch template-swatch" />
              Template structure
            </span>
            <span>
              <i className="legend-swatch conflict-swatch" />
              Placement conflict
            </span>
            <span>
              Minor square 10 cm · darker line 50 cm · bold line 1 m
            </span>
          </div>
        </section>

        <aside className="side-panel">
          <section className="panel-section apartment-section">
            <span className="eyebrow">Apartment</span>
            <h2>Plan size</h2>
            <div className="apartment-form">
              <NumberField
                label="Width (cm)"
                value={plan.apartment.widthCm}
                min={APARTMENT_LIMITS.minWidthCm}
                max={APARTMENT_LIMITS.maxWidthCm}
                unit="cm"
                onDraftChange={handleDraftChange}
                onCommit={(widthCm) => updateApartment({ widthCm })}
              />
              <NumberField
                label="Length (cm)"
                value={plan.apartment.lengthCm}
                min={APARTMENT_LIMITS.minLengthCm}
                max={APARTMENT_LIMITS.maxLengthCm}
                unit="cm"
                onDraftChange={handleDraftChange}
                onCommit={(lengthCm) => updateApartment({ lengthCm })}
              />
              <NumberField
                label="Known area (m²)"
                value={plan.apartment.knownAreaSqm}
                min={APARTMENT_LIMITS.minKnownAreaSqm}
                max={APARTMENT_LIMITS.maxKnownAreaSqm}
                step={0.1}
                unit="m²"
                onDraftChange={handleDraftChange}
                onCommit={(knownAreaSqm) =>
                  updateApartment({ knownAreaSqm })
                }
              />
            </div>
            <div className="area-summary" aria-live="polite">
              <span>
                Known total{" "}
                <strong>{formatArea(plan.apartment.knownAreaSqm)} m²</strong>
              </span>
              <span>
                Inferred total{" "}
                <strong>{formatArea(inferredAreaSqm)} m²</strong>
              </span>
            </div>
          </section>

          <section className="panel-section editor-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Furniture</span>
                <h2>
                  {selectedItem ? "Edit selected item" : "Nothing selected"}
                </h2>
              </div>
              {selectedItem && (
                <span className="selection-chip">
                  {selectedItem.rotation + "°"}
                </span>
              )}
            </div>

            {selectedItem ? (
              <div className="editor-form">
                <label>
                  Label
                  <input
                    type="text"
                    maxLength={100}
                    value={selectedItem.label}
                    onChange={(event) =>
                      updateItem(selectedItem.id, {
                        label: event.target.value,
                      })
                    }
                  />
                </label>
                <div className="dimension-fields">
                  <NumberField
                    key={selectedItem.id + "-width"}
                    label="Width (cm)"
                    value={selectedItem.width}
                    min={10}
                    max={1000}
                    unit="cm"
                    onDraftChange={handleDraftChange}
                    onCommit={(width) =>
                      updateItem(selectedItem.id, { width })
                    }
                  />
                  <NumberField
                    key={selectedItem.id + "-depth"}
                    label="Depth (cm)"
                    value={selectedItem.depth}
                    min={10}
                    max={1000}
                    unit="cm"
                    onDraftChange={handleDraftChange}
                    onCommit={(depth) =>
                      updateItem(selectedItem.id, { depth })
                    }
                  />
                </div>
                {conflictingIds.has(selectedItem.id) && (
                  <div className="placement-warning" role="status">
                    This item overlaps a fixed area, another item, or the
                    apartment boundary. It can stay here while you compare
                    options, but this placement does not fit.
                  </div>
                )}
                <div className="position-readout">
                  Centre: {Math.round(selectedItem.x)} cm from left,{" "}
                  {Math.round(selectedItem.y)} cm from top
                </div>
                <div className="editor-actions">
                  <button onClick={rotateSelected}>
                    Rotate 90° <span className="shortcut">R</span>
                  </button>
                  <button className="danger-button" onClick={deleteSelected}>
                    Delete <span className="shortcut">Del</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-selection">
                Select a furniture shape on the plan, or add a new one.
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}
