import {beforeEach, describe, expect, it, vi} from "vitest";
import {InteractableDisplay} from "@display/interactable-display";
import {FLAT_THEME} from "@display/flat-theme";
import {DisplayLine} from "@display/input";
import {createMockCanvasContext} from "@display/test-helpers/mock-canvas";
import {button, checkbox, line, numberBox, select, style, textbox} from "@display/builders";

type Listener = (event: KeyboardEvent | MouseEvent) => void;

function installWindowListenersMock(): Map<string, Listener[]> {
    const listeners = new Map<string, Listener[]>();

    Object.defineProperty(globalThis, "window", {
        value: {
            addEventListener: vi.fn((type: string, listener: Listener) => {
                const group = listeners.get(type) ?? [];
                group.push(listener);
                listeners.set(type, group);
            }),
            removeEventListener: vi.fn(),
        },
        configurable: true,
    });

    return listeners;
}

function triggerKeyDown(listeners: Map<string, Listener[]>, key: string): {preventDefault: ReturnType<typeof vi.fn>; stopPropagation: ReturnType<typeof vi.fn>} {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const event = {
        key,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        preventDefault,
        stopPropagation,
    } as unknown as KeyboardEvent;

    for (const listener of listeners.get("keydown") ?? []) {
        listener(event);
    }

    return {preventDefault, stopPropagation};
}

function triggerKeyUp(listeners: Map<string, Listener[]>, key: string): {preventDefault: ReturnType<typeof vi.fn>; stopPropagation: ReturnType<typeof vi.fn>} {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const event = {
        key,
        preventDefault,
        stopPropagation,
    } as unknown as KeyboardEvent;

    for (const listener of listeners.get("keyup") ?? []) {
        listener(event);
    }

    return {preventDefault, stopPropagation};
}

function triggerClick(listeners: Map<string, Listener[]>, x: number, y: number): {stopPropagation: ReturnType<typeof vi.fn>} {
    const stopPropagation = vi.fn();
    const event = {
        clientX: x,
        clientY: y,
        stopPropagation,
    } as unknown as MouseEvent;

    for (const listener of listeners.get("click") ?? []) {
        listener(event);
    }

    return {stopPropagation};
}

function layoutFrame(display: InteractableDisplay, lines: DisplayLine[]): void {
    const {ctx} = createMockCanvasContext();
    display.beginResolvePass();
    const {rows} = display.resolveLines(ctx, lines, 4);
    display.setFocusables(display.layoutLineFocusables(rows, 10, 10, 4));
}

