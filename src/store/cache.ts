/**
 * A generic memoizing cache. Subclasses decide how to encode a key into the
 * string the internal map is keyed by.
 */
export abstract class Cache<K, V> {
    private readonly cache = new Map<string, V>();

    /**
     * Encodes `key` into the string the internal map is keyed by.
     *
     * @param key - The key to encode.
     * @returns A string uniquely identifying `key`.
     */
    protected abstract encodeKey(key: K): string;

    /**
     * Returns the cached value for `key`, computing and storing it via
     * `compute` on a miss.
     *
     * @param key - The key to look up.
     * @param compute - Computes the value on a cache miss.
     * @returns The cached or freshly computed value.
     */
    public get(key: K, compute: (key: K) => V): V {
        const encoded = this.encodeKey(key);
        if (this.cache.has(encoded)) {
            return this.cache.get(encoded) as V;
        }
        const value = compute(key);
        this.cache.set(encoded, value);
        return value;
    }

    /** Clears every cached entry. */
    public clear(): void {
        this.cache.clear();
    }
}
