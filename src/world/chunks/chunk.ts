import {DrawContext, Tile} from "../tiles/tile";
import {ChunkSpriteSheets} from "../rendering/chunk-sprite-sheets";
import {DEBUG_CONFIG} from "../../debug/debug-config";
import {CHUNK_SIZE} from "./chunk-size";
import {ChunkGenerationResult} from "../generation/chunk/chunk-worker-protocol";
import {BiomeSummary} from "../generation/biome/biome";
import {StructurePieceInstance} from "../generation/structure/structure";
import {StructureLayer} from "../generation/structure/structure-manifest";
import {CoordMap} from "../coordinates/coord-set";
import {requireNonNull} from "../../util";
import {NoiseField} from "../generation/noise-field";
import {GradientStop, sampleGradient} from "../generation/noise-field-colors";
import {ConvexPolygon, rectPolygon} from "../../geometry/convex-polygon";

export type {ChunkSpriteSheets};
export {CHUNK_SIZE};

/** Fill colour for a chunk that hasn't finished generating yet. */
const PENDING_COLOR = "#000000";

/**
 * A ready chunk's cache state:
 * - `"cached"` - has a static cached bitmap, blitted every frame.
 * - `"live"` - has an animated tile (see {@link Tile.isAnimated}), so it's
 *   redrawn tile-by-tile every frame instead of blitting one cached bitmap -
 *   see {@link Chunk.cacheBitmap}.
 */
export type ChunkCacheState = "cached" | "live";

/** A chunk is a fixed-sized (`CHUNK_SIZE`) square region of tiles at a given location. */
export interface Chunk {
    /** Returns the chunk X coordinate, in chunk units. */
    getChunkX(): number;

    /** Returns the chunk Y coordinate, in chunk units. */
    getChunkY(): number;

    /** Returns the chunk biome summary, or an empty string while still generating. */
    getBiomeSummary(): BiomeSummary | "";

    /** Returns generation duration in milliseconds, or `0` while still generating. */
    getGenerationTimeMs(): number;

    /** Returns `true` after generation data has been hydrated. */
    isReady(): boolean;

    /** Returns whether the chunk currently draws from a cached bitmap or live tile rendering. */
    getCacheState(): ChunkCacheState;
}

/** Chunk contract that supports tile and structure lookups. */
export interface ReadableChunk extends Chunk {
    /**
     * Returns a tile by local chunk coordinates.
     *
     * @param localX - Local X coordinate in `[0, CHUNK_SIZE)`.
     * @param localY - Local Y coordinate in `[0, CHUNK_SIZE)`.
     * @throws When the requested coordinates are out of bounds.
     * @throws When the chunk is not ready yet.
     */
    getTile(localX: number, localY: number): Tile;

    /**
     * Returns the structure piece occupying `worldX/worldY`, if any.
     *
     * @param worldX - World tile X coordinate.
     * @param worldY - World tile Y coordinate.
     */
    getStructurePieceAt(worldX: number, worldY: number): StructurePieceInstance | undefined;
}

/** A chunk contract that can be rendered in world and debug passes. */
export interface DrawableChunk extends ReadableChunk {
    /**
     * Draws terrain and background structures for this chunk.
     *
     * @param ctx - Canvas context to draw into.
     * @param originX - Canvas X for this chunk's top-left corner.
     * @param originY - Canvas Y for this chunk's top-left corner.
     * @param tileSize - Tile render size in canvas pixels.
     * @param animationElapsedMs - Shared animation clock in milliseconds.
     */
    draw(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number, animationElapsedMs?: number): void;

    /**
     * Draws foreground structure props for this chunk.
     *
     * @param ctx - Canvas context to draw into.
     * @param originX - Canvas X for this chunk's top-left corner.
     * @param originY - Canvas Y for this chunk's top-left corner.
     * @param tileSize - Tile render size in canvas pixels.
     */
    drawProps(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number): void;

    /**
     * Draws the chunk debug overlay.
     *
     * @param ctx - Canvas context to draw into.
     * @param originX - Canvas X for this chunk's top-left corner.
     * @param originY - Canvas Y for this chunk's top-left corner.
     * @param tileSize - Tile render size in canvas pixels.
     * @param queuePosition - Optional chunk queue position while generating.
     */
    drawDebug(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number, queuePosition?: number): void;

