/**
 * Generates a palette of pastel colours evenly spaced around the hue wheel.
 * High lightness and moderate saturation are what give the colours their
 * soft, pastel look.
 *
 * @param count - Number of colours to generate.
 * @param saturation - Saturation percentage, 0-100.
 * @param lightness - Lightness percentage, 0-100.
 * @returns `count` CSS `hsl()` colour strings.
 */
export function generatePastelPalette(count: number, saturation = 60, lightness = 82): string[] {
    const colors: string[] = [];
    for (let i = 0; i < count; i++) {
        const hue = Math.round((360 / count) * i);
        colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    }
    return colors;
}

/** Default pastel palette that tiles are coloured from. */
export const PASTEL_TILE_COLORS: string[] = generatePastelPalette(12);
