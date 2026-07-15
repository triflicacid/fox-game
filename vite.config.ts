import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  base: "./",
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist/web",
    // electron/main.ts is compiled separately into dist/electron; don't let
    // the client build wipe it out.
    emptyOutDir: false,
  },
});
