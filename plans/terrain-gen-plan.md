# Terrain Generation Rewrite: Analysis and Plan

This is a planning document only. It does not propose or make any source
changes; it compares `docs/terrain-gen-rewrite.md` (the target design)
against the terrain generation code that currently exists under `src/world/`,
and lays out what a rewrite toward that design would involve.

---

## ASAP: move chunk generation to a Worker

**Status: implemented.** A single `ChunkWorkerClient`
(`src/world/generation/chunk-worker-client.ts`) runs one dedicated worker
(`chunk-worker.ts`, inlined into the single-file build via Vite's
`?worker&inline` import) that holds its own `ChunkGenerator` and answers
`generate` requests. `World.getChunk` requests generation and inserts a
pending `Chunk` into the cache immediately, so the buffered-range polling in
`updateLoadedChunks` doesn't re-request an in-flight chunk. `Chunk` renders a
placeholder fill until its data arrives (`isReady()`), and gameplay/debug
reads that could hit a not-yet-ready chunk (`World.getFeatureTag`) fall back
to `"none"` instead of throwing. `World.chunkGenerator` (main thread) is kept
around only for `getNoiseFieldNames`/`drawNoiseFieldOverlay` - the debug
noise-field heatmap still needs synchronous field sampling.

Chunk generation currently runs synchronously on the main thread and can
stutter the UI. This should be delegated to a Web Worker as soon as
possible - not deferred to a later phase.

This is also the reason `World.CHUNK_BUFFER` (`world.ts`) exists: chunks
just outside the visible view are pre-generated ahead of time so that, once
generation moves off-thread, the Worker has a head start and (hopefully)
finishes before the camera pans far enough for that chunk to become
visible.

---

## 0. Decisions from review

Settled while reviewing this plan (see `plans/terrain-gen-review-questions.md`
for the full reasoning):

- **Flood fill stays for lakes** - a conscious divergence from the rewrite
  doc's "no flood fill" rule. Candidacy comes from a noise threshold, then a
  flood fill grabs the whole connected region so min-size and CA smoothing
  can be enforced. This is the current `LakeFeature` approach minus the
  biome gating. Flood fill is kept only where it stays bounded (capped, and
  the cap must exceed any real lake for cross-chunk agreement); genuinely
  unbounded/global scans are still avoided.
- **Zero padding for now.** Whole-region flood fill is what makes this
  viable (the whole lake is in hand, so water-dark/smoothing work off
  component membership, no margin needed). Padding gets added later only if
  a rule that can't be answered from a component or a pure point-sample
  turns up (likely shorelines).
- **Per-tile feature identity = a cheap enum tag** (`none`/`lake`/`river`/
  `shore`/...) written during application, not a retained `Feature`
  instance.
- **Chunk caching stays, with a per-tile redraw fallback** until the cached
  bitmap is ready. Determinism makes the fallback visually identical, so it
  also dissolves the async-sprite-loading concern.
- **Rivers-from-lakes is split into its own phase** (Phase 4), and the
  chosen approach is **lake-aware rivers**: a river is seeded/anchored from a
  lake's edge (cheaply available since lakes are already flood-filled) and
  its path carved by a noise field. This accepts some lake->river coupling
  the rewrite doc wanted to avoid - a deliberate, accepted design drift, on
  the grounds that it stays cheap (mostly noise-field driven) and gives
  reliable "river out of a lake" results. `lake-geometry.ts`'s edge/centroid
  ideas are adopted here rather than discarded.
- **Every river attaches to at least one lake.** A river flows out of a lake
  and, if it reaches another lake, into it; if it doesn't, it fades out into
  wetland or splits into a few tiny streams that just stop (a delta-like
  terminus). Rivers vary in thickness by design - some generate thin and
  stay thin (thinness is not the same as fading out), some are thick.
- **No ocean for now.** Oceans may come later but are out of scope; ignore
  them in the current phase plan. (Until one exists, "into the ocean" from
  the acceptance bar just means "or fades into wetland/streams".)
- **Lake flood-fill cap = 9 chunks** (`9 * CHUNK_SIZE * CHUNK_SIZE` =
  2304 tiles). Sized in chunk units so it scales if `CHUNK_SIZE` changes.
- **Rivers start as pure field masks**, then get smoothed, with appropriate
  fading / delta ends added afterward (per the terminus rule above). Bounded
  flood fill is not used for basic river discovery.
