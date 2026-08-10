import {Effect} from "../../effects/effect";

/** Owns the active transient effects for one world instance. */
export class WorldEffects {
    private effects: Effect[] = [];

    /** Adds `effect` to the live set. */
    public register(effect: Effect): void {
        this.effects.push(effect);
    }

    /** Advances every active effect and removes any that have expired. */
    public update(deltaMs: number): void {
        this.effects.forEach(e => e.update(deltaMs));
        this.effects = this.effects.filter(e => !e.isExpired());
    }

    /** Draws every active effect in registration order. */
    public draw(ctx: CanvasRenderingContext2D, viewX: number, viewY: number): void {
        for (const effect of this.effects) {
            effect.draw(ctx, viewX, viewY);
        }
    }

    /** Removes all active effects without advancing them to expiry. */
    public clear(): void {
        this.effects = [];
    }
}

