import { parseCliArgs, writeSpriteSheet } from "./lib/sprite-sheet.mjs";
import { buildSheet, ROWS } from "./fox-sprites/sheet.mjs";

const { sheetW, sheetH, sheet, descriptor } = buildSheet();
const { outPath, descriptorOutPath } = parseCliArgs("gen-fox-sprites.mjs", "static/fox-sprites.json");
writeSpriteSheet(outPath, descriptorOutPath, sheetW, sheetH, sheet, descriptor);
console.log("row order:", ROWS.join(", "));
