/**
 * Base class for a transient visual effect.
 */
export abstract class Effect {
    /**
     * Advances this effect by `deltaMs`.
     *
     * @param deltaMs - Time elapsed since the last update, in milliseconds.
     */
    public abstract update(deltaMs: number): void;

    /**
     * Whether this effect has fully finished and can be discarded.
     *
     * @returns `true` once the effect is done.
     */
    public abstract isExpired(): boolean;

    /**
     * Draws this effect.
     *
     * @param ctx - Canvas context to draw into.
     * @param viewX - Camera's view left edge, in world pixels.
     * @param viewY - Camera's view top edge, in world pixels.
     */
    public abstract draw(ctx: CanvasRenderingContext2D, viewX: number, viewY: number): void;
}
