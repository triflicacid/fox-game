import {CHUNK_SIZE} from "../../chunk-size";
import {BiomeTag} from "../biome/biome";
import {NoiseField} from "../noise-field";
import {hashLatticePoint} from "../../noise";
import {StructureLayer, StructureManifest, StructureManifestPiece, pickShape} from "./structure-manifest";
import {CollisionResponseKind} from "../../../geometry/collision-response";
import type {CollisionContext} from "../../collision";

/** One resolved structure piece, stamped at an absolute world-tile position. */
export interface StructurePieceInstance<TSpriteType extends string = string> {
    readonly worldX: number;
    readonly worldY: number;
    readonly sprite: TSpriteType;
    readonly layer: StructureLayer;
    /** See {@link StructureManifestPiece.collision}. */
    readonly collision: CollisionResponseKind;
    /** Which `Structure` produced this piece - see {@link Structure.getStructureId}. Lets a main-thread collision check look the originating `Structure` back up (see {@link Structure.handleCollision}), even though generation itself runs off-thread. */
    readonly structureId: string;
}

/** Reserved rolls this base class uses - subclasses must pick distinct (much smaller) salts of their own. */
const SPAWN_SALT = 90001;
const SHAPE_SALT = 90002;

/**
 * A multi-tile decorative/terrain object placed from a deterministic,
 * data-driven JSON manifest (e.g. trees). Every tile it occupies is defined
 * relative to one anchor tile, and each can independently belong to the
 * background layer (merged into the ground cache, drawn before entities -
 * e.g. a low decoration that shouldn't occlude the player) or the
 * foreground layer (drawn after entities, with room for transparent gaps -
 * e.g. a tree's trunk and canopy alike, so the player always renders under
 * the whole tree rather than only under its leaves).
 *
 * Like trees among lakes/oases, a `Structure` is a per-tile scatter/point
 * process, not a region/component feature: every candidate anchor is
 * evaluated independently from world coordinates and shared fields, so no
 * flood fill or cross-chunk component discovery is needed. A structure
 * whose shape spills into a neighbouring chunk is generated identically by
 * both chunks (same anchor, same deterministic rolls), and each chunk keeps
 * whichever stamped pieces land within its own bounds.
 *
 * @typeParam TSpriteType - Union of sprite types this structure's pieces resolve to.
 */
export abstract class Structure<TSpriteType extends string = string> {
    /**
     * @param worldSeed - The world's seed, so this structure's rolls/fields sample deterministically.
     * @param hashSeedOffset - Per-structure-type offset so independent structures' rolls don't correlate. Must stay well clear of {@link SPAWN_SALT}/{@link SHAPE_SALT}.
     * @param structureId - Stable id for this structure type (e.g. `"tree"`/`"cactus"`) - stamped onto every piece it generates (see {@link StructurePieceInstance.structureId}) so a main-thread collision check can look this exact `Structure` instance back up (see `World.handleEntityCollisions`), even though {@link generate} itself runs off-thread.
     */
    protected constructor(
        private readonly worldSeed: number,
        private readonly hashSeedOffset: number,
        private readonly structureId: string,
    ) {
    }

    /**
     * This structure type's stable id - see the constructor's `structureId` doc.
     *
     * @returns The id.
     */
    public getStructureId(): string {
        return this.structureId;
    }

    /**
     * Optional per-structure collision override. If implemented, called once
     * an entity's collision polygon is confirmed to overlap one of this
     * structure's pieces (see `World.resolveObstacleCollision`) - *before*
     * the generic {@link CollisionResponseKind} handler runs (see
     * `world/collision.ts`'s `applyCollisionResponse`).
     *
     * Return `false` to fully take over the reaction yourself (e.g.
     * repositioning the entity, playing an effect, ...) and skip the generic
     * handler entirely. Return `true` - or simply don't implement this - to
     * let the generic handler run afterwards as normal.
     *
     * @param context - The collision context - see `world/collision.ts`'s `CollisionContext`.
     * @returns Whether the generic response handler should still run.
     */
    public handleCollision?(context: CollisionContext): boolean;

    /** Every `NoiseField` this structure owns (e.g. a field choosing which family grows where). */
    public abstract getFields(): readonly NoiseField[];

