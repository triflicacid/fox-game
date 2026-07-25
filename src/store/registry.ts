/**
 * A named lookup of registered values. Subclasses decide how to derive a
 * value's own key.
 */
export abstract class Registry<K, V> {
    private readonly items = new Map<K, V>();

    /**
     * Derives the key `value` is registered under.
     *
     * @param value - The value being registered.
     * @returns The key to register `value` under.
     */
    protected abstract keyOf(value: V): K;

    /**
     * Registers `value` under its own key - see {@link keyOf}.
     * Registering the same instance again is a no-op; registering a different
     * value under an existing key is an error.
     *
     * @param value - The value to register.
     */
    public register(value: V): void {
        const key = this.keyOf(value);
        const existing = this.items.get(key);
        if (this.items.has(key) && existing !== value) {
            throw new Error(`A different value is already registered for key '${String(key)}'.`);
        }
        this.items.set(key, value);
    }

    /** Removes every registered value. */
    public clear(): void {
        this.items.clear();
    }

    /**
     * Looks up a registered value by key.
     *
     * @param key - The value's key.
     * @returns The value, or `undefined` if nothing is registered under that key.
     */
    public get(key: K): V | undefined {
        return this.items.get(key);
    }

    /**
     * Every registered value.
     *
     * @returns All registered values.
     */
    public getAll(): readonly V[] {
        return [...this.items.values()];
    }
}
