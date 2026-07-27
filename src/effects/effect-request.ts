/** A generic trigger an {@link Entity} broadcasts to ask for some transient effect. */
export abstract class EffectRequest {
    /**
     * @param key - Identifies which kind of effect this is, matched against registered handlers via {@link matches}.
     */
    protected constructor(public readonly key: string) {
    }

    /**
     * Whether a handler registered under `key` should run for this request.
     * The default is exact key equality.
     *
     * @param key - A registered handler's key to test against.
     * @returns `true` if that handler should run for this request.
     */
    public matches(key: string): boolean {
        return key === this.key;
    }
}
