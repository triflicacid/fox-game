# Terrain Generation Plan

_Last aligned with the codebase on 2026-07-26._

This document is the implementation plan for terrain generation. It supersedes
the earlier branch-history analysis that used to live here. The design goals in
`docs/terrain-gen-rewrite.md` still guide the work, but this plan records the
architecture that actually exists, deliberate deviations from that document,
and the remaining milestones.

The next milestone is **rare Desert oases**. Desert classification, terrain,
and biome-interior terrain depth are complete. Oases should now add rare,
Desert-specific water without weakening the shared climate model.

---

## 1. Goals and invariants

Terrain generation must remain:

- **Deterministic:** the same world seed and world tile coordinate always
  produce the same result.
- **Order-independent:** a chunk's result must not depend on which other chunks
  were generated first or are currently loaded.
- **World-space based:** fields and local rules use absolute tile coordinates,
  including for negative coordinates.
- **Seam-free:** independently generated neighbouring chunks agree at their
  shared edges, including after local smoothing and derived visual rules.
- **Expandable:** adding a biome or feature should not require rewriting the
  generator's control flow.
- **Bounded:** local generation work must have an explicit bound. Avoid
  open-ended searches and unbounded caches.
- **Inspectable:** every important named field should remain available to the
  debug field visualiser.

Visual quality, deterministic output, and seamless chunk boundaries are all
required.

---

## 2. Current implementation

### 2.1 Named noise fields

`src/world/generation/noise-field.ts` provides deterministic named fields:

- `ConstantField`
- `ValueNoiseField`
- `PerlinNoiseField`
- `FbmField`

`NoiseFieldRegistry` stores fields by stable name. The registry feeds the debug
noise-field overlay and allows generation concepts to be inspected without
hardcoding them into the renderer.

Current field ownership is mixed:

- `PlainsBiome` owns `grass_variant`.
- `LakeFeature` owns `moisture`, `wetness`, and `lake_shape`.

That is sufficient with one biome, but `moisture` must become a shared climate
field before Desert is introduced. Registering another field with the same name
currently replaces the previous entry silently, so shared fields must be
created once rather than duplicated by consumers.

### 2.2 Biomes and base terrain

`Biome` is an abstract class with:

- a stable `name`;
- `getFields()`;
- `matches(fieldValues)`;
- `sampleBaseTerrain(worldX, worldY, biomeDepth)`.

`resolveBiome` tries biome instances in order and returns the first match. The
list must end with a catch-all biome.

Only `PlainsBiome` exists today. It always matches and uses the world-space
`grass_variant` field to select `grass1`, `grass2`, or `grass3`.

`ChunkGenerator.generate()` currently resolves one biome for the whole chunk
with an empty field-value map. This works only because Plains always matches.
`resolveBiomeAt()` can classify an arbitrary world position, but today it is
used for feature biome checks rather than base-terrain selection.

A generated chunk also exposes one biome name for its debug label. That model
cannot accurately represent a chunk containing both Plains and Desert.

### 2.3 Feature application

`Feature` exposes `getFields()` and `apply()`. `ChunkGenerator` constructs base
terrain first, then applies configured features in deterministic list order.
Mask discovery, tile mutation, and visual derivation are currently allowed to
live inside one `Feature.apply()` call; the five conceptual levels from
`docs/terrain-gen-rewrite.md` are not separate runtime interfaces yet.

This simpler API is acceptable until two features need reusable masks or an
explicit conflict-resolution stage. Do not add abstractions solely to make the
code resemble the conceptual five-level diagram.

### 2.4 Lakes

`LakeFeature` is implemented in `src/world/generation/lakes.ts`.

Current behavior:

1. `moisture`, `wetness`, and `lake_shape` must independently clear their
   configured thresholds.
2. Candidate tiles are discovered with an 8-connected flood fill.
3. Discovery is capped at `9 * CHUNK_SIZE * CHUNK_SIZE` tiles. A component that
   exceeds the cap is rejected.
4. The raw component is eroded with two cellular-automata-style smoothing
   passes.
5. Components below `minSize` or without an interior core are rejected.
6. Core tiles are majority-voted by biome. Only components whose majority
   biome is in `allowedBiomes` are accepted.
7. Accepted local tiles receive `waterLight` or `waterDark` and either the
   `lake:shallow` or `lake:deep` feature tag.