    /** This structure's shape manifest, keyed by family (e.g. `"oak"`/`"birch"`). */
    protected abstract getManifest(): StructureManifest;

    /**
     * How far (in tiles, from the anchor) this structure's shapes can reach
     * at most - derived from the manifest's actual data, not guessed, so
     * the boundary scan's halo stays tied to real geometry.
     */
    protected abstract getMaximumReachTiles(): number;

    /** Biomes this structure may spawn in - checked by {@link generate} before {@link getSpawnChance}. */
    public abstract getPermittedBiomes(): readonly BiomeTag[];

    /**
     * Extra site-specific rejection rule beyond biome, e.g. avoiding another
     * feature's water. Defaults to never excluding.
     *
     * @param worldX - Candidate anchor's X, in tiles from the world origin.
     * @param worldY - Candidate anchor's Y, in tiles from the world origin.
     */
    protected isExcluded(worldX: number, worldY: number): boolean {
        void worldX;
        void worldY;
        return false;
    }

    /**
     * Whether/how strongly a candidate anchor should spawn this structure.
     * Only called for anchors that already passed {@link getPermittedBiomes}/{@link isExcluded}.
     *
     * @param worldX - Candidate anchor's X, in tiles from the world origin.
     * @param worldY - Candidate anchor's Y, in tiles from the world origin.
     * @param biomeTag - The biome resolved at this position.
     * @param biomeDepth - Capped 8-connected distance from the biome's border at this position.
     * @returns Spawn probability in `[0, 1]`.
     */
    protected abstract getSpawnChance(worldX: number, worldY: number, biomeTag: BiomeTag, biomeDepth: number): number;

    /**
     * Picks which manifest family a spawning instance uses at this anchor
     * (e.g. oak vs birch) - typically from a smooth, spatially-correlated
     * field so instances form coherent patches rather than tile-by-tile
     * speckle.
     *
     * @param worldX - The instance's anchor X, in tiles from the world origin.
     * @param worldY - The instance's anchor Y, in tiles from the world origin.
     */
    protected abstract pickFamily(worldX: number, worldY: number): string;

    /**
     * Resolves one manifest piece's role (plus any extra deterministic
     * per-instance choices, e.g. trunk style - see {@link roll}) into a
     * concrete sprite type.
     *
     * @param family - The instance's family - see {@link pickFamily}.
     * @param piece - The manifest piece being resolved.
     * @param anchorWorldX - The instance's anchor X - stable across every piece of the same instance, so per-instance (not per-piece) rolls stay consistent.
     * @param anchorWorldY - The instance's anchor Y.
     */
    protected abstract resolveSprite(
        family: string,
        piece: StructureManifestPiece,
        anchorWorldX: number,
        anchorWorldY: number,
    ): TSpriteType;

