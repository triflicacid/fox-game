import {WorldController} from "./world-controller";
import {exposeGlobals} from "./globals";

const TARGET_FPS = 60;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const worldController = new WorldController(canvas, TARGET_FPS);
exposeGlobals(worldController);
worldController.start();
