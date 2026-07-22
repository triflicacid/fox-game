import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

/**
 * Computes the CRC32 checksum for a buffer.
 *
 * @param {Buffer | Uint8Array} buf - The data to compute the checksum for.
 * @returns {number} The unsigned 32-bit CRC32 checksum.
 */
function crc32(buf) {
    // build lookup table once
    let table = crc32.table;
    if (!table) {
        table = crc32.table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c >>> 0;
        }
    }

    // hash buffer
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}


/**
 * Creates a PNG chunk.
 * Writes the chunk length, type, data, and CRC32 checksum into a single
 * buffer.
 *
 * @param {string} type - The four-character PNG chunk type (for example,
 * `"IHDR"`, `"IDAT"`, or `"IEND"`).
 * @param {Buffer} data - The chunk payload.
 * @returns {Buffer} The complete encoded PNG chunk.
 */
function chunk(type, data) {
    // png chunk header
    const typeBuf = Buffer.from(type, "ascii");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);

    // crc covers type and data
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);

    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Writes an RGBA pixel buffer to a PNG file.
 *
 * Encodes the image as an 8-bit RGBA PNG by prepending each scanline with a
 * filter byte, compressing the pixel data with DEFLATE, assembling the
 * required PNG chunks, and writing the result to disk.
 *
 * @param {string} outPath - The path to write the PNG file to.
 * @param {number} width - The image width in pixels.
 * @param {number} height - The image height in pixels.
 * @param {Buffer} rgba - The raw RGBA pixel data in row-major order. Must
 * contain exactly `width * height * 4` bytes.
 */
export function writePng(outPath, width, height, rgba) {
    // prepend each row with filter type 0
    const rawRows = [];
    for (let y = 0; y < height; y++) {
        const row = Buffer.alloc(1 + width * 4);
        row[0] = 0;
        rgba.copy(row, 1, y * width * 4, (y + 1) * width * 4);
        rawRows.push(row);
    }

    // compress pixel data
    const raw = Buffer.concat(rawRows);
    const idatData = deflateSync(raw, { level: 9 });

    // build ihdr
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // 8 bits per channel
    ihdr[9] = 6; // rgba

    // assemble png
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const png = Buffer.concat([
        signature,
        chunk("IHDR", ihdr),
        chunk("IDAT", idatData),
        chunk("IEND", Buffer.alloc(0)),
    ]);

    writeFileSync(outPath, png);
    console.log(`wrote ${png.length} bytes to ${outPath} (${width}x${height})`);
}