Deep water is **not** currently the simple “all eight neighbours are water”
rule from `docs/terrain-gen-rewrite.md`. A tile must be away from the edge and
must clear a shore-distance-dependent `lake_shape` threshold. This intentional
current behavior produces patchy shallows inside lakes and is the baseline to
preserve unless a later visual review chooses otherwise.

### 2.5 Tile and render data

`TileData` stores the final `groundType` and a `FeatureTag`. Current feature
tags are:

- `none`
- `lake:shallow`
- `lake:deep`

Chunks retain tile data for gameplay/debug queries and cache their completed
terrain image for drawing. The per-tile draw path remains a fallback while the
cached image is unavailable.

### 2.6 Debug support

The debug UI can visualise registered noise fields and reports chunk state and
generation timing. Desert's `temperature`, shared `moisture`, and
`sand_variant` fields must be visible through the same mechanism.

---

## 3. Deliberate design decisions

These decisions override conflicting suggestions in
`docs/terrain-gen-rewrite.md`.

### 3.1 `Biome` subclasses, not separate `BiomeRule` objects

Biome matching and base-terrain selection stay on `Biome` subclasses. Ordered
first-match resolution already supplies rule priority. Desert will be placed
before the catch-all Plains biome.

### 3.2 Biomes are resolved per world tile

Desert/Plains borders must not follow chunk boundaries. For every output tile:

1. Sample only the fields needed for biome classification at its world
   coordinate.
2. Resolve the first matching biome.
3. Ask that biome to sample its base terrain at the same coordinate.

The biome result should be retained as a cheap per-tile `BiomeTag` (initially
`"plains" | "desert"`). Features and gameplay can then inspect the resolved
biome without repeating noise sampling.

The existing singular chunk biome label must be replaced with a debug summary,
for example the sole biome name when uniform and `mixed` when more than one
biome occurs. It must not remain authoritative generation data.

### 3.3 Climate fields are shared inputs

`moisture` already exists as a field owned by `LakeFeature`; it must be promoted
to a shared world climate field. `temperature` is the new companion climate
field required for Desert classification. Neither field should ultimately be
owned by one biome or feature.

`ChunkGenerator` should adopt the existing `moisture` configuration, create
`temperature`, register both once per seed, and pass the same field instances
to every consumer that needs them. Biomes may continue to own terrain-specific
fields such as `grass_variant` or `sand_variant`. Features may own feature-
specific fields such as `wetness` and `lake_shape`.

Use the current lake moisture seed/frequency as the initial shared-moisture
baseline so this refactor does not needlessly regenerate all lakes. Add a
separate seed offset for temperature. Thresholds remain tuning values and must
be inspected with the field visualiser rather than copied blindly from an
example.

The registry must be rebuilt or cleared when the seed is reset, and duplicate
field names should fail clearly unless the exact same shared instance is being
registered. Silent replacement makes generation depend on registration order.

### 3.4 Biome sampling must be narrow and bounded

The current `resolveBiomeAt()` samples every registered field, including fields
that biome matching does not use. Do not call that implementation once per base
terrain tile.

Add a climate-specific sampling path that samples only `temperature` and
`moisture`. Cache values only within one chunk-generation operation, or use an
explicitly bounded cache. The current generator-level position cache must not
grow indefinitely as new world positions are visited.

### 3.5 Lakes keep bounded component discovery

Lakes deliberately retain capped flood fill because the current design needs
whole-component minimum size, smoothing, biome voting, and shore distance. This
is a known divergence from the field-only recommendation in
`docs/terrain-gen-rewrite.md`.

The cap is a safety boundary, not a target lake size. Tuning must keep normal
components comfortably below it. Components exceeding it are rejected
consistently from every touching chunk.

### 3.6 Padding is introduced only with a consumer

Current lake rules inspect the discovered whole component, so they do not need
a separate padded chunk mask. Per-tile biome classification also needs no
padding.

A local smoothing or adjacency rule must declare its neighbourhood radius. If
it runs for multiple passes, its required halo is at least:

`kernel radius * number of dependent passes`

Introduce a reusable padded working area when rivers or shorelines first need
one. Never smooth only the visible 16x16 area.

### 3.7 Rivers begin as local field masks

The first river implementation will follow the local, field-based model:
world-space fields produce continuous bands, and lake and river water merge
when their independently derived masks touch.

