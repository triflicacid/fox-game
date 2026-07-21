import { writeFileSync } from "node:fs";
import { writePng } from "./png-writer.mjs";

/**
 * blits a row-major grid of rgba colors into a pixel buffer, expanding each
 * cell into a block x block square of pixels.
 *
 * @param {Buffer} sheet - destination rgba pixel buffer.
 * @param {number} sheetW - buffer width in pixels.
 * @param {(number[]|null)[]} gridColors - row-major grid of rgba colors; falsy entries are skipped.
 * @param {number} grid - number of cells per grid edge.
 * @param {number} block - pixels per grid cell.
 * @param {number} originX - destination x origin, in pixels.
 * @param {number} originY - destination y origin, in pixels.
 * @returns {void}
 */
export function blitGrid(sheet, sheetW, gridColors, grid, block, originX, originY) {
    for (let gy = 0; gy < grid; gy++) {
        for (let gx = 0; gx < grid; gx++) {
            const color = gridColors[gy * grid + gx];
            if (!color) continue;
            const [r, g, b, a] = color;
            for (let by = 0; by < block; by++) {
                const py = originY + gy * block + by;
                for (let bx = 0; bx < block; bx++) {
                    const px = originX + gx * block + bx;
                    const idx = (py * sheetW + px) * 4;
                    sheet[idx] = r;
                    sheet[idx + 1] = g;
                    sheet[idx + 2] = b;
                    sheet[idx + 3] = a;
                }
            }
        }
    }
}

/**
 * reads the png/descriptor output paths from the cli arguments.
 *
 * @param {string} scriptName - script filename, used in the usage message.
 * @param {string} defaultDescriptorPath - descriptor path used when the second argument is omitted.
 * @returns {{outPath: string, descriptorOutPath: string}} the resolved output paths.
 */
export function parseCliArgs(scriptName, defaultDescriptorPath) {
    const outPath = process.argv[2];
    const descriptorOutPath = process.argv[3] ?? defaultDescriptorPath;
    if (!outPath) throw new Error(`usage: node ${scriptName} <pngOutPath> [descriptorOutPath]`);
    return { outPath, descriptorOutPath };
}

/**
 * writes the sheet png and its json descriptor to disk.
 *
 * @param {string} outPath - png output path.
 * @param {string} descriptorOutPath - json descriptor output path.
 * @param {number} sheetW - sheet width in pixels.
 * @param {number} sheetH - sheet height in pixels.
 * @param {Buffer} sheet - sheet rgba pixel buffer.
 * @param {object} descriptor - json-serializable descriptor to write alongside the png.
 * @returns {void}
 */
export function writeSpriteSheet(outPath, descriptorOutPath, sheetW, sheetH, sheet, descriptor) {
    writePng(outPath, sheetW, sheetH, sheet);
    writeFileSync(descriptorOutPath, JSON.stringify(descriptor, null, 2) + "\n");
    console.log(`wrote sprite sheet descriptor to ${descriptorOutPath}`);
}
