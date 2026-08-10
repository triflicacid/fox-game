import {ConvexPolygon, rectPolygon} from "../../geometry/convex-polygon";
import {Vector2d} from "../../geometry/vector2d";
import {SpriteTile} from "../../sprites/sprite";
import type {Structure, StructurePieceInstance} from "../generation/structure/structure";
import type {StructureSheetRegistry} from "../rendering/structure-sheet-dispatch";

/** Resolves a structure piece's sprite to its bitmap/collision hull, and a piece instance back to its definition. */
export class StructureResolver {
    /**
     * @param structureSheetRegistry - Routes a structure sprite string to whichever biome sheet actually defines it.
     * @param getStructures - Returns the generator's current structure definitions.
     */
    public constructor(
        private readonly structureSheetRegistry: StructureSheetRegistry,
        private readonly getStructures: () => readonly Structure[],
    ) {}

    /** Resolves a decorative structure piece's sprite type to its bitmap, wherever it's actually defined. */
    public getSpriteBitmap(sprite: string): Promise<ImageBitmap> {
        return this.structureSheetRegistry.findSheet(sprite).getTileBitmap(sprite);
    }

    /** Finds the {@link Structure} that produced pieces stamped with `structureId`. */
    public findStructure(structureId: string): Structure | undefined {
        return this.getStructures().find((structure) => structure.getStructureId() === structureId);
    }

    /** Locates `sprite` in the sheet that defines it. */
    public locateSprite(sprite: string): SpriteTile {
        return this.structureSheetRegistry.findSheet(sprite).locateTile(sprite);
    }

    /** Returns `sprite`'s authored collision hull scaled to `tileSize`, or `undefined` if it has none. */
    public collisionPolygonForSprite(sprite: string, centerX: number, centerY: number, tileSize: number): ConvexPolygon | undefined {
        const {bounds, w} = this.locateSprite(sprite);
        if (!bounds) {
            return undefined;
        }
        const scale = tileSize / w;
        return bounds.points.map((point) => new Vector2d(centerX + point.x * scale, centerY + point.y * scale));
    }

    /** Returns `piece`'s world-space collision polygon centred at its tile. */
    public structurePiecePolygon(piece: StructurePieceInstance, tileX: number, tileY: number, tileSize: number): ConvexPolygon {
        const centerX = tileX * tileSize + tileSize / 2;
        const centerY = tileY * tileSize + tileSize / 2;
        return this.collisionPolygonForSprite(piece.sprites[0], centerX, centerY, tileSize)
            ?? rectPolygon(tileX * tileSize, tileY * tileSize, tileSize, tileSize);
    }
}
