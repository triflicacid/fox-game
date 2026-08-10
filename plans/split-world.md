# Split World Plan

_Last aligned with the codebase on 2026-08-10._

This document plans the decomposition of `src/world/world.ts` and the
reorganization of the surrounding `src/world/` package. `World` remains the
public facade and frame-level orchestrator, while cohesive subsystems take
ownership of chunk streaming, queries, entities, effects, collisions, rendering,
and inspection.

The refactor must preserve observable behavior unless a phase documents an
intentional change. APIs may change freely when every affected in-repository
caller is migrated in the same phase.

---

## 1. Goals and constraints

The resulting world package must be:

- **Cohesive:** each module owns one domain and the state enforcing its
  invariants.
- **Explicit:** generation-triggering queries are distinguishable from passive
  ready-only reads.
- **Testable:** world behavior can be exercised without real workers, canvas
  images, or browser rendering APIs.
- **Incremental:** every phase compiles, passes tests, and can be reviewed
  independently.
- **Integrated:** `WorldController`, registries, debug globals, and settings are
  migrated alongside any API they consume.
- **Ordered:** simulation and rendering sequences remain intentional and
  covered by tests.
- **Lifecycle-safe:** worker-backed services can be cancelled and disposed.

This is an architectural refactor, not a terrain-generation rewrite, ECS
migration, rendering redesign, or gameplay change. Behavioral defects found
while extracting code should be characterized and recorded, then fixed in a
separate change unless they block the refactor.

---

## 2. Current architecture

`src/world/world.ts` is approximately 1,800 lines and currently owns several
independently complex responsibilities.

### 2.1 Chunk lifecycle and streaming

`World` owns the loaded chunk map, generation worker, debug generator, world
seed, generation queue focus, loading policy, eviction policy, generation
configuration, and generation timing metrics.

Important existing semantics include:

- `getChunk()` can create an asynchronously generating placeholder.
- drawing can request chunks independently of `update()`;
- queue priority changes when the generation focus enters another chunk;
- movement onto generating chunks is configurable;
- changing the seed updates future generation while leaving loaded chunks
  intact;
- unloading a chunk does not necessarily cancel its pending worker request.

The refactor must not silently change these behaviors.

### 2.2 Tile and structure queries

`World` converts between tile and chunk coordinates and exposes tile, feature,
structure, and hover queries. The current query methods have two distinct
semantics:

- generating reads may request missing chunks;
- ready-only reads inspect existing completed chunks without requesting work.

These semantics need separate contracts so collision and inspection code cannot
start generation accidentally.

### 2.3 Entities and effects

`World` owns the entity collection, the main entity invariant, entity updates,
effect registration, effect updates, effect expiration, entity drawing, and
entity hover hit-testing.

Replacing or destroying the main entity also performs dispatcher cleanup. That
invariant must move with entity ownership rather than remain in the facade.

### 2.4 Collision and structure resolution

`World` constrains entities to generated ground, sweeps for entity and structure
collisions, resolves structure sprite hulls, dispatches collision responses, and
stores the latest collision for debugging.

Structure sprite resolution and collision simulation are related but distinct.
The former translates structure data into world-space geometry; the latter
applies simulation policy to entities.

### 2.5 Rendering

`World.draw()` coordinates these layers:

1. chunks or void;
2. optional noise overlay;
3. effects;
4. entities;
5. foreground structure props;
6. debug world overlays;
7. restored camera transform;
8. minimap;
9. debug HUD, noise legend, and minimap statistics.

This order is observable behavior. Foreground structures intentionally occlude
entities, while debug borders must remain above gameplay content.

### 2.6 Inspection and diagnostics

`World` builds minimap data, minimap statistics, debug HUD data, tile and entity
hover information, biome-region diagnostics, and noise-field overlays.

The repository already separates several data objects from their renderers.
The refactor should extend that pattern rather than place world knowledge inside
HUD or minimap components.

---

## 3. Target package structure

Keep `world.ts` at the root as the discoverable public facade. Put entity
ownership beside the existing entity classes and organize world-specific code
by domain:

```text
src/entities/
    entity-collection.ts
    entity-lookup-handler.ts
    spectator-constants.ts
    ...

src/world/
    create-world.ts
    world.ts
    world-dependencies.ts

    chunks/
        chunk.ts
        chunk-size.ts
        chunk-store.ts
        chunk-store.spec.ts
        chunk-generation-queue-debug-view.ts
        chunk-streaming-manager.ts
        chunk-streaming-math.ts

    collision/
        collision.ts
        structure-resolver.ts
        world-collision-system.ts

    coordinates/
        chunk-coordinate.ts
        coord-set.ts
        tile-coordinates.ts
        world-grid-math.ts

    effects/
        world-effects.ts

    generation/
        biome/
        chunk/
            chunk-generation-worker.ts
        feature/
        structure/
        noise.ts
        random-world-seed.ts
        terrain-generation-source.ts
        world-generation-view.ts
        ...

    inspection/
        dominant-label.ts
        hover-info.ts
        minimap-data-builder.ts
        world-debug-snapshot-builder.ts
        world-hover-inspector.ts

    rendering/
        animated-background-tiles.ts
        chunk-sprite-sheets.ts
        structure-sheet-dispatch.ts
        world-renderer.ts

    tiles/
        tile.ts
        world-grid-view.ts

    testing/
        create-test-world-dependencies.ts
```

This is the required destination layout. Test files live beside their source
files and are omitted from the tree except where useful for clarity.

Avoid broad barrel files during the refactor. Direct imports make dependency
cycles and accidental cross-domain coupling easier to see. Stable public
boundaries can receive an `index.ts` later if repeated imports justify one.

