/**
 * A generic trigger a `MovableEntity` broadcasts to ask for some transient
 * effect, dispatched by key to handlers registered via
 * `MovableEntity.addEffectHandler`.
 */
export abstract class EffectRequest {
    /**
     * @param key - Identifies which kind of effect this is (e.g. `"dash"`), matched against registered handlers via {@link matches}.
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