- **Lakes gate on biome via a whole-component majority vote** (revises the
  original "Desert does not gate water" stance). A per-tile biome gate was
  considered and rejected: biome resolves once per whole chunk today
  (`ChunkGenerator.generate`, not per tile), so a per-tile gate would cut a
  lake off wherever it crosses into a differently-biomed chunk - the exact
  chunk-boundary cutoff this rewrite exists to eliminate. Instead, a lake's
  *core* tiles (interior, all 8 neighbours also lake - the same set the
  water light/dark rule needs) are majority-voted, each resolved at its own
  world position, against an allowed-biome array (`["plains"]` for now,
  extensible); the whole discovered component is accepted or rejected as a
  unit, spill-over into a disallowed biome included on acceptance. A
  component with no core tiles is rejected outright, same bucket as failing
  min-size. This is Phase 5's "oasis rework" done in Phase 2 instead of
  deferred. Rivers (Phase 3/4) have no flood-filled component to vote over,
  so they stay biome-agnostic for now - unaffected by this.
- **No GitHub / issue tracking.** Phases are tracked in this document only;
  keep it updated as stages are completed. Never open issues/PRs or push
  (see `docs/preferences.md`).
- Corrections folded in: moisture is a shared biome+feature field (not
  purely per-feature); the current `wetPlains`/`lakePlains` band is a
  coherent alternative being replaced (not a muddle); the river
  `waterLight` hardcode diverges from the uniform water rule only for wide
  rivers (latent, not wrong today).

---

## 1. Current state of the branch

The committed terrain generation code (as of `6cb35f2 Generate rivers and
lakes`) is: `src/world/noise.ts`, `terrain-generator.ts`, `chunk.ts`,
`tile.ts`, `world.ts`, and `features/feature.ts`,
`features/lake-feature.ts`, `features/river-feature.ts`.

There is also one uncommitted, untracked file:
`src/world/features/lake-geometry.ts`. It reads as the start of a rewrite
toward the design doc's field-only model, but it does not compile against
the rest of the branch as it stands:

- it imports `sampleWaterRegionValue` and `WATER_REGION_THRESHOLD` from
  `terrain-generator.ts`, but that file exports neither (it only exports
  `sampleGrassType`, `sampleLakeValue`, `LAKE_THRESHOLD`, `Biome`,
  `sampleBiome`, `sampleChunkBiome`, `RIVER_RIDGE_THRESHOLD`,
  `sampleRiverRidge`)
- it calls `sampleChunkBiome()` with no arguments, but the current
  signature is `sampleChunkBiome(worldSeed, chunkX, chunkY)`
- it gates lake eligibility on the chunk biome being `"plains"`, which
  contradicts the committed model, where `LakeFeature` only applies to the
  `"lakePlains"` sub-biome
- its own doc comments reference a `river-geometry.ts` module that does not
  exist anywhere in the branch

So the branch currently holds two different, incompatible mental models for
lakes at once: the committed flood-fill-plus-sub-biome model, and an
abandoned-partway field-only model. Part of this rewrite is picking one on
purpose rather than letting the conflict resolve itself by accretion.

Separately, several files' doc comments point at `plans/terrain-generation.md`
(`noise.ts`, `terrain-generator.ts`, `river-feature.ts`, `tile.ts`) - `git
log` shows that path has never existed in this repo. It looks like a
reference to an earlier, local, never-committed planning doc, later
superseded by `docs/terrain-gen-rewrite.md`. Those comments should get
repointed once this plan doc's ideas land in code.

---

## 2. Section-by-section comparison

### 2.1 Noise as modular, named fields (`NoiseField`)

**Doc:** the generator is handed a collection of `NoiseField` instances,
each with a stable name (`moisture`, `temperature`, `grass_variant`, ...),
so new fields can be added without touching the generator itself.

**Current code:** `noise.ts` exports three free sampling functions
(`sampleNoise2d`, `sampleFbm2d`, `sampleGradientNoise2d`). Every terrain
concept in `terrain-generator.ts` is its own hardcoded function
(`sampleGrassType`, `sampleBiome`, `sampleLakeValue`, `sampleRiverRidge`),
each with its own module-level seed-offset/frequency/octave constants baked
in. There is no object with a name, no registry, nothing swappable. Adding
an elevation field today means writing a new function and manually wiring
it into every call site that needs it, not registering an instance.

**Gap:** total. This is the foundational piece the rest of the doc's
expandability rests on.

### 2.2 Biome fields (temperature/moisture, `BiomeRule`)

**Doc:** at least two independent, low-frequency fields (temperature,
moisture); `BiomeRule` objects each inspect field values and report a
match; an ordered list of rules; Plains/Desert as the starting pair, with
room to add Forest/Jungle/Tundra/etc. later.

