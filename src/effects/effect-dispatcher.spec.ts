import {describe, it, expect, vi} from "vitest";
import {EffectDispatcher} from "./effect-dispatcher";
import {EffectRequest} from "./effect-request";

class TestEffectRequest extends EffectRequest {
    public constructor(key: string) {
        super(key);
    }
}

class AlwaysMatchesRequest extends EffectRequest {
    public constructor(key: string) {
        super(key);
    }

    public override matches(): boolean {
        return true;
    }
}

describe("EffectDispatcher", () => {
    describe("add / dispatch", () => {
        it("calls a handler registered under a matching key, passing the request", () => {
            const dispatcher = new EffectDispatcher();
            const handler = vi.fn();
            const request = new TestEffectRequest("dash");

            dispatcher.add("dash", handler);
            dispatcher.dispatch(request);

            expect(handler).toHaveBeenCalledExactlyOnceWith(request);
        });

        it("does not call a handler registered under a different key", () => {
            const dispatcher = new EffectDispatcher();
            const handler = vi.fn();

            dispatcher.add("jump", handler);
            dispatcher.dispatch(new TestEffectRequest("dash"));

            expect(handler).not.toHaveBeenCalled();
        });

        it("calls all handlers registered under the same key", () => {
            const dispatcher = new EffectDispatcher();
            const first = vi.fn();
            const second = vi.fn();

            dispatcher.add("dash", first);
            dispatcher.add("dash", second);
            dispatcher.dispatch(new TestEffectRequest("dash"));

            expect(first).toHaveBeenCalledOnce();
            expect(second).toHaveBeenCalledOnce();
        });

        it("only calls handlers whose key matches, when handlers are registered under different keys", () => {
            const dispatcher = new EffectDispatcher();
            const dashHandler = vi.fn();
            const jumpHandler = vi.fn();

            dispatcher.add("dash", dashHandler);
            dispatcher.add("jump", jumpHandler);
            dispatcher.dispatch(new TestEffectRequest("dash"));

            expect(dashHandler).toHaveBeenCalledOnce();
            expect(jumpHandler).not.toHaveBeenCalled();
        });

        it("allows the same handler to be registered under multiple keys", () => {
            const dispatcher = new EffectDispatcher();
            const handler = vi.fn();

            dispatcher.add("dash", handler);
            dispatcher.add("jump", handler);
            dispatcher.dispatch(new TestEffectRequest("dash"));
            dispatcher.dispatch(new TestEffectRequest("jump"));

            expect(handler).toHaveBeenCalledTimes(2);
        });

        it("defers to the request's own matches() rather than exact key equality", () => {
            const dispatcher = new EffectDispatcher();
            const handler = vi.fn();

            dispatcher.add("unrelated-key", handler);
            dispatcher.dispatch(new AlwaysMatchesRequest("dash"));

            expect(handler).toHaveBeenCalledOnce();
        });

        it("is a no-op when dispatching with no registered handlers", () => {
            const dispatcher = new EffectDispatcher();

            expect(() => dispatcher.dispatch(new TestEffectRequest("dash"))).not.toThrow();
        });
    });

    describe("remove", () => {
        it("stops a previously-added handler from receiving dispatches", () => {
            const dispatcher = new EffectDispatcher();
            const handler = vi.fn();

            dispatcher.add("dash", handler);
            dispatcher.remove("dash", handler);
            dispatcher.dispatch(new TestEffectRequest("dash"));

            expect(handler).not.toHaveBeenCalled();
        });

        it("is a no-op when the handler was never registered under that key", () => {
            const dispatcher = new EffectDispatcher();
            const handler = vi.fn();
            const other = vi.fn();

            dispatcher.add("dash", other);

            expect(() => dispatcher.remove("dash", handler)).not.toThrow();

            dispatcher.dispatch(new TestEffectRequest("dash"));

            expect(other).toHaveBeenCalledOnce();
        });

        it("only removes the exact (key, handler) pair, leaving the same handler registered under another key", () => {
            const dispatcher = new EffectDispatcher();
            const handler = vi.fn();

            dispatcher.add("dash", handler);
            dispatcher.add("jump", handler);
            dispatcher.remove("dash", handler);

            dispatcher.dispatch(new TestEffectRequest("dash"));
            dispatcher.dispatch(new TestEffectRequest("jump"));

            expect(handler).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({key: "jump"}));
        });

        it("removes only one registration when the same handler was added twice under the same key", () => {
            const dispatcher = new EffectDispatcher();
            const handler = vi.fn();

            dispatcher.add("dash", handler);
            dispatcher.add("dash", handler);
            dispatcher.remove("dash", handler);
            dispatcher.dispatch(new TestEffectRequest("dash"));

            expect(handler).toHaveBeenCalledOnce();
        });
    });

    describe("clear", () => {
        it("removes all registered handlers regardless of key", () => {
            const dispatcher = new EffectDispatcher();
            const dashHandler = vi.fn();
            const jumpHandler = vi.fn();

            dispatcher.add("dash", dashHandler);
            dispatcher.add("jump", jumpHandler);
            dispatcher.clear();

            dispatcher.dispatch(new TestEffectRequest("dash"));
            dispatcher.dispatch(new TestEffectRequest("jump"));

            expect(dashHandler).not.toHaveBeenCalled();
            expect(jumpHandler).not.toHaveBeenCalled();
        });
    });
});
