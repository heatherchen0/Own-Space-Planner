import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "own-space-planner:v2:plan";

type StoredPlan = {
  apartment: {
    templateId: string;
    widthCm: number;
    lengthCm: number;
    knownAreaSqm: number;
  };
  furniture: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    depth: number;
    rotation: number;
    color: string;
  }>;
};

async function waitForStoredPlan(
  page: Page,
  predicate: (plan: StoredPlan) => boolean,
) {
  await expect
    .poll(async () => {
      const plan = await page.evaluate((key) => {
        const source = window.localStorage.getItem(key);
        return source
          ? (JSON.parse(source) as { plan: StoredPlan }).plan
          : null;
      }, STORAGE_KEY);
      return plan ? predicate(plan) : false;
    })
    .toBe(true);
}

function apartmentSection(page: Page) {
  return page.locator(".apartment-section");
}

function furnitureEditor(page: Page) {
  return page.locator(".editor-section");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("renders a neutral starter plan with known and inferred totals", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "Own Space Planner" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Default floor plan" }),
  ).toBeVisible();
  await expect(page.getByText("165 cm · default", { exact: true })).toBeVisible();
  await expect(page.getByText("420 cm", { exact: true })).toBeVisible();
  await expect(page.getByText("750 cm", { exact: true })).toBeVisible();
  await expect(
    apartmentSection(page).getByText("Known total 33 m²", { exact: true }),
  ).toBeVisible();
  await expect(
    apartmentSection(page).getByText("Inferred total 31.5 m²", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Apartment draft", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("planner-canvas")).toBeVisible();

  const gridWidths = await page
    .locator("#grid-10, #grid-50, #grid-100")
    .evaluateAll((patterns) =>
      patterns.map((pattern) => pattern.getAttribute("width")),
    );
  expect(gridWidths).toEqual(["10", "50", "100"]);
  await expect(page.getByText("Saved locally in this browser")).toBeVisible();
  await page.screenshot({
    path: "test-results/planner-overview.png",
    fullPage: true,
  });
});

test("adjusts apartment size and known area, then restores them", async ({
  page,
}) => {
  const apartment = apartmentSection(page);
  const widthInput = apartment.getByLabel("Width (cm)", { exact: true });
  const lengthInput = apartment.getByLabel("Length (cm)", { exact: true });
  const knownAreaInput = apartment.getByLabel("Known area (m²)", {
    exact: true,
  });

  await widthInput.fill("500");
  await widthInput.press("Enter");
  await lengthInput.fill("700");
  await lengthInput.press("Enter");
  await knownAreaInput.fill("40");
  await knownAreaInput.press("Enter");

  await expect(page.getByText("500 cm", { exact: true })).toBeVisible();
  await expect(page.getByText("700 cm", { exact: true })).toBeVisible();
  await expect(
    apartment.getByText("Known total 40 m²", { exact: true }),
  ).toBeVisible();
  await expect(
    apartment.getByText("Inferred total 35 m²", { exact: true }),
  ).toBeVisible();

  await waitForStoredPlan(
    page,
    (plan) =>
      plan.apartment.widthCm === 500 &&
      plan.apartment.lengthCm === 700 &&
      plan.apartment.knownAreaSqm === 40,
  );
  await page.reload();

  await expect(widthInput).toHaveValue("500");
  await expect(lengthInput).toHaveValue("700");
  await expect(knownAreaInput).toHaveValue("40");
  await expect(
    apartment.getByText("Inferred total 35 m²", { exact: true }),
  ).toBeVisible();
});

test("adds, edits, moves, rotates, and restores furniture", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add furniture" }).click();

  const editor = furnitureEditor(page);
  const labelInput = editor.getByLabel("Label", { exact: true });
  await labelInput.fill("Desk");

  const widthInput = editor.getByLabel("Width (cm)", { exact: true });
  await widthInput.fill("120");
  await widthInput.press("Enter");

  const depthInput = editor.getByLabel("Depth (cm)", { exact: true });
  await depthInput.fill("70");
  await depthInput.press("Enter");

  const desk = page.locator('[data-item-id^="furniture-"]');
  await expect(desk).toHaveCount(1);
  await desk.focus();
  const transformBeforeMove = await desk.getAttribute("transform");
  await desk.press("ArrowRight");
  const transformAfterMove = await desk.getAttribute("transform");
  expect(transformAfterMove).not.toBe(transformBeforeMove);

  await editor.getByRole("button", { name: "Rotate 90° R" }).click();
  await expect(editor.getByText("90°", { exact: true })).toBeVisible();
  await expect(desk).toHaveAttribute("transform", /rotate\(90\)/);

  await waitForStoredPlan(
    page,
    (plan) =>
      plan.furniture.some(
        (item) =>
          item.label === "Desk" &&
          item.width === 120 &&
          item.depth === 70 &&
          item.rotation === 90,
      ),
  );
  await page.reload();

  const restoredDesk = page.getByRole("button", {
    name: /Desk, 120 by 70 centimetres/,
  });
  await expect(restoredDesk).toBeVisible();
  await expect(restoredDesk).toHaveAttribute("transform", /rotate\(90\)/);
});

