# Unit Testing Plan

_Last aligned with the codebase on 2026-07-25._

This plan adds a small set of stable unit tests for foundational application
logic. The tests should protect public behavior and important boundary cases
without mirroring implementation details.

---

## 1. Goals

The unit tests should:

- cover logic reused across the application;
- protect behavior where small mistakes have broad or visible effects;
- exercise public APIs rather than private implementation details;
- use parameterized cases when several inputs share one invariant;
- remain valid through ordinary refactoring;
- run in the existing Node-based Vitest project with `pnpm test`.

Assertions should describe properties and contracts. Generated values should
only be pinned to exact numbers when that number is itself part of the public
contract.

---

## 2. Core test files

### 2.1 `src/geometry/vector2d.spec.ts`

Test the vector operations used by movement, positioning, and camera logic.

Cases:

1. Parameterize over `COMPASS_DIRECTIONS` and verify every
   `Vector2d.fromDirection()` result has length approximately `1`.
2. Verify the canvas coordinate convention with representative cardinal
   directions:
   - north is `(0, -1)`;
   - east is `(1, 0)`.
3. Verify `add()` returns the component-wise sum.
4. Verify `subtract()` returns the component-wise difference.
5. Verify `scale()` multiplies both components, including a negative or zero
   factor.
6. Verify arithmetic operations return a new vector and leave both operands
   unchanged.

The direction-length test is the central invariant: diagonal movement must not
be faster than cardinal movement.

### 2.2 `src/camera/camera.spec.ts`

Test viewport positioning and rectangle culling at the boundaries.

Use a camera whose centre and dimensions make all four viewport edges easy to
calculate. Parameterize equivalent edge cases where practical.

Cases:

1. Verify `getViewX()` and `getViewY()` derive the top-left view coordinate from
   the centre and viewport size.
2. Verify a rectangle wholly inside the viewport is visible.
3. Verify rectangles partially overlapping the left, right, top, and bottom
   edges are visible.
4. Verify rectangles wholly outside each viewport edge are not visible.
5. Verify a rectangle that only touches an edge is not visible, matching the
   strict-overlap behavior of `isRectVisible()`.
6. Verify `pan()` changes the view origin and subsequent visibility checks.
7. Verify `setViewportSize()` changes the view origin and subsequent visibility
   checks.

The tests should assert externally visible camera behavior rather than testing
all accessors independently.

### 2.3 `src/store/cache.spec.ts`

Create a small test-only `Cache` subclass with an uncomplicated key encoder.
Use spies for compute callbacks.

Cases:

1. Verify a cache miss calls the compute callback once, passes it the original
   key, stores the result, and returns it.
2. Verify repeated access through the same encoded key returns the original
   value without recomputing it.
3. Parameterize over falsy cached values such as `undefined`, `false`, and `0`
   and verify each remains cached.
4. Verify `clear()` causes the next access to recompute the value.
5. Verify keys that encode differently are cached independently.

The falsy-value case protects the distinction between a missing entry and a
present entry whose value happens to be falsy.

### 2.4 `src/store/registry.spec.ts`

Create a small test-only `Registry` subclass whose values contain their own
string key.

Cases:

1. Verify a registered value can be retrieved by key.
2. Verify `get()` returns `undefined` for an unknown key.
3. Verify registering the same instance twice is a no-op and does not duplicate
   it in `getAll()`.
4. Verify registering a different instance under an existing key throws and
   retains the original value.
5. Verify `getAll()` returns all registered values.
6. Verify `clear()` removes all registered values.

The duplicate-key case is the main registry invariant. The test should check
both the error and the registry state after the failed registration.

---

## 3. Maybe tests

These tests are useful but can be deferred until the corresponding behavior
becomes costly to debug or receives more development.

### 3.1 `src/world/noise.spec.ts`

Test mathematical properties rather than exact terrain samples.

Possible cases:

1. Parameterize representative positive, zero, negative, and large world
   coordinates and verify identical arguments produce identical results.
2. Sample a representative coordinate table and verify `sampleNoise2d()` and
   `sampleFbm2d()` return finite values in their documented range.
3. Verify `sampleGradientNoise2d()` returns finite values in its documented
   approximate signed range.
4. Verify a table of samples contains variation when the seed or coordinate is
   changed, rather than requiring every individual pair to differ.
5. Include negative coordinates so world generation on either side of the
   origin exercises the same contract.

Do not pin complete fields or individual samples to golden values. The tests
should permit intentional changes to the noise algorithm while retaining its
public guarantees.

### 3.2 `src/world/coordinate-key.spec.ts`

Use one parameterized round-trip test:

```text
parseCoordinateKey(coordinateKey(x, y)) === [x, y]
```

Include:

- `(0, 0)`;
- positive coordinates;
- negative coordinates on either or both axes;
- large safe integers used as representative world coordinates.

Only integer coordinates are part of the documented contract.

### 3.3 `src/geometry/rect.spec.ts`

Add these tests if rectangle boundary semantics become important to interaction
or collision behavior.

Cases:

1. Verify points strictly inside a rectangle are included.
2. Parameterize points on all four edges and corners and verify they are
   included.
3. Parameterize points immediately beyond all four edges and verify they are
   excluded.
4. Verify `rectsEqual()` compares all four rectangle properties.

### 3.4 Movement direction resolution

The direction-combination rules are valuable, but
`MovementController.resolveDirection()` is private. If that logic is extracted
into a small pure function, add a parameterized truth-table test alongside the
new module.

Cases:

1. No pressed directions resolve to `undefined`.
2. Each single direction resolves to its matching cardinal direction.
3. Adjacent cardinal directions combine into the correct diagonal.
4. Opposite vertical directions cancel.
5. Opposite horizontal directions cancel.
6. When three directions are pressed, the opposing pair cancels and the
   remaining direction wins.
7. All four directions cancel to `undefined`.

The extraction should happen only when there is another reason to change this
area. Tests should consume the extracted public function rather than access a
private method.

---

## 4. Implementation order

1. Add `vector2d.spec.ts` and run the focused test file.
2. Add `camera.spec.ts` and run the focused test file.
3. Add `cache.spec.ts` and run the focused test file.
4. Add `registry.spec.ts` and run the focused test file.
5. Run the complete root unit-test project.
6. Run lint and the client build to catch type or style issues outside Vitest.
7. Add any tests from section 3 only when their adoption condition is met.

---

## 5. Verification

Run the focused tests while implementing:

```powershell
pnpm exec vitest run --config vitest.config.ts src/geometry/vector2d.spec.ts
pnpm exec vitest run --config vitest.config.ts src/camera/camera.spec.ts
pnpm exec vitest run --config vitest.config.ts src/store/cache.spec.ts
pnpm exec vitest run --config vitest.config.ts src/store/registry.spec.ts
```

Run the full verification after all four files are complete:

```powershell
pnpm test
pnpm run lint
pnpm run build:client
```

The core work is complete when all four spec files exist, every case in section
2 is represented without duplicate assertions, and the full verification
commands pass.

