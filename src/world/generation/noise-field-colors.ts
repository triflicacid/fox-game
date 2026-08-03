/**
 * Named colour gradients for the noise-field debug overlay (see
 * `World.drawNoiseFieldOverlay`/`drawNoiseFieldLegend`) - lets
 * semantically-meaningful fields (e.g. temperature) render as a themed
 * colour ramp instead of plain greyscale. A field with no entry below falls
 * back to {@link GREYSCALE_GRADIENT}.
 */

/** One stop in a colour gradient: `rgb` at sample value `value`, in `[0, 1]`. */
export interface GradientStop {
    readonly value: number;
    readonly rgb: readonly [number, number, number];
}

/** Fallback gradient for fields with no themed entry in {@link NAMED_GRADIENTS}: black (0) to white (1). */
const GREYSCALE_GRADIENT: readonly GradientStop[] = [
    {value: 0, rgb: [0, 0, 0]},
    {value: 1, rgb: [255, 255, 255]},
];

/** Themed gradients, keyed by {@link NoiseField.name}. */
const NAMED_GRADIENTS: Record<string, readonly GradientStop[]> = {
    // Blackbody colour-temperature ramp (1000K-10000K), cold-to-hot: see
    // https://www.lightingdesignlab.com/sites/default/files/images/kelvin-temp.jpg
    temperature: [
        {value: 0, rgb: [204, 219, 255]}, // 10000K - blue sky
        {value: 1 / 9, rgb: [214, 225, 255]}, // 9000K
        {value: 2 / 9, rgb: [227, 233, 255]}, // 8000K - overcast daylight
        {value: 3 / 9, rgb: [245, 243, 255]}, // 7000K
        {value: 4 / 9, rgb: [255, 243, 239]}, // 6000K - noon daylight
        {value: 5 / 9, rgb: [255, 228, 206]}, // 5000K - electronic flash
        {value: 6 / 9, rgb: [255, 209, 163]}, // 4000K - household bulbs
        {value: 7 / 9, rgb: [255, 180, 107]}, // 3000K - early sunrise
        {value: 8 / 9, rgb: [255, 137, 18]}, // 2000K - tungsten light
        {value: 1, rgb: [255, 56, 0]}, // 1000K - candlelight
    ],
};

/**
 * The colour gradient a noise field should render with.
 *
 * @param fieldName - The field's name, e.g. `"temperature"`.
 * @returns The gradient's stops, ascending by `value`; {@link GREYSCALE_GRADIENT} if `fieldName` has no themed entry.
 */
export function getFieldGradient(fieldName: string): readonly GradientStop[] {
    return NAMED_GRADIENTS[fieldName] ?? GREYSCALE_GRADIENT;
}

/**
 * Interpolates a colour gradient at a sample value.
 *
 * @param stops - The gradient's stops, ascending by `value` (see {@link getFieldGradient}).
 * @param t - The sample value, clamped to `[0, 1]`.
 * @returns The interpolated colour, each channel in `[0, 255]`.
 */
export function sampleGradient(stops: readonly GradientStop[], t: number): readonly [number, number, number] {
    const clamped = Math.min(1, Math.max(0, t));
    for (let i = 0; i < stops.length - 1; i++) {
        const start = stops[i];
        const end = stops[i + 1];
        if (clamped <= end.value) {
            const span = end.value - start.value;
            const localT = span === 0 ? 0 : (clamped - start.value) / span;
            return [
                Math.round(start.rgb[0] + (end.rgb[0] - start.rgb[0]) * localT),
                Math.round(start.rgb[1] + (end.rgb[1] - start.rgb[1]) * localT),
                Math.round(start.rgb[2] + (end.rgb[2] - start.rgb[2]) * localT),
            ] as const;
        }
    }
    return stops[stops.length - 1].rgb;
}