---

## 4. Dependency rules

The extracted modules should follow these rules:

1. `World` may compose and call every world subsystem.
2. Subsystems must not depend on the concrete `World` class.
3. Read-only consumers receive narrow query interfaces, not chunk maps.
4. Collision and inspection use ready-only queries.
5. Streaming is the only subsystem allowed to create or evict loaded chunks.
6. Rendering reads subsystem views but does not mutate simulation state, except
   for preserving explicitly documented chunk-request behavior during the
   transition.
7. Debug and minimap renderers receive data objects rather than querying world
   internals.
8. Pure coordinate and range helpers do not import stateful services.
9. Generation remains deterministic and independent of loaded-world state.

Two grid contracts should make query side effects explicit:

- a generating grid API for callers allowed to request missing data;
- a ready-only grid API for passive lookup.

Names should communicate the behavior directly. Avoid conventional getter names
for operations that initiate asynchronous generation.

---

## 5. Implementation phases

Execute phases in numerical order. Within a phase, perform file creation and
moves first, move implementations second, update every caller third, remove the
old symbols fourth, add or update tests fifth, then run all phase checks. Do not
start the next phase while the current phase has compilation, test, lint, or
build failures. A moved method must have exactly one implementation by the end
of its phase; do not leave duplicate implementations in `World`. Unless a phase
gives a new signature, preserve the method's current parameters, return type,
iteration order, error behavior, and side effects.

### Phase 1 (Done): Characterize behavior and add seams

_Status: completed on 2026-08-10._

Protect behavior before moving high-coupling code.

#### Files to create

- `src/world/coordinates/chunk-coordinate.ts`
  - Export `ChunkCoordinate` with numeric `chunkX` and `chunkY` properties.
  - Remove the identical interface from `world.ts` and import this one there.
- `src/world/generation/terrain-generation-source.ts`
  - Export `TerrainGenerationSource` with
    `setSeed(worldSeed: number): void`.
  - Add `resolveBiomeTagAt(worldX: number, worldY: number): BiomeTag`.
  - Add `getStructures(): readonly Structure[]`.
  - Add `getFields(): NoiseFieldRegistry`.
  - Update `ChunkGenerator` to implement `TerrainGenerationSource`.
- `src/world/generation/chunk/chunk-generation-worker.ts`
  - Export `ChunkGenerationWorker` with
    `setSeed(worldSeed: number): void`.
  - Add `setMinGenerationDelayMs(delayMs: number): void`.
  - Add `requestChunk(chunkX: number, chunkY: number): Promise<ChunkGenerationResult>`.
  - Add `cancelPending(): void`.
  - Add `getPendingChunks(): readonly ChunkCoordinate[]`.
  - Add `reorderPending(order: readonly ChunkCoordinate[]): void`.
  - Add `getQueuePosition(chunkX: number, chunkY: number): number | undefined`.
  - Add `terminate(): void`.
  - Update `ChunkWorkerClient` to implement `ChunkGenerationWorker`.
- `src/world/generation/random-world-seed.ts`
  - Export `randomWorldSeed()` using the current `World.randomSeed()` body.
  - Remove `World.randomSeed()` after callers use the function.
- `src/world/world-dependencies.ts`
  - Export `ChunkFactory` with `chunkX`, `chunkY`,
    `Promise<ChunkGenerationResult>`, `ChunkSpriteSheets`, and `tileSize`
    parameters and a `Chunk` return value.
  - Export `ChunkSpriteSheetsFactory`. It accepts a
    `StructureSheetRegistry` and a structure collision-polygon callback, then
    returns `ChunkSpriteSheets`.
  - Export `WorldDependencies`.
  - Add `worldSeed: number`.
  - Add `chunkGenerator: TerrainGenerationSource`.
  - Add `chunkWorkerClient: ChunkGenerationWorker`.
  - Add `chunkFactory: ChunkFactory`.
  - Add `chunkSpriteSheetsFactory: ChunkSpriteSheetsFactory`.
  - Add `structureSheetRegistry: StructureSheetRegistry`.
  - Add `debugHud: DebugHudRenderer`.
  - Add `minimap: MinimapRenderer`.
  - Add `minimapStatsHud: MinimapStatsHudRenderer`.
- `src/world/create-world.ts`
  - Export `createWorld(tileSize: number, worldSeed = randomWorldSeed()): World`.
  - Construct a `ChunkGenerator` seeded with `worldSeed` and default features.
  - Construct a `ChunkWorkerClient` seeded with `worldSeed`.
  - Construct one `StructureSheetRegistry`.
  - Provide a `ChunkFactory` that performs the current `new Chunk(...)`.
  - Provide a `ChunkSpriteSheetsFactory` that constructs both background
    sprite sheets and binds structure bitmap lookup to the supplied registry
    and collision lookup to the supplied callback.
  - Construct `DebugHud`, `Minimap`, and `MinimapStatsHud`.
  - Assemble a complete `WorldDependencies` object and pass it to `new World()`.
- `src/world/testing/create-test-world-dependencies.ts`
  - Export `createTestWorldDependencies(worldSeed = 1, overrides = {})`
    returning a complete `WorldDependencies` object.
  - Type `overrides` as
    `Partial<Omit<WorldDependencies, "worldSeed">>` so the seed cannot be
    overridden independently of the seed used to build the fake generator and
    worker.
  - Build the fake generator and worker with `worldSeed`.
  - Supply fake generator, worker, chunk factory, sprite-sheet factory,
    structure registry, debug HUD, minimap, and minimap-stats renderer.
  - Merge collaborator overrides only in this test factory and always return
    complete `WorldDependencies`.
  - Tests pass the returned complete object to `World`; production code must
    never call this factory.
