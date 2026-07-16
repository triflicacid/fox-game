import {Vector2d} from "../geometry/vector2d";

/** Angle, in radians, each side of an arrowhead splays from the shaft. */
const ARROWHEAD_ANGLE = Math.PI / 7;

/** Length of an arrowhead's sides, in canvas pixels. */
const ARROWHEAD_LENGTH = 8;

/**
 * Draws a straight arrow from `from` to `to`. Used by debug overlays, e.g.
 * to show a {@link MovableEntity}'s facing direction.
 *
 * @param ctx - Canvas context to draw into.
 * @param from - Arrow's tail, in canvas pixels.
 * @param to - Arrow's tip, in canvas pixels.
 * @param color - Stroke/fill colour.
 * @param lineWidth - Shaft's stroke width, in canvas pixels.
 */
export function drawArrow(ctx: CanvasRenderingContext2D, from: Vector2d, to: Vector2d, color: string, lineWidth: number): void {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const leftAngle = angle + Math.PI - ARROWHEAD_ANGLE;
    const rightAngle = angle + Math.PI + ARROWHEAD_ANGLE;

    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x + Math.cos(leftAngle) * ARROWHEAD_LENGTH, to.y + Math.sin(leftAngle) * ARROWHEAD_LENGTH);
    ctx.lineTo(to.x + Math.cos(rightAngle) * ARROWHEAD_LENGTH, to.y + Math.sin(rightAngle) * ARROWHEAD_LENGTH);
    ctx.closePath();
    ctx.fill();
}
