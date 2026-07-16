import {SpriteFrame} from "./sprites/sprite";
import {FoxSpriteSheet} from "./sprites/fox";
import {randomElement} from "./util";
import {World} from "./world/world";

function requireContext(context: CanvasRenderingContext2D | null): CanvasRenderingContext2D {
    if (!context) {
        throw new Error("Could not acquire 2D canvas context");
    }
    return context;
}

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = requireContext(canvas.getContext("2d"));

const WALK_FRAME_MS = 120;
const TILE_SIZE = 32;

const world = new World(TILE_SIZE);
const foxSheet = new FoxSpriteSheet();
const directions = foxSheet.getDirections();
const walkDirection = randomElement(directions);
let walkFrame: SpriteFrame = foxSheet.locateSprite(walkDirection);
let walkBitmap: ImageBitmap | null = null;

async function showWalkFrame(frame: SpriteFrame): Promise<void> {
    walkBitmap = await foxSheet.extractSprite(frame);
    draw();
}
showWalkFrame(walkFrame);

setInterval(() => {
    walkFrame = foxSheet.next(walkFrame);
    showWalkFrame(walkFrame);
}, WALK_FRAME_MS);

function resize(): void {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    draw();
}

function draw(): void {
    world.draw(ctx, 0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#f2a65a";
    ctx.font = "48px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Hello, fox", canvas.width / 2, canvas.height / 2);

    if (walkBitmap) {
        const size = 128;
        ctx.drawImage(
            walkBitmap,
            canvas.width / 2 - size / 2,
            canvas.height / 2 + 32,
            size,
            size,
        );
    }
}

window.addEventListener("resize", resize);
resize();