**Current code:** a single `waterRegionNoise`-style field
(`WATER_REGION_SEED_OFFSET`) thresholded into three ordered bands
(`plains` / `wetPlains` / `lakePlains`). There is no temperature or
moisture field anywhere, no Desert, and no `BiomeRule` abstraction.

**Gap:** total on the missing fields/`BiomeRule`, plus one modeling change.
Today's `Biome` enum bakes water-feature *eligibility* into the biome value
itself (`wetPlains`/`lakePlains`). That band structure is a coherent design,
not a muddle: it deliberately guarantees a `wetPlains` buffer around every
`lakePlains` region so a river always has somewhere to exist between dry
land and a lake. We're replacing it anyway, with a noise-driven feature
system where eligibility is recomputed from fields per feature rather than
frozen into the biome. Note moisture is a *shared* field the doc feeds into
both biome selection (temperature + moisture) and feature gating (the lake
moisture threshold); the issue isn't that moisture touches biome, it's that
the current enum freezes the derived eligibility instead of recomputing it.

### 2.3 Base terrain / grass variant

**Doc:** grass variant is a smooth, low/mid-frequency `grass_variant`
field, thresholded into 3 bands, sampled per tile in world space, only
consulted when the tile is Plains.

**Current code:** `sampleGrassType` does exactly this. This is the one
piece of the current implementation that already matches the doc closely.
It should carry forward largely as-is, just rehomed behind the `NoiseField`
abstraction once that exists.

### 2.4 Padded chunk generation area

**Doc:** an explicit requirement - generate into a working area larger than
the visible 16x16 (e.g. 24x24 or 32x32), used only as a local sampling
margin for neighbour-dependent rules (smoothing, water colour, shorelines),
never as a cap on feature size.

**Current code:** no padded working area exists. `Chunk.generateTerrain`
only ever touches the exact 16x16 local grid. Feature discovery does reach
outside the chunk (`LakeFeature`'s flood fill samples neighbouring chunks'
biomes as it expands), but that is an unbounded, recursive cross-chunk
search, not a fixed local margin. `LakeFeature.isFullySurrounded` also only
checks membership in the feature's already-discovered
`coveredWorldTiles` set, not a general padded neighbour sample - correct
only as long as the flood fill discovered the feature's true full shape.

**Gap:** total. This is a prerequisite for shorelines, uniform water
colour, and any local CA smoothing done the way the doc describes.

### 2.5 Five-level pipeline separation

**Doc:** five explicit levels - biome fields, base terrain, feature masks,
feature application, visual variants - each independently swappable.

**Current code:** `Chunk`'s constructor really has two phases:
`generateTerrain` (biome selection + grass variant fused together) and
`applyFeatures` (mask discovery, application, and water-colour derivation
all fused together inside each `Feature` subclass's `tryGenerate`/`paint`).
Nothing separates mask generation from mask application from visual
variant derivation; each feature class owns its entire pipeline
end-to-end.

**Gap:** significant. Not incorrect, but not modular in the way the doc
wants - a generator that orchestrates discrete stages, versus feature
classes that each do everything themselves.

### 2.6 Field-based features, no flood fill / BFS

**Doc:** stated repeatedly and explicitly, in the "Field-Based Features",
"Lake Minimum Size", "Rivers From Lakes", and "Performance" sections -
features must not use flood fill, BFS, or other global searches.

**Current code:** `Feature.floodFill` and `Feature.findComponents`
(`features/feature.ts`) are a literal BFS-based flood fill, and it is the
core discovery mechanism both `LakeFeature` and `RiverFeature` are built
on. `Feature.smoothComponent` is a single, non-iterative erosion pass
applied to the already-fully-flood-filled component afterward.

**Decision (see section 0):** we are *not* eliminating flood fill wholesale.
For lakes it is retained on purpose - candidacy from a noise threshold, then
flood-fill the whole connected region so min-size and CA smoothing can be
enforced (a hard min-size guarantee is the one thing pure field+CA cannot
give). What we drop is the *unbounded/global* usage the doc rightly warns
against: today `LakeFeature.isEligible` recursively samples
`sampleChunkBiome` for whatever neighbouring chunks the flood fill reaches,
so a badly tuned `lake_shape` frequency/threshold could sample noise across
many chunks' worth of area. The retained version stays bounded by a size cap
(as today), and the cap must exceed any real lake so every touching chunk
agrees on where the lake ends. Rivers do *not* use flood fill for discovery
(see 2.9): they are a pure field mask, smoothed, with faded/delta ends.

### 2.7 Cellular automata smoothing

**Doc:** iterative local 3x3/5x5 neighbour-density passes over the padded
working area, configurable per feature, turning a raw threshold mask into
a smooth blob and cleaning up chunk-seam artifacts.

**Current code:** `Feature.smoothComponent` is a single pass, applied once
to an already-complete flood-filled shape, and only used opt-in by
`LakeFeature` (`RiverFeature` skips it, since a 1-2-tile-wide ridge wouldn't
survive any reasonable neighbour threshold).

**Decision (see section 0):** because lakes keep whole-region flood fill,
smoothing continues to operate on the full component (not a padded
per-chunk mask), which is what lets us run zero padding. Whether one erosion
pass is enough or it should iterate is a tuning question to settle against
real output, not an architectural one. The doc's "smooth a mask over a
padded working area" model only becomes relevant if a future feature can't
afford a whole-region flood fill; lakes can.

### 2.8 Lakes

**Doc:** mask built from moisture + wetness + lake_shape fields plus local
density; no guarantee of exact connected size, on purpose - the doc leans
on frequency/threshold tuning plus local density checks instead of ever
computing an exact size.

**Current code:** `LakeFeature`'s field logic (`sampleLakeValue` gated by
biome) is conceptually close to the doc. Per section 0 the flood-fill +
min-size + smooth structure is being *kept*, not replaced: the change is
swapping the candidacy test from the `lakePlains` sub-biome to a raw noise
threshold, and dropping the cross-chunk biome sampling in favour of a pure
per-tile candidacy check. That makes the lake work more a refactor of the
current `LakeFeature` than a rewrite. The `MAX_SIZE` cap stays (needed for
cross-chunk agreement, not just cost) and is set to 9 chunks'
worth of tiles (`9 * CHUNK_SIZE * CHUNK_SIZE` = 2304), sized in chunk units
so it tracks `CHUNK_SIZE`.

