export interface DrawOp {
    kind: string;
    args: number[];
}

export interface MockCanvasContext {
    ctx: CanvasRenderingContext2D;
    ops: DrawOp[];
}

/** Creates a lightweight canvas-context stub for deterministic unit tests. */
export function createMockCanvasContext(): MockCanvasContext {
    const ops: DrawOp[] = [];

    const raw: Record<string, unknown> = {
        fillStyle: "#000000",
        strokeStyle: "#000000",
        lineWidth: 1,
        font: "14px monospace",
        fillRect: (x: number, y: number, w: number, h: number) => ops.push({kind: "fillRect", args: [x, y, w, h]}),
        strokeRect: (x: number, y: number, w: number, h: number) => ops.push({kind: "strokeRect", args: [x, y, w, h]}),
        fillText: (_text: string, x: number, y: number) => ops.push({kind: "fillText", args: [x, y]}),
        beginPath: () => ops.push({kind: "beginPath", args: []}),
        moveTo: (x: number, y: number) => ops.push({kind: "moveTo", args: [x, y]}),
        lineTo: (x: number, y: number) => ops.push({kind: "lineTo", args: [x, y]}),
        closePath: () => ops.push({kind: "closePath", args: []}),
        stroke: () => ops.push({kind: "stroke", args: []}),
        fill: () => ops.push({kind: "fill", args: []}),
        arc: (x: number, y: number, r: number, start: number, end: number) => ops.push({kind: "arc", args: [x, y, r, start, end]}),
        measureText: (text: string) => ({width: text.length * 10}),
    };

    return {ctx: raw as unknown as CanvasRenderingContext2D, ops};
}

