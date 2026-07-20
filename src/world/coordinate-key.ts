/**
 * Builds a string key identifying an integer coordinate pair.
 *
 * @param x - X coordinate.
 * @param y - Y coordinate.
 * @returns A key uniquely identifying that coordinate pair.
 */
export function coordinateKey(x: number, y: number): string {
    return `${x},${y}`;
}

/**
 * Inverse of {@link coordinateKey}.
 *
 * @param key - A key previously produced by {@link coordinateKey}.
 * @returns The `[x, y]` it encodes.
 */
export function parseCoordinateKey(key: string): [number, number] {
    const [x, y] = key.split(",");
    return [Number(x), Number(y)];
}
