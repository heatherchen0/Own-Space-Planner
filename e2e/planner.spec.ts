import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createStarterPlan, STARTER_PLANS } from "../src/starterPlans";
import type { PlannerPlan } from "../src/types";

const STORAGE_KEY = "own-space-planner:v3:plan";
const PREVIOUS_PLAN_KEY = "own-space-planner:v3:previous-plan";
const LEGACY_FURNITURE_KEY = "own-space-planner:v1:furniture";

// Deliberately synthetic: tests must never distribute somebody's real layout.
function syntheticPlanFile() {
  const plan: PlannerPlan = {
    apartment: { widthCm: 500, lengthCm: 600, knownAreaSqm: 30 },
    layout: {
      extent: { x: 0, y: 0, width: 500, height: 680 },
      shapes: [
        { type: "rect", style: "surface", x: 40, y: 45, width: 100, height: 80 },
        { type: "text", style: "label", x: 90, y: 90, text: "SYNTHETIC WORK ZONE", rotate: 0 },
        { type: "rect", style: "surface", x: 140, y: 610, width: 90, height: 50 },
        { type: "text", style: "label", x: 185, y: 640, text: "SYNTHETIC EXTERIOR", rotate: 0 },
      ],
      blockedZones: [
        { id: "synthetic-work-zone", label: "Synthetic work zone", x: 40, y: 45, width: 100, height: 80 },
      ],
    },
    furniture: [
      {
        id: "synthetic-table", label: "Synthetic table", x: 90, y: 85,
        width: 60, depth: 40, rotation: 0, color: "#336699",
      },
    ],
  };
  return { format: "own-space-planner", version: 2, plan };
}

async function storedPlan(page: Page, key = STORAGE_KEY) {
  return page.evaluate((storageKey) => {
    const source = window.localStorage.getItem(storageKey);
    return source
      ? (JSON.parse(source) as { plan: PlannerPlan }).plan
      : null;
  }, key);
}

async function waitForStoredPlan(
  page: Page,
  predicate: (plan: PlannerPlan) => boolean,
) {
  await expect.poll(async () => {
    const plan = await storedPlan(page);
    return plan ? predicate(plan) : false;
  }).toBe(true);
}

function apartmentSection(page: Page) {
  return page.locator(".apartment-section");
}

function furnitureEditor(page: Page) {
  return page.locator(".editor-section");
}

function starterPicker(page: Page) {
  return page.getByRole("dialog", { name: "Choose a starter plan" });
}

function structuredStarter() {
  const starter = STARTER_PLANS.find((option) => option.id !== "empty");
  if (!starter) throw new Error("The starter catalog has no apartment plans.");
  return starter;
}

async function chooseStarter(page: Page, starter: (typeof STARTER_PLANS)[number]) {
  await page.getByRole("button", { name: "Choose starter plan", exact: true }).click();
  await expect(starterPicker(page)).toBeVisible();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe(
      `Replace the current plan with ${starter.name}? A recovery copy will be kept in this browser.`,
    );
    await dialog.accept();
  });
  await starterPicker(page).getByRole("button", { name: "Use " + starter.name, exact: true }).click();
  await expect(starterPicker(page)).toBeHidden();
}

async function selectPlanFile(page: Page, file: unknown) {
  await page.locator("#plan-import-input").setInputFiles({
    name: "synthetic-plan.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(file)),
  });
}