    /**
     * Draws a noise-field color overlay for this chunk.
     *
     * @param ctx - Canvas context to draw into.
     * @param originX - Canvas X for this chunk's top-left corner.
     * @param originY - Canvas Y for this chunk's top-left corner.
     * @param tileSize - Tile render size in canvas pixels.
     * @param field - Noise field to sample.
     * @param gradient - Color stops used to map samples to colors.
     */
    drawNoiseOverlay(
        ctx: CanvasRenderingContext2D,
        originX: number,
        originY: number,
        tileSize: number,
        field: NoiseField,
        gradient: readonly GradientStop[],
    ): void;
}

/**
 * A fixed-size square region of the world, made up of `CHUNK_SIZE x
 * CHUNK_SIZE` {@link Tile}s. Chunks are generated on demand by {@link World}
 * (on a background worker - see `ChunkWorkerClient`) and identified by their
 * integer chunk coordinates.
 */
export class LoadedChunk implements DrawableChunk {
    /** Empty until {@link hydrate} resolves - see {@link isReady}. */
    private tiles: Tile[][] = [];

    /**
     * Rendered once every tile's sprite has loaded, and only while none of
     * this chunk's tiles animate (see {@link Tile.isAnimated}). `null` until
     * then, or permanently for a chunk with any animated tile, during which
     * {@link draw} falls back to a per-tile loop instead.
     */
    private cachedBitmap: ImageBitmap | null = null;

    /** Whether any tile in this chunk animates - see {@link cachedBitmap}. `false` until {@link hydrate} resolves. */
    private hasAnimatedTile = false;

    /** Decorative structure pieces (e.g. tree trunks/leaves) touching this chunk. Empty until {@link hydrate} resolves. */
    private structurePieces: StructurePieceInstance[] = [];

    /** Rendered once every foreground-layer piece's sprite has loaded. `null` until then (or while there are none), during which {@link drawProps} draws nothing. */
    private cachedPropsBitmap: ImageBitmap | null = null;

    /**
     * Rendered once every background-layer piece's sprite has loaded. `null`
     * until then (or while there are none) - its own layer, separate from
     * {@link cachedBitmap}, so background props still draw normally even for
     * a chunk whose tile bitmap isn't cacheable (see {@link hasAnimatedTile}).
     */
    private cachedBackgroundPropsBitmap: ImageBitmap | null = null;

    /** Rendered once, lazily, the first time {@link drawDebug} is called on a ready chunk - see {@link buildDebugBitmap}. `null` until then. */
    private cachedDebugBitmap: ImageBitmap | null = null;

    /** Rendered lazily while this chunk is still generating - see {@link buildPendingDebugBitmap}. Rebuilt only when {@link cachedPendingQueuePosition} goes stale. `null` until first drawn. */
    private cachedPendingDebugBitmap: ImageBitmap | null = null;

    /** Queue position {@link cachedPendingDebugBitmap} was last built for - compared against the latest value on every {@link drawDebug} call to decide whether a rebuild is needed. */
    private cachedPendingQueuePosition: number | undefined = undefined;

    /** Rendered lazily the first time {@link drawNoiseOverlay} is called for a given field - see {@link buildNoiseOverlayBitmap}. `null` until then. */
    private cachedNoiseOverlayBitmap: ImageBitmap | null = null;

    /** Field name {@link cachedNoiseOverlayBitmap} was last built for - compared against the requested field on every {@link drawNoiseOverlay} call to decide whether a rebuild is needed. `undefined` until first drawn. */
    private cachedNoiseOverlayField: string | undefined = undefined;

    /** Bitmap per distinct structure sprite type this chunk uses - populated once in {@link hydrate}, before either cache is built. */
    private readonly structureBitmaps = new Map<string, ImageBitmap>();

    /** Structure piece at each occupied world position - see {@link drawStructureOutlines} and {@link getStructurePieceAt}. Populated once in {@link hydrate}. */
    private readonly structureOccupancy = new CoordMap<StructurePieceInstance>();

    /** Dominant biome or `mixed`, for debugging only. Empty until {@link isReady}. */
    private biomeSummary: BiomeSummary | "" = "";

