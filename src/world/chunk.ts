import {Tile} from "./tile";
import {ChunkSpriteSheets} from "./chunk-sprite-sheets";
import {DEBUG_CONFIG} from "../debug/debug-config";
import {CHUNK_SIZE} from "./chunk-size";
import {ChunkGenerationResult} from "./generation/chunk/chunk-worker-protocol";
import {BiomeSummary} from "./generation/biome/biome";
import {StructurePieceInstance} from "./generation/structure/structure";
import {StructureLayer} from "./generation/structure/structure-manifest";
import {CoordMap} from "./coord-set";
import {requireNonNull} from "../util";

export type {ChunkSpriteSheets};
export {CHUNK_SIZE};

/** Fill colour for a chunk that hasn't finished generating yet. */
const PENDING_COLOR = "#000000";

/**
 * A fixed-size square region of the world, made up of `CHUNK_SIZE x
 * CHUNK_SIZE` {@link Tile}s. Chunks are generated on demand by {@link World}
 * (on a background worker - see `ChunkWorkerClient`) and identified by their
 * integer chunk coordinates.
 */
export class Chunk {
    /** Empty until {@link hydrate} resolves - see {@link isReady}. */
    private tiles: Tile[][] = [];

    /** Rendered once every tile's sprite has loaded. `null` until then, during which {@link draw} falls back to a per-tile loop. */
    private cachedBitmap: ImageBitmap | null = null;

    /** Decorative structure pieces (e.g. tree trunks/leaves) touching this chunk. Empty until {@link hydrate} resolves. */
    private structurePieces: StructurePieceInstance[] = [];

    /** Rendered once every foreground-layer piece's sprite has loaded. `null` until then (or while there are none), during which {@link drawProps} draws nothing. */
    private cachedPropsBitmap: ImageBitmap | null = null;

    /** Bitmap per distinct structure sprite type this chunk uses - populated once in {@link hydrate}, before either cache is built. */
    private readonly structureBitmaps = new Map<string, ImageBitmap>();

    /** Structure piece at each occupied world position - see {@link drawStructureOutlines} and {@link getStructurePieceAt}. Populated once in {@link hydrate}. */
    private readonly structureOccupancy = new CoordMap<StructurePieceInstance>();

    /** Dominant biome or `mixed`, for debugging only. Empty until {@link isReady}. */
    public biomeSummary: BiomeSummary | "" = "";

    /** How long generation took for this chunk, in milliseconds. `0` until {@link isReady}. */
    public generationTimeMs = 0;

    /**
     * @param chunkX - This chunk's X coordinate, in chunk units (not tiles/pixels).
     * @param chunkY - This chunk's Y coordinate, in chunk units (not tiles/pixels).
     * @param generation - Resolves with this chunk's generated biome/tile data once the worker responds.
     * @param spriteSheets - Shared sprite sheets this chunk's tiles/props resolve their bitmaps from.
     * @param tileSize - Width/height a tile renders at, in canvas pixels - fixed for the `World` this chunk belongs to, so {@link cacheBitmap} can size its offscreen canvas once.
     */
    public constructor(
        public readonly chunkX: number,
        public readonly chunkY: number,
        generation: Promise<ChunkGenerationResult>,
        spriteSheets: ChunkSpriteSheets,
        tileSize: number,
    ) {
        void this.hydrate(generation, spriteSheets, tileSize);
    }

    /**
     * Populates this chunk's biome/tile data once `generation` resolves,
     * then caches its bitmap. If `generation` rejects (the worker was
     * terminated before responding, e.g. from a world seed change), this
     * chunk is left permanently un-generated.
     *
     * @param generation - Resolves with this chunk's generated biome/tile data.
     * @param spriteSheets - Shared sprite sheets this chunk's tiles resolve their bitmaps from.
     * @param tileSize - Width/height a tile renders at, in canvas pixels.
     */
    private async hydrate(generation: Promise<ChunkGenerationResult>, spriteSheets: ChunkSpriteSheets, tileSize: number): Promise<void> {
        let result: ChunkGenerationResult;
        try {
            result = await generation;
        } catch {
            return;
        }

        this.biomeSummary = result.biomeSummary;
        this.generationTimeMs = result.generationTimeMs;
        this.tiles = result.tiles.map((row) => row.map((data) => new Tile(data, spriteSheets)));
        this.structurePieces = result.props;
        for (const piece of this.structurePieces) {
            this.structureOccupancy.set(piece.worldX, piece.worldY, piece);
        }

        const distinctSprites = [...new Set(this.structurePieces.map((piece) => piece.sprite))];
        await Promise.all(distinctSprites.map(async (sprite) => {
            this.structureBitmaps.set(sprite, await spriteSheets.getStructureSpriteBitmap(sprite));
        }));

        await Promise.all([this.cacheBitmap(tileSize), this.cachePropsBitmap(tileSize)]);
    }

