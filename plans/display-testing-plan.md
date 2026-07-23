# `lib/display` Testing Plan

This is a planning document only. It proposes a complete testing strategy for
`lib/display` as a standalone canvas UI library, without changing source code.

---

## 1) Goals and constraints

### Goals

- Keep correctness confidence high while allowing internal refactors.
- Prioritise user-visible behaviour over implementation details.
- Cover all major interaction models (mouse, keyboard, focus/edit states).
- Catch visual regressions across themes (`WIN98_THEME`, `FLAT_THEME`).
- Keep feedback loops fast enough for day-to-day development.

### Constraints

- Rendering is canvas-based, so behaviour and visuals are tightly coupled.
- Text measurement and anti-aliasing vary by runtime/font/platform.
- Many APIs are stateful (`InteractableDisplay`), so deterministic test
  harnessing is required (time, viewport, fonts, focus setup).

### Non-goals

- Do not assert exact sequence of low-level canvas calls except in rare,
  contract-level smoke checks.
- Do not attempt pixel-identical cross-platform comparisons in all jobs.

---

## 2) Testing philosophy (important)

1. **Visual and behaviour together**: test what users see and what users can
   do (selection, focus movement, resolved layout, callbacks, bounds, visible
   state).
2. **Sufficient coverage over rigid ratios**: add whichever test type best
   protects each feature, without forcing a fixed pyramid split.
3. **Math/behaviour assertions first, screenshots where needed**: if a result
   can be robustly asserted through deterministic unit/integration checks
   (layout math, state transitions, callback outcomes), prefer that; use
   screenshot assertions when the meaningful outcome is visual and cannot be
   confidently covered by those checks alone.
4. **Implementation details last**: avoid brittle tests tied to draw-call order
   or private helper internals.

This keeps tests resilient to refactors while still catching real regressions.

---

## 3) Test portfolio for `lib/display`

`lib/display` is canvas-first UI code, so this plan intentionally leans into
visual regression tests while still keeping strong behavioural and logic
coverage.

### 3.1 Unit tests

Unit tests should cover deterministic logic and API contracts:

- layout/geometry math
- style fallback and precedence rules
- keyboard/mouse state transitions
- edit-buffer commit/revert behaviour
- selection and navigation invariants

These are fast and should run on every commit, but they are not the only
source of confidence for this library.

### 3.2 Integration tests

Integration tests should run real render+interaction flows in one process:

- `resolve -> layout -> draw` pipelines
- dropdown open/highlight/commit
- text/number edit flows and cursor movement
- occupied bounds and merged focusables

Integration assertions should still be behavioural and structural first.

### 3.3 Visual regression tests (primary confidence layer)

Visual tests verify rendered outputs for canonical states:

- base themes
- control states (focused/selected/disabled/pressed/editing)
- multi-control composition scenes

Use toleranced pixel diff and grow the baseline set by user-visible scenarios.
Prefer scenario-level snapshots over implementation-level micro snapshots.

### 3.4 Playwright e2e tests

Playwright validates browser/runtime reality:

- keyboard and mouse interaction semantics
- focus mode (`always` vs `click`)
- dropdown and editing UX behaviour
- screenshot baselines for key interaction flows

Chromium can be the baseline for strict screenshot gating; Firefox/WebKit can
still run behavioural assertions.

---

## 4) Tooling proposal

## Core

- `vitest` + `@vitest/coverage-v8` for unit/integration/visual test runners.
- `@playwright/test` for browser e2e.

### Canvas/image support

- Node-side rendering: `@napi-rs/canvas`.
- Pixel diffs: `pixelmatch` + `pngjs`.

### Optional helpers

- deterministic clock helper for blink-related tests.
- fixture builders for `DisplayLine`/input trees.

---

## 5) Test structure and naming

Proposed tree:

- `lib/display/__tests__/unit/*.test.ts`
- `lib/display/__tests__/integration/*.test.ts`
- `lib/display/__tests__/visual/*.visual.test.ts`
- `lib/display/__tests__/fixtures/*`
- `lib/display/__tests__/helpers/*`
- `tests/e2e/display/*.spec.ts`
- `tests/e2e/display/snapshots/*`

Naming conventions:

- `*.test.ts` for unit/integration
- `*.visual.test.ts` for snapshot-based image tests
- `*.spec.ts` for Playwright

---

## 6) Determinism and anti-flake rules

These are mandatory for stable canvas tests.

1. Pin viewport size and `deviceScaleFactor` in Playwright.
2. Pin or bundle a deterministic test font; avoid system fallback drift.
3. Control time for cursor blink (`Date.now()` mocking where needed).
4. Seed any random fixture generation.
5. Keep pixel thresholds explicit per suite.
6. Store baselines from one canonical environment for visual checks.
7. Separate behavioural CI failures from visual-only failures.

---

## 7) Coverage matrix (what to test)

## 7.1 Pure/mostly pure modules (unit-heavy)

- `lib/display/spacing.ts`
  - spacing resolution defaults
  - tuple normalization edge cases
- `lib/display/bounding-rect.ts`
  - `pointInRect`, `rectsEqual`, `unionRect`, `expandRect`