The old requirement that every river must be explicitly anchored to a lake is
removed. It cannot be guaranteed by independent chunk generation without a
fully specified bounded ownership/search algorithm. If emergent intersections
look inadequate, evaluate such an algorithm as a separate design spike
before adding it to the production plan.

### 3.8 Feature precedence must be explicit

Before a second feature is added, define deterministic precedence. Initial
intent:

1. biome base terrain;
2. lake and river water masks, merged as water;
3. shoreline/wetland terrain derived from final water adjacency;
4. terrain details;
5. decorative overlays.

A single `FeatureTag` may be sufficient for mutually exclusive terrain
features, but overlays must not be forced into it later. Add a separate overlay
or detail layer when the first feature requires composition.

### 3.9 Oases are rare Desert water features

An oasis is not a normal lake with `desert` added to the lake allow-list.
Desert is selected from low moisture, so reusing the normal lake's high-
moisture candidacy would either produce no oases or weaken the meaning of the
climate fields.

Oases instead use dedicated deterministic world-space fields:

- `oasis_region`: a very low-frequency, high-threshold groundwater/suitability
  gate that makes eligible regions rare;
- `oasis_shape`: a somewhat higher-frequency field that shapes water inside an
  eligible region.

An oasis component is accepted only when the majority of its core tiles resolve
to Desert. Vote once for the whole component rather than gating every tile, so
an oasis can cross a biome border naturally instead of being cut off at it.

Oases reuse extracted bounded-component, smoothing, core, biome-vote, and
shore-distance utilities from lakes, but have their own configuration. They
should generally be smaller than lakes and use a lower component cap. Do not
copy the complete lake implementation into a second feature.

Oases should also be visually recognizable as oases rather than ordinary lake
water. Add dedicated `oasisWaterLight` and `oasisWaterDark` ground sprites with
a warmer/turquoise palette, plus `oasis:shallow` and `oasis:deep` feature tags.
The first oasis phase does not require palms, reeds, or a special shoreline;
those belong to the later shoreline/flora phases and can key off the oasis tag.

Rarity must be measured over Desert area, not guessed from a threshold. The
initial tuning target is:

- fewer than 1% of sampled Desert chunks touched by an oasis; and
- at least 20 times fewer accepted oasis components than accepted normal lake
  components over a sufficiently large fixed-seed sample.

These are initial visual-tuning targets, not permanent gameplay constants.
Record the seed set, sampled area, and measured rates whenever thresholds are
changed.

---

## 4. Roadmap

### Phase 1: Climate fields and Desert

**Status: complete.**

#### 1.1 Promote moisture and add temperature

- Move the existing named low-frequency `moisture` field out of
  `LakeFeature` without changing its seed offset, frequency, octaves, or
  sampling behavior.
- Add the new named low-frequency `temperature` field.
- Register each climate field exactly once.
- Inject shared `moisture` into `LakeFeature`; keep `wetness` and `lake_shape`
  feature-owned.
- Reset the field registry and position caches cleanly when changing seed.
- Ensure both climate fields appear in the debug visualiser; the Desert step
  adds `sand_variant` separately.

#### 1.2 Resolve and retain a biome per tile

- Add `BiomeTag = "plains" | "desert"` to generated tile data.
- For each world tile, sample the climate fields, resolve its biome, and sample
  that biome's base terrain.
- Use the retained tag for local feature checks where possible.
- Keep arbitrary-position biome resolution for lake tiles outside the current
  chunk, but make its cache operation-scoped or bounded.
- Replace the singular chunk biome assumption with a uniform/mixed debug
  summary.
- Verify borders crossing all four chunk edges and negative chunk coordinates.

#### 1.3 Add Desert terrain and assets

Sand sprites do not exist yet. Add them before returning sand tile types:

- Extend `scripts/gen-background-tile-sprites.mjs` with three visually related
  sand variants.
- Regenerate `static/background-tile-sprites.png` and
  `static/background-tile-sprites.json`.
- Extend `BackgroundTileType` with `sand1`, `sand2`, and `sand3`.
- Add `DesertBiome` with its own world-space `sand_variant` field.
- Match Desert from configurable high-temperature/low-moisture thresholds.
- Register Desert before catch-all Plains.
- Tune field frequencies and thresholds using the debug visualiser so regions
  are broad, smooth, and common enough to find without dominating the world.

