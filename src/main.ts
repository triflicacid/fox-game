import {World} from "./world/world";
import {Camera} from "./camera/camera";
import {CameraDragController} from "./camera/camera-drag-controller";
import {MovementController} from "./entities/movement-controller";
import {Vector2d} from "./geometry/vector2d";
import {DebugController} from "./debug/debug-controller";

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
const movementController = new MovementController(world.getMainEntity(), {camera, mode: "edge"});
const debugController = new DebugController();

function resize(): void {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    camera.setViewportSize(canvas.width, canvas.height);
    draw();
}

function draw(): void {
    world.draw(ctx, camera, debugController.isEnabled());
}

let lastTickTime = performance.now();

function tick(now: number): void {
    const deltaMs = now - lastTickTime;
    lastTickTime = now;
    world.update(deltaMs, camera);
    movementController.updateCamera();
    draw();
    requestAnimationFrame(tick);
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(tick);
