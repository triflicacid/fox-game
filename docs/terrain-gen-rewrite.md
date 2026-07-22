# 2D Tile World Generation Ideas

I am planning a basic 2D game using TypeScript and HTML canvas.

The world is made from tiles and is split into chunks. Each chunk contains a fixed grid of tiles.

- Chunk size: 16x16 tiles
- Rendering target: canvas
- Generation style: deterministic, seed-based generation
- Terrain style: smooth, blob-like regions rather than noisy single-tile variation
- Feature style: based on noise fields, local rules, and smoothing

The main goal is performance.

Chunk generation should be pure and deterministic, based on a random world seed and world coordinates. Given the same seed and the same chunk coordinates, the generator should always produce the same result.

Once a chunk has been generated, it should be able to create an image bitmap or cached offscreen canvas of itself. During gameplay, the renderer can then simply blit the cached chunk image instead of regenerating or redrawing every tile every frame.

---

## Dynamic and Expandable Generation

Most generation behaviour should be modular and expandable rather than hardcoded.

The generation engine should be given collections of generation components, such as:

- noise fields
- biome rules
- terrain rules
- feature rules
- smoothing rules
- visual variant rules

For example, the generator may receive a list of NoiseField instances.

A NoiseField could represent:

- Perlin noise
- Simplex noise
- value noise
- domain-warped noise
- a derived field
- a constant field
- a combined field based on other fields

Each field should have a stable name so other systems can reference it.

Example NoiseField concepts:

- name: moisture
- type: PerlinNoiseField
- frequency: low
- octaves: configurable
- seed offset: moisture-specific

- name: temperature
- type: PerlinNoiseField
- frequency: low
- octaves: configurable
- seed offset: temperature-specific

- name: grass_variant
- type: PerlinNoiseField
- frequency: medium
- octaves: configurable
- seed offset: grass-specific

- name: wetness
- type: PerlinNoiseField
- frequency: low or medium
- octaves: configurable
- seed offset: wetness-specific

- name: lake_shape
- type: PerlinNoiseField
- frequency: low
- octaves: configurable
- seed offset: lake-specific

- name: river_field
- type: PerlinNoiseField or derived field
- frequency: configurable
- octaves: configurable
- seed offset: river-specific

The names temperature, moisture, wetness, grass_variant, lake_shape, and river_field are useful starting examples, but the generation engine should not require those exact fields unless the current biome or feature logic references them.

The important point is that new fields can be added without rewriting the whole generator.

For example:

- adding an elevation field could allow mountains, cliffs, or beaches
- adding a fertility field could affect vegetation density
- adding a danger field could affect enemy spawning
- adding a magic field could affect special terrain or rare features

Features should also be expandable. Each feature can inherit from a common feature base class or implement a shared feature interface.

A feature might define:

- its name
- its priority
- which biomes it can apply to
- which fields it samples
- whether it needs smoothing
- how much padding it requires
- how it modifies tiles
- how it resolves conflicts with other features

This allows the generator to be given a list of Feature instances and apply them in a deterministic order.

Features should not rely on global searches, flood fills, or BFS. They should be generated from fields and local smoothing rules.

---

## Chunk Generation

The world is split into chunks of tiles.

Each chunk is 16x16 tiles, but generation should not only consider those 16x16 tiles in isolation. Some generation rules depend on neighbouring tiles, so each chunk should be generated with extra sampling padding around it.

For example:

- visible chunk area: 16x16
- internal working area: larger than 16x16, such as 24x24 or 32x32

The final chunk stores and renders only the central 16x16 area, but the padded border is used for neighbour checks.

The padded working area is only a local sampling margin. It is not a limit on terrain or feature size.

This is important.

If a lake or river crosses a chunk boundary, it should not be cut off just because the current chunk only renders 16x16 tiles. The generator should be able to sample the same world-space fields in any chunk. Since lakes and rivers come from world-space noise fields, neighbouring chunks should independently reach the same result at shared borders.

Padding is used for local rules such as:

- cellular automata smoothing
- water colour checks
- shoreline checks
- grass variant smoothing
- local density checks
- visual transition tiles

Chunk generation should be pure:

- same seed + same chunk coordinate = same result
- no dependency on generation order
- no dependency on which chunks have already been generated
- no use of unseeded randomness

Once generated, the chunk should produce an image bitmap or cached offscreen canvas. During gameplay, the renderer should blit this cached chunk image.