- `lib/display/state-style.ts`
  - layered style resolution precedence
- `lib/display/text-style.ts`
  - `TextFormat` bitmask usage contracts

## 7.2 `Display` (`lib/display/display.ts`)

- style inheritance/override behaviour
- `invert`, `invertFormat`, `fontSizeDelta` application
- uppercase/lowercase precedence
- hidden segment behaviour
- line resolution metrics (`width`, `maxFontSize`)
- block layout dimensions with padding

## 7.3 Input models (`lib/display/input/*`)

- option-level fallback semantics (radio/select)
- number bounds (`min`, exclusive `max`) semantics
- default field behaviour docs mirrored by tests

## 7.4 `InteractableDisplay` (largest investment)

Unit + integration behaviour suites:

- focusability and navigation
  - horizontal/vertical movement
  - skipping disabled elements
  - null-cursor stop handling
- interaction state machines
  - mouse press/release activation semantics
  - keyboard press/release semantics
- text/number edit lifecycle
  - enter editing
  - commit on blur/navigation
  - reject/revert paths
  - selection ranges (Shift+Arrow)
- select behaviour
  - open/close lifecycle
  - highlight movement
  - commit behaviour
  - disabled options not selectable
- layout and bounds
  - line resolution and focusable rect mapping
  - `getOccupiedBounds()` with open dropdown inclusion

## 7.5 Theme contracts (`flat-theme.ts`, `win98-theme.ts`, `chrome-theme.ts`)

Focus on contract-level and visual outcomes:

- `boxDimensionsFor` consistency
- focus/default marker style expectations
- representative visual outputs for controls in both themes

---

## 8) Visual baseline plan

Create a broad but curated baseline set of canonical scenes:

1. Plain text style composition scene.
2. Radio group: idle/focused/selected/disabled options.
3. Checkbox/button/select scene in both themes.
4. Textbox/number editing scene (caret visible, selection highlight).
5. Dropdown-open scene with highlighted/disabled rows.

Each scene should be generated by reusable fixture builders.

Suggested scene categories to expand over time:

1. Theme parity scenes (`WIN98_THEME` and `FLAT_THEME`) for the same content.
2. Control state matrices (idle/focused/selected/disabled/pressed/editing).
3. Mixed-line composition scenes with text + multiple input kinds.
4. Interaction snapshots (before/after keyboard or mouse actions).
5. Regression scenes added for every visual bug fixed.

Store expected PNGs under:

- `lib/display/__tests__/visual/snapshots/`

Include a per-scene threshold budget for `pixelmatch` and keep it documented
next to each snapshot suite.

---

## 9) Playwright scenario plan

Minimum high-value browser scenarios:

1. `click` focus mode: click in/out focus transitions.
2. Arrow navigation across mixed controls.
3. Enter/Space activation semantics for pressable elements.
4. Select dropdown keyboard navigation and commit.
5. Textbox edit, selection, commit/reject callback path.
6. Number input step and bound-clamp behaviour.

Use screenshot assertions where the flow has meaningful visual outcomes; use
behavioural assertions for flows where screenshots add little value.

---

## 10) CI strategy

Split jobs to isolate failures:

1. **Unit+integration job** (fast, required)
2. **Visual snapshot job** (required)
3. **Playwright behavioural job** (required)
4. **Playwright screenshot job** (required for selected suites)

Execution recommendations:

- run fast behavioural suites on every PR
- run visual suites on every PR where practical, with heavier suites nightly
- allow baseline updates only via explicit review process

---

## 11) Phased rollout plan

### Phase A: Foundation

- Add Vitest config and test folders.
- Add helpers: deterministic clock, fixture builders, canvas utilities.
- Land first unit suites for geometry/style/layout primitives.

### Phase B: Core behaviour

- Add `Display` unit tests.
- Add `InteractableDisplay` navigation/edit/select behavioural tests.
- Reach meaningful branch coverage on core state transitions.

### Phase C: Visual confidence layer

- Add canonical scene renderer.
- Generate an initial set of visual baselines, then expand by feature/state.
- Wire pixel diff suite with thresholds and CI reporting.

### Phase D: Browser realism

- Add Playwright interaction specs.
- Add minimal screenshot assertions for critical flows.
- Stabilise against CI flake.

### Phase E: Hardening

- Fill regression gaps from real bugs.
- Tune suite runtime and snapshot count.
- Finalise contribution rules and baseline update policy.

### Ongoing rule (after Phase E)

- When a visual bug is fixed, add or update a screenshot test in the same
  change where practical.

---

## 12) Acceptance criteria (definition of done)

The testing initiative is considered complete when:

- unit/integration/visual/e2e suites exist and are documented
- major behaviour areas in section 7 are covered
- visual baseline set is representative across themes, states, and
  interaction flows
- CI runs deterministic jobs with acceptable flake rate
- developers can add new display features with clear test guidance

---

## 13) Risks and mitigations

- **Risk:** visual snapshot churn from tiny render changes
  - **Mitigation:** keep baseline set small and scenario-focused.
- **Risk:** font/runtime differences causing false positives
  - **Mitigation:** fixed test font + canonical visual environment.
