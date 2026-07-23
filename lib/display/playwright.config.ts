import {defineConfig} from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    timeout: 30_000,
    expect: {
        timeout: 10_000,
    },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: "list",
    use: {
        baseURL: "http://127.0.0.1:4173",
        viewport: {width: 980, height: 560},
        deviceScaleFactor: 1,
        colorScheme: "dark",
    },
    webServer: {
        command: "pnpm exec vite --host 127.0.0.1 --port 4173 --strictPort",
        url: "http://127.0.0.1:4173/tests/harness/index.html",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
    projects: [
        {
            name: "chromium",
            use: {
                browserName: "chromium",
            },
        },
    ],
});