Do not use `dirt` as the permanent Desert placeholder; that would hide missing
asset work and make visual acceptance ambiguous.

#### 1.4 Desert/lake interaction

The existing lake vote allows only `plains`. Preserve that default: a lake may
spill across a Desert border when the majority of its core is Plains, but a
lake whose core majority is Desert is rejected.

This phase does not add oases. Phase 3 adds them with separate fields and
Desert-specific criteria rather than simply allowing every lake in Desert.

#### Phase 1 acceptance criteria

- A chunk may contain both Plains and Desert without a chunk-edge cutoff.
- Every tile's base terrain agrees with its retained biome tag.
- Desert is selected only when its climate rule matches; Plains remains the
  fallback.
- Grass and sand variants form deterministic world-space patches.
- Shared edges are identical regardless of chunk generation order.
- Negative and positive coordinates behave consistently.
- Existing lake geometry is unchanged by the moisture ownership refactor for
  fixed seeds, except where the new Desert biome gate intentionally rejects a
  component.
- Field names are unique and all expected fields are debug-visible.

### Phase 2: Biome-interior terrain depth

**Status: complete.**

The implemented default caps depth at 8 tiles and classifies a 9-tile halo,
so each chunk uses a bounded 34x34 biome mask. Border depths use 8-connectivity
and start at 1. The first two rings are hard light-only bands; intermediate
rings allow light/medium sprites with at most 0.75 tile of world-space noise
perturbation; capped depth allows medium/dark sprites with a 0.5 noise split.

Sprite palettes were audited rather than ordered by numeric suffix:

- Plains light/medium/dark: `grass2`, `grass1`, `grass3`;
- Desert light/medium/dark: `sand2`, `sand1`, `sand3`.

`ChunkGenerator` accepts validated depth tuning, owns padded classification and
distance orchestration, and shares the tuning with both biome samplers. Tests
cover capped/diagonal transforms, exact padded work, negative/positive chunk
edges, both biome mappings, and generation-order independence.

Grass and sand variants currently come from biome-owned world-space noise.
Retain that variation, but make colour depth primarily reflect how far a tile
is inside its biome. The darkest grass and sand variants must be reserved for
biome interiors rather than appearing directly beside a biome border.

#### 2.1 Add bounded padded biome classification

- Add a configurable maximum terrain-depth radius in tiles. This radius is
  both the visual depth cap and the generation-work bound.
- For each generated chunk, classify a padded biome mask covering the output
  chunk plus a halo of `maximumDepthTiles + 1`. The extra tile lets a border
  cell at the outer measurable radius inspect its unlike neighbour.
- Classify every padded position from absolute world coordinates using the
  shared climate fields and normal ordered biome resolution.
- Reuse operation-scoped classification results where positions overlap the
  output chunk or feature checks. Do not add a world-lifetime position cache.
- Never infer biome depth from loaded chunks or chunk biome summaries; those
  are too coarse and would make output depend on runtime loading state.

#### 2.2 Compute capped distance from biome borders

- Mark every padded cell with an 8-connected neighbour of another biome as a
  biome-border cell.
- Run a multi-source breadth-first distance transform from all border cells,
  propagating only through cells with the same biome tag.
- Stop propagation at the configured maximum depth. A tile not reached before
  the cap is treated as fully interior; the complete biome must never be flood
  filled.
- Read distances only for the central output chunk. The halo must make the
  capped result identical when neighbouring chunks generate independently,
  including at corners and negative coordinates.
- Keep work proportional to the padded mask area:
  `(CHUNK_SIZE + 2 * (maximumDepthTiles + 1))²`.

#### 2.3 Select terrain variants from depth and noise

- Pass the capped biome depth into the resolved biome's base-terrain sampler.
  `ChunkGenerator` owns mask/distance orchestration; biome classes own the
  mapping from depth and their variant field to sprites.
- Audit the existing grass and sand sprites and define explicit light,
  medium, and dark ordering rather than assuming numeric suffixes encode
  brightness.
- Near a biome border, allow only the light variant. At intermediate depth,
  allow light and medium variants. At full interior depth, allow medium and
  dark variants.
- Continue sampling `grass_variant` and `sand_variant` in world space to choose
  among the variants allowed at that depth. Noise may soften transitions, but
  it must never select the darkest variant below its hard minimum depth.
