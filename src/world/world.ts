import {Chunk, CHUNK_SIZE} from "./chunk";
import {Tile} from "./tile";
import {Entity} from "../entities/entity";
import {MovableEntity} from "../entities/movable-entity";
import {Fox} from "../entities/fox";
import {Camera} from "../camera/camera";
import {DEBUG_CONFIG} from "../debug/debug-config";

/** A chunk's position, in chunk units (not tiles/pixels). */
export interface ChunkCoordinate {
    chunkX: number;
    chunkY: number;
}

/** A rectangular range of chunk coordinates, inclusive of both ends. */
interface ChunkRange {
    startChunkX: number;
    startChunkY: number;
    endChunkX: number;
    endChunkY: number;
}

/**
 * The game world: an effectively infinite 2D grid of tiles, split into
 * fixed-size {@link Chunk}s that are generated on demand and cached in
 * memory as they're needed. Chunk deltas (edits diverging from generation)
 * aren't persisted yet; see `initial-plan.md` for the planned storage design.
 */
export class World {
    /** How many extra chunks to keep loaded beyond the camera's visible view, in every direction. */
    private static readonly CHUNK_BUFFER = 2;

    private readonly chunks = new Map<string, Chunk>();
    private readonly entities: Entity[] = [];
    private mainEntity: MovableEntity;

    /**
     * @param tileSize - Width/height of a single tile, in canvas pixels.
     */
    public constructor(public readonly tileSize: number) {
        this.mainEntity = new Fox();
        this.entities.push(this.mainEntity);
    }

    /**
     * Converts a world tile position into the coordinate of the chunk that
     * contains it.
     *
     * @param tileX - Tile's X position, in tiles from the world origin.
     * @param tileY - Tile's Y position, in tiles from the world origin.
     * @returns The containing chunk's coordinate, in chunk units.
     */
    public static tileToChunk(tileX: number, tileY: number): ChunkCoordinate {
        return {
            chunkX: Math.floor(tileX / CHUNK_SIZE),
            chunkY: Math.floor(tileY / CHUNK_SIZE),
        };
    }

    /**
     * Builds the key {@link chunks} is keyed by for a given chunk coordinate.
     *
     * @param chunkX - Chunk's X coordinate, in chunk units.
     * @param chunkY - Chunk's Y coordinate, in chunk units.
     * @returns A string uniquely identifying that chunk coordinate.
     */
    private static chunkKey(chunkX: number, chunkY: number): string {
        return `${chunkX},${chunkY}`;
    }

    /**
     * Returns the chunk at the given chunk coordinate, generating and
     * caching it first if it hasn't been loaded yet.
     *
     * @param chunkX - Chunk's X coordinate, in chunk units.
     * @param chunkY - Chunk's Y coordinate, in chunk units.
     * @returns The loaded chunk.
     */
    public getChunk(chunkX: number, chunkY: number): Chunk {
        const key = World.chunkKey(chunkX, chunkY);
        let chunk = this.chunks.get(key);
        if (!chunk) {
            chunk = new Chunk(chunkX, chunkY);
            this.chunks.set(key, chunk);
        }
        return chunk;
    }

    /**
     * Whether the chunk at the given chunk coordinate is currently loaded in
     * memory, without generating it if it isn't.
     *
     * @param chunkX - Chunk's X coordinate, in chunk units.
     * @param chunkY - Chunk's Y coordinate, in chunk units.
     * @returns `true` if the chunk is loaded.
     */
    public isChunkLoaded(chunkX: number, chunkY: number): boolean {
        return this.chunks.has(World.chunkKey(chunkX, chunkY));
    }

    /**
     * Drops a chunk from memory. Safe to call on a chunk that isn't loaded.
     * Since chunk deltas aren't persisted yet, any edits made to the chunk
     * are lost; once storage exists, this is where a dirty chunk would be
     * flushed before being evicted.
     *
     * @param chunkX - Chunk's X coordinate, in chunk units.
     * @param chunkY - Chunk's Y coordinate, in chunk units.
     */
    public unloadChunk(chunkX: number, chunkY: number): void {
        this.chunks.delete(World.chunkKey(chunkX, chunkY));
    }

    /**
     * Looks up the tile at the given world tile position, generating its
     * containing chunk first if necessary.
     *
     * @param tileX - Tile's X position, in tiles from the world origin.
     * @param tileY - Tile's Y position, in tiles from the world origin.
     * @returns The tile at that position.
     */
    public getTile(tileX: number, tileY: number): Tile {
        const {chunkX, chunkY} = World.tileToChunk(tileX, tileY);
        const chunk = this.getChunk(chunkX, chunkY);
        return chunk.getTile(tileX - chunkX * CHUNK_SIZE, tileY - chunkY * CHUNK_SIZE);
    }

    /**
     * Every entity currently in the world. Just the fox for now.
     *
     * @returns The world's entities.
     */
    public getEntities(): readonly Entity[] {
        return this.entities;
    }

