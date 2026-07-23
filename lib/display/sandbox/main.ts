import {button, checkbox, hr, line, numberBox, select, textbox} from "../src/builders";
import {DisplayLine} from "../src/input";
import {InteractableDisplay} from "../src/interactable-display";
import {WIN98_THEME} from "../src/win98-theme";

const LINE_SPACING = 18;
const PANEL_PADDING = 24;

const DISPLAY_DEFAULTS = {
    fontFamily: "monospace",
    fontSize: 16,
    checkboxGap: 8,
    numberInputWidth: 72,
    selectPadding: 6,
    selectArrowWidth: 10,
    buttonPaddingX: 10,
    buttonPaddingY: 4,
};

const canvasElement = document.getElementById("sandbox") as HTMLCanvasElement | null;
const canvasContext = canvasElement?.getContext("2d") ?? null;

if (!canvasElement || !canvasContext) {
    throw new Error("Sandbox canvas is missing a 2D context.");
}

const canvas: HTMLCanvasElement = canvasElement;
const ctx: CanvasRenderingContext2D = canvasContext;

const display = new InteractableDisplay(DISPLAY_DEFAULTS, WIN98_THEME, "always");
display.setActive(true);

const state = {
    username: "Fox",
    speed: 5,
    palette: "forest",
    debugHud: false,
    pingCount: 0,
};

function resizeCanvasToDisplaySize(): void {
    const width = Math.floor(window.innerWidth);
    const height = Math.floor(window.innerHeight);
    if (canvas.width === width && canvas.height === height) {
        return;
    }

    canvas.width = width;
    canvas.height = height;
}

function buildLines(): DisplayLine[] {
    return [
        line().content("Display sandbox"),
        line().content("Tab/arrows/Enter or click."),
        line().content(hr()),
        line().content("Name:").content(textbox({
            value: state.username,
            minWidth: 120,
            maxWidth: 180,
            onChange: (value) => {
                state.username = value;
                return true;
            },
        })),
        line().content("Speed:").content(numberBox({
            value: state.speed,
            min: 1,
            max: 20,
            onChange: (value) => {
                state.speed = value;
            },
        })),
        line().content("Palette:").content(select({
            selected: state.palette,
            options: [
                {key: "forest", content: "Forest"},
                {key: "autumn", content: "Autumn"},
                {key: "night", content: "Night"},
            ],
            onSelect: (key) => {
                state.palette = key;
            },
        })),
        line().content(checkbox({
            checked: state.debugHud,
            content: "Enable debug HUD",
            onToggle: (checked) => {
                state.debugHud = checked;
            },
        })),
        line().content(button({
            content: "Ping",
            onClick: () => {
                state.pingCount += 1;
            },
        })).content(button({
            content: "Reset",
            onClick: () => {
                state.username = "Fox";
                state.speed = 5;
                state.palette = "forest";
                state.debugHud = false;
                state.pingCount = 0;
            },
        })),
        line().content(`State: ${state.username || "friend"}, speed ${state.speed}, ${state.palette}, dbg ${state.debugHud ? "on" : "off"}, pings ${state.pingCount}`),
    ];
}

function render(): void {
    resizeCanvasToDisplaySize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    ctx.fillStyle = "#1b2a1f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    display.setClickRegion({
        x: 0,
        y: 0,
        w: canvas.width,
        h: canvas.height,
    });

    display.beginResolvePass();
    const lines = buildLines();
    const {rows, width, height} = display.resolveLines(ctx, lines, LINE_SPACING);

    const panelX = PANEL_PADDING;
    const panelY = PANEL_PADDING;
    const panelWidth = width + PANEL_PADDING * 2;
    const panelHeight = height + PANEL_PADDING * 2;

    ctx.fillStyle = WIN98_THEME.surfaceBackground;
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    const border = WIN98_THEME.borderWidth;
    WIN98_THEME.drawPanelBorder(ctx, panelX - border, panelY - border, panelWidth + border * 2, panelHeight + border * 2);

    const contentX = panelX + PANEL_PADDING;
    const contentY = panelY + PANEL_PADDING;
    const focusables = display.layoutLineFocusables(rows, contentX, contentY, LINE_SPACING);
    display.setFocusables(focusables);
    display.drawLines(ctx, rows, contentX, contentY, LINE_SPACING);
    display.drawOverlays(ctx);

    requestAnimationFrame(render);
}

window.addEventListener("resize", resizeCanvasToDisplaySize);
requestAnimationFrame(render);

