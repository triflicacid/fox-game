# Developer Commands Plan

_Last aligned with the codebase on 2026-07-26._

This document plans an in-game developer command console. The first version
provides seed inspection, coordinate teleportation, feature lookup, and feature
teleportation without making commands depend on loaded chunks.

The first milestone is a tested command parser and modal console with `/seed`,
`/pos`, `/tp`, `/locate`, and `/help`.

---

## 1. Goals and constraints

Developer commands must be:

- **Predictable:** syntax, coordinate units, and errors are explicit.
- **Deterministic:** feature lookup returns the same result for the same seed,
  origin, selector, and search radius.
- **Bounded:** feature searches have a finite chunk radius and can be cancelled.
- **Non-blocking:** expensive lookup runs outside the main thread and does not
  delay normal chunk streaming.
- **Seed-safe:** a result from an old seed can never teleport the player after a
  seed change.
- **Extensible:** adding a command or feature selector does not add another
  conditional chain to the console controller.
- **Testable:** parsing and execution are independent of canvas rendering.

The console is a developer tool, not a chat system. The initial parser does not
need quoting, escaping, aliases, permissions, persistence, or command scripts.

---

## 2. Current architecture

### 2.1 Popup and input handling

`WorldController` owns the current popup controllers. While a popup is open it
pauses world updates, freezes the world image, and routes drawing to the popup.
`Popup` and `InteractableDisplay` already provide modal keyboard capture and a
single-line `TextInput`.

The console should use the same popup lifecycle. It must be registered in
`WorldController.popupControllers` and `keyBindingPopupControllers` so it
pauses the world and appears in help.

The current `TextInput.onChange` callback represents a committed edit. A command
line needs a distinct Enter action, automatic focus when opened, and history
navigation. Add the smallest reusable display API needed for those behaviors.
Do not execute a command when focus merely leaves the field.

### 2.2 Coordinates and teleportation

The game uses three coordinate units:

- world pixels;
- world tiles, where one tile is `World.tileSize` pixels;
- chunks, where one chunk is `CHUNK_SIZE` tiles on each edge.

`World.teleportMainEntityTo()` accepts the world-pixel point at which the main
entity should be centered. `World.tileToChunk()` already handles negative tile
coordinates correctly with `Math.floor`.

Command code must centralize conversions instead of duplicating `tileSize` and
`CHUNK_SIZE` arithmetic throughout command handlers.

### 2.3 Seeds

`World.getWorldSeed()` and `World.setWorldSeed()` already expose the active
seed. Setting a seed updates both generators but deliberately leaves loaded
chunks in memory. `/seed <value>` should preserve that behavior and report it
clearly. A separate `/reload` command may reload chunks when desired.

### 2.4 Feature data

Generated tiles retain `FeatureTag` values such as `lake:shallow`, `lake:deep`,
`oasis:shallow`, and `oasis:deep`. Lakes and oases are component features whose
acceptance depends on smoothing, size, core detection, and biome voting.

A field threshold alone is not enough to prove that a feature exists. Feature
lookup must inspect normal `ChunkGenerator` output so `/locate` agrees with the
world that will be rendered.

The normal `ChunkWorkerClient` is latency-sensitive because it streams visible
chunks. Locator work must not share its queue.

---

## 3. Command model

### 3.1 Parser

Add a small command module under `src/dev-commands/`:

- `command-parser.ts` converts a line into a command name and whitespace-split
  arguments;
- `command-registry.ts` owns command definitions and dispatch;
- `command-context.ts` exposes narrow callbacks needed by handlers;
- `command-result.ts` represents success, error, progress, and cancellation;
- focused unit tests cover parsing and handler behavior.

Normalize the command name and enum-like arguments to lowercase. Preserve
argument text for output. Reject empty input, missing `/`, unknown commands,
extra arguments, non-finite numbers, decimals where integers are required, and
values outside documented limits.

Each command definition owns its name, usage text, short help text, argument
validation, and executor. `/help` reads the registry rather than maintaining a
second command list.

Commands may return immediately or resolve asynchronously. The console owns the
presentation of results; handlers return data and do not draw UI themselves.

### 3.2 Initial syntax

