/**
 * A single square tile within a {@link Chunk}. Currently just a flat-coloured
 * square; this will later carry terrain/biome data instead of a raw colour.
 */
export class Tile {
    /**
     * @param color - CSS colour string this tile is filled with.
     */
    public constructor(public readonly color: string) {
    }

    /**
     * Draws this tile as a filled square.
     *
     * @param ctx - Canvas context to draw into.
     * @param x - Left edge of the tile, in canvas pixels.
     * @param y - Top edge of the tile, in canvas pixels.
     * @param size - Width/height of the tile, in canvas pixels.
     */
    public draw(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
        ctx.fillStyle = this.color;
        ctx.fillRect(x, y, size, size);
    }
}