    /** How long generation took for this chunk, in milliseconds. `0` until {@link isReady}. */
    private generationTimeMs = 0;

    /**
     * @param chunkX - This chunk's X coordinate, in chunk units (not tiles/pixels).
     * @param chunkY - This chunk's Y coordinate, in chunk units (not tiles/pixels).
     * @param generation - Resolves with this chunk's generated biome/tile data once the worker responds.
     * @param spriteSheets - Shared sprite sheets this chunk's tiles/props resolve their bitmaps from.
     * @param tileSize - Width/height a tile renders at, in canvas pixels - fixed for the `World` this chunk belongs to, so {@link cacheBitmap} can size its offscreen canvas once.
     */
    public constructor(
        private readonly chunkX: number,
        private readonly chunkY: number,
        generation: Promise<ChunkGenerationResult>,
        private readonly spriteSheets: ChunkSpriteSheets,
        tileSize: number,
    ) {
        void this.hydrate(generation, spriteSheets, tileSize);
    }

    /** @inheritdoc */
    public getChunkX(): number {
        return this.chunkX;
    }

    /** @inheritdoc */
    public getChunkY(): number {
        return this.chunkY;
    }

    /** @inheritdoc */
    public getBiomeSummary(): BiomeSummary | "" {
        return this.biomeSummary;
    }

    /** @inheritdoc */
    public getGenerationTimeMs(): number {
        return this.generationTimeMs;
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
        const chunkOriginX = this.chunkX * CHUNK_SIZE;
        const chunkOriginY = this.chunkY * CHUNK_SIZE;
        this.tiles = result.tiles.map((row, y) => row.map((data, x) => new Tile(data, spriteSheets, chunkOriginX + x, chunkOriginY + y)));
        this.hasAnimatedTile = this.tiles.some((row) => row.some((tile) => tile.isAnimated));
        this.structurePieces = result.props;
        for (const piece of this.structurePieces) {
            this.structureOccupancy.set(piece.worldX, piece.worldY, piece);
        }

        const distinctSprites = [...new Set(this.structurePieces.flatMap((piece) => piece.sprites))];
        await Promise.all(distinctSprites.map(async (sprite) => {
            this.structureBitmaps.set(sprite, await spriteSheets.getStructureSpriteBitmap(sprite));
        }));

        await Promise.all([this.cacheBitmap(tileSize), this.cachePropsBitmap(tileSize), this.cacheBackgroundPropsBitmap(tileSize)]);
    }

    /** @inheritdoc */
    public isReady(): boolean {
        return this.tiles.length > 0;
    }

    /** @inheritdoc */
    public getCacheState(): ChunkCacheState {
        return this.hasAnimatedTile ? "live" : "cached";
    }

