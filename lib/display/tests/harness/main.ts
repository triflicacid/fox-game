import {InteractableDisplay, FocusMode} from "@display/interactable-display";
import {FLAT_THEME} from "@display/flat-theme";
import {WIN98_THEME} from "@display/win98-theme";
import {DisplayLine} from "@display/input";
import {button, checkbox, hr, line, numberBox, select, style, textbox} from "@display/builders";
import {ChromeTheme} from "@display/chrome-theme";

type KeyEventType = "keydown" | "keyup";
type MouseEventType = "mousedown" | "mouseup" | "click";

interface SceneRuntime {
    render: () => void;
    key: (key: string, type?: KeyEventType, init?: Partial<KeyboardEventInit>) => void;
    mouse: (x: number, y: number, type?: MouseEventType) => void;
}

interface Scene {
    theme: ChromeTheme;
    focusMode: FocusMode;
    initialFocusIndex?: number | null;
    lines: () => DisplayLine[];
    run?: (runtime: SceneRuntime) => void;
}

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");

if (!ctx) {
    throw new Error("Missing 2D canvas context for visual harness.");
}

const canvasCtx: CanvasRenderingContext2D = ctx;

// Keep caret blink phase deterministic across screenshot runs.
Date.now = () => 1_000;

canvasCtx.textBaseline = "top";

const sharedState = {
    volume: 7,
    profile: "dev",
    username: "Fox",
    alias: "Den",
    quantity: 12,
    mode: "balanced",
};