async function openSyntheticPlan(page: Page, file = syntheticPlanFile()) {
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe(
      "Replace the current plan with this imported plan?",
    );
    await dialog.accept();
  });
  await selectPlanFile(page, file);
  await expect(
    page.getByRole("button", { name: /Synthetic table, 60 by 40 centimetres/ }),
  ).toBeVisible();
  await waitForStoredPlan(page, (plan) => plan.furniture[0]?.id === "synthetic-table");
  return file;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("starts with a general empty rectangle and no fixed structures", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Own Space Planner" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Floor plan", exact: true })).toBeVisible();
  await expect(page.getByTestId("planner-canvas")).toBeVisible();
  await expect(page.locator("[data-item-id]")).toHaveCount(0);
  await expect(page.locator(".layout-surface")).toHaveCount(0);
  await expect(apartmentSection(page).getByText("Known total 30 m²", { exact: true })).toBeVisible();
  await expect(apartmentSection(page).getByText("Inferred total 30 m²", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nothing selected" })).toBeVisible();
  await expect(page.getByText("Saved locally in this browser")).toBeVisible();
  await waitForStoredPlan(page, (plan) =>
    plan.apartment.widthCm === 500 && plan.apartment.lengthCm === 600 &&
    plan.layout.extent === null && plan.layout.shapes.length === 0 &&
    plan.layout.blockedZones.length === 0 && plan.furniture.length === 0,
  );
  expect(await page.locator("#grid-10, #grid-50, #grid-100").evaluateAll((patterns) =>
    patterns.map((pattern) => pattern.getAttribute("width")),
  )).toEqual(["10", "50", "100"]);
  await page.screenshot({ path: "test-results/planner-overview.png", fullPage: true });
});

test("adjusts blank plan size and area, then resumes them after reload", async ({ page }) => {
  const apartment = apartmentSection(page);
  const width = apartment.getByLabel("Width (cm)", { exact: true });
  const length = apartment.getByLabel("Length (cm)", { exact: true });
  const knownArea = apartment.getByLabel("Known area (m²)", { exact: true });
  await width.fill("650");
  await width.press("Enter");
  await length.fill("800");
  await length.press("Enter");
  await knownArea.fill("55");
  await knownArea.press("Enter");
  await expect(apartment.getByText("Inferred total 52 m²", { exact: true })).toBeVisible();
  await waitForStoredPlan(page, (plan) =>
    plan.apartment.widthCm === 650 && plan.apartment.lengthCm === 800 && plan.apartment.knownAreaSqm === 55,
  );
  await page.reload();
  await expect(width).toHaveValue("650");
  await expect(length).toHaveValue("800");
  await expect(knownArea).toHaveValue("55");
  await expect(page.locator("[data-item-id]")).toHaveCount(0);
});

test("adds, edits, nudges, rotates, and resumes furniture", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add furniture" }).click();
  const editor = furnitureEditor(page);
  await editor.getByLabel("Label", { exact: true }).fill("Draft desk");
  const width = editor.getByLabel("Width (cm)", { exact: true });
  const depth = editor.getByLabel("Depth (cm)", { exact: true });
  await width.fill("120");
  await width.press("Enter");
  await depth.fill("70");
  await depth.press("Enter");
  const desk = page.getByRole("button", { name: /Draft desk, 120 by 70 centimetres/ });
  await desk.focus();
  const before = await desk.getAttribute("transform");
  await desk.press("ArrowRight");
  await expect(desk).not.toHaveAttribute("transform", before ?? "");
  await editor.getByRole("button", { name: /Rotate 90/ }).click();
  await expect(desk).toHaveAttribute("transform", /rotate\(90\)/);
  await waitForStoredPlan(page, (plan) => plan.furniture.some((item) =>
    item.label === "Draft desk" && item.width === 120 && item.depth === 70 && item.rotation === 90,
  ));
  await page.reload();
  await expect(desk).toBeVisible();
  await expect(desk).toHaveAttribute("transform", /rotate\(90\)/);
});

test("keeps invalid dimension drafts recoverable", async ({ page }) => {
  const apartment = apartmentSection(page);
  const apartmentWidth = apartment.getByLabel("Width (cm)", { exact: true });
  await apartmentWidth.fill("");
  await page.getByRole("heading", { name: "Floor plan", exact: true }).click();
  await expect(apartment.getByRole("alert")).toContainText("Enter a value from");
  await apartmentWidth.press("Escape");
  await expect(apartmentWidth).toHaveValue("500");
  await expect(apartment.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "+ Add furniture" }).click();
  const editor = furnitureEditor(page);
  const furnitureWidth = editor.getByLabel("Width (cm)", { exact: true });
  const savedWidth = await furnitureWidth.inputValue();
  await furnitureWidth.fill("");
  await page.getByRole("heading", { name: "Floor plan", exact: true }).click();
  await expect(editor.getByRole("alert")).toHaveText("Enter a value from 10 to 1000 cm.");
  await furnitureWidth.press("Escape");
  await expect(furnitureWidth).toHaveValue(savedWidth);
  await expect(editor.getByRole("alert")).toHaveCount(0);
});

