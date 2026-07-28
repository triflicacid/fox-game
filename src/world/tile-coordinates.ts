/** Converts a world-pixel coordinate to the equivalent tile coordinate. */
export function pixelToTile(pixels: number, tileSize: number): number {
    return pixels / tileSize;
}

/** Converts a tile coordinate to the equivalent world-pixel coordinate. */
export function tileToPixel(tiles: number, tileSize: number): number {
    return tiles * tileSize;
}