    /**
     * The entity currently under player control, e.g. for binding a
     * {@link MovementController} to.
     *
     * @returns The main entity.
     */
    public getMainEntity(): MovableEntity {
        return this.mainEntity;
    }

    /**
     * Switches which entity is under player control. Doesn't add `entity`
     * to {@link getEntities} itself - callers should do that first if it
     * isn't already in the world.
     *
     * @param entity - Entity to make the new main entity.
     */
    public setMainEntity(entity: MovableEntity): void {
        this.mainEntity = entity;
    }

    /**
     * Advances every entity in the world by one simulation tick, and streams
     * chunks in/out around the camera (see {@link updateLoadedChunks}).
     *
     * @param deltaMs - Time elapsed since the last update, in milliseconds.
     * @param camera - Camera the world is currently being viewed through.
     */
    public update(deltaMs: number, camera: Camera): void {
        for (const entity of this.entities) {
            entity.update(deltaMs);
        }
        this.updateLoadedChunks(camera);
    }

    /**
     * The range of chunk coordinates that overlap the camera's view.
     *
     * @param camera - Camera to compute the visible chunk range for.
     * @returns The visible chunk range.
     */
    private getVisibleChunkRange(camera: Camera): ChunkRange {
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;
        return {
            startChunkX: Math.floor(camera.getViewX() / chunkPixelSize),
            startChunkY: Math.floor(camera.getViewY() / chunkPixelSize),
            endChunkX: Math.floor((camera.getViewX() + camera.getWidth()) / chunkPixelSize),
            endChunkY: Math.floor((camera.getViewY() + camera.getHeight()) / chunkPixelSize),
        };
    }

    /**
     * Generates/loads every chunk within the camera's view plus a buffer of
     * {@link CHUNK_BUFFER} chunks, then unloads any loaded chunk that's
     * drifted further than that buffer outside the view. Keeps memory
     * bounded as the camera pans, while still keeping a margin of chunks
     * pre-generated just outside the visible area.
     *
     * @param camera - Camera to load/unload chunks around.
     */
    private updateLoadedChunks(camera: Camera): void {
        const visible = this.getVisibleChunkRange(camera);
        const bufferedStartX = visible.startChunkX - World.CHUNK_BUFFER;
        const bufferedStartY = visible.startChunkY - World.CHUNK_BUFFER;
        const bufferedEndX = visible.endChunkX + World.CHUNK_BUFFER;
        const bufferedEndY = visible.endChunkY + World.CHUNK_BUFFER;

        for (let chunkY = bufferedStartY; chunkY <= bufferedEndY; chunkY++) {
            for (let chunkX = bufferedStartX; chunkX <= bufferedEndX; chunkX++) {
                this.getChunk(chunkX, chunkY);
            }
        }

        for (const chunk of this.chunks.values()) {
            const outsideBuffer = chunk.chunkX < bufferedStartX || chunk.chunkX > bufferedEndX
                || chunk.chunkY < bufferedStartY || chunk.chunkY > bufferedEndY;
            if (outsideBuffer) {
                this.unloadChunk(chunk.chunkX, chunk.chunkY);
            }
        }
    }