---

## Important Note About Padding

The padded area is not where features are created.

Features are not created inside a temporary 32x32 area and then cut down to 16x16. That could cause visual problems if treated incorrectly.

Instead, all fields are sampled in world space.

For example, if a lake is generated from wetness and lake_shape fields, those fields exist across the whole world. A chunk only samples the part of the world that it needs.

The padding exists so that local rules can be evaluated correctly near chunk edges.

For example:

- a tile on the edge of a chunk needs neighbouring tiles to decide if it is dark water
- a smoothing rule needs surrounding tiles to decide whether a feature tile should remain
- a shoreline rule needs nearby water and land tiles

So the padded working area is a temporary evaluation area, not a boundary for terrain or features.

---

## Five Levels of Generation

Generation should be split into five levels:

1. Biome fields
2. Base terrain tiles
3. Feature masks
4. Feature application
5. Visual variants and derived appearance

This keeps each part of generation separate.

The general flow is:

1. Evaluate the noise fields needed for the tile or area.
2. Use biome rules to choose the biome.
3. Generate the base terrain for that biome.
4. Generate feature masks from fields.
5. Smooth feature masks using local cellular automata rules.
6. Apply features in a deterministic order.
7. Apply final visual choices, such as grass variation and water colour.
8. Render the final 16x16 chunk to a cached image.

---

## Level 1: Biome Fields

The world is split into biomes.

Biomes should be determined using smooth named fields. The initial planned setup uses at least two environmental fields:

- temperature
- moisture

These should be low-frequency noise fields so that biome regions are large and smooth.

To start with, there will be two biomes:

- Plains
- Desert

Example biome logic:

- high temperature + low moisture = Desert
- everything else = Plains

This gives a simple starting point while leaving room for more biomes later.

Possible future biomes could include:

- Forest
- Jungle
- Tundra
- Snow
- Wetlands
- Savanna
- Mountains

Using temperature and moisture from the beginning makes these easier to add later, but the engine should not hardcode those concepts. They are named fields provided to the generator.

For example:

- high temperature + high moisture = Jungle
- medium temperature + high moisture = Forest
- low temperature + high moisture = Tundra or Snow
- high temperature + low moisture = Desert
- medium temperature + medium moisture = Plains

Biome selection should be expandable. For example, the generator might contain a list of BiomeRule objects. Each BiomeRule can inspect the current field values and return whether it matches.

---

## Level 2: Base Terrain Tiles

After the biome is chosen, the generator chooses the base terrain tile.

Initial base terrain:

- Plains = grass
- Desert = sand

Plains have three grass variants:

- grass 1
- grass 2
- grass 3

The grass variants should not be selected randomly per tile. Random per-tile selection would create a noisy speckled look.

Instead, grass variants should be selected using a separate named noise field, such as grass_variant.

The grass_variant field should exist across the whole world, like any other noise field. However, it is only used when the current tile is in the Plains biome.

So conceptually:

1. Determine the biome for the tile.
2. If the biome is Plains, sample or use the grass_variant field.
3. Use that field value to choose grass 1, grass 2, or grass 3.
4. If the biome is not Plains, ignore the grass_variant field for that tile.

The grass field should not be generated separately per Plains region. It should be a normal world-space field.

This keeps grass patches:

- smooth
- deterministic
- chunk-safe
- independent of connected-region detection
- stable if biome borders change slightly

Example grass variant rule:

- biome: Plains
- field used: grass_variant
- low field values produce grass 1
- medium field values produce grass 2
- high field values produce grass 3

The same idea can later be used for:

- sand variants
- dirt variants
- snow variants
- stone variants
- decorative terrain variation

---

## Level 3: Feature Masks

After terrain is generated, the world generates features.

Features are extra structures or modifications placed on top of base terrain. They are generated from noise fields, biome conditions, local rules, and smoothing.

Features can depend on conditions such as:

- biome
- named field values
- temperature
- moisture
- wetness
- height or elevation, if added later
- noise thresholds
- seeded random values
- local density checks
- local neighbourhood rules

There should not be feature descriptors. Features should not be generated as explicit world objects with fixed positions and stored shapes.

Instead, each feature should be derived from world-space fields.

A feature may define:

- its id or name
- its priority
- whether it is enabled
- which fields it depends on
- which biomes it can appear in
- how much chunk padding it needs
- how it creates its mask
- what smoothing rules it uses
- how it applies itself to tiles

This allows new features to be added by creating new Feature classes and giving them to the generator.

---

## Field-Based Features

All features should be field-based.

Field-based features are generated directly from noise fields and local rules.

These are suitable for:

- grass detail patches
- flowers
- small rocks
- wet grass
- reeds
- ponds
- lakes
- rivers
- streams
- marshes
- local decorative clusters

A field-based feature has a condition set.

Example conditions:

- only generate in Plains
- only generate when moisture is above a threshold
- only generate when a wetness field is above a threshold
- only generate when a feature-specific field is above a threshold
- only keep the feature if enough nearby tiles also satisfy the same condition

For example, a pond or lake feature might have conditions such as:

- biome must be Plains
- moisture must be above a threshold
- wetness noise must be above a threshold
- lake_shape noise must be above a threshold
- after smoothing, the local region must remain dense enough

The important point is that the generator should avoid creating sporadic one-tile features unless that is intentionally desired.

---

## Cellular Automata Smoothing

Feature regions should be smoothed using cellular automata-style rules.

The purpose of smoothing is to remove tiny isolated fragments and create more natural blob-like shapes.

The basic idea:

1. First create a rough feature mask from noise.
2. For each tile, count how many neighbouring tiles also satisfy the feature condition.
3. Keep or remove the tile based on that count.
4. Optionally repeat this process for a small number of passes.

Example 3x3 rule:

- Look at the tile and its 8 neighbours.
- If enough of those 9 positions are part of the feature, keep the tile.
- Otherwise, remove it.

Example:

- if at least 5 out of 9 tiles in the 3x3 area are feature tiles, keep the tile
- otherwise, remove it

Example 5x5 rule:

- Look at the 25 tiles in a 5x5 area.
- If enough of those tiles are feature tiles, keep the tile.
- Otherwise, remove it.

Example:

- if at least 12 out of 25 tiles in the 5x5 area are feature tiles, keep the tile
- otherwise, remove it

These values should be configurable per feature or provided by the feature class itself.

This is not the same as flood filling or BFS. It does not try to discover the full connected region. It only looks at a small local neighbourhood.

This should be fast enough for chunk generation, especially because chunks are small.

Cellular automata smoothing is useful for:

- removing one-tile noise
- removing tiny two-tile fragments
- making feature edges smoother
- making blobs feel more organic
- keeping generation local and deterministic

Because smoothing depends on neighbours, chunks need padded generation areas. Without padding, smoothing near chunk borders could produce visible seams.

---

## Lakes

Lakes should be generated from noise fields and smoothing.

A lake is not an explicit descriptor or predefined object. A lake exists wherever the relevant world-space fields and smoothing rules produce water.

Initial lake conditions might include:

- biome must be Plains
- moisture field must be high
- wetness field must be high
- lake_shape field must satisfy a threshold
- smoothed local density must be high enough

The lake mask should be created from one or more smooth fields.

For example:

- moisture controls where lakes are likely
- wetness controls local water suitability
- lake_shape controls the actual blob shape
- optional elevation could later prevent lakes from appearing on high ground

The rough mask should then be smoothed using cellular automata.

This allows lakes to be:

- random
- organic
- irregular
- deterministic
- chunk-safe
- based on fields rather than explicit objects

The lake shape should not be circular or fixed. It should emerge from the combination of noise fields and smoothing.

To avoid sporadic tiny water patches, lake fields should generally be low-frequency or medium-frequency, and the mask should use local density rules.

Example lake mask logic:

- tile is in Plains
- moisture is above the lake moisture threshold
- wetness is above the lake wetness threshold
- lake_shape is above the lake shape threshold
- enough nearby tiles also satisfy the same rough lake condition
- after smoothing, the tile remains water

This produces blob-like water regions without needing flood fill.

---

## Lake Minimum Size

Avoid flood fills or connected-component checks for minimum lake size.

Instead, use local density and smoothing approximations.

For example:

- a candidate lake tile only survives if enough nearby tiles are also lake candidates
- a 3x3 or 5x5 local count can remove tiny fragments
- multiple smoothing passes can remove isolated shapes and strengthen larger blobs

This does not guarantee exact connected size, but it avoids expensive global algorithms.

The generator should aim to prevent tiny lakes by choosing good field frequencies and thresholds in the first place.