const scenes: Record<string, Scene> = {
    "flat-mixed-controls": {
        theme: FLAT_THEME,
        focusMode: "always",
        lines: () => [
            line().content("Profile:").content(select({
                selected: sharedState.profile,
                options: [
                    {key: "dev", content: "Developer"},
                    {key: "qa", content: "QA", disabled: true},
                    {key: "play", content: "Play"},
                ],
                onSelect: (next) => {
                    sharedState.profile = next;
                },
            })),
            line().content("Username:").content(textbox({
                value: sharedState.username,
                onChange: (next) => {
                    sharedState.username = next;
                    return true;
                },
            })),
            line()
                .content(checkbox({
                    checked: true,
                    content: "Sound",
                    onToggle: () => undefined,
                    style: style().foreground("#00ff00"),
                }))
                .content(numberBox({
                    value: sharedState.volume,
                    min: 0,
                    max: 11,
                    onChange: (next) => {
                        sharedState.volume = next;
                    },
                }))
                .content(button({
                    content: "Apply",
                    onClick: () => undefined,
                    focusedStyle: style().invert(),
                })),
        ],
    },
    "win98-select-open": {
        theme: WIN98_THEME,
        focusMode: "always",
        lines: () => [
            line().content("Difficulty").content(select({
                selected: "low",
                options: [
                    {key: "low", content: "Low"},
                    {key: "mid", content: "Medium", disabled: true},
                    {key: "high", content: "High"},
                ],
                onSelect: () => undefined,
            })),
            line().content(button({
                content: "Start",
                onClick: () => undefined,
            })),
        ],
        run: ({render, key}) => {
            key("Enter");
            render();
            key("ArrowDown");
            render();
        },
    },
    "flat-click-focus-pressed": {
        theme: FLAT_THEME,
        focusMode: "click",
        lines: () => [
            line().content(button({
                content: "Open",
                onClick: () => undefined,
            })),
            line().content("Click mode active"),
        ],
        run: ({render, mouse, key}) => {
            mouse(40, 50, "click");
            render();
            key("Enter", "keydown");
            render();
        },
    },
    "flat-alignment-matrix": {
        theme: FLAT_THEME,
        focusMode: "always",
        lines: () => [
            line()
                .content({content: "ALIGN", style: style().foreground("#66ddff").fontSize(24).build()})
                .content(checkbox({checked: true, content: "Top", onToggle: () => undefined, align: "top", focusedStyle: style().background("#1e3a5f")}))
                .content(numberBox({value: 5, onChange: () => undefined, align: "centre", focusedStyle: style().background("#223c22")}))
                .content(button({content: "Bottom", onClick: () => undefined, align: "bottom", focusedStyle: style().background("#4c2e4a")})),
            line()
                .content({content: "Rows", align: "bottom", style: style().foreground("#ffc977").fontSize(18).build()})
                .content(textbox({value: "fox", onChange: () => true, align: "top", focusedStyle: style().background("#2d2d66")}))
                .content(select({
                    selected: "b",
                    align: "centre",
                    options: [
                        {key: "a", content: "Alpha"},
                        {key: "b", content: "Beta"},
                    ],
                    onSelect: () => undefined,
                    focusedStyle: style().background("#2f4f2f"),
                })),
        ],
    },
    "flat-focused-background-matrix": {
        theme: FLAT_THEME,
        focusMode: "always",
        initialFocusIndex: 3,
        lines: () => [
            line()
                .content({content: "Focus BG", style: style().foreground("#88ccff").fontSize(20).build(), align: "top"})
                .content(checkbox({checked: false, content: "Check", onToggle: () => undefined, align: "centre", focusedStyle: style().background("#05344d").foreground("#d2f4ff")}))
                .content(numberBox({value: sharedState.quantity, onChange: (next) => { sharedState.quantity = next; }, align: "bottom", focusedStyle: style().background("#214a1f").foreground("#d4ffcb")}))
                .content(textbox({value: sharedState.alias, onChange: (next) => { sharedState.alias = next; return true; }, align: "top", focusedStyle: style().background("#471f52").foreground("#f8dcff")})),
            line()
                .content(select({
                    selected: sharedState.mode,
                    options: [
                        {key: "balanced", content: "Balanced"},
                        {key: "safe", content: "Safe"},
                        {key: "max", content: "Max"},
                    ],
                    onSelect: (next) => {
                        sharedState.mode = next;
                    },
                    align: "centre",
                    focusedStyle: style().background("#5c3c18").foreground("#ffe9c9"),
                }))
                .content(button({content: "Apply", onClick: () => undefined, align: "bottom", focusedStyle: style().background("#163a5f").foreground("#d7ecff")})),
        ],
    },
    "flat-focused-fontsize-matrix": {
        theme: FLAT_THEME,
        focusMode: "always",
        lines: () => [
            line()
                .content({content: "Font Shift", style: style().foreground("#ffca6b").fontSize(18).build()})
                .content(button({content: "Grow Btn", onClick: () => undefined, focusedStyle: style().fontSize(21).background("#3e2e18"), align: "bottom"}))
                .content(numberBox({value: sharedState.volume, onChange: (next) => { sharedState.volume = next; }, focusedStyle: style().fontSize(20).background("#1f4420"), align: "centre"})),
            line()
                .content(textbox({value: sharedState.username, onChange: (next) => { sharedState.username = next; return true; }, focusedStyle: style().fontSize(22).background("#292d57"), align: "top"}))
                .content(select({
                    selected: sharedState.profile,
                    options: [
                        {key: "dev", content: "Developer"},
                        {key: "play", content: "Play"},
                    ],
                    onSelect: (next) => {
                        sharedState.profile = next;
                    },
                    focusedStyle: style().fontSize(20).background("#46321f"),
                    align: "bottom",
                }))
                .content({
                    content: "interactive",
                    interactive: true,
                    onClick: () => undefined,
                    align: "centre",
                    focusedStyle: style().fontSize(24).background("#3f1f46").build(),
                }),
        ],
        run: ({render, key}) => {
            key("ArrowRight");
            render();
            key("ArrowRight");
            render();
            key("ArrowDown");
            render();
        },
    },
    "win98-padding-alignment-matrix": {
        theme: WIN98_THEME,
        focusMode: "always",
        lines: () => [
            line()
                .content({content: "Pad", style: style().fontSize(24).foreground("#000000").build(), align: "top", margin: [0, 10, 0, 0]})
                .content(checkbox({checked: true, content: "Wide", onToggle: () => undefined, padding: [2, 6, 2, 6], margin: [0, 12, 0, 0], align: "centre", focusedStyle: style().background("#001f6a").foreground("#ffffff")}))
                .content(button({content: "Tall", onClick: () => undefined, padding: [4, 10, 4, 10], align: "bottom", focusedStyle: style().background("#001f6a").foreground("#ffffff")})),
            line()
                .content(numberBox({value: 9, onChange: () => undefined, align: "bottom", padding: [4, 6, 4, 6], focusedStyle: style().background("#001f6a").foreground("#ffffff")}))
                .content(textbox({value: "retro", onChange: () => true, align: "top", padding: [3, 8, 3, 8], focusedStyle: style().background("#001f6a").foreground("#ffffff")}))
                .content(select({
                    selected: "m",
                    options: [
                        {key: "s", content: "Small"},
                        {key: "m", content: "Medium"},
                        {key: "l", content: "Large"},
                    ],
                    onSelect: () => undefined,
                    align: "centre",
                    padding: [2, 6, 2, 6],
                    focusedStyle: style().background("#001f6a").foreground("#ffffff"),
                })),
        ],
    },
    "win98-focused-background-matrix": {
        theme: WIN98_THEME,
        focusMode: "always",
        initialFocusIndex: 4,
        lines: () => [
            line()
                .content({content: "Focus Paint", style: style().fontSize(19).foreground("#000000").build(), align: "top"})
                .content({content: "link", interactive: true, onClick: () => undefined, align: "centre", focusedStyle: style().background("#000080").foreground("#ffffff").build()})
                .content(button({content: "Run", onClick: () => undefined, align: "bottom", focusedStyle: style().background("#000080").foreground("#ffffff")})),
            line()
                .content(checkbox({checked: false, content: "Toggle", onToggle: () => undefined, align: "bottom", focusedStyle: style().background("#000080").foreground("#ffffff")}))
                .content(numberBox({value: 3, onChange: () => undefined, align: "top", focusedStyle: style().background("#000080").foreground("#ffffff")}))
                .content(textbox({value: "win98", onChange: () => true, align: "centre", focusedStyle: style().background("#000080").foreground("#ffffff")})),
        ],
    },
    "win98-focused-fontsize-select-open": {
        theme: WIN98_THEME,
        focusMode: "always",
        lines: () => [
            line()
                .content({content: "Focus Size", style: style().fontSize(18).foreground("#000000").build(), align: "top"})
                .content(select({
                    selected: "normal",
                    options: [
                        {key: "normal", content: "Normal"},
                        {key: "large", content: "Large"},
                        {key: "xl", content: "XL"},
                    ],
                    onSelect: () => undefined,
                    focusedStyle: style().fontSize(21).background("#000080").foreground("#ffffff"),
                    expandedStyle: style().background("#c0d0ff").foreground("#000000"),
                    align: "bottom",
                }))
                .content(button({content: "Confirm", onClick: () => undefined, focusedStyle: style().fontSize(20).background("#000080").foreground("#ffffff"), align: "centre"})),
            line()
                .content(textbox({value: "size", onChange: () => true, focusedStyle: style().fontSize(20).background("#000080").foreground("#ffffff"), align: "bottom"}))
                .content(numberBox({value: 14, onChange: () => undefined, focusedStyle: style().fontSize(20).background("#000080").foreground("#ffffff"), align: "top"})),
        ],
        run: ({render, key}) => {
            key("Enter");
            render();
            key("ArrowDown");
            render();
        },
    },
    "flat-disabled-all-controls": {
        theme: FLAT_THEME,
        focusMode: "always",
        lines: () => [
            line()
                .content({content: "Disabled", style: style().fontSize(20).foreground("#b8dfff").build(), align: "top"})
                .content({content: "link", interactive: true, disabled: true, onClick: () => undefined, align: "bottom", focusedStyle: style().background("#224466").build()}),
            line()
                .content(checkbox({checked: true, content: "Checkbox", disabled: true, onToggle: () => undefined, align: "centre"}))
                .content(numberBox({value: 8, disabled: true, onChange: () => undefined, align: "top"}))
                .content(textbox({value: "ghost", disabled: true, onChange: () => true, align: "bottom"})),
            line()
                .content(select({
                    selected: "b",
                    disabled: true,
                    options: [
                        {key: "a", content: "A"},
                        {key: "b", content: "B"},
                        {key: "c", content: "C", disabled: true},
                    ],
                    onSelect: () => undefined,
                    align: "top",
                }))
                .content(button({content: "Disabled Btn", disabled: true, onClick: () => undefined, align: "centre"})),
        ],
    },
    "win98-disabled-all-controls": {
        theme: WIN98_THEME,
        focusMode: "always",
        lines: () => [
            line().content({content: "Disabled", style: style().fontSize(20).foreground("#000000").build(), align: "top"}),
            line()
                .content(checkbox({checked: false, content: "Legacy", disabled: true, onToggle: () => undefined, align: "bottom"}))
                .content(numberBox({value: 2, disabled: true, onChange: () => undefined, align: "centre"}))
                .content(textbox({value: "win98", disabled: true, onChange: () => true, align: "top"})),
            line()
                .content(select({
                    selected: "safe",
                    disabled: true,
                    options: [
                        {key: "safe", content: "Safe"},
                        {key: "fast", content: "Fast"},
                    ],
                    onSelect: () => undefined,
                    align: "bottom",
                }))
                .content(button({content: "Run", disabled: true, onClick: () => undefined, align: "top"})),
        ],
    },
    "flat-textbox-selection-caret": {
        theme: FLAT_THEME,
        focusMode: "always",
        lines: () => [
            line()
                .content({content: "Selection", style: style().foreground("#e4d085").fontSize(18).build()})
                .content(textbox({
                    value: "Visual Test",
                    onChange: () => true,
                    selectedStyle: style().background("#6e204f").foreground("#ffe7f7"),
                    focusedStyle: style().background("#2a2f66").foreground("#d3dcff"),
                    minWidth: 260,
                    align: "bottom",
                })),
        ],
        run: ({render, key}) => {
            key("x");
            render();
            key("ArrowLeft", "keydown", {shiftKey: true});
            key("ArrowLeft", "keydown", {shiftKey: true});
            key("ArrowLeft", "keydown", {shiftKey: true});
            key("ArrowLeft", "keydown", {shiftKey: true});
            key("ArrowLeft", "keydown", {shiftKey: true});
            render();
        },
    },
    "win98-dropdown-disabled-row-nav": {
        theme: WIN98_THEME,
        focusMode: "always",
        lines: () => [
            line().content("Route:").content(select({
                selected: "a",
                options: [
                    {key: "a", content: "Alpha"},
                    {key: "b", content: "Beta", disabled: true},
                    {key: "c", content: "Gamma"},
                    {key: "d", content: "Delta", disabled: true},
                    {key: "e", content: "Epsilon"},
                ],
                onSelect: () => undefined,
                focusedStyle: style().background("#000080").foreground("#ffffff"),
                expandedStyle: style().background("#d9e4ff").foreground("#000000"),
            })),
            line().content(button({content: "Commit", onClick: () => undefined})),
        ],
        run: ({render, key}) => {
            key("Enter");
            render();
            key("ArrowDown");
            render();
        },
    },
    "flat-button-mouse-pressed": {
        theme: FLAT_THEME,
        focusMode: "always",
        lines: () => [
            line()
                .content(button({content: "Mouse Press", onClick: () => undefined, align: "bottom"}))
                .content(button({content: "Idle", onClick: () => undefined, align: "top"})),
        ],
        run: ({render, mouse}) => {
            mouse(40, 40, "mousedown");
            render();
        },
    },
    "win98-hr-layout-modes": {
        theme: WIN98_THEME,
        focusMode: "always",
        lines: () => [
            line().content({content: "Short", style: style().fontSize(14).build()}),
            line().content(hr({length: "max", thickness: 2, style: style().background("#b0b0b0")})),
            line().content({content: "Very long middle row for HR reference", style: style().fontSize(16).build()}),
            line().content(hr({length: "top", thickness: 2})),
            line().content({content: "Tail", style: style().fontSize(12).build()}),
        ],
    },
    "flat-nested-format-scaling": {
        theme: FLAT_THEME,
        focusMode: "always",
        lines: () => [
            line()
                .content(button({
                    content: [
                        {content: "Big", style: style().fontSize(24).foreground("#ffe08a").build()},
                        {content: " ", style: style().fontSize(24).build()},
                        {content: "Btn", style: style().fontSize(14).foreground("#9ae6ff").build()},
                    ],
                    onClick: () => undefined,
                    align: "bottom",
                }))
                .content(checkbox({
                    checked: true,
                    content: [
                        {content: "XL", style: style().fontSize(20).foreground("#86ffa8").build()},
                        {content: " label", style: style().fontSize(14).build()},
                    ],
                    onToggle: () => undefined,
                    align: "centre",
                })),
            line()
                .content({content: "Mixed nested segments", style: style().foreground("#d2b7ff").fontSize(16).build(), align: "top"})
                .content(textbox({value: "sizes", onChange: () => true, align: "bottom", focusedStyle: style().fontSize(20).background("#3f2a5f")})),
        ],
    },
};

