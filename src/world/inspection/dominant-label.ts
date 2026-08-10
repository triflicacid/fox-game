export interface TileRange {
    startTileX: number;
    startTileY: number;
    endTileX: number;
    endTileY: number;
}

/**
 * Returns the most frequent non-"none" label within the inclusive tile range.
 * Ties keep the first encountered label while scanning rows top-to-bottom.
 * Returns `"none"` if there are no tiles.
 */
export function dominantNonNoneLabel<T extends string>(
    range: TileRange,
    readLabel: (tileX: number, tileY: number) => T | "none",
): T | "none" {
    const counts = new Map<T, number>();

    for (let tileY = range.startTileY; tileY <= range.endTileY; tileY++) {
        for (let tileX = range.startTileX; tileX <= range.endTileX; tileX++) {
            const label = readLabel(tileX, tileY);
            if (label !== "none") {
                counts.set(label, (counts.get(label) ?? 0) + 1);
            }
        }
    }

    let dominantLabel: T | "none" = "none";
    let dominantCount = 0;
    for (const [label, count] of counts) {
        if (count > dominantCount) {
            dominantLabel = label;
            dominantCount = count;
        }
    }

    return dominantLabel;
}