| Command | Behavior |
| --- | --- |
| `/help` | List commands and one-line usage. |
| `/help <command>` | Show detailed usage for one command. |
| `/seed` | Print the active world seed. |
| `/seed <integer>` | Set the seed for future generation and warn that loaded chunks remain. |
| `/reload` | Drop loaded chunks and cancel their pending generation. |
| `/pos` | Print the main entity center in tile and chunk coordinates. |
| `/tp tile <x> <y>` | Teleport to the center of a world tile. |
| `/tp chunk <x> <y>` | Teleport to the center of a chunk. |
| `/locate <feature> [radius]` | Find the nearest matching feature within a chunk radius. |
| `/tp feature <feature> [radius]` | Locate a feature, then teleport to the returned tile. |
| `/cancel` | Cancel the active feature search. |

All coordinate and radius arguments are base-10 integers. Negative tile and
chunk coordinates are valid. Radius is measured in chunks and must be positive.

Initial feature selectors are `lake` and `oasis`. Selectors match both depth
tags for that feature. Keep selector metadata in one registry shared by
`/locate`, `/tp feature`, help, and the locator worker protocol.

### 3.3 Teleport semantics

`/tp tile x y` targets the pixel center of tile `(x, y)`:

`((x + 0.5) * tileSize, (y + 0.5) * tileSize)`

`/tp chunk x y` targets the center tile-space point of the chunk:

`((x * CHUNK_SIZE + CHUNK_SIZE / 2) * tileSize,
(y * CHUNK_SIZE + CHUNK_SIZE / 2) * tileSize)`

Before teleporting, stop the main entity so retained velocity does not move it
on the next tick. Center the camera on the same target so the destination is
visible immediately. Teleporting works when the destination chunk is unloaded;
normal world streaming requests it after the console closes.

`/tp feature` targets the center of the exact tile returned by the locator. It
is valid for that tile to be shallow or deep water because this is a developer
command.

`/pos` derives coordinates from the main entity's rendered center, not its
sprite's top-left position. Chunk coordinates come from `World.tileToChunk()`.

---

## 4. Feature locator

### 4.1 Dedicated worker

Add a dedicated feature-locator worker and client rather than extending the
normal chunk-generation queue:

- `feature-locator-protocol.ts` defines typed requests, progress, results,
  not-found responses, errors, and cancellation;
- `feature-locator-worker.ts` owns a `ChunkGenerator` built with
  `DEFAULT_FEATURE_PROVIDERS`;
- `feature-locator-client.ts` correlates responses by request ID and exposes a
  cancellable promise-like operation.

A request contains:

- request ID;
- world seed;
- feature selector;
- origin tile coordinate;
- maximum chunk radius.

A result contains:

- request ID and seed;
- selector;
- matched tile coordinate;
- containing chunk coordinate;
- squared tile distance from the origin;
- number of chunks inspected.

Do not add generated locator chunks to `World.chunks`. They are temporary search
results and must not alter loaded state, generation timing statistics, or the
normal worker queue.

### 4.2 Search order and nearest result

Search chunks by the minimum squared distance from the origin tile to each
chunk's inclusive tile rectangle. Use a deterministic priority order, with
chunk Y then chunk X as tie-breakers.

For each chunk:

1. Generate it with the normal `ChunkGenerator`.
2. Inspect its tiles for tags accepted by the requested selector.
3. Track the matching tile with the lowest squared distance.
4. Break tile ties by tile Y then tile X.
5. Stop when the next chunk's minimum possible distance is greater than the
   best match distance.

This stopping rule returns the actual nearest matching tile without scanning
the entire bounded square after a result is found. If no result is found, stop
after every chunk within the requested Chebyshev radius has been inspected.

The initial default radius should be 16 chunks. Set a hard maximum of 32
chunks, for at most 4,225 generated chunks in a no-result search. Keep both
values in shared locator configuration and include them in help output. These
are safety bounds, not promises that every rare feature will be found. Increase
them only after profiling fixed-seed worst cases.

### 4.3 Cancellation and stale results

The worker checks for cancellation between generated chunks. One synchronous
chunk generation may finish after cancellation, but no further chunks should
start.

Only one locator request is active per console. Starting another lookup cancels
the previous one. `/cancel`, closing the console, changing the seed, and
stopping `WorldController` also cancel active work.

Every result includes the seed used for the search. Before displaying or using
a result, compare it with `World.getWorldSeed()`. Discard stale results even if
the old worker response arrives after cancellation.

Report progress at a throttled interval, not once per chunk. The console should
show the selector, inspected chunk count, and search bound while work is active.

### 4.4 Future feature identity

The first version locates feature categories, not stable component IDs. For
example, `/locate oasis` returns the nearest tile tagged as oasis water.

Do not invent component IDs from loaded chunks. Stable IDs would require a
canonical world-space component anchor that every touching chunk can reproduce.
Add that only when a command or gameplay feature needs to refer to one exact
component across multiple operations.