    /**
     * Generates every piece of this structure touching the chunk at
     * `(chunkX, chunkY)`, including ones anchored in a neighbouring chunk
     * whose shape spills in.
     *
     * @param chunkX - Chunk's X coordinate, in chunk units.
     * @param chunkY - Chunk's Y coordinate, in chunk units.
     * @param paddedBiomeTags - The chunk's already-computed padded biome-tag mask, indexed `[paddedY][paddedX]`.
     * @param paddedBiomeDepths - The chunk's already-computed padded biome-depth mask, indexed `[paddedY][paddedX]`, in the same padding as `paddedBiomeTags`.
     * @param biomeHaloTiles - How many tiles `paddedBiomeTags`/`paddedBiomeDepths` are padded by beyond the chunk's own bounds. Must be at least {@link getMaximumReachTiles}.
     * @returns Every generated piece touching this chunk.
     */
    public generate(
        chunkX: number,
        chunkY: number,
        paddedBiomeTags: readonly (readonly BiomeTag[])[],
        paddedBiomeDepths: readonly (readonly number[])[],
        biomeHaloTiles: number,
    ): StructurePieceInstance<TSpriteType>[] {
        const instances: StructurePieceInstance<TSpriteType>[] = [];
        const chunkOriginX = chunkX * CHUNK_SIZE;
        const chunkOriginY = chunkY * CHUNK_SIZE;
        const reach = this.getMaximumReachTiles();
        const manifest = this.getManifest();
        const permittedBiomes = this.getPermittedBiomes();

        for (let paddedY = biomeHaloTiles - reach; paddedY < biomeHaloTiles + CHUNK_SIZE + reach; paddedY++) {
            for (let paddedX = biomeHaloTiles - reach; paddedX < biomeHaloTiles + CHUNK_SIZE + reach; paddedX++) {
                const biomeTag = paddedBiomeTags[paddedY][paddedX];
                if (!permittedBiomes.includes(biomeTag)) {
                    continue;
                }
                const biomeDepth = paddedBiomeDepths[paddedY][paddedX];
                const worldX = chunkOriginX + paddedX - biomeHaloTiles;
                const worldY = chunkOriginY + paddedY - biomeHaloTiles;
                if (this.isExcluded(worldX, worldY)) {
                    continue;
                }

                const spawnChance = this.getSpawnChance(worldX, worldY, biomeTag, biomeDepth);
                if (spawnChance <= 0 || this.roll(worldX, worldY, SPAWN_SALT) >= spawnChance) {
                    continue;
                }

                const family = this.pickFamily(worldX, worldY);
                const shapes = manifest[family];
                if (!shapes || shapes.length === 0) {
                    continue;
                }
                const shape = pickShape(shapes, this.roll(worldX, worldY, SHAPE_SALT));

                for (const piece of shape.pieces) {
                    instances.push({
                        worldX: worldX + piece.x,
                        worldY: worldY + piece.y,
                        sprite: this.resolveSprite(family, piece, worldX, worldY),
                        layer: piece.layer,
                        collision: piece.collision ?? "none",
                        structureId: this.structureId,
                    });
                }
            }
        }

        return instances;
    }

    /**
     * A deterministic roll in `[0, 1)` for `(worldX, worldY)`, independent
     * per `salt` - for subclasses' own per-instance choices (e.g. trunk
     * style). Must use a `salt` distinct from every other roll this
     * structure makes, including the base class's own {@link SPAWN_SALT}/{@link SHAPE_SALT}.
     *
     * @param worldX - Tile X to roll for, in tiles from the world origin.
     * @param worldY - Tile Y to roll for, in tiles from the world origin.
     * @param salt - Roll-specific offset, so different rolls at the same position don't correlate.
     */
    protected roll(worldX: number, worldY: number, salt: number): number {
        return hashLatticePoint(this.worldSeed + this.hashSeedOffset + salt, worldX, worldY);
    }

    /**
     * Whether `(worldX, worldY)` is the sole tile within its
     * `cellSizeTiles`-square cell eligible to spawn this structure - every
     * other tile in the cell is rejected outright, guaranteeing two
     * candidates are at least `2 * cellMarginTiles + 1` tiles apart.
     *
     * @param worldX - Candidate tile's X, in tiles from the world origin.
     * @param worldY - Candidate tile's Y, in tiles from the world origin.
     * @param cellSizeTiles - Side length of the grid cell candidates are drawn from.
     * @param cellMarginTiles - How far the candidate is kept from the cell's own edge - the remaining span is jitter room.
     * @param jitterXSalt - Roll salt for the candidate's X jitter within its cell.
     * @param jitterYSalt - Roll salt for the candidate's Y jitter within its cell.
     */
    protected isSoleCellCandidate(
        worldX: number,
        worldY: number,
        cellSizeTiles: number,
        cellMarginTiles: number,
        jitterXSalt: number,
        jitterYSalt: number,
    ): boolean {
        const cellX = Math.floor(worldX / cellSizeTiles);
        const cellY = Math.floor(worldY / cellSizeTiles);
        const span = cellSizeTiles - 2 * cellMarginTiles;
        const jitterX = Math.floor(this.roll(cellX, cellY, jitterXSalt) * span);
        const jitterY = Math.floor(this.roll(cellX, cellY, jitterYSalt) * span);
        const anchorX = cellX * cellSizeTiles + cellMarginTiles + jitterX;
        const anchorY = cellY * cellSizeTiles + cellMarginTiles + jitterY;
        return worldX === anchorX && worldY === anchorY;
    }
}
