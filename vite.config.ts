import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from 'path';

export default defineConfig({
  plugins: [viteSingleFile()],
  base: "./",
  resolve: {
    alias: {
      "@lib": path.resolve(__dirname, "lib"),
    }
  },
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