Use:

- lower-frequency lake fields for larger blobs
- local density checks to remove tiny fragments
- cellular automata smoothing to clean edges
- biome and moisture gates to keep lakes in suitable regions

---

## Rivers

Rivers should also be generated from noise fields and local rules.

They should not be generated from descriptors or explicit path objects.

A river can be represented by a river field that creates thin, continuous bands.

One possible river approach:

- sample a river_field noise value
- water appears where the river_field is close to a target value
- the allowed band width controls river thickness
- another field can affect river width, windiness, or branching
- moisture or wetness can control where rivers are more likely to appear

Example river mask logic:

- river_field is close to a target value
- biome allows rivers
- moisture or wetness is high enough
- optional river_strength field is above threshold
- local smoothing keeps the river coherent

A river field can produce vein-like or contour-like paths across the world.

To create different types of rivers, use additional fields:

- river_width field controls thickness
- river_activity field controls whether a river exists in an area
- river_branch field controls splitting or side streams
- river_windiness field can be used to distort sampling coordinates
- wetness field can make rivers more likely in wet regions

Rivers should be deterministic because all fields are sampled in world space.

---

## Rivers From Lakes

The ideal concept is that rivers come from lakes.

However, if everything is based on fields and smoothing, the generator should avoid needing to identify lake objects, flood fill lakes, or find exact lake shores.

Instead, river-lake relationships should be approximate and field-based.

Possible rule:

- lakes appear in high moisture and high wetness regions
- rivers appear in nearby or connected high wetness bands
- river fields are more likely to become active where wetness is high
- lake and river masks use related fields so they naturally intersect
- if a river mask touches a lake mask, it visually becomes a river flowing from or into that lake

This means rivers do not need to explicitly know which lake they came from.

The visual result can still be:

- lakes with zero rivers
- lakes with one river
- lakes with several rivers
- rivers passing through wet regions
- rivers widening into lakes
- smaller streams branching from main rivers

But this relationship is emergent from fields, not stored as explicit objects.

To encourage rivers to connect with lakes:

- use the same moisture and wetness fields for both systems
- make lakes appear in high wetness blobs
- make river activity stronger in high wetness regions
- allow river masks to override terrain into water
- allow river masks and lake masks to merge during feature application

This keeps the system deterministic, local, and field-based.

---

## Streams and Branching

Small streams can be generated using the same river logic with different thresholds.

For example:

- main rivers use a wider river_field threshold band
- streams use a narrower band
- streams require a weaker river_strength threshold
- streams can appear only where wetness is above a lower threshold

Branching can be approximated by combining multiple river fields.

For example:

- river_field_main creates large rivers
- river_field_secondary creates smaller streams
- river_field_tertiary creates tiny branches

The final river mask can be the union of these fields, with rules controlling which ones are active.

This can create the appearance of branching without needing pathfinding or graph generation.

---

## Level 4: Feature Application

Once feature masks have been generated and smoothed, features are applied to the base terrain.

Feature application changes the final tile.

Examples:

- lake mask changes grass to water
- river mask changes grass or sand to water
- flower mask adds a decorative overlay
- rock mask adds an obstacle or decoration
- wet grass mask changes grass appearance

Features should have a deterministic priority order.

Example priority order:

1. Base terrain
2. Lake water
3. River water
4. Wetland or shoreline terrain
5. Terrain details
6. Decorative overlays

If multiple features affect the same tile, the result should be consistent.

For example:

- water may override grass
- river water may merge with lake water
- decorations may appear on grass but not on water
- reeds may appear near water but not in deep water
- shoreline tiles may appear where water touches land

This priority system avoids unpredictable feature conflicts.

---

## Water Tiles

There are two types of water:

- light water
- dark water

Water colour is derived after water placement.

A water tile is dark if all 8 neighbouring tiles are also water.

The 8 neighbours are:

- north
- north-east
- east
- south-east
- south
- south-west
- west
- north-west

Rule:

- if all 8 neighbouring tiles are water, the tile is dark water
- otherwise, the tile is light water

This means:

- lake interiors become dark
- wide river interiors can become dark
- shores stay light
- thin rivers and edges stay light

This requires padded chunk generation because water colour for edge tiles depends on tiles outside the visible 16x16 chunk.

---

## Shorelines

Shorelines can be derived from water adjacency.