const params = new URLSearchParams(window.location.search);
const sceneName = params.get("scenario") ?? "flat-mixed-controls";
const scene = scenes[sceneName];

if (!scene) {
    throw new Error(`Unknown harness scenario: ${sceneName}`);
}

const display = new InteractableDisplay({}, scene.theme, scene.focusMode, scene.initialFocusIndex ?? 0);
display.setClickRegion({x: 0, y: 0, w: canvas.width, h: canvas.height});
display.setActive(true);

function key(keyValue: string, type: KeyEventType = "keydown", init: Partial<KeyboardEventInit> = {}): void {
    window.dispatchEvent(new KeyboardEvent(type, {
        key: keyValue,
        bubbles: true,
        cancelable: true,
        ...init,
    }));
}

function mouse(x: number, y: number, type: MouseEventType = "click"): void {
    window.dispatchEvent(new MouseEvent(type, {clientX: x, clientY: y, bubbles: true, cancelable: true}));
}

function render(): void {
    canvasCtx.fillStyle = "#111";
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    const lines = scene.lines();
    display.beginResolvePass();
    const {rows} = display.resolveLines(canvasCtx, lines, 8);
    display.setFocusables(display.layoutLineFocusables(rows, 20, 30, 8));
    display.drawLines(canvasCtx, rows, 20, 30, 8);
    display.drawOverlays(canvasCtx);

    canvas.dataset.rendered = "true";
}

render();
scene.run?.({render, key, mouse});