test("opens complete local geometry, autosaves it, and exports an exact roundtrip", async ({ page }) => {
  const writes: string[] = [];
  const leakedRequests: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
    if (
      request.postData()?.includes("SYNTHETIC WORK ZONE") ||
      decodeURIComponent(request.url()).includes("SYNTHETIC WORK ZONE")
    ) {
      leakedRequests.push(request.url());
    }
  });
  const imported = await openSyntheticPlan(page);
  const canvas = page.getByTestId("planner-canvas");
  await expect(canvas.getByText("SYNTHETIC WORK ZONE", { exact: true })).toBeVisible();
  await expect(canvas.getByText("SYNTHETIC EXTERIOR", { exact: true })).toBeVisible();
  await expect(canvas.locator('rect[x="40"][y="45"][width="100"][height="80"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Synthetic table.*placement conflict/ })).toBeVisible();
  await expect(furnitureEditor(page).getByRole("status")).toContainText("This item overlaps a fixed area");
  await page.reload();
  await expect(canvas.getByText("SYNTHETIC EXTERIOR", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Synthetic table.*placement conflict/ })).toBeVisible();
  expect(await storedPlan(page)).toEqual(imported.plan);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export plan" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^own-space-plan-\d{4}-\d{2}-\d{2}\.json$/);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  expect(JSON.parse(await readFile(downloadPath as string, "utf8"))).toEqual(imported);
  expect(writes).toEqual([]);
  expect(leakedRequests).toEqual([]);
});

test("uses imported blocked zones for placement warnings", async ({ page }) => {
  await openSyntheticPlan(page);
  const table = page.getByRole("button", { name: /Synthetic table, 60 by 40 centimetres/ });
  await expect(table).toHaveAttribute("aria-label", /placement conflict/);
  await table.focus();
  await table.press("Shift+ArrowDown");
  await table.press("Shift+ArrowDown");
  await expect(table).not.toHaveAttribute("aria-label", /placement conflict/);
  await expect(furnitureEditor(page).getByRole("status")).toHaveCount(0);
  await waitForStoredPlan(page, (plan) => plan.furniture[0]?.y === 185);
  await page.reload();
  await expect(table).not.toHaveAttribute("aria-label", /placement conflict/);
  await expect(page.getByTestId("planner-canvas").getByText("SYNTHETIC WORK ZONE")).toBeVisible();
});

test("preserves imported boundary conflicts exactly through reload and export", async ({ page }) => {
  const file = syntheticPlanFile();
  const item = file.plan.furniture[0];
  if (!item) throw new Error("Synthetic fixture furniture is missing.");
  item.x = -20;
  item.y = 300;
  await openSyntheticPlan(page, file);
  const table = page.getByRole("button", { name: /Synthetic table.*placement conflict/ });
  await expect(table).toHaveAttribute("transform", "translate(-20 300) rotate(0)");
  expect(await storedPlan(page)).toEqual(file.plan);
  await page.reload();
  await expect(table).toHaveAttribute("transform", "translate(-20 300) rotate(0)");
  expect(await storedPlan(page)).toEqual(file.plan);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export plan" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  expect(JSON.parse(await readFile(downloadPath as string, "utf8"))).toEqual(file);
});

test("rejects malformed geometry without changing the current plan", async ({ page }) => {
  const current = await openSyntheticPlan(page);
  const invalid = syntheticPlanFile();
  invalid.plan.layout.shapes[0] = {
    type: "text", style: "label", x: 30, y: 30, text: "Invalid rotation", rotate: Number.NaN,
  };
  await selectPlanFile(page, invalid);
  await expect(page.getByRole("alert")).toContainText("Invalid plan file");
  expect(await storedPlan(page)).toEqual(current.plan);
  await expect(page.getByTestId("planner-canvas").getByText("SYNTHETIC WORK ZONE")).toBeVisible();
});