A land tile may become a shoreline tile if it is adjacent to water.

A water tile may use a shoreline edge variant if it has one or more neighbouring land tiles.

This should be determined locally using neighbouring tile checks.

Possible shoreline rules:

- land next to water becomes wet sand, mud, or shoreline grass
- water next to land remains light water
- water surrounded by water becomes dark water
- reeds may appear on suitable shoreline tiles
- decorative shore details may use deterministic per-tile randomness

Like water colour, shoreline logic requires padded chunk generation.

---

## Level 5: Visual Variants and Derived Appearance

The final generation level handles visual variation and derived tile appearance.

This includes things like:

- grass variant
- sand variant
- water colour
- water animation variant
- shoreline variant
- tile edge transitions
- decorative overlays
- small texture variation

Some visual variants should use smooth noise.

Examples:

- grass variant patches
- sand tone patches
- large ground colour variation

Some tiny visual details can use deterministic per-tile randomness.

Examples:

- a single flower decoration
- a pebble
- a tiny crack in sand
- a small grass tuft

The distinction is important:

- use smooth noise for terrain-like variation
- use deterministic hashes for tiny cosmetic details

Visual variation should never make the terrain look noisy unless that is the intended style.

---

## Deterministic Randomness

All randomness should be deterministic.

The world should generate the same way every time for the same seed.

Random values should be derived from stable inputs such as:

- world seed
- tile coordinate
- chunk coordinate
- generation layer name
- field name
- feature name

Avoid unseeded randomness.

For example, do not directly use normal runtime randomness for world generation, because then chunks may change depending on generation order or reload timing.

The generator should have separate deterministic random streams or seed offsets for different generation layers.

For example:

- biome noise
- moisture noise
- temperature noise
- grass variant noise
- wetness noise
- lake shape noise
- river field noise
- decoration placement

Keeping these separate helps avoid accidental changes where modifying one layer changes unrelated parts of the world.

---

## Performance

Performance is the main point.

The generator should avoid expensive global algorithms where possible.

Avoid:

- large flood fills
- BFS over large regions
- searching huge areas to find features
- global connected-component checks
- explicit feature graph generation
- per-frame terrain regeneration
- per-frame tile-by-tile rendering
- unnecessary object allocation for every tile
- repeated expensive noise calls when values can be cached

Prefer:

- pure deterministic generation
- chunk image caching
- offscreen rendering
- image bitmap blitting
- padded chunk generation
- low-frequency noise fields
- local cellular automata smoothing
- field-based feature masks
- local neighbourhood checks
- reusing arrays and buffers
- spreading chunk generation over multiple frames if needed

Local smoothing should be acceptable because chunks are small.

For example, even a 5x5 neighbourhood check over a padded chunk is much cheaper than a global search or flood fill over an unknown region.

The expensive part is not checking neighbours locally. The expensive part is allowing feature generation to become open-ended or dependent on scanning large world areas.

---

## Summary

The world is a deterministic, chunk-based 2D tile world.

Chunks are 16x16 tiles, but generation uses padded areas to avoid seams and support neighbour-based rules. This padding is only a local sampling margin, not a boundary for terrain or features.

Generation happens in five levels:

1. Biome fields
2. Base terrain tiles
3. Feature masks
4. Feature application
5. Visual variants and derived appearance

The generation engine should be dynamic and expandable. It should be given modular components such as NoiseField instances, biome rules, feature classes, smoothing strategies, and visual rules.

The initial biome setup uses temperature and moisture fields.

Initial biomes:

- Plains
- Desert

Initial terrain:

- Plains generate grass
- Desert generates sand
- Plains have three smooth grass variants

Grass variant selection uses a world-space grass_variant field. This field exists across the whole world but is only used for Plains tiles.

Features are based on world-space noise fields, local conditions, and cellular automata smoothing.

Lakes are generated from moisture, wetness, lake_shape, biome conditions, and smoothing.

Rivers are generated from river fields, wetness conditions, local masks, and smoothing.

Rivers may visually connect to lakes by using related fields and merging water masks, but the system should not rely on explicit lake objects, feature descriptors, flood fills, or pathfinding.

Water has two appearances:

- light water
- dark water

A water tile is dark only if all 8 neighbouring tiles are also water.

The overall goal is to produce smooth, natural-looking terrain while keeping generation deterministic, chunk-safe, expandable, and performant.
