import {CompassDirection} from "./direction";

/** Unit vectors for each compass direction; diagonals are normalised to length 1, same as the cardinal directions. */
const DIRECTION_VECTORS: Record<CompassDirection, readonly [x: number, y: number]> = {
    N: [0, -1],
    NE: [Math.SQRT1_2, -Math.SQRT1_2],
    E: [1, 0],
    SE: [Math.SQRT1_2, Math.SQRT1_2],
    S: [0, 1],
    SW: [-Math.SQRT1_2, Math.SQRT1_2],
    W: [-1, 0],
    NW: [-Math.SQRT1_2, -Math.SQRT1_2],
};

/** An immutable 2D vector, used for entity positions, velocities, and facings. */
export class Vector2d {
    /** The zero vector, `(0, 0)`. */
    public static readonly ZERO = new Vector2d(0, 0);

    /**
     * @param x - Horizontal component.
     * @param y - Vertical component.
     */
    public constructor(public readonly x: number, public readonly y: number) {
    }

    /**
     * The unit vector pointing in the given compass direction (canvas
     * convention: `y` increases downward, so north is `(0, -1)`).
     *
     * @param direction - Compass direction to convert.
     * @returns A unit vector pointing in that direction.
     */
    public static fromDirection(direction: CompassDirection): Vector2d {
        const [x, y] = DIRECTION_VECTORS[direction];
        return new Vector2d(x, y);
    }

    /**
     * Adds another vector to this one.
     *
     * @param other - Vector to add.
     * @returns The sum, as a new vector.
     */
    public add(other: Vector2d): Vector2d {
        return new Vector2d(this.x + other.x, this.y + other.y);
    }

    /**
     * Subtracts another vector from this one.
     *
     * @param other - Vector to subtract.
     * @returns The difference, as a new vector.
     */
    public subtract(other: Vector2d): Vector2d {
        return new Vector2d(this.x - other.x, this.y - other.y);
    }

    /**
     * Scales this vector by a scalar factor.
     *
     * @param factor - Amount to scale by.
     * @returns The scaled vector, as a new vector.
     */
    public scale(factor: number): Vector2d {
        return new Vector2d(this.x * factor, this.y * factor);
    }

    /**
     * This vector's angle, in radians.
     *
     * @returns The angle, in radians.
     */
    public angleRadians(): number {
        return Math.atan2(this.y, this.x);
    }
}
