import {defineConfig} from "vitest/config";
import path from "path";

export default defineConfig({
    resolve: {
        alias: {
            "@display": path.resolve(__dirname, "lib/display/src"),
            "@frames": path.resolve(__dirname, "lib/frames/src"),
            "@keyboard": path.resolve(__dirname, "lib/keyboard/src/index.ts"),
            "@lib": path.resolve(__dirname, "lib"),
        },
    },
    test: {
        name: "unit",
        environment: "node",
        include: ["src/**/*.spec.ts"],
        exclude: ["lib/**", "node_modules/**", "dist/**"],
    },
});