test("keeps invalid dimensions and placements visibly recoverable", async ({
  page,
}) => {
  const apartment = apartmentSection(page);
  const apartmentWidth = apartment.getByLabel("Width (cm)", { exact: true });
  await apartmentWidth.fill("");
  await page.getByRole("heading", { name: "Default floor plan" }).click();
  await expect(apartment.getByRole("alert")).toHaveText(
    "Enter a value from 380 to 3000 cm.",
  );

  const editor = furnitureEditor(page);
  const furnitureWidth = editor.getByLabel("Width (cm)", { exact: true });
  await furnitureWidth.fill("");
  await page.getByRole("heading", { name: "Default floor plan" }).click();
  await expect(editor.getByRole("alert")).toHaveText(
    "Enter a value from 10 to 1000 cm.",
  );
  await furnitureWidth.press("Escape");
  await expect(furnitureWidth).toHaveValue("140");
  await expect(editor.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Bed, 140 by 200 centimetres/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "+ Add furniture" }).click();
  const newItem = page.locator('[data-item-id^="furniture-"]');
  await newItem.focus();
  for (let step = 0; step < 18; step += 1) {
    await newItem.press("ArrowUp");
  }

  await expect(newItem).toHaveAttribute("aria-label", /placement conflict/);
  await expect(
    page.getByText("This item overlaps a fixed area", { exact: false }),
  ).toBeVisible();
});

test("exports the complete versioned plan", async ({ page }) => {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export plan" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^own-space-plan-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const exported = JSON.parse(
    await readFile(downloadPath as string, "utf8"),
  ) as {
    format: string;
    version: number;
    plan: StoredPlan;
  };

  expect(exported.format).toBe("own-space-planner");
  expect(exported.version).toBe(1);
  expect(exported.plan.apartment).toEqual({
    templateId: "starter-studio-v1",
    widthCm: 420,
    lengthCm: 750,
    knownAreaSqm: 33,
  });
  expect(exported.plan.furniture).toHaveLength(3);
  expect(exported.plan.furniture[0]).toEqual(
    expect.objectContaining({
      id: "starter-bed",
      label: "Bed",
      width: 140,
      depth: 200,
    }),
  );
  await expect(page.getByRole("status")).toHaveText(
    "Plan exported as a JSON file.",
  );
});

