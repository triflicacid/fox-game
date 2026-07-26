/**
 * Coordinate packing: encodes an `(x, y)` integer pair as a single non-negative
 * safe integer, supporting coordinates in the range
 * `[-MAX_COORD, MAX_COORD)` = `[-8 388 608, 8 388 608)`.
 */
const MAX_COORD = 1 << 23; // 8,388,608
const COORD_RANGE = MAX_COORD * 2; // 16,777,216

function pack(x: number, y: number): number {
    if (x < -MAX_COORD || x >= MAX_COORD || y < -MAX_COORD || y >= MAX_COORD) {
        throw new RangeError(
            `CoordSet/CoordMap coordinate out of range: (${x}, ${y}). ` +
            `Each axis must be in [-${MAX_COORD}, ${MAX_COORD}).`,
        );
    }
    return (x + MAX_COORD) * COORD_RANGE + (y + MAX_COORD);
}

/**
 * A read-only view of a {@link CoordSet}: size, membership, equality, and
 * insertion-order iteration as `[x, y]` pairs.
 */
export interface ReadonlyCoordSet extends Iterable<[number, number]> {
    readonly size: number;
    has(x: number, y: number): boolean;
    /** Whether this set contains exactly the same coordinates as `other`. */
    equals(other: ReadonlyCoordSet): boolean;
}

/**
 * A mutable set of integer `(x, y)` coordinate pairs, backed by a numeric
 * hash key for O(1) membership tests.
 *
 * Iterates in insertion order as `[x, y]` tuples.
 */
export class CoordSet implements ReadonlyCoordSet {
    private readonly keys = new Set<number>();
    private readonly pairs: [number, number][] = [];

    /** Number of coordinates in the set. */
    get size(): number {
        return this.keys.size;
    }

    /** Whether `(x, y)` is in the set. */
    has(x: number, y: number): boolean {
        return this.keys.has(pack(x, y));
    }

    /**
     * Adds `(x, y)` to the set if not already present.
     * @returns `this`, for chaining.
     */
    add(x: number, y: number): this {
        const key = pack(x, y);
        if (!this.keys.has(key)) {
            this.keys.add(key);
            this.pairs.push([x, y]);
        }
        return this;
    }

    /** Iterates over `[x, y]` pairs in insertion order. */
    [Symbol.iterator](): IterableIterator<[number, number]> {
        return this.pairs[Symbol.iterator]();
    }

    /** Whether this set contains exactly the same coordinates as `other`. */
    equals(other: ReadonlyCoordSet): boolean {
        if (this.size !== other.size) {
            return false;
        }
        for (const [x, y] of other) {
            if (!this.has(x, y)) {
                return false;
            }
        }
        return true;
    }
}

/**
 * A map from integer `(x, y)` coordinate pairs to values of type `T`, backed
 * by a numeric hash key for O(1) lookup. Maintains insertion order for
 * {@link keys}, {@link values}, and {@link delete}-then-{@link set} reordering.
 */
export class CoordMap<T> {
    private readonly map = new Map<number, T>();
    private readonly pairs: [number, number][] = [];

    /** Number of entries in the map. */
    get size(): number {
        return this.map.size;
    }

    /** Whether the map has an entry for `(x, y)`. */
    has(x: number, y: number): boolean {
        return this.map.has(pack(x, y));
    }

    /** Returns the value at `(x, y)`, or `undefined` if absent. */
    get(x: number, y: number): T | undefined {
        return this.map.get(pack(x, y));
    }

    /**
     * Sets the value at `(x, y)`. New entries are appended to iteration order.
     * @returns `this`, for chaining.
     */
    set(x: number, y: number, value: T): this {
        const key = pack(x, y);
        if (!this.map.has(key)) {
            this.pairs.push([x, y]);
        }
        this.map.set(key, value);
        return this;
    }

    /**
     * Removes the entry for `(x, y)`.
     * @returns `true` if the entry existed, `false` otherwise.
     */
    delete(x: number, y: number): boolean {
        const key = pack(x, y);
        if (!this.map.delete(key)) {
            return false;
        }
        const idx = this.pairs.findIndex(([px, py]) => px === x && py === y);
        if (idx !== -1) {
            this.pairs.splice(idx, 1);
        }
        return true;
    }

    /** Removes all entries. */
    clear(): void {
        this.map.clear();
        this.pairs.length = 0;
    }

    /**
     * Iterates over coordinate pairs in insertion order.
     * Safe to call {@link delete} or {@link set} during iteration.
     */
    *keys(): IterableIterator<[number, number]> {
        yield* [...this.pairs];
    }

    /**
     * Iterates over values in insertion order.
     * Safe to call {@link delete} or {@link set} during iteration.
     */
    *values(): IterableIterator<T> {
        for (const [x, y] of [...this.pairs]) {
            const v = this.map.get(pack(x, y));
            if (v !== undefined) {
                yield v;
            }
        }
    }
}