- Tune depth thresholds and a small bounded noise perturbation so colour
  changes do not form obvious parallel contour bands.
- Apply lakes and later features after biome base terrain has been selected, as
  they are today.

#### Phase 2 acceptance criteria

- Dark grass and dark sand never occur within the configured border exclusion
  depth.
- Both biomes become progressively darker toward their interiors without
  losing deterministic local texture variation.
- No colour-depth seam appears at a chunk edge or corner, regardless of chunk
  generation order.
- Results agree at positive and negative world coordinates.
- Runtime work and temporary memory are bounded by the padded mask dimensions,
  not by total biome size.
- Existing biome tags, climate matching, and lake acceptance behavior are
  unchanged.

### Phase 3: Rare Desert oases

Start after Desert classification, biome-interior terrain depth, sand terrain,
and per-tile biome tags are stable.

#### 3.1 Extract reusable water-component utilities

- Extract the bounded 8-connected component discovery, smoothing, core-tile
  detection, shore-distance calculation, and component-level biome vote from
  `lakes.ts`.
- Keep feature-specific fields, thresholds, accepted biomes, size bounds,
  depth rules, sprites, and tags in each feature's configuration.
- Preserve normal lake output exactly for fixed seeds while extracting the
  shared mechanics.
- Keep all searches explicitly capped and all temporary caches scoped to one
  generation operation.

#### 3.2 Add oasis fields and acceptance rules

- Add named `oasis_region` and `oasis_shape` fields with independent seed
  offsets.
- Require both fields to clear configured thresholds before a tile is a raw
  candidate.
- Smooth and size-check the discovered component using oasis-specific values.
- Reject components without a core or whose core-tile majority is not Desert.
- Give oases a smaller safety cap and expected size range than normal lakes;
  tune the fields so accepted components remain comfortably below that cap.
- Do not require high shared `moisture`: the dedicated oasis fields represent
  rare groundwater inside an otherwise dry climate.

#### 3.3 Add distinct oasis appearance

- Extend `scripts/gen-background-tile-sprites.mjs` with
  `oasisWaterLight` and `oasisWaterDark` tiles using a distinct but compatible
  water palette.
- Regenerate `static/background-tile-sprites.png` and
  `static/background-tile-sprites.json`.
- Extend `BackgroundTileType` with both oasis water types.
- Extend `FeatureTag` with `oasis:shallow` and `oasis:deep`.
- Use the same documented shore-distance/depth model as lakes initially, with
  oasis-specific thresholds available if visual tuning needs them.
- When normal lake and oasis masks overlap at a biome transition, union them as
  water. Preserve a deterministic owner/tag for the tile; prefer the normal
  lake on Plains-majority components and the oasis on Desert-majority
  components. Never let feature application order decide accidentally.

#### Phase 3 acceptance criteria

- Oases occur only as Desert-majority components, but may spill naturally over
  a Desert/Plains boundary.
- Oases are deterministic, order-independent, and seamless across chunk edges
  and corners, including at negative coordinates.
- Fewer than 1% of Desert chunks in the documented tuning sample touch an
  oasis.
- Accepted oasis components are at least 20 times rarer than accepted normal
  lake components in the same fixed-seed survey.
- The survey still finds at least 10 accepted oases, proving the rarity target
  was not met by making oasis generation effectively impossible.
- No accepted oasis approaches its safety cap under the tuned field settings.
- Oasis water is visually distinct from normal water without being confused
  with sand or shallow normal lake water.
- Normal lake tile output remains unchanged by the shared-utility extraction.
- All oasis fields are available in the debug field visualiser.

### Phase 4: Stabilise the existing lake implementation

Start only after the preceding Desert, biome-depth, and oasis phases are
complete.

- Profile repeated discovery of one lake from neighboring chunks before adding
  any cache. Do not add a cross-chunk component cache without a bounded
  lifetime and invalidation strategy.
- Visually tune thresholds, smoothing passes, minimum size, shore-distance
  depth thresholds, and occurrence rate across a documented seed sample.
- Decide whether patchy deep water remains the desired rule. If replacing it
  with the all-eight-neighbours rule, change code, tags, and this plan together.
- Keep `lake:shallow` and `lake:deep` as the canonical current tags.
- Record measured component-size distributions and ensure accepted lakes stay
  comfortably below the cap.