describe("InteractableDisplay integration flows", () => {
    let listeners: Map<string, Listener[]>;

    beforeEach(() => {
        listeners = installWindowListenersMock();
    });

    it("opens a select, skips disabled options, and commits via keyboard", () => {
        const selectedKeys: string[] = [];
        const display = new InteractableDisplay({}, FLAT_THEME, "always");

        const lines: DisplayLine[] = [[{
            kind: "select",
            selected: "a",
            options: [
                {key: "a", content: "Alpha"},
                {key: "b", content: "Beta", disabled: true},
                {key: "c", content: "Gamma"},
            ],
            onSelect: (key) => {
                selectedKeys.push(key);
            },
        }]];

        layoutFrame(display, lines);
        display.setActive(true);
        const closedBounds = display.getOccupiedBounds();

        triggerKeyDown(listeners, "Enter");
        layoutFrame(display, lines);
        const openBounds = display.getOccupiedBounds();

        triggerKeyDown(listeners, "ArrowDown");
        triggerKeyDown(listeners, "Enter");

        expect(closedBounds).not.toBeNull();
        expect(openBounds).not.toBeNull();
        if (closedBounds === null || openBounds === null) {
            throw new Error("Expected occupied bounds to be available");
        }

        expect(openBounds.h).toBeGreaterThan(closedBounds.h);
        expect(selectedKeys).toEqual(["c"]);
    });

    it("starts and commits number editing via keyboard", () => {
        let value = 42;
        const onChange = vi.fn((next: number) => {
            value = next;
        });

        const display = new InteractableDisplay({}, FLAT_THEME, "always");
        const lines = (): DisplayLine[] => [[{
            kind: "number",
            value,
            onChange,
        }]];

        layoutFrame(display, lines());
        display.setActive(true);

        triggerKeyDown(listeners, "Backspace");
        triggerKeyDown(listeners, "Enter");

        expect(onChange).toHaveBeenCalledWith(4);
        expect(value).toBe(4);
    });

    it("filters textbox typing by allowedChars and commits accepted text", () => {
        let value = "ab";
        const onChange = vi.fn((next: string) => {
            value = next;
            return true;
        });

        const display = new InteractableDisplay({}, FLAT_THEME, "always");
        const lines = (): DisplayLine[] => [[{
            kind: "textbox",
            value,
            allowedChars: ["a", "b", "c"],
            onChange,
        }]];

        layoutFrame(display, lines());
        display.setActive(true);

        triggerKeyDown(listeners, "c");
        triggerKeyDown(listeners, "z");
        triggerKeyDown(listeners, "Enter");

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith("abc");
        expect(value).toBe("abc");
    });

    it("builds a mixed layout via builders and runs number/button keyboard flow", () => {
        let value = 1;
        const onNumberChange = vi.fn((next: number) => {
            value = next;
        });
        const onButtonClick = vi.fn();

        const display = new InteractableDisplay({}, FLAT_THEME, "always");
        const lines: DisplayLine[] = [
            line()
                .content("Builder:")
                .content(checkbox({checked: false, disabled: true, onToggle: () => undefined, content: "Disabled"}))
                .content(numberBox({value, onChange: onNumberChange, style: style().foreground("#00ff00")}))
                .content(button({content: "Apply", onClick: onButtonClick, focusedStyle: style().invert()})),
        ];

        layoutFrame(display, lines);
        display.setActive(true);

        triggerKeyDown(listeners, "ArrowRight");
        triggerKeyDown(listeners, "5");
        triggerKeyDown(listeners, "Enter");
        triggerKeyDown(listeners, "ArrowRight");
        triggerKeyDown(listeners, "Enter");
        triggerKeyUp(listeners, "Enter");

        expect(onNumberChange).toHaveBeenCalledWith(15);
        expect(value).toBe(15);
        expect(onButtonClick).toHaveBeenCalledTimes(1);
    });

    it("builds select/textbox rows via builders and expands occupied bounds when select opens", () => {
        const selectedKeys: string[] = [];
        const onTextCommit = vi.fn(() => true);
        const display = new InteractableDisplay({}, FLAT_THEME, "always");

        const lines: DisplayLine[] = [
            line().content("Theme").content(select({
                selected: "low",
                style: style().foreground("#ffcc00"),
                expandedStyle: style().background("#001122"),
                options: [
                    {key: "low", content: "Low"},
                    {key: "high", content: "High"},
                ],
                onSelect: (key) => {
                    selectedKeys.push(key);
                },
            })),
            line().content("Name").content(textbox({value: "ab", onChange: onTextCommit})),
        ];

        layoutFrame(display, lines);
        display.setActive(true);
        const closedBounds = display.getOccupiedBounds();

        triggerKeyDown(listeners, "Enter");
        layoutFrame(display, lines);
        const openBounds = display.getOccupiedBounds();

        triggerKeyDown(listeners, "ArrowDown");
        triggerKeyDown(listeners, "Enter");

        expect(closedBounds).not.toBeNull();
        expect(openBounds).not.toBeNull();
        if (closedBounds === null || openBounds === null) {
            throw new Error("Expected occupied bounds to be available");
        }

        expect(openBounds.h).toBeGreaterThan(closedBounds.h);
        expect(selectedKeys).toEqual(["high"]);
    });

    it("supports click-focus mode with builder-built controls", () => {
        const onButtonClick = vi.fn();
        const display = new InteractableDisplay({}, FLAT_THEME, "click");
        const lines: DisplayLine[] = [line().content(button({content: "Open", onClick: onButtonClick}))];

        display.setClickRegion({x: 0, y: 0, w: 200, h: 200});
        layoutFrame(display, lines);
        display.setActive(true);

        triggerClick(listeners, 20, 20);
        expect(display.isFocused()).toBe(true);
        expect(onButtonClick).toHaveBeenCalledTimes(1);

        triggerClick(listeners, 250, 250);
        expect(display.isFocused()).toBe(false);
    });
});


