import {World} from "./world/world";
import {Camera} from "./camera/camera";
import {CameraDragController} from "./camera/camera-drag-controller";
import {MovementController} from "./entities/movement-controller";
import {Vector2d} from "./geometry/vector2d";
import {DebugController} from "./debug/debug-controller";
import {requireNonNull} from "./util";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = requireNonNull(canvas.getContext("2d"));

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
    world.draw(ctx, camera, debugController.isEnabled(), movementController.isSpectating());
}

let lastTickTime = performance.now();

function tick(now: number): void {
    const deltaMs = now - lastTickTime;
    lastTickTime = now;
    world.update(deltaMs, camera);
    movementController.update(deltaMs);
    draw();
    requestAnimationFrame(tick);
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(tick);
