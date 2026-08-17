# Own Space Planner

Own Space Planner is a small 2D tool for arranging accurately sized furniture
shapes inside an apartment outline. Geometry is stored in
centimetres and rendered on a calibrated SVG grid.

The included floor plan is a generic starter template. It has a known total
area of **33 m²** and an inferred rectangular shell of **420 × 750 cm**, or
**31.5 m²**. The known area is descriptive; the inferred area is calculated
from the editable shell dimensions.

The starter template contains no address or resident information.

## Current features

- A 2D grid with 10 cm, 50 cm, and 1 m intervals
- An adjustable apartment width, length, and known total area
- A live inferred-area calculation based on width × length
- A generic starter layout with bathroom, entry, storage, kitchen, balcony,
  and door-clearance landmarks
- Furniture shapes that can be added, selected, dragged on a 5 cm snap grid,
  renamed, resized, rotated in 90-degree steps, and deleted
- Placement warnings for furniture that overlaps another item, a fixed area,
  a door clearance, or the apartment boundary
- Keyboard movement, browser-local autosaving, and a reset action
- Export and import of the complete plan as a versioned JSON file

## Run locally

Install [Node.js](https://nodejs.org/) 22.12 or newer, clone the repository,
and run:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, normally
`http://localhost:5173`.

To build and preview the production bundle locally:

```sh
npm run build
npm run preview
```

On Windows PowerShell, use `npm.cmd` in place of `npm` if script execution is
restricted on the machine.

No account, server, or database is required. Anyone who clones the repository
can run their own independent copy with Node.js and npm.

## Using apartment settings

Edit the apartment width and length in centimetres to resize the outer shell.
The planner recalculates the inferred area as:

```text
width (cm) × length (cm) ÷ 10,000 = inferred area (m²)
```

The known total area is a separate editable value. It is not used to stretch
the plan, because reported area and clear inner-shell area can follow different
measurement conventions.

The default values are:

| Setting | Default |
| --- | ---: |
| Known total area | 33 m² |
| Shell width | 420 cm |
| Shell length | 750 cm |
| Inferred shell area | 31.5 m² |

Changing the shell dimensions preserves the centimetre-based model. Review
furniture and fixed-feature placements after making the shell smaller.

## Saving, exporting, and importing

The browser automatically saves the current apartment settings and furniture
in `localStorage`. Browser storage is specific to the browser
profile and site origin, so a plan saved on one computer is not automatically
available on another computer or in a different browser.

Use **Export plan** to download the complete plan as a versioned JSON file. Use
**Import plan** to load a compatible plan file and replace the plan currently
open in the editor. Plan files can move a layout between local installations
or serve as a portable backup.

Exported plan files contain the apartment dimensions, furniture positions,
dimensions, colors, and any labels entered by the user. Review those contents
before sharing a file publicly. The application does not upload plans by
itself.

## Verification

Run the unit tests:

```sh
npm run test
```

Run the browser interaction suite with Microsoft Edge installed:

```sh
npm run test:e2e
```

Run the production build check:

```sh
npm run build
```

## Project map

- `src/apartment.ts` defines the generic starter settings, plan geometry, and
  starter furniture.
- `src/types.ts` defines the apartment, furniture, and versioned plan-file
  data structures.
- `src/geometry.ts` contains snapping, rotation, bounds, and clamping helpers.
- `src/PlannerCanvas.tsx` renders the grid, plan landmarks, dimensions, and
  pointer interactions.
- `src/App.tsx` owns the plan state and editing controls.
- `src/planFile.ts` validates and serializes versioned plan files.
- `src/storage.ts` persists complete plans and migrates older local data.
- `e2e/planner.spec.ts` exercises the editor in a local browser.

## Accuracy

The default floor plan is a general starting point, not a survey or
construction drawing. Verify critical dimensions and clearances independently
before making purchasing, installation, plumbing, or built-in decisions.