### 2.9 Rivers

**Doc:** a `river_field` noise value close to a target value, sampled in
world space, deliberately allowed to cross chunk boundaries so a river can
read as one long, continuous curve; extra fields (width, activity,
branching) are optional layering on top; a river relates to a lake only
through shared/related fields, never an explicit path or graph object.

**Current code:** `RiverFeature.tryGenerate`'s `isEligible` explicitly
refuses to leave the current chunk - a deliberate performance workaround,
per its own doc comment. That means every river in the current code is, by
construction, a chunk-sized fragment, and can visibly stop dead at a chunk
edge if the underlying ridge noise would otherwise have continued into the
neighbour. This is exactly the "cut off at a chunk boundary" failure mode
the doc explicitly calls unacceptable for lakes - just self-imposed here
for rivers instead of accidental.

**Decision (see section 0):** rivers are discovered as a pure per-tile field
mask (river field clears a threshold), then smoothed, with faded/delta ends
added afterward. No flood fill for discovery, so they cross chunk boundaries
for free - fixing the current chunk-local cutoff. Rivers vary in thickness
by design (thin-and-staying-thin is intentional, distinct from a fading
terminus). The lake relationship is deferred to Phase 4 and is **lake-aware**
(the chosen approach, diverging from the doc's pure-emergence ideal): a river
is anchored at a lake edge and carved by the field. Every river attaches to
at least one lake; a river that doesn't reach a second lake terminates by
fading into wetland or splitting into a few tiny stopping streams.

This is where `lake-geometry.ts`'s `anchor`/`edgeTiles`/`centroid` become
useful rather than discarded: a lake's edge tiles are exactly the seed points
lake-aware river anchoring needs. What we don't build is an explicit stored
river *path* object - the path is still carved by sampling a field, the lake
edge only provides the deterministic starting point.

### 2.10 Water colour (light / dark)

**Doc:** one uniform rule - a water tile is dark iff all 8 neighbours are
also water - applied the same way regardless of which feature produced the
water. The doc explicitly lists "wide river interiors can become dark" as
one of the rule's expected emergent outcomes.

**Current code:** `LakeFeature.isFullySurrounded` implements exactly the
doc's rule, correctly, for lake tiles. `RiverFeature.paint` hardcodes every
river tile to `waterLight`. This is not wrong output today: the uniform rule
only darkens a tile with all 8 neighbours water, and the ridge-line rivers
the current code produces are too thin to ever have a fully-interior tile,
so the hardcode is observably equivalent to the uniform rule. The
divergence is latent - it only appears once a river is wide enough to have
an interior tile. Worth reconciling into a single shared water-colour
implementation both features feed into, for uniformity, but it isn't a live
bug.

### 2.11 Shorelines

**Doc:** land adjacent to water becomes a shoreline variant; water
adjacent to land stays light; all locally derived from neighbour checks.

**Current code:** does not exist at all. No shoreline concept anywhere.

### 2.12 Chunk image caching / render performance

**Doc:** an explicit, headline requirement (stated in the intro and again
in "Performance") - once a chunk is generated, cache it to an
`ImageBitmap` or offscreen canvas, and have the renderer blit that cached
image during gameplay instead of redrawing every tile every frame.

**Current code:** `Chunk.draw()` iterates all 256 tiles and calls
`Tile.draw()` on each, every frame, with no offscreen-canvas or bitmap
caching of the chunk as a whole anywhere in the codebase. Compounding
this: `Tile`'s constructor kicks off an async sprite-sheet bitmap lookup
per tile, per `Chunk` construction, and `World.unloadChunk` just deletes
the `Chunk` from its `Map` with no persistence - so revisiting a
previously-unloaded chunk regenerates everything from scratch: fields
resampled, feature flood fills redone, 256 new `Tile` objects created, 256
new async bitmap lookups kicked off.

**Gap:** this is the largest concrete gap relative to the doc's stated
primary goal ("The main goal is performance").

### 2.13 Determinism

**Doc:** same seed + same chunk coordinate always produces the same
result, independent of generation order or which chunks already exist;
separate deterministic seed offsets per generation layer.

**Current code:** matches well. Every sampling function takes an explicit
`worldSeed`, everything samples at absolute world coordinates, and
`terrain-generator.ts` already uses distinct per-channel seed offset
constants (`GRASS_SEED_OFFSET`, `WATER_REGION_SEED_OFFSET`,
`LAKE_SEED_OFFSET`, `RIVER_SEED_OFFSET`). One caveat worth noting: because
`LakeFeature`'s flood fill can reach into neighbouring chunks, a chunk's
generation cost is not bounded by that chunk's own tile count - this
doesn't break determinism (there's no shared mutable state to race on), but
it does undercut the doc's performance goals in the same way as 2.6 above.

