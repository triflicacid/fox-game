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

## fox

`scripts/gen-fox-sprites.mjs`

Procedurally draws the top-down fox: an 8-direction, 8-frame walk cycle plus curl/uncurl/sleepTurn rows for its resting animations.

```
pnpm run spritesheet:fox
```

Re-run either after changing its script, then `pnpm run copy:static` to refresh the copy under `dist/web/static/`.
