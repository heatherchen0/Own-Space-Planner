# Own Space Planner

Own Space Planner is a local-first 2D tool for arranging accurately sized
furniture inside a floor plan. Coordinates and dimensions use centimetres,
with a calibrated SVG grid.

The app initially starts with an empty **500 × 600 cm rectangle (30 m²)** and
resumes your browser autosave on later visits. Choose a generic starter layout,
keep the space empty, or import a private plan file. Personal layouts are not
bundled with the app.

## Run locally

Install [Node.js](https://nodejs.org/) 22.12 or newer, then run:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. On Windows PowerShell, use `npm.cmd`
instead of `npm` if script execution is restricted.

To build and preview locally:

```sh
npm run build
npm run preview
```

No account, backend, or database is required.

## Choose a starter plan

Use **Choose starter plan** to preview an empty space or five
Helsinki-inspired apartment types:

| Starter | Finnish notation | Example shell area |
| --- | --- | ---: |
| Empty space | — | 30 m² |
| Open-kitchen studio | 1h+kt | 28 m² |
| Separate-kitchen studio | 1h+k | 36 m² |
| One-bedroom with open kitchen | 2h+kt | 45 m² |
| One-bedroom with separate kitchen | 2h+k | 54 m² |
| Two-bedroom family apartment | 3h+kt | 70 m² |

These are original schematic drawings with illustrative dimensions. They
represent apartment types found in Helsinki, rather than measured plans of
specific homes. `h` counts living rooms and bedrooms, `k` means a separate
kitchen, and `kt` means cooking space, shown open in these examples.

The selection is informed by [Heka's apartment types](https://www.hekaoy.fi/kohde/kauppakartanonkatu-10/)
and the [City of Helsinki's Koskelanpiha apartment types](https://asuntotuotanto.hel.fi/fi/asuntohaku/hitas/asunto-oy-helsingin-koskelanpiha-kunnalliskodintie-9).
See also the [City's housing terminology](https://www.hel.fi/en/housing/housing-in-helsinki-tips-for-newcomers).
These sources establish the categories; the sample dimensions and geometry
are our own examples, not averages or copied apartment drawings.

Every starter begins without furniture. Walls, bathroom fixtures, kitchen cabinets,
and door-clearance zones are fixed; arrange your own furniture around them.
Choosing a starter asks for confirmation and preserves the current non-empty
plan in the same recovery slot used by import and **New blank plan**.

## Import and save a personal plan

1. Choose **Import plan** and select your private JSON plan file.
2. Arrange furniture. The app automatically saves the complete active plan
   in this browser, including the imported floor layout.
3. Choose **Export plan** to make a portable backup or move to another device.

Files are read in the browser; the app does not upload them. Keep personal
files outside the repository, build output, and any publicly served directory.
The local `.private/` folder is ignored by Git and denied by the development
server as an additional safeguard. An ignore rule alone does not protect a
file that is imported into application code or copied into a deployment.

Browser autosave is specific to the browser profile and site origin (including
the port). It is not encrypted storage or a cross-device backup. Clearing
browser data can erase it; anyone using that browser profile can open it.
Keep a separate private exported file.

**New blank plan** starts a fresh empty space. Before replacing a non-empty
plan, the app keeps one complete recovery copy in browser storage. Choose
**Restore previous plan** to reopen that copy. Importing another file or choosing
a starter also keeps a recovery copy. This is one recovery slot, not a history
of every plan; export files to retain multiple layouts. Replacement is blocked if the
recovery copy cannot be saved.

## Older saves and exports

Version 2 plan files contain the floor drawing and placement zones as well as
apartment settings and furniture. Version 1 files and old browser saves
contain no full floor layout, so they cannot reconstruct it independently.

To recover an older plan:

1. Import a complete version 2 plan containing the correct floor layout.
2. If this browser has an older save, choose **Restore older furniture**.
   Alternatively, import your older exported file and confirm keeping the
   currently open layout while restoring the old measurements and furniture.
3. Export a new complete plan file for your backup.

Old browser storage entries are retained. **Download older save** provides
an unchanged backup of the older data. The app does not silently substitute
an unrelated floor layout when restoring an old save.

## Editing

- Resize the outer rectangle using apartment width and length in centimetres.
- Set the known area independently; inferred area is width × length ÷ 10,000.
- Add, rename, resize, rotate, move, and delete furniture.
- Drag on a 5 cm snap grid, or use arrow keys (Shift for larger steps).
- Placement warnings identify overlaps with furniture, imported blocked zones,
  or the outer boundary.

Fixed structures retain their saved centimetre coordinates when the
outer rectangle is resized. The current editor changes the shell and furniture;
editing walls or fixtures directly is not yet supported. All imported drawing
shapes, labels, and blocked zones are retained in subsequent exports.

## Privacy when publishing

Publish only the generic app and synthetic examples. Do not add personal files
to `src/`, `public/`, screenshots, documentation, tests, or deployment archives.
A hidden button, secret URL, or frontend password cannot protect layout data
that is shipped in the public JavaScript bundle.

Removing a layout from the current source does not remove it from older Git
commits, releases, deployments, forks, or downloaded copies. Review those
separately before publishing; history cleanup is not performed by this app.

## Verification

```sh
npm run test
npm run build
npm run test:e2e
```

The browser suite uses Microsoft Edge. Its layout fixtures are synthetic and
independent of any personal plan.

## Project map

- `src/apartment.ts`: generic defaults, bounds, and drawing extents.
- `src/starterPlans.ts`: original schematic starter layouts and metadata.
- `src/StarterPlanPicker.tsx`: accessible starter previews and selection.
- `src/types.ts`: complete plan and drawing data structures.
- `src/PlannerCanvas.tsx`: grid, imported drawing primitives, and furniture.
- `src/App.tsx`: editing, importing/exporting plans, and recovery controls.
- `src/planFile.ts`: strict versioned file validation and serialization.
- `src/storage.ts`: browser autosave, recovery copy, and older-save access.
- `e2e/planner.spec.ts`: browser interaction and persistence checks.