test("cancelling open and new blank preserves the active plan", async ({ page }) => {
  const current = await openSyntheticPlan(page);
  const replacement = syntheticPlanFile();
  replacement.plan.layout.shapes = [];
  replacement.plan.furniture = [];
  const importDialogPromise = page.waitForEvent("dialog");
  await selectPlanFile(page, replacement);
  const importDialog = await importDialogPromise;
  expect(importDialog.message()).toContain("Replace the current plan");
  await importDialog.dismiss();
  expect(await storedPlan(page)).toEqual(current.plan);
  page.once("dialog", async (dialog) => {
    expect(dialog.message().toLowerCase()).toContain("new blank");
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "New blank plan" }).click();
  expect(await storedPlan(page)).toEqual(current.plan);
  await expect(page.getByRole("button", { name: /Synthetic table, 60 by 40 centimetres/ })).toBeVisible();
});

test("new blank retains a durable recovery copy of the previous complete plan", async ({ page }) => {
  const imported = await openSyntheticPlan(page);
  page.once("dialog", async (dialog) => {
    expect(dialog.message().toLowerCase()).toContain("new blank");
    expect(dialog.message().toLowerCase()).toContain("recovery copy");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "New blank plan" }).click();
  await expect(page.locator("[data-item-id]")).toHaveCount(0);
  await expect(page.getByTestId("planner-canvas").getByText("SYNTHETIC WORK ZONE")).toHaveCount(0);
  await waitForStoredPlan(page, (plan) => plan.furniture.length === 0 && plan.layout.shapes.length === 0);
  expect(await storedPlan(page, PREVIOUS_PLAN_KEY)).toEqual(imported.plan);
  await page.reload();
  await expect(page.locator("[data-item-id]")).toHaveCount(0);
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restore previous plan" }).click();
  await expect(page.getByTestId("planner-canvas").getByText("SYNTHETIC WORK ZONE")).toBeVisible();
  await waitForStoredPlan(page, (plan) => plan.furniture[0]?.id === "synthetic-table");
  expect(await storedPlan(page)).toEqual(imported.plan);
});

test("refuses to replace a plan when its recovery copy cannot be saved", async ({ page }) => {
  const imported = await openSyntheticPlan(page);
  await page.evaluate((recoveryKey) => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === recoveryKey) {
        throw new DOMException("Synthetic storage quota failure", "QuotaExceededError");
      }
      originalSetItem.call(this, key, value);
    };
  }, PREVIOUS_PLAN_KEY);
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "New blank plan" }).click();
  await expect(page.getByRole("alert")).toContainText(/export/i);
  expect(await storedPlan(page)).toEqual(imported.plan);
  await expect(page.getByTestId("planner-canvas").getByText("SYNTHETIC WORK ZONE")).toBeVisible();
});

test("keeps older furniture available until its complete layout is opened", async ({ page }) => {
  const furniture = [
    { id: "synthetic-recovered-shelf", label: "Recovered shelf", x: 300, y: 300,
      width: 90, depth: 30, rotation: 0, color: "#445566" },
  ];
  await page.evaluate(({ currentKey, legacyKey, items }) => {
    localStorage.removeItem(currentKey);
    localStorage.setItem(legacyKey, JSON.stringify(items));
  }, { currentKey: STORAGE_KEY, legacyKey: LEGACY_FURNITURE_KEY, items: furniture });
  await page.reload();
  await expect(page.locator("[data-item-id]")).toHaveCount(0);
  const imported = await openSyntheticPlan(page);
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restore older furniture" }).click();
  await expect(page.getByRole("button", { name: /Recovered shelf, 90 by 30 centimetres/ })).toBeVisible();
  await waitForStoredPlan(page, (plan) => plan.furniture.some((item) => item.id === furniture[0]?.id));
  expect((await storedPlan(page))?.layout).toEqual(imported.plan.layout);
  expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY_FURNITURE_KEY))
    .toBe(JSON.stringify(furniture));
});

