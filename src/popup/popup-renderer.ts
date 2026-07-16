import {Popup} from "./popup";
import {POPUP_CONFIG} from "./popup-config";

/**
 * Draws a dimming layer plus `popup`, centred on the canvas.
 *
 * @param ctx - Canvas context to draw into.
 * @param canvasWidth - Canvas width, in canvas pixels.
 * @param canvasHeight - Canvas height, in canvas pixels.
 * @param popup - Popup to draw.
 */
export function drawPopup(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, popup: Popup): void {
    if (!popup.isOpen()) {
        return;
    }

    const title = popup.getTitle();
    const lines = popup.getLines();
    const buttons = popup.getButtons();
    const cursor = popup.getCursor();
    const buttonLabels = buttons.map((button) => `[${button.label}]`);

    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    ctx.font = POPUP_CONFIG.titleFont;
    const titleWidth = title ? ctx.measureText(title).width : 0;

    ctx.font = POPUP_CONFIG.font;
    const lineWidths = lines.map((line) => ctx.measureText(line).width);
    const buttonWidths = buttonLabels.map((label) => ctx.measureText(label).width);
    const buttonRowWidth = buttonWidths.reduce((sum, w) => sum + w, 0)
        + POPUP_CONFIG.buttonGap * Math.max(buttons.length - 1, 0);

    const contentWidth = Math.max(titleWidth, buttonRowWidth, ...lineWidths, 0);
    const width = contentWidth + POPUP_CONFIG.padding * 2;

    const titleHeight = title ? POPUP_CONFIG.titleHeight : 0;
    const linesHeight = lines.length * POPUP_CONFIG.lineHeight;
    const buttonRowHeight = buttons.length > 0 ? POPUP_CONFIG.buttonRowGap + POPUP_CONFIG.lineHeight : 0;
    const height = titleHeight + linesHeight + buttonRowHeight + POPUP_CONFIG.padding * 2;

    const x = (canvasWidth - width) / 2;
    const y = (canvasHeight - height) / 2;

    ctx.fillStyle = POPUP_CONFIG.dimColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.fillStyle = POPUP_CONFIG.backgroundColor;
    ctx.fillRect(x, y, width, height);

    let lineY = y + POPUP_CONFIG.padding;
    if (title) {
        ctx.fillStyle = POPUP_CONFIG.titleColor;
        ctx.font = POPUP_CONFIG.titleFont;
        ctx.fillText(title, x + POPUP_CONFIG.padding, lineY);
        lineY += titleHeight;
    }

    ctx.font = POPUP_CONFIG.font;
    ctx.fillStyle = POPUP_CONFIG.textColor;
    for (const line of lines) {
        ctx.fillText(line, x + POPUP_CONFIG.padding, lineY);
        lineY += POPUP_CONFIG.lineHeight;
    }

    if (buttons.length > 0) {
        lineY += POPUP_CONFIG.buttonRowGap;
        let buttonX = x + POPUP_CONFIG.padding;
        buttonLabels.forEach((label, i) => {
            const labelWidth = buttonWidths[i];
            if (i === cursor) {
                ctx.fillStyle = POPUP_CONFIG.highlightBackgroundColor;
                ctx.fillRect(buttonX - 2, lineY - 2, labelWidth + 4, POPUP_CONFIG.lineHeight);
            }
            ctx.fillStyle = POPUP_CONFIG.textColor;
            ctx.fillText(label, buttonX, lineY);
            buttonX += labelWidth + POPUP_CONFIG.buttonGap;
        });
    }
}
