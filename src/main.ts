import {World} from "./world/world";
import {Camera} from "./camera/camera";
import {CameraDragController} from "./camera/camera-drag-controller";
import {Vector2d} from "./geometry/vector2d";

function requireContext(context: CanvasRenderingContext2D | null): CanvasRenderingContext2D {
    if (!context) {
        throw new Error("Could not acquire 2D canvas context");
    }
    return context;
}

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = requireContext(canvas.getContext("2d"));

const TILE_SIZE = 32;

const world = new World(TILE_SIZE);
const camera = new Camera(Vector2d.ZERO, window.innerWidth, window.innerHeight);
new CameraDragController(canvas, camera);

function resize(): void {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    camera.setViewportSize(canvas.width, canvas.height);
    draw();
}

function draw(): void {
    world.draw(ctx, camera);

    ctx.fillStyle = "#f2a65a";
    ctx.font = "48px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Hello, fox", canvas.width / 2, canvas.height / 2);
}

let lastTickTime = performance.now();

function tick(now: number): void {
    const deltaMs = now - lastTickTime;
    lastTickTime = now;
    world.update(deltaMs, camera);
    draw();
    requestAnimationFrame(tick);
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(tick);
