import {DisplayLine} from "../lib/display/input";
import {KeyBinding} from "../help/key-binding";
import {PopupController} from "../lib/popup/popup-controller";
import {CameraFollowMode} from "../entities/movement-controller";
import {TextFormat} from "../lib/display/text-style";

/**
 * Shows the game's settings in a {@link Popup}, opened with `#` and closed
 * with `Esc` or `#` again (or by selecting its `Close` button).
 */
export class SettingsController extends PopupController {
    /** Value of the test textbox added below "Target FPS" - purely for exercising the textbox input kind, not wired to any real setting. */
    private textboxTestValue = "Hello, world";

    /**
     * @param getCameraFollowMode - Called on every {@link draw} to read the current camera follow mode.
     * @param setCameraFollowMode - Invoked when the user selects a different camera follow mode.
     * @param getSpectating - Called on every {@link draw} to read whether spectator mode is on.
     * @param setSpectating - Invoked when the user toggles the spectator mode checkbox.
     * @param getDebugEnabled - Called on every {@link draw} to read whether debug mode is on.
     * @param setDebugEnabled - Invoked when the user toggles the debug mode checkbox.
     * @param getGenerationEnabled - Called on every {@link draw} to read whether chunk generation is enabled.
     * @param setGenerationEnabled - Invoked when the user toggles the chunk generation checkbox.
     * @param getTargetFps - Called on every {@link draw} to read the current target FPS.
     * @param setTargetFps - Invoked when the user edits the target FPS field.
     * @param getNoiseFieldNames - Called on every {@link draw} to list the noise fields available to visualise.
     * @param getNoiseFieldName - Called on every {@link draw} to read which noise field (if any) is currently visualised.
     * @param setNoiseFieldName - Invoked when the user picks a different noise field, or `undefined` for none.
     * @param onOpenChange - Called whenever this popup opens or closes.
     */
    public constructor(
        private readonly getCameraFollowMode: () => CameraFollowMode | undefined,
        private readonly setCameraFollowMode: (mode: CameraFollowMode) => void,
        private readonly getSpectating: () => boolean,
        private readonly setSpectating: (spectating: boolean) => void,
        private readonly getDebugEnabled: () => boolean,
        private readonly setDebugEnabled: (enabled: boolean) => void,
        private readonly getGenerationEnabled: () => boolean,
        private readonly setGenerationEnabled: (enabled: boolean) => void,
        private readonly getTargetFps: () => number,
        private readonly setTargetFps: (fps: number) => void,
        private readonly getNoiseFieldNames: () => readonly string[],
        private readonly getNoiseFieldName: () => string | undefined,
        private readonly setNoiseFieldName: (name: string | undefined) => void,
        onOpenChange: (open: boolean) => void,
    ) {
        super("Settings", "#", {closeKeys: ["Escape", "#"], onOpenChange});
    }

    /**
     * This controller's own key bindings, for the help popup to list.
     *
     * @returns This controller's key bindings.
     */
    public getKeyBindings(): KeyBinding[] {
        return [
            {key: "#", description: "Toggle the settings window"},
            {key: "Esc", description: "Close this popup"},
        ];
    }

    /**
     * Builds this popup's content.
     *
     * @returns The lines to show in the settings popup.
     */
    protected buildContent(): DisplayLine[] {
        const lines: DisplayLine[] = [
            [
                {content: "Camera follow mode: ", align: 'centre'},
                {
                    kind: "radio",
                    selected: this.getCameraFollowMode() ?? "",
                    onSelect: (key) => this.setCameraFollowMode(key as CameraFollowMode),
                    options: [
                        {key: "edge", content: [{content: "Edge"}]},
                        {key: "center", content: [{content: "Centre"}]},
                    ],
                },
            ],
            [
                {kind: "checkbox", checked: this.getSpectating(), onToggle: this.setSpectating, content: [{content: "Spectator mode"}]},
            ],
            [
                {kind: "checkbox", checked: this.getDebugEnabled(), onToggle: this.setDebugEnabled, content: [{content: "Debug mode"}]},
            ],
            [
                {content: "Target FPS: "},
                {kind: "number", value: this.getTargetFps(), step: 1, onChange: this.setTargetFps},
            ],
        ];

        if (this.getDebugEnabled()) {
            lines.push([
                {content: "Noise field: "},
                {
                    kind: "select",
                    selected: this.getNoiseFieldName() ?? "",
                    onSelect: (key) => this.setNoiseFieldName(key === "" ? undefined : key),
                    options: [
                        {key: "", content: [{content: "None"}]},
                        ...this.getNoiseFieldNames().map((name) => ({key: name, content: [{content: name}]})),
                    ]
                },
            ]);
            lines.push([
                {kind: "checkbox", checked: this.getGenerationEnabled(), onToggle: this.setGenerationEnabled, content: [{content: "Chunk generation"}]},
            ]);
        }

        return lines;
    }
}