- Update `src/debug/debug-hud.ts`
  - Export `DebugHudRenderer` with
    `draw(ctx: CanvasRenderingContext2D, data: DebugHudData): void`.
  - Make `DebugHud` implement `DebugHudRenderer`.
- Update `src/minimap/minimap.ts`
  - Export `MinimapRenderer` with
    `draw(ctx: CanvasRenderingContext2D, canvasWidth: number, data: MinimapData): void`.
  - Make `Minimap` implement `MinimapRenderer`.
- Update `src/minimap/minimap-stats-hud.ts`
  - Export `MinimapStatsHudRenderer` with
    `draw(ctx: CanvasRenderingContext2D, canvasWidth: number, data: MinimapStatsHudData): void`.
  - Make `MinimapStatsHud` implement `MinimapStatsHudRenderer`.
- `src/world/world.spec.ts`
  - Test construction, update orchestration, seed behavior, and facade methods.
- `src/world/world-rendering.spec.ts`
  - Test render ordering with recording collaborators and a recording context.
- `src/world/world-streaming.spec.ts`
  - Test request, focus, queue, buffer, eviction, and generation-disabled behavior.
- `src/world/world-collision.spec.ts`
  - Test ground constraints and collision sweep ordering before extraction.

#### Exact `World` changes

- Change the constructor to
  `constructor(tileSize: number, dependencies: WorldDependencies)`.
- Set `worldSeed` from `dependencies.worldSeed`.
- Replace direct collaborator field initializers with constructor initialization.
- Replace `new Chunk(...)` inside `World.getChunk()` with the injected
  `chunkFactory`.
- Build `chunkSpriteSheets` by calling `dependencies.chunkSpriteSheetsFactory`
  with `dependencies.structureSheetRegistry` and the bound
  `structureCollisionPolygonForSprite()` callback.
- Assign every dependency directly. Do not construct fallback collaborators in
  `World` and do not make any `WorldDependencies` property optional.
- Update `World.refreshWorldSeed()` to call imported `randomWorldSeed()`.
- Apart from `ChunkCoordinate` and `randomSeed()`, do not move fields or methods
  in this phase.
- In `src/world-controller.ts`, replace `new World(WorldController.TILE_SIZE)`
  with `createWorld(WorldController.TILE_SIZE)`.
- Update every test to construct `World` with
  `createTestWorldDependencies()`.

#### Exact behavior to characterize

- Add focused `World` characterization tests using fakes where practical.
- Cover update ordering and exact rendering layer ordering.
- Cover negative tile-to-chunk conversion and visible chunk ranges.
- Cover generation priority, focus movement, buffering, and eviction.
- Cover generation-disabled behavior and movement onto generating chunks.
- Cover collision sweep ordering and first-obstacle behavior.
- Cover seed changes with ready and pending chunks.
- Cover dominant-label tie behavior and minimap hover state.
- Require worker, generator, sprite, and presentation collaborators through the
  complete dependency object.

Record these exact edge cases:

- `tileToChunk(-1, -1)`, `tileToChunk(-16, -16)`, and
  `tileToChunk(-17, -17)` use floor-based chunk coordinates.
- Visible chunk ranges include the far boundary calculated from
  `(viewOrigin + viewSize) / chunkPixelSize` without subtracting one.
- The generation queue reorders only after its focus crosses a chunk boundary.
- The loaded buffer is exactly two chunks on every side.
- Drawing requests visible missing chunks even when `update()` has not run.
- Generation-disabled drawing paints void and does not request missing chunks.
- Ground checks distinguish missing, generating, and ready chunks.
- Collision scans tile Y outside tile X, checks the tile before its structure,
  and stops after the first handled obstacle.
- Seed changes leave loaded chunks in place and clear biome diagnostic caches.
- Dominant-label ties retain the first label encountered.
- Drawing sets minimap hover data; a draw with the minimap disabled clears it.

Tests must not require a real `Worker`, image loading, `OffscreenCanvas`, or an
actual canvas unless specifically testing a rendering integration.

**Phase exit criteria:** existing behavior is represented by tests, production
constructs `World` only through `createWorld()`, tests pass complete dependency
objects, and `World` contains no collaborator fallback construction.

### Phase 2 (Done): Reorganize existing files

_Status: completed on 2026-08-10._

Reduce the crowded package root before adding more modules.

#### Exact file moves

| From | To |
| --- | --- |
| `src/world/chunk.ts` | `src/world/chunks/chunk.ts` |
| `src/world/chunk-size.ts` | `src/world/chunks/chunk-size.ts` |
| `src/world/coord-set.ts` | `src/world/coordinates/coord-set.ts` |
| `src/world/coord-set.spec.ts` | `src/world/coordinates/coord-set.spec.ts` |
| `src/world/tile-coordinates.ts` | `src/world/coordinates/tile-coordinates.ts` |
| `src/world/tile.ts` | `src/world/tiles/tile.ts` |
| `src/world/collision.ts` | `src/world/collision/collision.ts` |
| `src/world/hover-info.ts` | `src/world/inspection/hover-info.ts` |
| `src/world/entity-lookup-handler.ts` | `src/entities/entity-lookup-handler.ts` |
| `src/world/spectator-constants.ts` | `src/entities/spectator-constants.ts` |
| `src/world/animated-background-tiles.ts` | `src/world/rendering/animated-background-tiles.ts` |
| `src/world/chunk-sprite-sheets.ts` | `src/world/rendering/chunk-sprite-sheets.ts` |
| `src/world/structure-sheet-dispatch.ts` | `src/world/rendering/structure-sheet-dispatch.ts` |
| `src/world/noise.ts` | `src/world/generation/noise.ts` |
| `src/world/noise.spec.ts` | `src/world/generation/noise.spec.ts` |