test("opens an older furniture file only after a complete floor layout is available", async ({ page }) => {
  const olderFile = {
    format: "own-space-planner",
    version: 1,
    plan: {
      // This identifier belongs to the old file schema; all measurements here are synthetic.
      apartment: {
        templateId: "starter-studio-v1",
        widthCm: 650,
        lengthCm: 800,
        knownAreaSqm: 52,
      },
      furniture: [
        {
          id: "synthetic-older-cabinet",
          label: "Older cabinet",
          x: 300,
          y: 300,
          width: 90,
          depth: 40,
          rotation: 90,
          color: "#556677",
        },
      ],
    },
  };
  await selectPlanFile(page, olderFile);
  await expect(page.getByRole("alert")).toContainText("no floor layout");
  await expect(page.locator("[data-item-id]")).toHaveCount(0);
  await expect(apartmentSection(page).getByLabel("Width (cm)", { exact: true }))
    .toHaveValue("500");

  const complete = await openSyntheticPlan(page);
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Keep the open layout");
    await dialog.accept();
  });
  await selectPlanFile(page, olderFile);
  await expect(page.getByRole("button", { name: /Older cabinet, 90 by 40 centimetres/ }))
    .toBeVisible();
  await waitForStoredPlan(page, (plan) => plan.furniture[0]?.id === "synthetic-older-cabinet");
  expect((await storedPlan(page))?.layout).toEqual(complete.plan.layout);
  expect((await storedPlan(page))?.apartment).toEqual({
    widthCm: 650,
    lengthCm: 800,
    knownAreaSqm: 52,
  });
  expect(await storedPlan(page, PREVIOUS_PLAN_KEY)).toEqual(complete.plan);
  await page.reload();
  await expect(page.getByRole("button", { name: /Older cabinet, 90 by 40 centimetres/ }))
    .toBeVisible();
  await expect(page.getByTestId("planner-canvas").getByText("SYNTHETIC WORK ZONE"))
    .toBeVisible();
});

test("supports pointer dragging on the centimetre model", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add furniture" }).click();
  const item = page.locator("[data-item-id]");
  const before = await item.getAttribute("transform");
  const box = await item.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 35, { steps: 6 });
  await page.mouse.up();
  await expect(item).not.toHaveAttribute("transform", before ?? "");
});

test("keeps local plan actions and furniture editing usable on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  for (const name of ["+ Add furniture", "Export plan", "Import plan", "New blank plan", "Choose starter plan"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByTestId("planner-canvas")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "+ Add furniture" }).click();
  await page.getByRole("heading", { name: "Edit selected item" }).scrollIntoViewIfNeeded();
  await expect(furnitureEditor(page).getByLabel("Label", { exact: true })).toBeVisible();
});

for (const starter of STARTER_PLANS) {
  test(`chooses and resumes the ${starter.name} starter plan`, async ({ page }) => {
    const expected = createStarterPlan(starter.id);
    await chooseStarter(page, starter);
    const apartment = apartmentSection(page);
    await expect(apartment.getByLabel("Width (cm)", { exact: true }))
      .toHaveValue(String(starter.widthCm));
    await expect(apartment.getByLabel("Length (cm)", { exact: true }))
      .toHaveValue(String(starter.lengthCm));
    await expect(apartment.getByLabel("Known area (m²)", { exact: true }))
      .toHaveValue(String(starter.areaSqm));
    await expect(page.getByTestId("planner-canvas").locator(".layout-layer > *"))
      .toHaveCount(expected.layout.shapes.length);
    await expect(page.locator("[data-item-id]")).toHaveCount(0);
    await waitForStoredPlan(page, (plan) =>
      plan.apartment.widthCm === expected.apartment.widthCm &&
      plan.layout.shapes.length === expected.layout.shapes.length,
    );
    expect(await storedPlan(page)).toEqual(expected);
    await page.reload();
    expect(await storedPlan(page)).toEqual(expected);
    await expect(page.getByTestId("planner-canvas").locator(".layout-layer > *"))
      .toHaveCount(expected.layout.shapes.length);
    await expect(page.getByTestId("planner-canvas").locator(".layout-layer > text"))
      .toHaveText(expected.layout.shapes.filter((shape) => shape.type === "text")
        .map((shape) => shape.text));
  });
}