---

## 5. Console controller

Add `DevConsoleController` under `src/dev-commands/` and derive it from
`KeyBindingPopupController`.

The console should:

- open with `/` and prefill the command prefix;
- close with Escape;
- focus the command input when opened;
- submit only on Enter;
- retain a bounded session history of commands and output;
- use Up and Down to navigate command history when the input is active;
- clear the input back to `/` after successful submission;
- keep invalid input available for correction;
- display asynchronous progress and final results;
- cap visible history so popup size and memory use remain bounded.

Use a single shared history limit, initially 50 entries. Oldest entries are
removed first. Do not persist history across page reloads in the first version.

The `/` opening event must not produce a second slash in the input. Add an
integration test for this because keyboard event ordering spans the shared
`Keyboard`, `Popup`, and `InteractableDisplay` systems.

`WorldController` constructs the console with narrow callbacks for seed access,
reload, position, teleport, camera centering, velocity reset, and feature
lookup. Do not pass `WorldController` itself into command handlers.

---

## 6. Implementation phases

### Phase 1: Command core

- Add command tokenization, registry, typed results, and command context.
- Implement `/help`, `/seed`, `/reload`, and `/pos` without UI dependencies.
- Unit-test valid syntax, whitespace, casing, negative integers, invalid
  integers, missing arguments, extra arguments, and unknown commands.

### Phase 2: Console UI

- Add the minimal `TextInput` and popup hooks needed for explicit submission,
  initial editing focus, and history navigation.
- Add `DevConsoleController` with bounded history.
- Register it in `WorldController` and the help popup.
- Verify popup pause, Escape close, slash opening, mouse focus, and resize.

### Phase 3: Coordinate teleportation

- Add shared tile, chunk, and pixel conversion helpers.
- Implement `/tp tile` and `/tp chunk`.
- Stop entity velocity and center the camera on successful teleport.
- Test positive, zero, boundary, and negative coordinates.

### Phase 4: Bounded feature lookup

- Add the feature selector registry.
- Add the locator protocol, worker, client, priority search, progress, and
  cancellation.
- Implement `/locate`, `/tp feature`, and `/cancel`.
- Reject stale-seed results.
- Measure worst-case search time at default and maximum radius before changing
  either bound.

### Phase 5: Documentation and polish

- Add command usage to the console's `/help` output.
- Add the console key to the keyboard help popup.
- Document locator radius units and seed behavior.
- Update this plan with measured search costs and final tuning values.

---

## 7. Testing strategy

### 7.1 Unit tests

- parser and command registry;
- integer and radius validation;
- tile and chunk coordinate conversion;
- entity-center position reporting;
- selector-to-tag matching;
- chunk priority and deterministic tie-breaking;
- safe early termination after a nearest match;
- no-result behavior at the radius boundary;
- stale seed rejection and cancellation.

Use small fake chunk generators for locator algorithm tests. Do not make every
algorithm test generate real terrain.

### 7.2 Integration tests

- `TextInput` submits on Enter but not on blur;
- slash opens the console with exactly one prefix;
- Up and Down traverse bounded history;
- popup input does not move the fox or camera;
- closing the console cancels active lookup;
- `/tp feature` teleports only after a current-seed result;
- a locator request does not enter the normal chunk worker queue.

### 7.3 Deterministic terrain checks

For fixed seeds and origins:

- compare locator results across repeated runs;
- compare results for positive and negative coordinates;
- verify the returned tile has a matching tag in normal generated output;
- verify increasing the radius cannot replace a nearer result with a farther
  one;
- verify lake and oasis selectors do not match one another;
- verify generation order and loaded chunks do not affect results.

---

## 8. Acceptance criteria

- `/` opens a modal command console and Escape closes it.
- Invalid commands show actionable errors without closing the console.
- `/seed` reads and sets the active seed with current loaded-chunk semantics.
- `/pos` reports tile and chunk coordinates correctly at negative positions.
- `/tp tile` and `/tp chunk` place the entity and camera at documented centers.
- `/locate lake` and `/locate oasis` return the nearest matching generated tile
  within the bound or a clear not-found result.
- `/tp feature lake` and `/tp feature oasis` reuse the locator and teleport only
  on a current-seed result.
- Lookup is deterministic, bounded, cancellable, and independent of loaded
  chunks.
- Locator work does not block rendering or normal chunk generation.
- Console history, worker requests, and temporary generated chunks remain
  bounded.
- Unit tests, integration tests, lint, and the production client build pass.


