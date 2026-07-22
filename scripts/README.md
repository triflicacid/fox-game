# scripts

Sprite sheet generators. Each writes a PNG plus a matching JSON descriptor, no image editor or source art needed.

## background tiles

`scripts/gen-background-tile-sprites.mjs`

Procedurally generates a row of tile textures (grass, dirt, gravel, water) from small weighted color palettes.

```
node scripts/gen-background-tile-sprites.mjs static/background-tile-sprites.png static/background-tile-sprites.json
```

## fox

`scripts/gen-fox-sprites.mjs`

Procedurally draws the top-down fox: an 8-direction, 8-frame walk cycle plus curl/uncurl/sleepTurn rows for its resting animations.

```
node scripts/gen-fox-sprites.mjs static/fox-sprites.png static/fox-sprites.json
```

## anthropomorphic fox

`scripts/gen-anthro-fox-sprites.mjs`

Procedurally draws the upright fox with connected neck/chest fur, eight directional idle poses, and an eight-frame walk cycle for each direction. The layout mirrors the directional rows in `fox-sprites.json`.

```
node scripts/gen-anthro-fox-sprites.mjs static/fox-anthro-sprites.png static/fox-anthro-sprites.json
node scripts/validate-anthro-fox-sprites.mjs
```

For a deliberately rough, low-resolution version of only the standalone front pose (not the spritesheet):

```
node scripts/gen-anthro-fox-low-res.mjs static/fox-anthro-low-res.png
```

Re-run a generator after changing its script, then `pnpm run copy:static` to refresh the copy under `dist/web/static/`.