---

## 3. Gap summary

| Area | Status |
|---|---|
| Deterministic, seeded, world-space sampling | Matches |
| Grass variant selection | Matches |
| Water light/dark rule (lakes only) | Matches; latent divergence for wide rivers only (see 2.10) |
| `NoiseField` abstraction | Missing entirely |
| Temperature/moisture biome fields, `BiomeRule` | Missing entirely; current biome freezes water eligibility into the enum |
| Padded chunk working area | Deliberately none for now (see section 0); revisit for shorelines |
| Five-level pipeline separation | Not separated; fused into ~2 phases |
| Field-based feature masks | Lakes keep flood fill by decision (see 0/2.6); avoided only for unbounded/global scans |
| CA smoothing | Kept on the whole flood-filled component; iterate-vs-single-pass is a tuning question |
| Rivers crossing chunk boundaries | Contradicted - deliberately chunk-local today |
| Rivers-from-lakes as emergent field relationship | Its own phase, noise-driven, highest-risk (see 0/Phase 4) |
| Shorelines | Missing entirely |
| Chunk image caching (`ImageBitmap`/offscreen canvas) | Missing entirely - biggest performance gap; kept with per-tile redraw fallback |

---

## 4. Proposed target architecture

- **`src/world/generation/noise-field.ts`**: a `NoiseField` interface
  (`name`, `sample(worldX, worldY): number`) plus implementations
  (`ConstantField`, `ValueNoiseField`, `PerlinNoiseField`,
  `FbmField`, `DomainWarpedField` wrapping another field,
  `CombinedField` combining several). These wrap the existing
  `noise.ts` primitives rather than replace them - `sampleNoise2d`,
  `sampleFbm2d`, and `sampleGradientNoise2d` are already solid and already
  doc-compliant on determinism; they just need an object wrapper with a
  stable name and per-channel seed offset, instead of a hand-written
  function per concept.
  - **Debug visualisation:** in debug mode, the settings dialog should offer
    a way to visualise every installed `NoiseField`. Because each field is a
    named `sample(worldX, worldY)` pure function, a debug overlay can render
    any chosen field as a greyscale/heatmap across the visible area (and
    toggle between fields by name). This is a direct payoff of the named-
    field registry - it only becomes possible once fields are first-class
    named objects rather than inline functions. Ties into the existing
    `DEBUG_CONFIG`/debug-HUD plumbing in `world.ts`.
- **A named field registry**: whatever config object the chunk generator
  is constructed with, keyed by field name, so biome rules and features can
  reference fields (`"moisture"`, `"grass_variant"`, ...) without importing
  each other's sampling functions directly.
