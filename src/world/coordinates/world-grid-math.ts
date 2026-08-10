import {CHUNK_SIZE} from "../chunks/chunk-size";
import type {ChunkCoordinate} from "./chunk-coordinate";

/** Inclusive tile coordinate bounds. */
export interface TileRange {
    startTileX: number;
    startTileY: number;
    endTileX: number;
    endTileY: number;
}

/** Converts a world tile coordinate into its containing chunk coordinate. */
export function tileToChunk(tileX: number, tileY: number, chunkSize = CHUNK_SIZE): ChunkCoordinate {
    return {
        chunkX: Math.floor(tileX / chunkSize),
        chunkY: Math.floor(tileY / chunkSize),
    };
}

/** Converts an inclusive world-pixel rectangle to an inclusive tile range. */
export function pixelRectToTileRange(x: number, y: number, w: number, h: number, tileSize: number): TileRange {
    return {
        startTileX: Math.floor(x / tileSize),
        startTileY: Math.floor(y / tileSize),
        endTileX: Math.floor((x + w - 1) / tileSize),
        endTileY: Math.floor((y + h - 1) / tileSize),
    };
}

/** Converts a world-pixel coordinate to the equivalent tile coordinate. */
export function pixelToTile(pixels: number, tileSize: number): number {
    return pixels / tileSize;
}

/** Converts a tile coordinate to the equivalent world-pixel coordinate. */
export function tileToPixel(tiles: number, tileSize: number): number {
    return tiles * tileSize;
}