- **Risk:** over-testing internals
  - **Mitigation:** enforce behaviour-first review checklist.
- **Risk:** slow suite discourages usage
  - **Mitigation:** shard visual suites, keep fixtures reusable, and separate
    fast PR suites from heavier nightly suites.

---

## 14) Open questions to settle before implementation

1. Which CI environment is the canonical source for visual baselines?
2. Should visual snapshots run on every PR immediately, or only after
   initial stabilisation?
3. Is Chromium-only screenshot gating acceptable, with Firefox/WebKit
   behavioural-only checks?
4. Do we want strict coverage thresholds, or milestone-based target growth?

---

## 15) First sprint deliverables (recommended)

- Test harness bootstrap (`vitest` + helpers + folder structure).
- Initial unit suites covering geometry/style/display logic.
- Initial integration suites covering `InteractableDisplay` navigation/edit
  flows.
- Initial canonical visual scenes with baseline snapshots.
- Initial Playwright behavioural specs and screenshot-backed flows.

This delivers immediate confidence while keeping implementation effort bounded.

---

## Progress log

### 2026-07-23 - Unit-test phase (isolated package) completed

- Created an isolated package for `lib/display` with its own tooling:
  - `lib/display/package.json`
  - `lib/display/tsconfig.json`
  - `lib/display/vitest.config.ts`
  - `pnpm-workspace.yaml` (workspace registration for `lib/display`)
- Kept `vitest` local to `lib/display` (not in root `package.json`).
- Added initial deterministic unit suites under
  `lib/display/__tests__/unit/`:
  - `spacing.unit.test.ts`
  - `bounding-rect.unit.test.ts`
  - `state-style.unit.test.ts`
  - `style-builder.unit.test.ts`
  - `input-builder.unit.test.ts`
- Current unit-test coverage focus:
  - spacing normalization and shorthand helpers
  - rectangle geometry utilities
  - state-style resolution and invert semantics
  - fluent style-builder format/invert-format flag logic
  - input builders and line-builder normalization/chaining
- Verification status:
  - `pnpm --dir lib/display test` passes
  - `pnpm --dir lib/display typecheck` passes

Next planned step: start integration tests for deterministic behavioural flows
in `InteractableDisplay` (still avoiding screenshot tests until logic/math
assertions are exhausted for those behaviours).

### 2026-07-23 - Co-located `*.spec.ts` migration and unit expansion

- Switched unit test discovery to co-located spec files by updating
  `lib/display/vitest.config.ts` to `include: ["**/*.spec.ts"]`.
- Added a canvas test helper for deterministic contract tests:
  - `lib/display/test-helpers/mock-canvas.ts`
- Added co-located unit tests across nearly all runtime files in
  `lib/display`:
  - `lib/display/spacing.spec.ts`
  - `lib/display/bounding-rect.spec.ts`
  - `lib/display/state-style.spec.ts`
  - `lib/display/text-style.spec.ts`
  - `lib/display/colors.spec.ts`
  - `lib/display/copy-paste.spec.ts`
  - `lib/display/display.spec.ts`
  - `lib/display/chrome-theme.spec.ts`
  - `lib/display/flat-theme.spec.ts`
  - `lib/display/win98-theme.spec.ts`
  - `lib/display/interactable-display.spec.ts`
  - `lib/display/builders/style.spec.ts`
  - `lib/display/builders/input.spec.ts`
  - `lib/display/builders/index.spec.ts`
- Coverage approach used in this phase:
  - deterministic math/behaviour assertions first
  - lightweight canvas contract checks (no strict operation-order coupling)
  - no screenshot tests yet (deferred per plan rule)
- Verification status:
  - `pnpm --dir lib/display test` passes (`14` files, `41` tests)
  - `pnpm --dir lib/display typecheck` passes

Notes:

- Type-only declaration files under `lib/display/input/*` are not directly
  runtime-testable and are currently covered indirectly through builder and
  consumer-level tests. They will continue to be validated through TypeScript
  checks and higher-level behaviour tests.


### 2026-07-23 - Integration-test phase started (separate Vitest project)

- Split test runner configuration into separate projects/config files inside
  `lib/display`:
  - `lib/display/vitest.unit.config.ts`
  - `lib/display/vitest.integration.config.ts`
  - `lib/display/vitest.config.ts` now runs both projects.
- Added dedicated scripts in `lib/display/package.json`:
  - `test:unit`
  - `test:integration`
  - `test` (runs both)
- Added first integration suite under:
  - `lib/display/tests/integration/interactable-display.integration.spec.ts`
- Current integration coverage focus:
  - select dropdown keyboard flow (open, disabled-option skip, commit)
  - number input edit lifecycle (start + commit)
  - textbox `allowedChars` filtering and commit

- Added additional integration scenarios (builder-heavy):
  - mixed line built with `line()/checkbox()/numberBox()/button()`
    exercising disabled-skip navigation, number commit, and button activation
  - multi-row builder layout using `select()` + `textbox()` with style builders,
    including dropdown open/commit and occupied-bounds expansion checks
  - `focusMode: "click"` flow with builder-built controls (focus on inside click,
    blur on outside click)