- **`src/world/generation/biome-rule.ts`**: a `BiomeRule` interface
  (`matches(fieldValues): boolean`, `biome`), evaluated in order, first
  match wins. Today's single-field ordered-band trick becomes one possible
  `BiomeRule` implementation, not the whole mechanism.
- **`src/world/generation/feature.ts`** (evolved from today's `Feature`,
  not thrown away): it needs to support two feature styles, since the
  decisions in section 0 keep both. (1) A *region* style (lakes): noise
  threshold picks candidate tiles, a bounded flood fill grabs the whole
  connected component, `smoothComponent` erodes it, a min-size check
  keeps/discards it - essentially today's `findComponents` pipeline, retained.
  (2) A *field-mask* style (rivers, decorations): the tile's membership is a
  pure function of world-space fields, evaluated per tile with no discovery
  step. Both write a per-tile feature **tag** (see below) plus a
  `groundType`, resolved by feature priority order per the doc's Level 4.
- **`src/world/generation/chunk-generator.ts`**: orchestrates the five
  levels explicitly over a padded working area, then crops to the visible
  16x16 - mirroring the doc's numbered "general flow" list.
- **Per-tile feature tag**: each tile carries a cheap enum
  (`none`/`lake`/`river`/`shore`/...) written during feature application,
  replacing today's retained `Feature` reference on `TileData`/`Tile`.
  Gameplay reads (`world.getDominantFeatureLabel`, the debug HUD) switch
  from `tile.feature?.name` to this tag. Nothing gameplay needs the full
  `Feature` instance for, so the tag is enough.
- **Chunk caching**: after generation, render the chunk once to an
  `OffscreenCanvas`, keep the resulting `ImageBitmap`, and have
  `Chunk.draw()` blit that image. Until that bitmap is ready, fall back to
  the current per-tile draw loop - determinism means the fallback and the
  cached image are pixel-identical, so there's no pop when the cache lands,
  and this sidesteps having to block generation on async sprite loads.
  `Chunk.getTile()` stays for gameplay logic (collision, feature-tag lookup
  at a position) and is decoupled from rendering entirely.
- **Carries forward largely unchanged**: the three `noise.ts` sampling
  primitives, the water dark/light rule (generalized to apply uniformly to
  any water tile regardless of which feature produced it, fixing 2.10),
  `BackgroundTileType`/sprite sheet plumbing, and `World`'s chunk
  load/unload/camera-buffer logic (orthogonal to generation internals).