test("imports a complete plan and restores it after reload", async ({ page }) => {
  const importedFile = {
    format: "own-space-planner",
    version: 1,
    plan: {
      apartment: {
        templateId: "starter-studio-v1",
        widthCm: 500,
        lengthCm: 700,
        knownAreaSqm: 40,
      },
      furniture: [
        {
          id: "imported-desk",
          label: "Imported desk",
          x: 275,
          y: 420,
          width: 120,
          depth: 70,
          rotation: 90,
          color: "#336699",
        },
      ],
    },
  };

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe(
      "Replace the current plan with this imported plan?",
    );
    await dialog.accept();
  });
  await page.locator("#plan-import-input").setInputFiles({
    name: "imported-plan.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(importedFile)),
  });

  const apartment = apartmentSection(page);
  await expect(
    apartment.getByLabel("Width (cm)", { exact: true }),
  ).toHaveValue("500");
  await expect(
    apartment.getByLabel("Length (cm)", { exact: true }),
  ).toHaveValue("700");
  await expect(
    apartment.getByLabel("Known area (m²)", { exact: true }),
  ).toHaveValue("40");
  await expect(
    page.getByRole("button", {
      name: /Imported desk, 120 by 70 centimetres/,
    }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Plan imported.");

  await waitForStoredPlan(
    page,
    (plan) =>
      plan.apartment.widthCm === 500 &&
      plan.furniture.length === 1 &&
      plan.furniture[0]?.id === "imported-desk",
  );
  await page.reload();

  await expect(
    page.getByRole("button", {
      name: /Imported desk, 120 by 70 centimetres/,
    }),
  ).toBeVisible();
  await expect(page.locator("[data-item-id]")).toHaveCount(1);
  await expect(
    apartment.getByText("Inferred total 35 m²", { exact: true }),
  ).toBeVisible();
});

test("rejects an invalid import without changing the current plan", async ({
  page,
}) => {
  const invalidFile = {
    format: "own-space-planner",
    version: 1,
    plan: {
      apartment: {
        templateId: "starter-studio-v1",
        widthCm: 100,
        lengthCm: 700,
        knownAreaSqm: 40,
      },
      furniture: [],
    },
  };

  await page.locator("#plan-import-input").setInputFiles({
    name: "invalid-plan.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalidFile)),
  });

  await expect(page.getByRole("alert")).toContainText(
    "Invalid plan file: plan.apartment.widthCm must be between 380 and 3000.",
  );
  await expect(
    apartmentSection(page).getByLabel("Width (cm)", { exact: true }),
  ).toHaveValue("420");
  await expect(page.locator("[data-item-id]")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: /Bed, 140 by 200 centimetres/ }),
  ).toBeVisible();
});

test("reset restores the complete starter plan", async ({ page }) => {
  const apartment = apartmentSection(page);
  const widthInput = apartment.getByLabel("Width (cm)", { exact: true });
  await widthInput.fill("500");
  await widthInput.press("Enter");
  await page.getByRole("button", { name: "+ Add furniture" }).click();
  await furnitureEditor(page).getByLabel("Label", { exact: true }).fill("Desk");

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Reset the apartment settings");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Reset starter plan" }).click();

  await expect(widthInput).toHaveValue("420");
  await expect(
    apartment.getByLabel("Length (cm)", { exact: true }),
  ).toHaveValue("750");
  await expect(
    apartment.getByLabel("Known area (m²)", { exact: true }),
  ).toHaveValue("33");
  await expect(page.locator("[data-item-id]")).toHaveCount(3);
  await expect(page.getByText("Desk", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Starter plan restored.");

  await waitForStoredPlan(
    page,
    (plan) =>
      plan.apartment.widthCm === 420 &&
      plan.apartment.lengthCm === 750 &&
      plan.apartment.knownAreaSqm === 33 &&
      plan.furniture.length === 3,
  );
  await page.reload();
  await expect(widthInput).toHaveValue("420");
  await expect(page.locator("[data-item-id]")).toHaveCount(3);
});

test("supports pointer dragging on the centimetre model", async ({ page }) => {
  const sofa = page.getByRole("button", {
    name: /Sofa, 185 by 85 centimetres/,
  });
  const before = await sofa.getAttribute("transform");
  const box = await sofa.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 80,
    box.y + box.height / 2 + 40,
    { steps: 6 },
  );
  await page.mouse.up();

  await expect(sofa).not.toHaveAttribute("transform", before ?? "");
});

test("keeps the planner usable at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  await expect(
    page.getByRole("button", { name: "+ Add furniture" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Export plan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import plan" })).toBeVisible();
  await expect(page.getByTestId("planner-canvas")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page
    .getByRole("heading", { name: "Edit selected item" })
    .scrollIntoViewIfNeeded();
  await expect(
    furnitureEditor(page).getByLabel("Label", { exact: true }),
  ).toBeVisible();
});
