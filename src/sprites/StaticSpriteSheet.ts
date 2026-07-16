import {SpriteTile} from "./sprite";
import {SpriteSheetDescriptor, SpriteTileDescriptor} from "./sprite-sheet-descriptor";
import {SpriteSheet} from "./SpriteSheet";

/**
 * A sprite sheet of multiple named, static tiles (no animations) laid out
 * per a {@link SpriteSheetDescriptor} of plain {@link SpriteTileDescriptor}
 * entries.
 *
 * @typeParam TType - Union of valid tile `type` values for this sheet.
 */
export class StaticSpriteSheet<TType extends string = string> extends SpriteSheet {
    /**
     * @param src - URL/path of the sprite sheet image, e.g. `"./static/foo.png"`.
     * @param descriptor - This sheet's layout, e.g. imported from a generated JSON file.
     */
    public constructor(
        src: string,
        private readonly descriptor: SpriteSheetDescriptor<TType, SpriteTileDescriptor<TType>>,
    ) {
        super(src);
    }

    /**
     * Finds the tile describing `type`.
     *
     * @param type - Tile identifier to find.
     * @returns The matching tile.
     * @throws {Error} If no tile has this `type`.
     */
    private findTile(type: TType): SpriteTileDescriptor<TType> {
        const tile = this.descriptor.rows.find((candidate) => candidate.type === type);
        if (!tile) {
            throw new Error(`Unknown sprite type: ${type}`);
        }
        return tile;
    }

    /**
     * Locates a tile within this sheet, returning the pixel rectangle it
     * occupies plus its collision bounds.
     *
     * @param type - Tile identifier to locate.
     * @returns The located tile.
     * @throws {Error} If `type` isn't a known tile.
     */
    public locateTile(type: TType): SpriteTile {
        const tile = this.findTile(type);
        const {cellWidth: w, cellHeight: h} = this.descriptor;
        return {x: tile.x, y: tile.y, w, h, bounds: tile.bounds};
    }

    /**
     * Every tile `type` this sheet defines. Lets callers enumerate or pick a
     * type at random without needing to know or duplicate the descriptor's
     * contents.
     *
     * @returns Every valid `type` value for this sheet.
     */
    public getSpriteTypes(): TType[] {
        return this.descriptor.rows.map((tile) => tile.type);
    }
}
