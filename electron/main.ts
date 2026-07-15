import { app, BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev: boolean = process.env.NODE_ENV === "development";

function createWindow(): void {
    const window: BrowserWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            contextIsolation: true,
        },
    });

    const load = isDev
        ? window.loadURL("http://localhost:5173")
        : window.loadFile(path.join(__dirname, "..", "web", "index.html"));
    load.catch(e => console.error(e));
}

app.whenReady().then(() => {
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