test("offers six starter choices and cancellation preserves the plan and focus", async ({ page }) => {
  const imported = await openSyntheticPlan(page);
  const chooseButton = page.getByRole("button", { name: "Choose starter plan", exact: true });
  await chooseButton.click();
  const picker = starterPicker(page);
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("button", { name: /^Use / })).toHaveCount(6);
  for (const starter of STARTER_PLANS) {
    await expect(picker.getByRole("button", { name: "Use " + starter.name, exact: true }))
      .toBeVisible();
  }
  const starter = structuredStarter();
  const useButton = picker.getByRole("button", { name: "Use " + starter.name, exact: true });
  page.once("dialog", async (dialog) => dialog.dismiss());
  await useButton.click();
  await expect(picker).toBeVisible();
  await expect(useButton).toBeFocused();
  expect(await storedPlan(page)).toEqual(imported.plan);
  expect(await storedPlan(page, PREVIOUS_PLAN_KEY)).toBeNull();
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(chooseButton).toBeFocused();
  expect(await storedPlan(page)).toEqual(imported.plan);
  await chooseButton.click();
  await picker.getByRole("button", { name: "Close starter plans", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(chooseButton).toBeFocused();
  expect(await storedPlan(page)).toEqual(imported.plan);
});

test("choosing a starter retains the private imported layout for recovery", async ({ page }) => {
  const imported = await openSyntheticPlan(page);
  const starter = structuredStarter();
  const expected = createStarterPlan(starter.id);
  await chooseStarter(page, starter);
  await waitForStoredPlan(page, (plan) => plan.layout.shapes.length === expected.layout.shapes.length);
  expect(await storedPlan(page)).toEqual(expected);
  expect(await storedPlan(page, PREVIOUS_PLAN_KEY)).toEqual(imported.plan);
  await expect(page.getByTestId("planner-canvas").getByText("SYNTHETIC WORK ZONE"))
    .toHaveCount(0);
  await page.reload();
  expect(await storedPlan(page, PREVIOUS_PLAN_KEY)).toEqual(imported.plan);
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restore previous plan", exact: true }).click();
  await expect(page.getByTestId("planner-canvas").getByText("SYNTHETIC WORK ZONE"))
    .toBeVisible();
  await waitForStoredPlan(page, (plan) => plan.furniture[0]?.id === "synthetic-table");
  expect(await storedPlan(page)).toEqual(imported.plan);
});

test("refuses a starter choice when the private plan cannot be backed up", async ({ page }) => {
  const imported = await openSyntheticPlan(page);
  await page.evaluate((recoveryKey) => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === recoveryKey) {
        throw new DOMException("Synthetic storage quota failure", "QuotaExceededError");
      }
      originalSetItem.call(this, key, value);
    };
  }, PREVIOUS_PLAN_KEY);
  await chooseStarter(page, structuredStarter());
  await expect(page.getByRole("alert")).toContainText(/export/i);
  expect(await storedPlan(page)).toEqual(imported.plan);
  await expect(page.getByTestId("planner-canvas").getByText("SYNTHETIC WORK ZONE"))
    .toBeVisible();
});

test("keeps the starter picker usable on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: "Choose starter plan", exact: true }).click();
  const picker = starterPicker(page);
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("button", { name: /^Use / })).toHaveCount(6);
  expect(await picker.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const lastChoice = picker.getByRole("button", { name: /^Use / }).last();
  await lastChoice.scrollIntoViewIfNeeded();
  await expect(lastChoice).toBeInViewport();
  await picker.getByRole("button", { name: "Close starter plans", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(page.getByRole("button", { name: "Choose starter plan", exact: true }))
    .toBeFocused();
});
