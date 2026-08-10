import type {ChunkCoordinate} from "../coordinates/chunk-coordinate";

/** Inclusive chunk coordinate bounds. */
export interface ChunkRange {
    startChunkX: number;
    startChunkY: number;
    endChunkX: number;
    endChunkY: number;
}

export const DEFAULT_CHUNK_BUFFER = 2;

/** Computes the inclusive chunk range covered by a camera view rectangle. */
export function visibleChunkRange(
    viewX: number,
    viewY: number,
    viewWidth: number,
    viewHeight: number,
    chunkPixelSize: number,
): ChunkRange {
    return {
        startChunkX: Math.floor(viewX / chunkPixelSize),
        startChunkY: Math.floor(viewY / chunkPixelSize),
        endChunkX: Math.floor((viewX + viewWidth) / chunkPixelSize),
        endChunkY: Math.floor((viewY + viewHeight) / chunkPixelSize),
    };
}

/** Expands a chunk range by a symmetric buffer in every direction. */
export function bufferChunkRange(range: ChunkRange, buffer = DEFAULT_CHUNK_BUFFER): ChunkRange {
    return {
        startChunkX: range.startChunkX - buffer,
        startChunkY: range.startChunkY - buffer,
        endChunkX: range.endChunkX + buffer,
        endChunkY: range.endChunkY + buffer,
    };
}

/** Lower values are more urgent: Manhattan distance from the focus point in chunk-space. */
export function chunkGenerationPriority(
    coordinate: ChunkCoordinate,
    focusX: number,
    focusY: number,
    chunkPixelSize: number,
): number {
    const dx = (coordinate.chunkX + 0.5) - focusX / chunkPixelSize;
    const dy = (coordinate.chunkY + 0.5) - focusY / chunkPixelSize;
    return Math.abs(dx) + Math.abs(dy);
}

/** Iterates every coordinate in an inclusive chunk range. */
export function* coordinatesInRange(range: ChunkRange): IterableIterator<ChunkCoordinate> {
    for (let chunkY = range.startChunkY; chunkY <= range.endChunkY; chunkY++) {
        for (let chunkX = range.startChunkX; chunkX <= range.endChunkX; chunkX++) {
            yield {chunkX, chunkY};
        }
    }
}

/** True when the given chunk coordinate is outside the inclusive chunk range. */
export function isOutsideChunkRange(chunkX: number, chunkY: number, range: ChunkRange): boolean {
    return chunkX < range.startChunkX || chunkX > range.endChunkX
        || chunkY < range.startChunkY || chunkY > range.endChunkY;
}