Do not move `src/world/world.ts` or any file already below
`src/world/generation/`.

#### Exact import updates

Update imports in every file in this checklist:

- `src/world/world.ts`;
- `src/world/create-world.ts`;
- `src/world/world-dependencies.ts`;
- `src/world/testing/create-test-world-dependencies.ts`;
- `src/debug/debug-hud.ts`;
- `src/debug/hover-tooltip.ts`;
- `src/registry-init.ts`;
- `src/entities/movement-controller.ts`;
- every moved source and test file from the table above;
- `src/world/generation/chunk/chunk-generator.ts`;
- `src/world/generation/chunk/chunk-worker.ts`;
- `src/world/generation/chunk/chunk-worker-client.ts`;
- `src/world/generation/chunk/chunk-worker-protocol.ts`;
- `src/world/generation/biome/climate-fields.ts`;
- `src/world/generation/feature/feature.ts`;
- `src/world/generation/feature/lakes.ts`;
- `src/world/generation/feature/oases.ts`;
- `src/world/generation/structure/structure.ts`;
- `src/world/generation/grid-algorithms.ts`;
- `src/world/generation/grid-algorithms.spec.ts`;
- `src/world/generation/noise-field.ts`.

For every moved file, adjust relative imports by one directory level where
required. Search the entire repository for every old import path and require
zero matches before completing the phase.

- Create the domain folders from the target structure.
- Move existing files according to their current responsibility.
- Move colocated tests with their source files.
- Update imports without changing exported symbols or runtime behavior.
- Keep `world.ts` and the existing `generation/` hierarchy in place.
- Run the complete test, lint, and client-build checks after the moves.

This phase should contain path changes only. Do not combine moves with class
extractions, API redesigns, or unrelated formatting.

**Phase exit criteria:** the project passes unchanged behavior checks and the
`src/world/` root contains only the facade and domain directories that genuinely
belong there.

### Phase 3: Extract pure foundations and query contracts

Move stateless policy out before extracting stateful systems.

#### `src/world/coordinates/world-grid-math.ts`

Create and export:

- `TileRange` with inclusive start and end tile coordinates;
- `CompassDirection` with `N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, and `NW`;
- `tileToChunk()` moved from `World.tileToChunk()`;
- `pixelRectToTileRange()` using the existing entity/collision bounds logic;
- `toCompassDirection()` moved from `World.toCompassDirection()`.

Replace every internal `World.tileToChunk()` and `World.toCompassDirection()`
call with these imports. Import `ChunkCoordinate` from `chunk-coordinate.ts`.
Remove both methods from `World`.

#### `src/world/chunks/chunk-streaming-math.ts`

Create and export:

- `ChunkRange` moved from `world.ts`;
- `DEFAULT_CHUNK_BUFFER` with value `2`, moved from `World.CHUNK_BUFFER`;
- `visibleChunkRange()` moved from `World.getVisibleChunkRange()`;
- `bufferChunkRange()` extracted from `World.updateLoadedChunks()`;
- `chunkGenerationPriority()` moved from
  `World.getChunkGenerationPriority()`;
- `coordinatesInRange()` extracted from repeated nested range loops;
- `isOutsideChunkRange()` extracted from chunk eviction checks.

Keep the current inclusive far-edge formula exactly. Remove the corresponding
constant and private methods from `World` after all calls use these helpers.

#### `src/world/inspection/dominant-label.ts`

Create `dominantNonNoneLabel(range, readLabel)`. Move the shared counting logic
from `World.getDominantFeatureLabel()` and
`World.getDominantStructureLabel()` into it. Iterate tile Y outside tile X and
replace the winner only when `count > dominantCount`.

#### `src/world/tiles/world-grid-view.ts`

Create these exact exports:

- `GeneratingWorldGrid` with `requestChunk()`, `requestTile()`,
  `requestFeatureTag()`, and `requestStructureTag()`;
- `ReadyWorldGrid` with `isChunkLoaded()`, `getLoadedChunk()`,
  `getReadyTile()`, and `getReadyStructurePieceAt()`;
- `DefaultWorldGridView` implementing both interfaces from one generating chunk
  callback and one passive chunk lookup callback.

Move and rename these `World` methods into `DefaultWorldGridView`:

| Current `World` method | New method |
| --- | --- |
| `getTile()` | `requestTile()` |
| `getFeatureTag()` | `requestFeatureTag()` |
| `getStructureTag()` | `requestStructureTag()` |
| `isChunkLoaded()` | `isChunkLoaded()` |
| `getReadyTile()` | `getReadyTile()` |
| `getReadyStructurePieceAt()` | `getReadyStructurePieceAt()` |

The view must not import `World`. In this phase, rename `World.getChunk()` to a
private `World.requestChunk()` without changing its body. Construct the view
with `(x, y) => this.requestChunk(x, y)` as its generating callback and
`(x, y) => this.chunks.get(x, y)` as its passive callback. Implement the view's
`requestChunk()` as direct delegation to the generating callback. Remove the
other methods listed in the table from `World` and update all internal calls to
use the appropriate interface. Phase 6 moves the remaining private
`World.requestChunk()` implementation into `ChunkStreamingManager`.

#### Tests to create

- `src/world/coordinates/world-grid-math.spec.ts`;
- `src/world/chunks/chunk-streaming-math.spec.ts`;
- `src/world/inspection/dominant-label.spec.ts`;
- `src/world/tiles/world-grid-view.spec.ts`.

Cover negative coordinates, exact chunk boundaries, inclusive visible ranges,
priority ties, empty label ranges, first-encounter ties, generating reads, and
ready-only reads that never invoke the request callback.

Pure helpers should accept all required values as parameters and must not import
`World`. Preserve negative-coordinate behavior by continuing to use floor-based
chunk conversion.

**Phase exit criteria:** pure calculations have focused unit tests, query side
effects are explicit in types and names, and callers no longer depend on
private calculations in `World`.

### Phase 4: Extract low-risk supporting services

Remove cohesive services that have limited influence on simulation policy.

#### `src/world/effects/world-effects.ts`

Create `WorldEffects` with private `effects` and public `register()`, `update()`,
`draw()`, and `clear()` methods. Move:

- the `World.effects` field;
- `World.registerEffect()` implementation;
- `World.updateEffects()`;
- the effect drawing loop from `World.draw()`.

Keep `World.registerEffect()` only as a deliberate gameplay facade method and
delegate it to `WorldEffects.register()`. Update `World.update()` and
`World.draw()` to call the service. Create `world-effects.spec.ts` covering
registration, update order, expiry removal, draw order, and clear.

#### `src/world/generation/world-generation-view.ts`

Create `WorldGenerationView` around the main-thread `ChunkGenerator` with
`setSeed()`, `getFieldNames()`, `getSample()`, `resolveBiomeTagAt()`, and
`getStructures()`. Move the
implementations of `World.getNoiseFieldNames()` and
`World.getNoiseFieldSample()` into it. Keep facade delegation because settings
and hover currently call these methods. `setSeed()` delegates to
`ChunkGenerator.setSeed()`, and `getStructures()` returns the generator's
current structure collection. Accept `TerrainGenerationSource` in the constructor
rather than concrete `ChunkGenerator`. Change `World.setWorldSeed()` in this
phase to call `WorldGenerationView.setSeed()` instead of retaining a direct
generator field.

#### `src/world/inspection/minimap-data-builder.ts`

Create `MinimapDataBuilder` with `build()` and `buildStats()`. Move
`World.buildMinimapData()` and `World.buildMinimapStatsData()` unchanged. Inject
tile size, `WorldGenerationView`, ready chunk access, and a main-entity read callback.
Create `minimap-data-builder.spec.ts`.

#### `src/world/inspection/world-hover-inspector.ts`

Create `WorldHoverInspector` with private `lastMinimapData` and:

- `setLastMinimapData()`;
- `getTileHoverInfo(tileX, tileY, animationElapsedMs)` moved from
  `World.getTileHoverInfo()`;
- `getMinimapHoverInfo()` moved from `World.getMinimapHoverInfo()`;
- `getEntityHoverInfo()` moved from `World.getEntityHoverInfo()`.

Inject `ReadyWorldGrid`, tile size, `WorldGenerationView`, and entity-read callbacks.
Preserve reverse entity iteration. `World.getTileHoverInfo()` supplies its
current animation clock when delegating. Delegate the other two existing facade
methods directly. Create `world-hover-inspector.spec.ts`.

#### `src/world/inspection/world-debug-snapshot-builder.ts`

Create:

- exported `WorldDebugSnapshotOptions`, renamed from `DebugHudOptions`;
- exported `BiomeRegionSize`;
- private `BiomeRegionCacheEntry`;
- `WorldDebugSnapshotBuilder` with `clearBiomeRegionCache()`,
  `getBiomeRegionSize()`, `getDistanceToBiomeEdge()`, and `build()`.

Move into this class:

- the `World.biomeRegionCache` field;
- `World.getBiomeRegionSize()`;
- `World.getDistanceToBiomeEdge()`;
- `World.getDominantFeatureLabel()`;
- `World.getDominantStructureLabel()`;
- every data calculation currently inside `World.drawDebugHud()`.

Use `dominantNonNoneLabel()` for both dominant labels. `build()` must return the
existing `DebugHudData` object and must not call `DebugHud.draw()`. Update
`World.setWorldSeed()` to clear this builder's cache. Create
`world-debug-snapshot-builder.spec.ts` covering cache reuse, seed invalidation,
anchor eviction, partial regions, edge distance, and debug labels.

Inject both grid contracts: use `ReadyWorldGrid` for biome-region traversal and
`GeneratingWorldGrid` for exact and dominant feature/structure labels, matching
the current generation-triggering debug behavior.

#### Caller updates

- Keep `WorldController` effect, hover, and noise calls working through `World`
  delegation in this phase.
- Change `World.update()` to call `WorldEffects.update()`.
- Change `World.draw()` to use `WorldEffects.draw()`, `MinimapDataBuilder`,
  `WorldHoverInspector.setLastMinimapData()`, and
  `WorldDebugSnapshotBuilder.build()`.
- Remove all moved fields and private methods from `World`.

**Phase exit criteria:** effects and inspection state no longer live in
`World`, their behavior has focused tests, and existing public calls still work
through the facade.

### Phase 5: Extract simulation systems

Move entity ownership and collision policy after query contracts are stable.

#### `src/entities/entity-collection.ts`

Create `EntityCollectionView` with `getEntities()` and `getMainEntity()`. Create
`EntityCollection` implementing it with:

- private `entities`, moved from `World.entities`;
- private `mainEntity`, moved from `World.mainEntity`;
- `getEntities()`;
- `getMainEntity()`;
- `setMainEntity()`;
- `teleportMainEntityTo()`;
- `update()`, returning each movable entity's pre-update position;
- `draw()` containing the old `World.drawEntities()` body;
- private `destroyEntity()`;
- private `requireMainEntity()`;
- `clear()` to remove dispatchers during disposal.

Move the corresponding methods from `World` and delete them there. Retain only
the `getMainEntity()`, `setMainEntity()`, and `teleportMainEntityTo()` facade
operations while `WorldController` uses them. Create
`entity-collection.spec.ts`.

Change moved `src/entities/entity-lookup-handler.ts` to accept
`EntityCollectionView` and
`tileSize` rather than concrete `World`. Update `src/registry-init.ts` to pass
those dependencies. Create `entity-lookup-handler.spec.ts`.

#### `src/world/collision/structure-resolver.ts`

Create `StructureResolver`, inject the structure sheet registry and
`() => generationView.getStructures()` as a live structure-provider callback, and
move:

- the `World.structureSheetRegistry` field into the resolver;
- the inline structure bitmap lookup to `getSpriteBitmap()`;
- `World.findStructure()` to `findStructure()`;
- `World.locateStructureSprite()` to `locateSprite()`;
- `World.structureCollisionPolygonForSprite()` to
  `collisionPolygonForSprite()`;
- `World.structurePiecePolygon()` to `structurePiecePolygon()`.

Preserve authored sprite bounds and the full-tile rectangle fallback exactly.
In `src/world/rendering/chunk-sprite-sheets.ts`, add
`createChunkSpriteSheets(structureResolver)`. It constructs the two background
sprite sheets and binds structure bitmap and collision lookups to the resolver.
In `world-dependencies.ts`, change `ChunkSpriteSheetsFactory` to accept a
`StructureResolver` and return `ChunkSpriteSheets`. Update the production and
test dependency factories to provide that new signature. In `World`, construct
`StructureResolver` first, then pass it to `chunkSpriteSheetsFactory`. Remove
the Phase 1 registry-and-callback factory wiring. Create
`structure-resolver.spec.ts`.

#### `src/world/collision/world-collision-system.ts`

Create `WorldCollisionDebugState` for the current collision label pair. Create
`WorldCollisionSystem` with private `lastCollision`, private
`canMoveOntoGeneratingChunks`, and:

- `getCanMoveOntoGeneratingChunks()`;
- `setCanMoveOntoGeneratingChunks()`;
- `update()`;
- `getDebugState()`;
- `clear()`;
- private `isPositionOnValidGround()`;
- private `constrainEntitiesToChunks()`;
- private `resolveActorCollisions()`;
- private `resolveEntityCollisions()`;
- private `resolveObstacleCollision()`.

Move all logic from `World.isPositionOnValidGround()`,
`constrainEntitiesToChunks()`, `handleCollisions()`,
`handleEntityCollisions()`, and `resolveObstacleCollision()`. Inject
`ReadyWorldGrid`, `EntityCollectionView`, `StructureResolver`, and tile size.

Preserve this order exactly:

1. constrain entities before obstacle collision;
2. scan entities in insertion order;
3. scan tile Y outside tile X;
4. check tile collision before structure collision;
5. stop after the first handled overlap;
6. treat a structure handler returning `false` as handled without generic
   response;
7. retain the last collision until the same movable entity moves again.

Create `world-collision-system.spec.ts` for every ordering rule and collision
response path. Move all still-relevant cases from
`src/world/world-collision.spec.ts` into this file, then delete the old
characterization test file.

#### Caller updates

- Change `World.update()` to obtain previous positions from
  `EntityCollection.update()`, then call `WorldCollisionSystem.update()`.
- Change drawing to call `EntityCollection.draw()` at the existing entity layer.
- Inject `EntityCollectionView` into `WorldHoverInspector`.
- Inject collision debug state into `WorldDebugSnapshotBuilder`.
- Remove actor, structure, and collision fields and methods from `World`.

**Phase exit criteria:** entity invariants and collision state are outside
`World`, collision order remains characterized, and no extracted system accepts
a concrete `World` dependency.

### Phase 6: Extract chunk storage and streaming

Separate loaded data ownership from loading policy.

#### `src/world/chunks/chunk-store.ts`

Create `ChunkStore` owning `CoordMap<Chunk>` with:

- `size` getter;
- `has()`;
- `get()`;
- `set()`;
- `remove()`;
- `clear()`;
- `values()`;
- `getGeneratingCount()`.

Move `World.chunks` into this class. It must never instantiate a `Chunk`, call a
worker, or request generation. Create `chunk-store.spec.ts`.

In the same file, export `ChunkStoreView` with only `size`, `has()`, `get()`,
`values()`, and `getGeneratingCount()`. Have `ChunkStore` implement it. Give
rendering and inspection `ChunkStoreView`; only streaming receives mutable
`ChunkStore`.

#### `src/world/chunks/chunk-streaming-manager.ts`

Create `ChunkStreamingManager` owning `ChunkStore`, `ChunkGenerationWorker`,
`ChunkFactory`, and these fields moved from `World`:

- `worldSeed`;
- `minChunkGenerationDelayMs`;
- `totalChunkGenerationTimeMs`;
- `generatedChunkCount`;
- `latestChunkGenerationTimeMs`;
- `lastChunkGenerationFocusChunk`;
- `generationEnabled`.

Move and rename these methods:

| Current `World` method | `ChunkStreamingManager` method |
| --- | --- |
| `getChunk()` request body | `requestChunk()` |
| `getLoadedChunkCount()` | `getLoadedChunkCount()` |
| `getGeneratingChunkCount()` | `getGeneratingChunkCount()` |
| `getAverageChunkGenerationTimeMs()` | `getAverageGenerationTimeMs()` |
| `getLatestChunkGenerationTimeMs()` | `getLatestGenerationTimeMs()` |
| `unloadChunk()` | `unloadChunk()` |
| `reloadAllChunks()` | `reloadAll()` |
| `cancelPendingChunkGeneration()` | `cancelPendingGeneration()` |
| `getChunkGenerationFocus()` | `getGenerationFocus()` |
| `reorderChunkGenerationQueueIfFocusMoved()` | `reorderQueueIfFocusMoved()` |
| `updateLoadedChunks()` | `update()` |

Also add `getWorldSeed()`, `setWorldSeed()`, generation-enabled getters and
setters, generation-delay getters and setters, `getQueuePosition()`, and
`dispose()`.

`dispose()` must cancel pending requests and terminate `ChunkWorkerClient`.
Initially preserve the existing difference between single-chunk unload,
reload-all cancellation, generation disabling, and seed changes.

#### Wiring and caller updates

- Construct `ChunkStore` before `ChunkStreamingManager` in `World`.
- Reconstruct `DefaultWorldGridView` with `streaming.requestChunk()` as its
  generating callback and `store.get()` as its passive callback.
- Change `World.update()` to call streaming focus, update, and reorder methods.
- Keep only genuine seed, reload, and generation-setting facade methods.
- Make `World.setWorldSeed()` coordinate streaming seed, `WorldGenerationView.setSeed()`,
  and debug cache invalidation.
- Give the debug snapshot builder store and streaming metric views.
- Give rendering a passive store plus an explicit request callback so current
  draw-triggered generation remains visible.
- Replace `WorldController.getChunkWorkerClient()` with a narrow chunk queue
  debug view exposing pending requests, queue positions, reordering inspection,
  and generation delay controls.
- Update `src/globals.ts` to expose that debug view instead of the concrete
  worker client.
- Remove chunk maps, worker state, metrics, and streaming methods from `World`.

Create `chunk-streaming-manager.spec.ts` covering duplicate requests,
completion, rejection, priority, focus movement, eviction, cancellation,
generation disabling, delay propagation, seeds, metrics, and disposal. Move all
still-relevant cases from `src/world/world-streaming.spec.ts` into this file,
then delete the old characterization test file.

#### `src/world/chunks/chunk-generation-queue-debug-view.ts`

Create `ChunkGenerationQueueDebugView` with `getPendingChunks()`,
`getQueuePosition()`, `reorderPending()`, and `setMinGenerationDelayMs()`.
Have `ChunkStreamingManager` implement these methods by delegating to its worker
client. Rename `WorldController.getChunkWorkerClient()` to
`getChunkGenerationQueue()` and return this interface. In `src/globals.ts`,
replace the `ChunkWorkerClient` import and `window.chunkGenerationQueue` type
with `ChunkGenerationQueueDebugView`, then assign
`worldController.getChunkGenerationQueue()`.

**Phase exit criteria:** `World` no longer owns chunk maps, queue state, or
generation metrics, and streaming behavior remains deterministic and bounded.

### Phase 7: Extract rendering and minimize the facade

Move rendering only after stable read models exist.

#### `src/world/rendering/world-renderer.ts`

Create `WorldRenderer` and move these fields from `World`:

- `animationElapsedMs`;
- `debugHud`;
- `minimap`;
- `minimapStatsHud`;
- `minimapEnabled`;
- `lastVisibleChunkCount`;
- `VOID_COLOR`, as a private renderer constant.

Add public `advanceAnimation()`, `draw()`, `isMinimapEnabled()`,
`setMinimapEnabled()`, and `getAnimationElapsedMs()`. Move these methods into it:

- `World.draw()` implementation;
- `drawStructureProps()`;
- `drawChunkDebugOverlays()`;
- `drawBiomeOutlines()`;
- `drawNoiseFieldOverlay()`;
- `drawNoiseFieldLegend()`;
- the remaining rendering half of `drawDebugHud()`.

Inject only `ChunkStoreView`, an explicit visible-chunk request callback,
`EntityCollection`, `WorldEffects`, `MinimapDataBuilder`, `WorldHoverInspector`,
`WorldDebugSnapshotBuilder`, `WorldGenerationView`, and queue-position lookup. Do not
inject `World`.

Create `world-renderer.spec.ts` and assert this exact order:

1. save context, apply camera transform, disable smoothing;
2. draw visible chunks or void;
3. draw noise overlay;
4. draw effects;
5. draw entities;
6. draw foreground structure props;
7. draw chunk and biome debug overlays;
8. restore context;
9. draw minimap;
10. set or clear hover inspector minimap data;
11. draw debug HUD;
12. draw noise legend;
13. draw minimap statistics.

Move all still-relevant cases from `src/world/world-rendering.spec.ts` into this
file, then delete the old characterization test file.

#### Final `World` responsibilities

Retain only:

- `tileSize`;
- construction and subsystem wiring;
- `setWorldSeed()` coordination;
- `refreshWorldSeed()`;
- `update()` orchestration;
- thin `draw()` delegation;
- facade operations still used as world-level gameplay/settings operations;
- `dispose()`.

The final `World.update()` must execute:

1. `renderer.advanceAnimation()`;
2. `entityCollection.update()` and capture previous positions;
3. `effects.update()`;
4. calculate streaming focus;
5. `streaming.update()`;
6. `streaming.reorderQueueIfFocusMoved()`;
7. `collision.update()`.

No extracted class may import `World`.

#### Final `World` public API

Keep these public members because they remain current application operations:

- `tileSize`;
- `registerEffect()`;
- `getWorldSeed()`, `setWorldSeed()`, and `refreshWorldSeed()`;
- `reloadAllChunks()`;
- `isGenerationEnabled()` and `setGenerationEnabled()`;
- `getMinimapEnabled()` and `setMinimapEnabled()`;
- `getTileHoverInfo()`, `getMinimapHoverInfo()`, and
  `getEntityHoverInfo()`;
- `getMainEntity()`, `setMainEntity()`, and `teleportMainEntityTo()`;
- `getNoiseFieldNames()` and `getNoiseFieldSample()`;
- `update()`, `draw()`, and `dispose()`.

After animation ownership moves, implement `World.getTileHoverInfo()` by
passing `renderer.getAnimationElapsedMs()` to the hover inspector.

Remove these public members and migrate their internal or external callers to
their named owners:

- `World.randomSeed()`;
- `World.tileToChunk()` and `World.toCompassDirection()`;
- `getMinChunkGenerationDelayMs()` and `setMinChunkGenerationDelayMs()`;
- `getChunk()` and `getTile()`;
- `getLoadedChunkCount()`, `getGeneratingChunkCount()`,
  `getAverageChunkGenerationTimeMs()`, and
  `getLatestChunkGenerationTimeMs()`;
- `getChunkWorkerClient()`;
- `isChunkLoaded()` and `unloadChunk()`;
- `getCanMoveOntoGeneratingChunks()` and
  `setCanMoveOntoGeneratingChunks()`;
- `getEntities()`;
- `getDominantFeatureLabel()` and `getDominantStructureLabel()`.

At the end of Phase 7, search for each removed symbol and require zero source
usages and zero definitions.

#### Controller lifecycle updates

- Add `WorldController.dispose()`.
- Have it stop the frame loop, remove its canvas and window listeners, and call
  `World.dispose()`.
- Do not call `World.dispose()` from `WorldController.stop()`, because `stop()`
  may be followed by `start()`.
- Add `World.dispose()` to clear entities and effects, clear collision state, and
  dispose chunk streaming.
- In `src/main.ts`, register a one-shot `beforeunload` listener that calls
  `worldController.dispose()`.
- Keep final facade and disposal tests in `src/world/world.spec.ts`.

**Phase exit criteria:** `World` is a small composition facade, rendering is
isolated behind read-only views, and all worker-backed resources have explicit
lifecycle ownership.

---

## 6. Testing strategy

### 6.1 Pure unit tests

Cover:

- coordinate conversion at zero, boundaries, and negative positions;
- visible and buffered chunk ranges;
- generation-priority ordering and ties;
- dominant-label ties and empty regions;
- structure hull scaling and fallback geometry;
- minimap and debug data calculations.

### 6.2 Stateful subsystem tests

Use fake grid views, stores, workers, entities, and render targets to cover:

- effect registration and expiration;
- main-entity replacement and cleanup;
- chunk requests, completion, cancellation, and eviction;
- queue reordering after focus movement;
- seed propagation and pending work;
- movement constraints for missing, generating, and ready chunks;
- entity and structure collision ordering;
- biome-region cache invalidation.

### 6.3 Orchestration tests

Keep a smaller set of facade-level tests to cover:

- update subsystem ordering;
- render pass ordering;
- facade delegation and migrated direct subsystem calls;
- generation requests initiated by update and drawing;
- minimap hover state across draw frames;
- disposal propagation.

Run the repository checks after every phase:

```powershell
pnpm run test
pnpm run lint
pnpm run build:client
```

---

## 7. Migration rules

- APIs may change within any phase, but every affected in-repository caller must
  be migrated before that phase is complete.
- Do not retain forwarding methods solely for backwards compatibility.
- Move state together with the methods that maintain its invariants.
- Do not pass `World` to extracted systems as a shortcut.
- Do not expose mutable collections solely to simplify an extraction.
- Avoid unrelated gameplay changes, formatting, and comment rewrites.
- Add concise TSDoc to new functions and methods and explicit access modifiers
  to class members.
- Keep tests behavior-focused and colocated with the source they cover.
- Prefer composition over inheritance for extracted systems.
- Avoid creating a replacement god object such as a broad `WorldManager`.

---

## 8. Risks

### 8.1 Hidden ordering dependencies

Simulation and rendering order affect gameplay and visuals. Characterization
tests must precede moving either orchestration path.

### 8.2 Query side effects

A passive-looking read can currently initiate generation. Explicit interfaces
must prevent accidental behavior changes and future misuse.

### 8.3 Browser-bound construction

Workers, sprite sheets, image APIs, and canvas collaborators make `World` hard
to instantiate in unit tests. `createWorld()` should build real browser
collaborators, while `createTestWorldDependencies()` supplies lightweight fakes
and returns the complete required dependency graph.

### 8.4 Circular dependencies

Rendering, collision, chunks, and structures currently share types and
callbacks. Narrow interfaces and direct imports should be used to keep the new
domain graph directional.

### 8.5 Replacement god classes

Moving many methods into a single `ChunkManager` or `WorldRenderer` without
narrow dependencies only relocates the problem. Each extraction must have clear
state ownership and a bounded reason to change.

### 8.6 Refactor scope

Path changes create large diffs, while behavioral extraction creates subtle
diffs. Keeping them in separate phases makes regressions and reviews easier to
manage.

---

## 9. Acceptance criteria

- `src/world/world.ts` primarily composes subsystems and orchestrates frames.
- `WorldController`, registries, settings, debug tools, and globals compile and
  work against the current APIs after every phase.
- The `src/world/` root is organized into cohesive domain folders.
- Generating and ready-only world queries have distinct contracts.
- Chunk storage and chunk streaming policy have separate ownership.
- Actor, effect, collision, inspection, and rendering state no longer accumulate
  in `World`.
- Extracted services do not depend on the concrete `World` class.
- Update and render ordering are explicit and covered by tests.
- Negative coordinates, generation focus, eviction, seed behavior, and collision
  behavior remain covered.
- Pending worker operations have explicit cancellation and disposal ownership.
- Unit tests, lint, and the production client build pass at the end of every
  phase.

