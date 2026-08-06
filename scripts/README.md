# scripts

Sprite sheet generators. Each writes a PNG plus a matching JSON descriptor, no image editor or source art needed.

## background tiles

`scripts/gen-background-tile-sprites.mjs`

Procedurally generates tile textures from small weighted color palettes. Plains
terrain and normal lake water occupy the first sheet row; Desert terrain and
oasis water occupy the second.

```
pnpm run spritesheet:background
```

## water

`scripts/gen-animated-background-tile-sprites.mjs`

Same procedural approach as the background tiles, but each of the 4 water types (normal/oasis, light/dark) gets a 3-phase shimmer loop instead of one static texture - each phase salts the palette hash's seed so different cells roll the "shimmer" color, and each type carries its own playback speed (`frameIntervalMs`) in the descriptor.

```
pnpm run spritesheet:water
```

## fox

`scripts/gen-fox-sprites.mjs`

Procedurally draws the top-down fox: an 8-direction, 8-frame walk cycle plus curl/uncurl/sleepTurn rows for its resting animations.

```
pnpm run spritesheet:fox
```

Re-run either after changing its script, then `pnpm run copy:static` to refresh the copy under `dist/web/static/`.