    /**
     * Renders this chunk once to an offscreen bitmap so {@link draw} can blit
     * it instead of redrawing every tile every frame. Left `null` (permanently)
     * for a chunk with any animated tile - see {@link hasAnimatedTile} - since
     * such a chunk needs repainting every frame anyway, so caching one static
     * snapshot of it wouldn't help.
     *
     * @param tileSize - Width/height a tile renders at, in canvas pixels.
     */
    private async cacheBitmap(tileSize: number): Promise<void> {
        if (this.hasAnimatedTile) {
            return;
        }

        await Promise.all(this.tiles.flatMap((row) => row.map((tile) => tile.whenReady())));

        const pixelSize = CHUNK_SIZE * tileSize;
        const offscreen = new OffscreenCanvas(pixelSize, pixelSize);
        const ctx = requireNonNull(offscreen.getContext("2d"));
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                this.tiles[y][x].draw(ctx, x * tileSize, y * tileSize, tileSize);
            }
        }
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
     * Renders this chunk's background-layer structure pieces onto a
     * transparent offscreen bitmap so {@link draw} can blit it instead of
     * redrawing every piece every frame - see {@link cachedBackgroundPropsBitmap}.
     * Left `null` if there are none to draw.
     *
     * @param tileSize - Width/height a tile renders at, in canvas pixels.
     */
    private async cacheBackgroundPropsBitmap(tileSize: number): Promise<void> {
        if (!this.structurePieces.some((piece) => piece.layer === "background")) {
            return;
        }

        const pixelSize = CHUNK_SIZE * tileSize;
        const offscreen = new OffscreenCanvas(pixelSize, pixelSize);
        const ctx = requireNonNull(offscreen.getContext("2d"));
        this.drawStructureLayer(ctx, tileSize, "background");
        this.cachedBackgroundPropsBitmap = offscreen.transferToImageBitmap();
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
            const localX = (piece.worldX - chunkOriginX) * tileSize;
            const localY = (piece.worldY - chunkOriginY) * tileSize;
            for (const sprite of piece.sprites) {
                const bitmap = requireNonNull(this.structureBitmaps.get(sprite));
                ctx.drawImage(bitmap, localX, localY, tileSize, tileSize);
            }
        }
    }

    /** @inheritdoc */
    public getTile(localX: number, localY: number): Tile {
        if (localX < 0 || localX >= CHUNK_SIZE || localY < 0 || localY >= CHUNK_SIZE) {
            throw new Error(`Tile position (${localX}, ${localY}) is outside chunk bounds`);
        }
        if (!this.isReady()) {
            throw new Error(`Chunk (${this.chunkX}, ${this.chunkY}) hasn't finished generating yet`);
        }
        return this.tiles[localY][localX];
    }

    /** @inheritdoc */
    public getStructurePieceAt(worldX: number, worldY: number): StructurePieceInstance | undefined {
        return this.structureOccupancy.get(worldX, worldY);
    }

    /** @inheritdoc */
    public draw(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number, animationElapsedMs = 0): void {
        if (!this.isReady()) {
            ctx.fillStyle = PENDING_COLOR;
            ctx.fillRect(originX, originY, CHUNK_SIZE * tileSize, CHUNK_SIZE * tileSize);
            return;
        }

        if (this.cachedBitmap) {
            ctx.drawImage(this.cachedBitmap, originX, originY, CHUNK_SIZE * tileSize, CHUNK_SIZE * tileSize);
        } else {
            for (let y = 0; y < CHUNK_SIZE; y++) {
                for (let x = 0; x < CHUNK_SIZE; x++) {
                    this.tiles[y][x].draw(ctx, originX + x * tileSize, originY + y * tileSize, tileSize, animationElapsedMs);
                }
            }
        }

        if (this.cachedBackgroundPropsBitmap) {
            ctx.drawImage(this.cachedBackgroundPropsBitmap, originX, originY, CHUNK_SIZE * tileSize, CHUNK_SIZE * tileSize);
        }
    }

    /** @inheritdoc */
    public drawProps(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number): void {
        if (!this.cachedPropsBitmap) {
            return;
        }
        ctx.drawImage(this.cachedPropsBitmap, originX, originY, CHUNK_SIZE * tileSize, CHUNK_SIZE * tileSize);
    }

    /** @inheritdoc */
    public drawDebug(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number, queuePosition?: number): void {
        const pixelSize = CHUNK_SIZE * tileSize;

        if (!this.isReady()) {
            if (!this.cachedPendingDebugBitmap || this.cachedPendingQueuePosition !== queuePosition) {
                this.cachedPendingDebugBitmap = this.buildPendingDebugBitmap(tileSize, queuePosition);
                this.cachedPendingQueuePosition = queuePosition;
            }
            ctx.drawImage(this.cachedPendingDebugBitmap, originX, originY, pixelSize, pixelSize);
            return;
        }

        if (!this.cachedDebugBitmap) {
            this.cachedDebugBitmap = this.buildDebugBitmap(tileSize);
        }
        ctx.drawImage(this.cachedDebugBitmap, originX, originY, pixelSize, pixelSize);
    }

    /**
     * Renders this chunk's debug overlay (outline, coordinate/biome/cache-state
     * label, feature outlines, structure outlines) once to an offscreen
     * bitmap, in local chunk-space, so {@link drawDebug} can blit it every
     * frame instead of re-stroking every tile edge. Only called once ready,
     * so the label always shows the final biome summary rather than
     * "generating...", and {@link hasAnimatedTile} - unlike {@link cachedBitmap}
     * itself - is already settled by then, so there's no risk of the label
     * getting built (and permanently cached) before it's known.
     *
     * @param tileSize - Width/height of each tile, in canvas pixels.
     */
    private buildDebugBitmap(tileSize: number): ImageBitmap {
        const pixelSize = CHUNK_SIZE * tileSize;
        const offscreen = new OffscreenCanvas(pixelSize, pixelSize);
        const ctx = requireNonNull(offscreen.getContext("2d"));

        ctx.strokeStyle = DEBUG_CONFIG.chunkOutlineColor;
        ctx.lineWidth = DEBUG_CONFIG.chunkOutlineWidth;
        ctx.strokeRect(0, 0, pixelSize, pixelSize);

        ctx.fillStyle = DEBUG_CONFIG.chunkLabelColor;
        ctx.font = DEBUG_CONFIG.chunkLabelFont;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`(${this.chunkX}, ${this.chunkY}), ${this.biomeSummary}`, DEBUG_CONFIG.chunkLabelPadding, DEBUG_CONFIG.chunkLabelPadding);

        this.drawFeatureOutlines(ctx, 0, 0, tileSize);
        this.drawStructureOutlines(ctx, 0, 0, tileSize);

        return offscreen.transferToImageBitmap();
    }

    /**
     * Renders this still-generating chunk's outline, label, and (if queued)
     * queue-position marker to an offscreen bitmap, in local chunk-space, so
     * {@link drawDebug} can blit it instead of re-stroking/re-filling text
     * every frame. Called again only when `queuePosition` changes - see
     * {@link cachedPendingQueuePosition}.
     *
     * @param tileSize - Width/height of each tile, in canvas pixels.
     * @param queuePosition - This chunk's position in the generation queue, or `undefined` if it isn't queued yet.
     */
    private buildPendingDebugBitmap(tileSize: number, queuePosition: number | undefined): ImageBitmap {
        const pixelSize = CHUNK_SIZE * tileSize;
        const offscreen = new OffscreenCanvas(pixelSize, pixelSize);
        const ctx = requireNonNull(offscreen.getContext("2d"));

        ctx.strokeStyle = DEBUG_CONFIG.chunkPendingOutlineColor;
        ctx.lineWidth = DEBUG_CONFIG.chunkOutlineWidth;
        ctx.strokeRect(0, 0, pixelSize, pixelSize);

        ctx.fillStyle = DEBUG_CONFIG.chunkLabelColor;
        ctx.font = DEBUG_CONFIG.chunkLabelFont;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`(${this.chunkX}, ${this.chunkY}), generating...`, DEBUG_CONFIG.chunkLabelPadding, DEBUG_CONFIG.chunkLabelPadding);

        if (queuePosition !== undefined) {
            ctx.fillStyle = DEBUG_CONFIG.chunkPendingOutlineColor;
            ctx.font = DEBUG_CONFIG.chunkQueuePositionFont;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(queuePosition), pixelSize / 2, pixelSize / 2);
        }

        return offscreen.transferToImageBitmap();
    }

    /** @inheritdoc */
    public drawNoiseOverlay(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number, field: NoiseField, gradient: readonly GradientStop[]): void {
        if (!this.cachedNoiseOverlayBitmap || this.cachedNoiseOverlayField !== field.name) {
            this.cachedNoiseOverlayBitmap = this.buildNoiseOverlayBitmap(tileSize, field, gradient);
            this.cachedNoiseOverlayField = field.name;
        }
        ctx.drawImage(this.cachedNoiseOverlayBitmap, originX, originY, CHUNK_SIZE * tileSize, CHUNK_SIZE * tileSize);
    }

    /**
     * Renders `field`'s sample at every tile in this chunk, coloured via
     * `gradient`, to an offscreen bitmap - see {@link drawNoiseOverlay}.
     *
     * @param tileSize - Width/height of each tile, in canvas pixels.
     * @param field - The noise field to sample.
     * @param gradient - Colour gradient to render `field`'s samples with.
     */
    private buildNoiseOverlayBitmap(tileSize: number, field: NoiseField, gradient: readonly GradientStop[]): ImageBitmap {
        const pixelSize = CHUNK_SIZE * tileSize;
        const offscreen = new OffscreenCanvas(pixelSize, pixelSize);
        const ctx = requireNonNull(offscreen.getContext("2d"));

        const chunkOriginX = this.chunkX * CHUNK_SIZE;
        const chunkOriginY = this.chunkY * CHUNK_SIZE;
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const [r, g, b] = sampleGradient(gradient, field.sample(chunkOriginX + x, chunkOriginY + y));
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
            }
        }

        return offscreen.transferToImageBitmap();
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
    private drawFeatureOutlines(ctx: DrawContext, originX: number, originY: number, tileSize: number): void {
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
     * Outlines every structure piece touching this chunk: a collidable piece
     * (see {@link StructurePieceInstance.collision}) draws its own actual
     * collision hull (see {@link ChunkSpriteSheets.getStructureCollisionPolygon} -
     * the very shape `World.handleEntityCollisions` collides against, not
     * just its occupied tile square), so this overlay can never drift out of
     * sync with real collision the way a separately-drawn approximation
     * could. A non-collidable piece (e.g. a leaf tile) has no such hull to
     * show, so it instead joins a merged tile-edge trace with its
     * like-kind neighbours - outlining every tile edge where non-collidable
     * occupancy differs from the neighbouring tile, the same as before this
     * split existed. Unlike {@link drawFeatureOutlines}, both also cover the
     * chunk's own outer edge: {@link structureOccupancy} already includes
     * halo-sourced pieces anchored in a neighbouring chunk, so a tree
     * spilling across the boundary still outlines correctly here.
     *
     * @param ctx - Canvas context to draw into.
     * @param originX - Canvas X position of this chunk's top-left corner.
     * @param originY - Canvas Y position of this chunk's top-left corner.
     * @param tileSize - Width/height of each tile, in canvas pixels.
     */
    private drawStructureOutlines(ctx: DrawContext, originX: number, originY: number, tileSize: number): void {
        ctx.strokeStyle = DEBUG_CONFIG.structureOutlineColor;
        ctx.lineWidth = DEBUG_CONFIG.structureOutlineWidth;

        const chunkOriginX = this.chunkX * CHUNK_SIZE;
        const chunkOriginY = this.chunkY * CHUNK_SIZE;
        // Non-collidable pieces alone, for the merged edge-trace below - a collidable piece never
        // participates in it, since it draws its own independent hull instead (see the loop below).
        const nonCollidableOccupied = (worldX: number, worldY: number): boolean => {
            const piece = this.structureOccupancy.get(worldX, worldY);
            return piece !== undefined && piece.collision === "none";
        };

        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const worldX = chunkOriginX + x;
                const worldY = chunkOriginY + y;
                const piece = this.structureOccupancy.get(worldX, worldY);
                if (!piece) {
                    continue;
                }

                const left = originX + x * tileSize;
                const top = originY + y * tileSize;

                if (piece.collision !== "none") {
                    const polygon = this.spriteSheets.getStructureCollisionPolygon(
                        piece.sprites[0], left + tileSize / 2, top + tileSize / 2, tileSize,
                    ) ?? rectPolygon(left, top, tileSize, tileSize);
                    this.strokePolygon(ctx, polygon);
                    continue;
                }

                const right = left + tileSize;
                const bottom = top + tileSize;

                if (!nonCollidableOccupied(worldX - 1, worldY)) {
                    this.strokeLine(ctx, left, top, left, bottom);
                }
                if (!nonCollidableOccupied(worldX + 1, worldY)) {
                    this.strokeLine(ctx, right, top, right, bottom);
                }
                if (!nonCollidableOccupied(worldX, worldY - 1)) {
                    this.strokeLine(ctx, left, top, right, top);
                }
                if (!nonCollidableOccupied(worldX, worldY + 1)) {
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
    private strokeLine(ctx: DrawContext, x1: number, y1: number, x2: number, y2: number): void {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    /**
     * Strokes `polygon` as a closed loop.
     *
     * @param ctx - Canvas context to draw into.
     * @param polygon - The polygon to stroke, in the same canvas-pixel space as `ctx`.
     */
    private strokePolygon(ctx: DrawContext, polygon: ConvexPolygon): void {
        ctx.beginPath();
        polygon.forEach((point, i) => {
            if (i === 0) {
                ctx.moveTo(point.x, point.y);
            } else {
                ctx.lineTo(point.x, point.y);
            }
        });
        ctx.closePath();
        ctx.stroke();
    }
}
