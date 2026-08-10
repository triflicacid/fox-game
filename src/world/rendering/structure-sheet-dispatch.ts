import {ForestStructureSpriteSheet} from "../../sprites/ForestStructureSpriteSheet";
import {TundraStructureSpriteSheet} from "../../sprites/TundraStructureSpriteSheet";
import {DesertStructureSpriteSheet} from "../../sprites/DesertStructureSpriteSheet";
import {StaticSpriteSheet} from "../../sprites/StaticSpriteSheet";
import {SpriteTile} from "../../sprites/sprite";

/** Which of the three biome structure sprite sheets a sprite belongs to. */
type StructureSheetKey = "forest" | "tundra" | "desert";

/** One structure sprite sheet's dispatch entry, type-erased so every biome's sheet - despite each having its own mutually-incompatible sprite type - can sit in one lookup. */
interface StructureSheetEntry {
    /** This sheet's own {@link StaticSpriteSheet.getTileBitmap}, type-erased to plain `string`. */
    readonly getTileBitmap: (sprite: string) => Promise<ImageBitmap>;
    /** This sheet's own {@link StaticSpriteSheet.locateTile}, type-erased to plain `string`. */
    readonly locateTile: (sprite: string) => SpriteTile;
}

/**
 * Wraps a structure sprite sheet as a {@link StructureSheetEntry}.
 *
 * @param sheet - The sprite sheet to wrap.
 * @returns The wrapped entry.
 */
function toEntry<TType extends string>(sheet: StaticSpriteSheet<TType>): StructureSheetEntry {
    return {
        getTileBitmap: (sprite) => sheet.getTileBitmap(sprite as TType),
        locateTile: (sprite) => sheet.locateTile(sprite as TType),
    };
}

/**
 * Pairs every sprite type `sheet` actually defines with `key`, for folding
 * into the registry's own type -> sheet index.
 *
 * @param sheet - The sprite sheet to index.
 * @param key - `sheet`'s own key.
 * @returns One `[type, key]` pair per sprite type `sheet` defines.
 */
function indexSheet<TType extends string>(sheet: StaticSpriteSheet<TType>, key: StructureSheetKey): [string, StructureSheetKey][] {
    return sheet.getSpriteTypes().map((type) => [type, key]);
}

/**
 * Routes a bare structure sprite string to whichever of the three biome
 * structure sprite sheets (forest/tundra/desert) actually defines it - see
 * {@link buildStructureSheetRegistry}.
 */
export interface StructureSheetRegistry {
    /**
     * Finds whichever structure sprite sheet actually defines `sprite`.
     *
     * @param sprite - The structure sprite type to look up.
     * @returns The owning sheet's dispatch entry.
     * @throws {Error} If no loaded sheet defines `sprite`.
     */
    findSheet(sprite: string): StructureSheetEntry;
}

/**
 * Builds the shared {@link StructureSheetRegistry}: constructs each biome's
 * structure sprite sheet once, then indexes every sprite type each actually
 * defines (via {@link StaticSpriteSheet.getSpriteTypes}) to its owning sheet.
 *
 * @returns The built registry.
 */
export function buildStructureSheetRegistry(): StructureSheetRegistry {
    const forest = new ForestStructureSpriteSheet();
    const tundra = new TundraStructureSpriteSheet();
    const desert = new DesertStructureSpriteSheet();

    const sheets: Readonly<Record<StructureSheetKey, StructureSheetEntry>> = {
        forest: toEntry(forest),
        tundra: toEntry(tundra),
        desert: toEntry(desert),
    };

    const sheetByType: ReadonlyMap<string, StructureSheetKey> = new Map([
        ...indexSheet(forest, "forest"),
        ...indexSheet(tundra, "tundra"),
        ...indexSheet(desert, "desert"),
    ]);

    return {
        findSheet(sprite: string): StructureSheetEntry {
            const sheetKey = sheetByType.get(sprite);
            if (!sheetKey) {
                throw new Error(`Unknown structure sprite: ${sprite}`);
            }
            return sheets[sheetKey];
        },
    };
}
