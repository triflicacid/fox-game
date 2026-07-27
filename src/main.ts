import {WorldController} from "./world-controller";
import {exposeGlobals} from "./globals";
import {registerDynamicFields} from "./registry-init";

const TARGET_FPS = 60;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const worldController = new WorldController(canvas, TARGET_FPS);
exposeGlobals(worldController);
registerDynamicFields(worldController);
worldController.start();
