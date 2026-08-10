import {describe, expect, it} from "vitest";
import {Effect} from "../../effects/effect";
import {WorldEffects} from "./world-effects";

/** Effect double that records lifecycle events. */
class RecordingEffect extends Effect {
    public expired = false;

    public constructor(private readonly events: string[], private readonly tag: string) {
        super();
    }

    public override update(deltaMs: number): void {
        this.events.push(`${this.tag}:update:${deltaMs}`);
    }

    public override isExpired(): boolean {
        return this.expired;
    }

    public override draw(ctx: CanvasRenderingContext2D, viewX: number, viewY: number): void {
        void ctx;
        void viewX;
        void viewY;
        this.events.push(`${this.tag}:draw`);
    }
}

describe("WorldEffects registration", () => {
    it("draws a newly registered effect on the next draw call", () => {
        const events: string[] = [];
        const fx = new WorldEffects();
        fx.register(new RecordingEffect(events, "a"));

        fx.draw({} as CanvasRenderingContext2D, 0, 0);

        expect(events).toContain("a:draw");
    });
});

describe("WorldEffects update", () => {
    it("forwards deltaMs to every registered effect", () => {
        const events: string[] = [];
        const fx = new WorldEffects();
        fx.register(new RecordingEffect(events, "a"));
        fx.register(new RecordingEffect(events, "b"));

        fx.update(16);

        expect(events).toContain("a:update:16");
        expect(events).toContain("b:update:16");
    });

    it("removes an effect once it reports expired", () => {
        const events: string[] = [];
        const fx = new WorldEffects();
        const effect = new RecordingEffect(events, "a");
        fx.register(effect);

        effect.expired = true;
        fx.update(16);
        events.length = 0;
        fx.draw({} as CanvasRenderingContext2D, 0, 0);

        expect(events).not.toContain("a:draw");
    });

    it("keeps effects that are not yet expired", () => {
        const events: string[] = [];
        const fx = new WorldEffects();
        const a = new RecordingEffect(events, "a");
        const b = new RecordingEffect(events, "b");
        fx.register(a);
        fx.register(b);

        a.expired = true;
        fx.update(16);
        events.length = 0;
        fx.draw({} as CanvasRenderingContext2D, 0, 0);

        expect(events).not.toContain("a:draw");
        expect(events).toContain("b:draw");
    });
});

describe("WorldEffects draw order", () => {
    it("draws effects in registration order", () => {
        const events: string[] = [];
        const fx = new WorldEffects();
        fx.register(new RecordingEffect(events, "first"));
        fx.register(new RecordingEffect(events, "second"));
        fx.register(new RecordingEffect(events, "third"));

        fx.draw({} as CanvasRenderingContext2D, 0, 0);

        expect(events.indexOf("first:draw")).toBeLessThan(events.indexOf("second:draw"));
        expect(events.indexOf("second:draw")).toBeLessThan(events.indexOf("third:draw"));
    });
});

describe("WorldEffects clear", () => {
    it("removes all effects so none draw after clear", () => {
        const events: string[] = [];
        const fx = new WorldEffects();
        fx.register(new RecordingEffect(events, "a"));
        fx.register(new RecordingEffect(events, "b"));

        fx.clear();
        fx.draw({} as CanvasRenderingContext2D, 0, 0);

        expect(events).toHaveLength(0);
    });
});

