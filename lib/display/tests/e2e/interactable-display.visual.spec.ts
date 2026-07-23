import {expect, test} from "@playwright/test";

const scenarios = [
    "flat-mixed-controls",
    "win98-select-open",
    "flat-click-focus-pressed",
    "flat-alignment-matrix",
    "flat-focused-background-matrix",
    "flat-focused-fontsize-matrix",
    "flat-disabled-all-controls",
    "win98-disabled-all-controls",
    "flat-textbox-selection-caret",
    "win98-dropdown-disabled-row-nav",
    "flat-button-mouse-pressed",
    "win98-hr-layout-modes",
    "flat-nested-format-scaling",
    "win98-padding-alignment-matrix",
    "win98-focused-background-matrix",
    "win98-focused-fontsize-select-open",
] as const;

for (const scenario of scenarios) {
    test(`renders ${scenario}`, async ({page}) => {
        await page.goto(`/tests/harness/index.html?scenario=${scenario}`);

        const canvas = page.locator("#scene");
        await expect(canvas).toHaveAttribute("data-rendered", "true");

        await expect(canvas).toHaveScreenshot(`${scenario}.png`, {
            scale: "css",
            animations: "disabled",
            caret: "hide",
            threshold: 0,
            maxDiffPixels: 0,
        });
    });
}