#### Phase 4 acceptance criteria

- No accepted lake differs across chunks that independently discover it.
- No lake is cut at a chunk boundary.
- Cap-exceeding components are rejected consistently.
- Lake occurrence and size are visually useful across a repeatable seed set.
- Desert-majority lake components remain rejected.
- Generation time and allocation are measured before and after any
  optimization.

### Phase 5: Field-based rivers

Implement basic river shapes without explicit lake anchoring.

- Add named fields for river shape and, only if needed by visible output,
  activity and width.
- Derive membership from absolute world coordinates without flood fill.
- Use a bounded local smoothing rule whose halo is derived from its kernel and
  pass count.
- Add `river:shallow` and `river:deep` tags only if gameplay needs to
  distinguish river depth; otherwise prefer a single `river` tag and derive
  appearance from the final merged water mask.
- Merge lake and river masks before deriving final water appearance.
- Define whether water can cross Desert freely or whether climate affects
  river activity. Do not truncate a river merely because one tile changes
  biome.
- Inspect thin, thick, and branching cases without relying on path objects.

#### Phase 5 acceptance criteria

- A river crossing a chunk boundary has no width, smoothing, color, or tag
  discontinuity.
- River output is independent of chunk generation order.
- Wide interiors and thin edges follow one documented water-appearance rule.
- Lake/river overlap produces one coherent water body.
- Smoothing work is bounded by the declared halo.

### Phase 6: Shorelines and derived water appearance

Build shorelines only after the combined lake/river mask exists.

- Introduce the reusable padded working area required by adjacency rules.
- Derive shoreline land from the final water mask, not separately from each
  water feature.
- Keep water adjacent to land shallow/light according to the chosen water
  appearance rule.
- Define behavior at Plains/Desert boundaries: for example, wet grass/mud on
  Plains and wet sand on Desert.
- Give oasis-adjacent Desert shoreline a distinct treatment only if the normal
  wet-sand shoreline does not make the oasis readable enough.
- Apply shoreline results after water merging and before decorations.
- Add transition assets and sprite types as part of this phase, not as hidden
  placeholders.

#### Phase 6 acceptance criteria

- Shorelines agree across every chunk edge and corner.
- Diagonal adjacency behavior is explicitly chosen and documented.
- Shoreline terrain reflects the underlying biome.
- No shoreline overwrites water or appears away from water.

### Phase 7: River/lake relationship design spike

Only run this phase if field-based rivers do not connect to lakes often enough
or do not look intentional.

Compare bounded deterministic alternatives:

1. Correlate river activity with shared moisture/wetness so intersections are
   emergent but more frequent.
2. Distort river fields toward locally sampled wetness gradients.
3. Introduce deterministic lake-edge anchors with an explicit maximum search
   radius and reproducible ownership rule.

An anchor proposal is not ready for implementation until it defines:

- how a chunk finds anchors outside its visible area;
- the maximum search/work bound;
- stable river identity and ownership;
- how neighboring chunks reproduce the same segment;
- behavior when no valid continuation exists;
- termination and branching rules;
- precedence when reaching another lake.

Do not store mutable global river paths or make results depend on already
loaded chunks.

### Phase 8: Flora and terrain details

- Add field-based clusters such as reeds, flowers, rocks, and wet grass.
- Add oasis-specific palms, reeds, or lush ground here; derive eligibility from
  oasis-water adjacency and deterministic fields rather than placing mutable
  decorations as part of oasis discovery.
- Use smooth fields for terrain-scale patches.
- Use deterministic coordinate hashes for isolated cosmetic details.
- Keep overlays separate from the mutually exclusive terrain feature tag when
  composition is required.
- Declare biome restrictions and feature precedence for every addition.
- Add fields such as fertility or elevation only when a concrete feature
  consumes them.

---

## 5. Definition of done for every phase

A phase is complete only when:

- its architectural decisions are reflected in this plan;
- deterministic behavior, seamless edges, and negative coordinates have been
  checked in the running output;
- debug field visibility is preserved;
- required sprite assets and type definitions are committed together;
- stale APIs and comments superseded by the phase are removed;
- output has been inspected across the documented visual seed set;
- performance has been measured when the phase adds neighborhood work or
  repeated field sampling.

Tuning values may continue to evolve, but their location, purpose, and safe
bounds must be documented next to the implementation.