    /**
     * Draws every chunk that overlaps the camera's view (loading and caching
     * any of those chunks that aren't already loaded), then every entity
     * whose sprite overlaps it.
     *
     * @param ctx - Canvas context to draw into.
     * @param camera - Camera to render the world through.
     * @param debugEnabled - Whether to also draw the debug overlay (chunk/tile outlines, entity bounding boxes/facing arrows, and the camera/entity HUD). Defaults to `false`.
     * @param spectating - Whether spectator mode is currently active, shown as an indicator in the debug HUD. Defaults to `false`.
     * @param actualFps - Currently measured rendering FPS, shown in the debug HUD. Defaults to `0`.
     * @param targetFps - Configured FPS cap, shown alongside `actualFps` in the debug HUD, or `undefined` when uncapped.
     */
    public draw(ctx: CanvasRenderingContext2D, camera: Camera, debugEnabled = false, spectating = false, actualFps = 0, targetFps?: number): void {
        const viewX = camera.getViewX();
        const viewY = camera.getViewY();
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;
        const {startChunkX, startChunkY, endChunkX, endChunkY} = this.getVisibleChunkRange(camera);

        for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
            for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
                const chunk = this.getChunk(chunkX, chunkY);
                chunk.draw(ctx, chunkX * chunkPixelSize - viewX, chunkY * chunkPixelSize - viewY, this.tileSize);
            }
        }

        this.drawEntities(ctx, camera);

        if (debugEnabled) {
            this.drawDebugOverlay(ctx, camera, spectating, actualFps, targetFps);
        }
    }

    /**
     * Draws every entity whose sprite overlaps the camera's view. Entities
     * entirely outside the view are skipped.
     *
     * @param ctx - Canvas context to draw into.
     * @param camera - Camera to render entities through.
     */
    private drawEntities(ctx: CanvasRenderingContext2D, camera: Camera): void {
        const viewX = camera.getViewX();
        const viewY = camera.getViewY();

        for (const entity of this.entities) {
            const bitmap = entity.getCurrentBitmap();
            if (!bitmap) {
                continue;
            }

            const frame = entity.getCurrentFrame();
            const position = entity.getPosition();
            if (!camera.isRectVisible(position.x, position.y, frame.w, frame.h)) {
                continue;
            }

            const x = position.x - viewX;
            const y = position.y - viewY;
            if (frame.rotation) {
                ctx.save();
                ctx.translate(x + frame.w / 2, y + frame.h / 2);
                ctx.rotate(frame.rotation);
                ctx.drawImage(bitmap, -frame.w / 2, -frame.h / 2, frame.w, frame.h);
                ctx.restore();
            } else {
                ctx.drawImage(bitmap, x, y, frame.w, frame.h);
            }
        }
    }

    /**
     * Draws the debug rendering overlay: every visible chunk/tile's outline,
     * every visible entity's bounding box and (for a {@link MovableEntity})
     * facing arrow, and the HUD readout (see {@link drawDebugHud}).
     *
     * @param ctx - Canvas context to draw into.
     * @param camera - Camera to render the overlay through.
     * @param spectating - Whether spectator mode is currently active, shown as an indicator in the HUD.
     * @param actualFps - Currently measured rendering FPS, shown in the HUD.
     * @param targetFps - Configured FPS cap, shown alongside `actualFps`, or `undefined` when uncapped.
     */
    private drawDebugOverlay(ctx: CanvasRenderingContext2D, camera: Camera, spectating: boolean, actualFps: number, targetFps: number | undefined): void {
        const viewX = camera.getViewX();
        const viewY = camera.getViewY();
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;
        const {startChunkX, startChunkY, endChunkX, endChunkY} = this.getVisibleChunkRange(camera);

        for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
            for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
                const chunk = this.getChunk(chunkX, chunkY);
                chunk.drawDebug(ctx, chunkX * chunkPixelSize - viewX, chunkY * chunkPixelSize - viewY, this.tileSize);
            }
        }

        for (const entity of this.entities) {
            const position = entity.getPosition();
            const frame = entity.getCurrentFrame();
            if (!camera.isRectVisible(position.x, position.y, frame.w, frame.h)) {
                continue;
            }
            entity.drawDebugOverlay(ctx, viewX, viewY);
        }

        this.drawDebugHud(ctx, camera, spectating, actualFps, targetFps);
    }

    /**
     * Draws a top-left HUD showing the camera's centre point and viewport
     * size, plus the main entity's position and current speed, plus the
     * current/target FPS, plus a spectator-mode indicator when active.
     *
     * @param ctx - Canvas context to draw into.
     * @param camera - Camera to read position/viewport info from.
     * @param spectating - Whether spectator mode is currently active.
     * @param actualFps - Currently measured rendering FPS.
     * @param targetFps - Configured FPS cap, or `undefined` when uncapped.
     */
    private drawDebugHud(ctx: CanvasRenderingContext2D, camera: Camera, spectating: boolean, actualFps: number, targetFps: number | undefined): void {
        const center = camera.getCenter();
        const position = this.mainEntity.getPosition();
        const velocity = this.mainEntity.getVelocity();
        const speed = Math.hypot(velocity.x, velocity.y);

        const lines: {text: string; color: string}[] = [
            {text: `camera: (${center.x.toFixed(1)}, ${center.y.toFixed(1)})`, color: DEBUG_CONFIG.hudTextColor},
            {text: `viewport: ${camera.getWidth()} x ${camera.getHeight()}`, color: DEBUG_CONFIG.hudTextColor},
            {text: `entity: (${position.x.toFixed(1)}, ${position.y.toFixed(1)}), facing: ${this.mainEntity.getFacing()}`, color: DEBUG_CONFIG.hudTextColor},
            {text: `velocity: (${velocity.x.toFixed(1)}, ${velocity.y.toFixed(1)}), speed: ${speed.toFixed(1)} px/s`, color: DEBUG_CONFIG.hudTextColor},
            {text: `FPS: ${actualFps.toFixed(2)}/${targetFps !== undefined ? targetFps.toFixed(0) : "uncapped"}`, color: DEBUG_CONFIG.hudTextColor},
        ];
        if (spectating) {
            lines.push({text: "SPECTATOR MODE", color: DEBUG_CONFIG.hudSpectatorColor});
        }

        ctx.font = DEBUG_CONFIG.hudFont;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";

        const padding = DEBUG_CONFIG.hudPadding;
        const lineHeight = DEBUG_CONFIG.hudLineHeight;
        const width = Math.max(...lines.map((line) => ctx.measureText(line.text).width)) + padding * 2;
        const height = lines.length * lineHeight + padding * 2;

        ctx.fillStyle = DEBUG_CONFIG.hudBackgroundColor;
        ctx.fillRect(0, 0, width, height);

        lines.forEach((line, i) => {
            ctx.fillStyle = line.color;
            ctx.fillText(line.text, padding, padding + i * lineHeight);
        });
    }
}
