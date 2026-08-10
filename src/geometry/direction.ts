/** One of the 8 compass directions. */
export type CompassDirection = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

/** Every compass direction, in clockwise order starting from north. */
export const COMPASS_DIRECTIONS: CompassDirection[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/**
 * Maps a displacement vector to one of the eight compass directions.
 *
 * @param dx - Horizontal displacement.
 * @param dy - Vertical displacement.
 * @returns The nearest compass direction.
 */
export function toCompassDirection(dx: number, dy: number): CompassDirection {
	const angle = Math.atan2(dy, dx) * 180 / Math.PI;
	const normalized = (angle + 360) % 360;
	const index = Math.round(normalized / 45) % 8;
	return ["E", "SE", "S", "SW", "W", "NW", "N", "NE"][index] as CompassDirection;
}

