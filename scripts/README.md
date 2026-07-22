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

Re-run either after changing its script, then `pnpm run copy:static` to refresh the copy under `dist/web/static/`.