- **Retired**: the `plains`/`wetPlains`/`lakePlains` three-way `Biome` enum
  (replaced by real biomes + per-feature field eligibility), the cross-chunk
  biome sampling inside `LakeFeature.isEligible` (replaced by a pure per-tile
  candidacy check), and `RiverFeature`'s chunk-local restriction. **Kept:**
  `Feature.floodFill`/`findComponents`/`smoothComponent` (lakes still use
  them, see section 0), and `lake-geometry.ts`'s `anchor`/`edgeTiles`/
  `centroid` ideas, now adopted for Phase 4's lake-aware river anchoring
  (a lake's edge tiles are the river seed points). The specific broken
  `lake-geometry.ts` file still gets rewritten to compile against the new
  model, but its shape helpers carry forward.

---

## 5. Suggested phased rewrite order

A semi-total rewrite is easier to keep the game runnable through if each
phase ends in a playable state, gradually building back up to (and past)
today's feature set, rather than doing all the architecture first and all
the content after. Each phase below bundles whatever new architecture it
needs with the content milestone it delivers.

### Phase 1: Plains grassland (parity with today, on the new architecture)

**Status: implemented.** `src/world/generation/` now holds `noise-field.ts`,
`field-registry.ts`, `biome.ts`, `plains-biome.ts`, `feature-tag.ts`, and
`chunk-generator.ts`; the old `terrain-generator.ts` and `features/` are
deleted. One deviation from this section as originally written: biome
matching didn't stay a separate `BiomeRule` object wrapping a plain `Biome`
value - `Biome` became an abstract class instead (`matches`/`getFields`/
`sampleBaseTerrain` as instance methods, `PlainsBiome` the first subclass),
since each biome needs to own its own fields (grass variant, later sand
variant, ...), not just report a match against a shared registry. Also added,
beyond this section's original scope: debug HUD counters for visible/loaded
chunk counts and latest/average chunk generation time, and a checkerboard
"not ready" placeholder tile drawn while a sprite bitmap is still loading.

Scope: a single Plains biome, grass variant patches, nothing else - visibly
the same as the current build, but built on the target architecture instead
of the current one.

- `NoiseField` abstraction (`ConstantField`, `ValueNoiseField`,
  `PerlinNoiseField`, `FbmField`), wrapping the existing `noise.ts`
  primitives.
- Debug noise-field visualiser: in debug mode, the settings dialog exposes a
  way to pick any installed `NoiseField` by name and render it as a
  greyscale/heatmap over the visible area. Cheap to build once fields are
  named objects, and it pays for itself immediately as the tuning tool for
  every later phase's thresholds (lake, river, moisture, ...). See section 4.
- `BiomeRule` scaffold with a single always-matches rule returning Plains -
  deliberately built now, even though there's only one biome, so adding
  Desert in Phase 5 is "add a rule", not "build the mechanism".
- Five-level pipeline scaffold in a new chunk generator, with Levels 3/4
  (feature masks/application) as no-ops for now.
- Chunk image caching (`ImageBitmap`/`OffscreenCanvas`), switching
  `Chunk.draw()` to blit a cached bitmap, with the current per-tile draw
  loop kept as the fallback until the bitmap is ready (determinism makes the
  two pixel-identical, so no pop). Worth doing early while the world is
  simplest and the draw path is easiest to reason about.
- `sampleGrassType`'s existing logic carries over close to unchanged,
  just rehomed as a `NoiseField`-backed visual variant rule.
- Per-tile feature tag on `TileData`/`Tile` (as `none` for now), replacing
  the retained `Feature` reference, so gameplay reads are ported once here
  rather than repeatedly as features land.

Zero padding: nothing here needs a tile's neighbours.

### Phase 2: Lakes

**Status: implemented.** `src/world/generation/lakes.ts` holds the whole
pipeline below (`createLakeFields`/`findLakeComponents`/`paintLakes`);
`ChunkGenerator.generate` calls it after base terrain, and gained a
`resolveBiomeAt` helper for the per-position biome vote. `FeatureTag`
widened to `"none" | "lake"`. Field thresholds/`MIN_SIZE` are first-guess
tuning values (see plan section 6), sanity-checked with a throwaway script
across several seeds (~1.5-2.7% of tiles came out as lake, spread over
~10-12% of sampled chunks, no discovered component came close to the
2304-tile cap) but not yet eyeballed in the actual running game.

New code informed by the deleted `LakeFeature`/flood-fill model, not an
in-place refactor: `src/world/features/` no longer exists in the tree after
Phase 1's cleanup (last present at `9f9a3b4`/`6cb35f2`, recoverable from git
history if useful as reference). Keeps the flood-fill + smooth + min-size
shape of the old design (see section 0) but re-drives candidacy from noise
and adds a whole-component biome gate that didn't exist before.

- Moisture/wetness/`lake_shape` fields as `NoiseField`s.
- **Candidacy** stays pure per-tile field thresholds, no biome involved -
  each of the three fields independently clears its own threshold. Keeping
  candidacy biome-agnostic avoids a per-tile biome check ever truncating a
  lake mid-shape (see the chunk-vs-tile biome-resolution note in section 0).
- **Discovery**: precompute the candidacy mask over the padded/capped
  working region up front, then run flood fill / connected-component
  labeling over that static mask (rather than sampling fields lazily as the
  frontier expands) from a candidate tile. Capped at 9 chunks
  (`9 * CHUNK_SIZE * CHUNK_SIZE` = 2304 tiles, needed for cross-chunk
  agreement); exceeding the cap rejects the component. No cross-call caching
  of discovered components - considered and rejected (no clean eviction
  story without a chunk-unload hook into the worker); redundant
  re-discovery of the same lake from neighbouring chunks is an accepted
  cost for now, revisit only if profiling shows it matters.
- `smoothComponent` erodes the fringe of the capped, accepted region into
  its final shape; min-size then keeps or discards it.
- **Core tiles**: within the final shape, tiles whose all 8 neighbours are
  also in the component. Computed once, reused for both the water
  light/dark rule and the biome vote below. A component with no core tiles
  (too thin/small to have an interior) is rejected outright, same bucket as
  failing min-size.
- **Biome gate, decided once per whole component, not per tile** (see
  section 0): majority-vote the core tiles' biome - each resolved at its
  own world position, not the chunk-wide `resolveBiome` shortcut
  `ChunkGenerator.generate` uses for base terrain - against an allowed-biome
  array (`["plains"]` for now, extensible). Majority in an allowed biome →
  accept the whole component, spill-over into a disallowed biome included;
  otherwise reject the whole component.
- Water light/dark rule as a single shared implementation (dark iff all 8
  neighbours are water - exactly the core-tile set above), driven off lake
  component membership - no padding needed because the whole component is
  in hand.