    /**
     * Whether this chunk has finished generating.
     *
     * @returns `true` once this chunk's biome/tile data is populated.
     */
    public isReady(): boolean {
        return this.tiles.length > 0;
    }

    /**
     * Renders this chunk once to an offscreen bitmap so {@link draw} can blit
     * it instead of redrawing every tile every frame. Background-layer
     * structure pieces are painted on top of the ground tiles within this
     * same cache, so they merge into it rather than needing their own pass.
     *
     * @param tileSize - Width/height a tile renders at, in canvas pixels.
     */
    private async cacheBitmap(tileSize: number): Promise<void> {
        await Promise.all(this.tiles.flatMap((row) => row.map((tile) => tile.whenReady())));

        const pixelSize = CHUNK_SIZE * tileSize;
        const offscreen = new OffscreenCanvas(pixelSize, pixelSize);
        const ctx = requireNonNull(offscreen.getContext("2d"));
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                this.tiles[y][x].draw(ctx, x * tileSize, y * tileSize, tileSize);
            }
        }
        this.drawStructureLayer(ctx, tileSize, "background");
        this.cachedBitmap = offscreen.transferToImageBitmap();
    }

    /**
     * Renders this chunk's foreground-layer structure pieces (e.g. a tree's
     * trunk and canopy alike) onto a transparent offscreen bitmap so
     * {@link drawProps} can blit it instead of redrawing every piece every
     * frame. Left `null` if there are none to draw.
     *
     * @param tileSize - Width/height a tile renders at, in canvas pixels.
     */
    private async cachePropsBitmap(tileSize: number): Promise<void> {
        if (!this.structurePieces.some((piece) => piece.layer === "foreground")) {
            return;
        }

        const pixelSize = CHUNK_SIZE * tileSize;
        const offscreen = new OffscreenCanvas(pixelSize, pixelSize);
        const ctx = requireNonNull(offscreen.getContext("2d"));
        this.drawStructureLayer(ctx, tileSize, "foreground");
        this.cachedPropsBitmap = offscreen.transferToImageBitmap();
    }

    /**
     * Draws every structure piece on the given layer at its local pixel
     * position, one tile in size. Piece bitmaps are preloaded into
     * {@link structureBitmaps} by {@link hydrate} before either cache is
     * built, so this never has to await anything.
     *
     * @param ctx - Canvas context to draw into.
     * @param tileSize - Width/height a tile renders at, in canvas pixels.
     * @param layer - Which layer to draw.
     */
    private drawStructureLayer(ctx: OffscreenCanvasRenderingContext2D, tileSize: number, layer: StructureLayer): void {
        const chunkOriginX = this.chunkX * CHUNK_SIZE;
        const chunkOriginY = this.chunkY * CHUNK_SIZE;
        for (const piece of this.structurePieces) {
            if (piece.layer !== layer) {
                continue;
            }
            const bitmap = requireNonNull(this.structureBitmaps.get(piece.sprite));
            const localX = (piece.worldX - chunkOriginX) * tileSize;
            const localY = (piece.worldY - chunkOriginY) * tileSize;
            ctx.drawImage(bitmap, localX, localY, tileSize, tileSize);
        }
    }

    /**
     * Looks up the tile at the given local position within this chunk.
     *
     * @param localX - Tile's X position within the chunk, 0 to `CHUNK_SIZE - 1`.
     * @param localY - Tile's Y position within the chunk, 0 to `CHUNK_SIZE - 1`.
     * @returns The tile at that position.
     * @throws {Error} If `localX`/`localY` is outside the chunk's bounds, or if this chunk hasn't finished generating yet (see {@link isReady}).
     */
    public getTile(localX: number, localY: number): Tile {
        if (localX < 0 || localX >= CHUNK_SIZE || localY < 0 || localY >= CHUNK_SIZE) {
            throw new Error(`Tile position (${localX}, ${localY}) is outside chunk bounds`);
        }
        if (!this.isReady()) {
            throw new Error(`Chunk (${this.chunkX}, ${this.chunkY}) hasn't finished generating yet`);
        }
        return this.tiles[localY][localX];
    }

    /**
     * Looks up the structure piece anchored at the given world position, if
     * any. Unlike {@link getTile}, takes world (not local) coordinates, since
     * {@link structureOccupancy} already includes halo-sourced pieces
     * anchored in a neighbouring chunk.
     *
     * @param worldX - Tile's X position, in tiles from the world origin.
     * @param worldY - Tile's Y position, in tiles from the world origin.
     * @returns The structure piece at that position, or `undefined` if none.
     */
    public getStructurePieceAt(worldX: number, worldY: number): StructurePieceInstance | undefined {
        return this.structureOccupancy.get(worldX, worldY);
    }

    /**
     * Draws this chunk: blits {@link cachedBitmap} if it's ready, otherwise
     * falls back to drawing every tile individually. While this chunk hasn't
     * finished generating yet, fills its bounds with a placeholder colour
     * instead.
     *
     * @param ctx - Canvas context to draw into.
     * @param originX - Canvas X position of this chunk's top-left corner.
     * @param originY - Canvas Y position of this chunk's top-left corner.
     * @param tileSize - Width/height of each tile, in canvas pixels.
     */
    public draw(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number): void {
        if (!this.isReady()) {
            ctx.fillStyle = PENDING_COLOR;
            ctx.fillRect(originX, originY, CHUNK_SIZE * tileSize, CHUNK_SIZE * tileSize);
            return;
        }

        if (this.cachedBitmap) {
            ctx.drawImage(this.cachedBitmap, originX, originY, CHUNK_SIZE * tileSize, CHUNK_SIZE * tileSize);
            return;
        }

        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                this.tiles[y][x].draw(ctx, originX + x * tileSize, originY + y * tileSize, tileSize);
            }
        }
    }

    /**
     * Draws this chunk's foreground-layer structure pieces (e.g. a tree's
     * trunk and canopy alike), on top of everything drawn so far - ground
     * and entities alike, see `World.draw` - so a tree always occludes the
     * player rather than being occluded by it. Draws nothing while not
     * ready or while this chunk has no foreground pieces; decorative, so a
     * piece popping in a frame late is fine, unlike {@link draw}'s
     * placeholder-backed fallback.
     *
     * @param ctx - Canvas context to draw into.
     * @param originX - Canvas X position of this chunk's top-left corner.
     * @param originY - Canvas Y position of this chunk's top-left corner.
     * @param tileSize - Width/height of each tile, in canvas pixels.
     */
    public drawProps(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number): void {
        if (!this.cachedPropsBitmap) {
            return;
        }
        ctx.drawImage(this.cachedPropsBitmap, originX, originY, CHUNK_SIZE * tileSize, CHUNK_SIZE * tileSize);
    }

    /**
     * Draws this chunk's outline and coordinate label, for debug rendering
     * mode. While this chunk hasn't finished generating, also draws its
     * position in the generation queue, centred in the chunk, if known.
     *
     * @param ctx - Canvas context to draw into.
     * @param originX - Canvas X position of this chunk's top-left corner.
     * @param originY - Canvas Y position of this chunk's top-left corner.
     * @param tileSize - Width/height of each tile, in canvas pixels.
     * @param queuePosition - This chunk's position in the generation queue, or `undefined` if it isn't queued (or is already ready).
     */
    public drawDebug(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number, queuePosition?: number): void {
        const pixelSize = CHUNK_SIZE * tileSize;

        ctx.strokeStyle = this.isReady() ? DEBUG_CONFIG.chunkOutlineColor : DEBUG_CONFIG.chunkPendingOutlineColor;
        ctx.lineWidth = DEBUG_CONFIG.chunkOutlineWidth;
        ctx.strokeRect(originX, originY, pixelSize, pixelSize);

        ctx.fillStyle = DEBUG_CONFIG.chunkLabelColor;
        ctx.font = DEBUG_CONFIG.chunkLabelFont;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`(${this.chunkX}, ${this.chunkY}), ${this.isReady() ? this.biomeSummary : "generating..."}`, originX + DEBUG_CONFIG.chunkLabelPadding, originY + DEBUG_CONFIG.chunkLabelPadding);

        if (queuePosition !== undefined) {
            ctx.fillStyle = DEBUG_CONFIG.chunkPendingOutlineColor;
            ctx.font = DEBUG_CONFIG.chunkQueuePositionFont;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(queuePosition), originX + pixelSize / 2, originY + pixelSize / 2);
        }

        if (this.isReady()) {
            this.drawFeatureOutlines(ctx, originX, originY, tileSize);
            this.drawStructureOutlines(ctx, originX, originY, tileSize);
        }
    }

    /**
     * Outlines every tile edge where {@link TileData.featureTag} differs
     * from the neighbouring tile. Skips the chunk's own outer edge, as a
     * neighbouring chunk's tiles aren't visible from here.
     *
     * @param ctx - Canvas context to draw into.
     * @param originX - Canvas X position of this chunk's top-left corner.
     * @param originY - Canvas Y position of this chunk's top-left corner.
     * @param tileSize - Width/height of each tile, in canvas pixels.
     */
    private drawFeatureOutlines(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number): void {
        ctx.strokeStyle = DEBUG_CONFIG.featureOutlineColor;
        ctx.lineWidth = DEBUG_CONFIG.featureOutlineWidth;

        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const tag = this.tiles[y][x].featureTag;
                if (tag === "none") {
                    continue;
                }

                const left = originX + x * tileSize;
                const top = originY + y * tileSize;
                const right = left + tileSize;
                const bottom = top + tileSize;

                if (x > 0 && this.tiles[y][x - 1].featureTag !== tag) {
                    this.strokeLine(ctx, left, top, left, bottom);
                }
                if (x < CHUNK_SIZE - 1 && this.tiles[y][x + 1].featureTag !== tag) {
                    this.strokeLine(ctx, right, top, right, bottom);
                }
                if (y > 0 && this.tiles[y - 1][x].featureTag !== tag) {
                    this.strokeLine(ctx, left, top, right, top);
                }
                if (y < CHUNK_SIZE - 1 && this.tiles[y + 1][x].featureTag !== tag) {
                    this.strokeLine(ctx, left, bottom, right, bottom);
                }
            }
        }
    }

    /**
     * Outlines every tile edge where structure-piece occupancy differs from
     * the neighbouring tile. Unlike {@link drawFeatureOutlines}, this also
     * covers the chunk's own outer edge: {@link structureOccupancy} already
     * includes halo-sourced pieces anchored in a neighbouring chunk, so a
     * tree spilling across the boundary still outlines correctly here.
     *
     * @param ctx - Canvas context to draw into.
     * @param originX - Canvas X position of this chunk's top-left corner.
     * @param originY - Canvas Y position of this chunk's top-left corner.
     * @param tileSize - Width/height of each tile, in canvas pixels.
     */
    private drawStructureOutlines(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number): void {
        ctx.strokeStyle = DEBUG_CONFIG.structureOutlineColor;
        ctx.lineWidth = DEBUG_CONFIG.structureOutlineWidth;

        const chunkOriginX = this.chunkX * CHUNK_SIZE;
        const chunkOriginY = this.chunkY * CHUNK_SIZE;
        const occupied = (worldX: number, worldY: number): boolean => this.structureOccupancy.has(worldX, worldY);

        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const worldX = chunkOriginX + x;
                const worldY = chunkOriginY + y;
                if (!occupied(worldX, worldY)) {
                    continue;
                }

                const left = originX + x * tileSize;
                const top = originY + y * tileSize;
                const right = left + tileSize;
                const bottom = top + tileSize;

                if (!occupied(worldX - 1, worldY)) {
                    this.strokeLine(ctx, left, top, left, bottom);
                }
                if (!occupied(worldX + 1, worldY)) {
                    this.strokeLine(ctx, right, top, right, bottom);
                }
                if (!occupied(worldX, worldY - 1)) {
                    this.strokeLine(ctx, left, top, right, top);
                }
                if (!occupied(worldX, worldY + 1)) {
                    this.strokeLine(ctx, left, bottom, right, bottom);
                }
            }
        }
    }

    /**
     * @param ctx - Canvas context to draw into.
     * @param x1 - Start X, in canvas pixels.
     * @param y1 - Start Y, in canvas pixels.
     * @param x2 - End X, in canvas pixels.
     * @param y2 - End Y, in canvas pixels.
     */
    private strokeLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
}
