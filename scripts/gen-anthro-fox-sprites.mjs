import { parseCliArgs, writeSpriteSheet } from "./lib/sprite-sheet.mjs";
import { writePng } from "./lib/png-writer.mjs";
import { DIRECTIONS } from "./anthro-fox-sprites/poses.mjs";
import { buildSheet } from "./anthro-fox-sprites/sheet.mjs";

// Construct pixels and descriptor together so their dimensions and row offsets
// cannot drift independently.
const { sheetW, sheetH, sheet, descriptor, idles } = buildSheet();

// Follow the same explicit output-path CLI contract as the other generators.
const { outPath, descriptorOutPath } = parseCliArgs("gen-anthro-fox-sprites.mjs", "static/fox-anthro-sprites.json");
writeSpriteSheet(outPath, descriptorOutPath, sheetW, sheetH, sheet, descriptor);

// Keep the historical standalone front-facing asset reproducible as well.
const standalonePath = outPath.replace(/-sprites\.png$/u, ".png");
if (standalonePath !== outPath) writePng(standalonePath, descriptor.cellWidth, descriptor.cellHeight, idles.S);
console.log("row order:", DIRECTIONS.join(", "));