- Lake tiles get the `lake` feature tag.

Still zero padding: whole-region flood fill is the alternative to padding.

### Phase 3: Rivers (field masks, not yet lake-attached)

Basic river *shapes* only; the lake attachment that makes them "real" is
Phase 4. Rivers appearing independent of lakes at the end of this phase is an
intermediate dev state, not the final design (the final rule, Phase 4, is
that every river attaches to at least one lake).

- River field as a `NoiseField` (built on gradient noise, per section
  2.9's reasoning for why value noise doesn't work here).
- River discovered as a pure per-tile field mask sampled directly from
  world-space fields, so it crosses chunk boundaries freely - replacing
  `RiverFeature`'s chunk-local restriction. No flood fill for discovery.
- Smooth the mask; render river tiles with the `river` feature tag;
  wide-enough interiors darken via the shared water rule from Phase 2.
- Support thickness variation (some rivers thin by design, some thick).

### Phase 4: Rivers from lakes, terminus behaviour, and shorelines (highest-risk)

Split out on purpose - the subtlest part of the design. Goal: a river
visibly flowing out of a lake and, where it reaches one, into another lake,
looking natural.

- **Lake-aware anchoring** (chosen approach, see section 0): seed a river
  deterministically from a lake's edge tile (from the flood-filled lake's
  `edgeTiles`) and carve its path with the river field. The path is still
  field-carved, not a stored path object; the lake edge only supplies the
  start point. Every river attaches to at least one lake.
- **Terminus behaviour**: a river that doesn't reach a second lake fades out
  into wetland or splits into a few tiny streams that stop (delta-like). A
  river that does reach another lake merges into it.
- **Shorelines**: land here (first point water bodies reliably coexist to be
  adjacent to). Could move earlier if simpler than expected.
- **Padding** may finally be needed here for shoreline neighbour checks that
  can't be answered from a lake component or a pure point-sample - add it
  then, per section 0.
- Acceptance is visual, not a metric (see section 0). Approach details worth
  confirming before building.

### Phase 5: Deserts

- Temperature field as a `NoiseField` (moisture already exists from
  Phase 2).
- A second `BiomeRule` (high temperature + low moisture = Desert), added
  to the ordered list built in Phase 1 - this is the payoff for building
  the `BiomeRule` mechanism early instead of hardcoding Plains-only logic.
- Sand base terrain + sand variants, mirroring the grass variant pattern
  from Phase 1.
- Lake biome-gating already exists from Phase 2 (majority-vote against an
  allowed-biome array, currently `["plains"]`); Desert lands outside that
  list by default, so lakes won't centre in Desert unless oasis rules are
  added here to admit it - a one-line change to the allowed-biome array, not
  a new mechanism.

### Phase 6: Flora and other decorative features

- Small field-based decorative features per the doc's Level 5
  (flowers, small rocks, reeds, wet grass, tile edge transitions,
  deterministic-hash-per-tile cosmetic details).
- Any further named fields the doc mentions as future hooks (elevation,
  fertility, danger, magic) as needed once something actually consumes
  them - not built speculatively ahead of a feature that needs them.
- Marshes/wetlands, if wanted, as another field-based feature alongside
  lakes and rivers rather than a special case of either.

### Cleanup (ongoing, not a separate phase)

As each phase lands, remove what it superseded rather than leaving it
alongside the new code: the old `plains`/`wetPlains`/`lakePlains` `Biome`
enum states and the cross-chunk biome sampling in `LakeFeature` (after
Phase 2, noting the flood-fill machinery itself is kept), `lake-geometry.ts`
(resolved one way or another by the end of Phase 4), and the dangling
`plans/terrain-generation.md` comment references (repoint at this document,
any time).

---

## 6. Left to settle during implementation

The design questions are resolved (see section 0). What remains is tuning
and small calls best made against real output, not up-front decisions:

- **Smoothing strength** - one erosion pass vs several, and the neighbour
  threshold, tuned per feature against how the blobs actually look.
- **Field frequencies/thresholds** - lake, river, moisture, temperature.
  The debug noise-field visualiser (Phase 1) is the tool for this; the lake
  frequency in particular must stay small enough that real lakes fit under
  the 9-chunk cap.
- **River thickness and terminus** - how thickness varies across a river,
  and when a non-lake-reaching river fades into wetland vs splits into
  stopping streams. Confirm the lake-aware anchoring specifics before
  building Phase 4.
- **Padding, if/when introduced** - if shorelines (Phase 4) need neighbour
  data not answerable from a lake component or a pure point-sample, derive
  the padding width from the smoothing reach at that point (section 0).

