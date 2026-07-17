import {PopupLine} from "../popup/text-style";
import {KeyBinding} from "../help/key-binding";
import {PopupController} from "../popup/popup-controller";
import {CameraFollowMode} from "../entities/movement-controller";

/**
 * Shows the game's settings in a {@link Popup}, opened with `#` and closed
 * with `Esc` or `#` again (or by selecting its `Close` button).
 */
export class SettingsController extends PopupController {
    /**
     * @param getCameraFollowMode - Called on every {@link draw} to read the current camera follow mode.
     * @param setCameraFollowMode - Invoked when the user selects a different camera follow mode.
     * @param getSpectating - Called on every {@link draw} to read whether spectator mode is on.
     * @param setSpectating - Invoked when the user toggles the spectator mode checkbox.
     * @param getDebugEnabled - Called on every {@link draw} to read whether debug mode is on.
     * @param setDebugEnabled - Invoked when the user toggles the debug mode checkbox.
     * @param getTargetFps - Called on every {@link draw} to read the current target FPS.
     * @param setTargetFps - Invoked when the user edits the target FPS field.
     * @param onOpenChange - Called whenever this popup opens or closes.
     */
    public constructor(
        private readonly getCameraFollowMode: () => CameraFollowMode | undefined,
        private readonly setCameraFollowMode: (mode: CameraFollowMode) => void,
        private readonly getSpectating: () => boolean,
        private readonly setSpectating: (spectating: boolean) => void,
        private readonly getDebugEnabled: () => boolean,
        private readonly setDebugEnabled: (enabled: boolean) => void,
        private readonly getTargetFps: () => number,
        private readonly setTargetFps: (fps: number) => void,
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
     * Builds this popup's content: the camera follow mode as a radio choice
     * between {@link CameraFollowMode}'s two values, a checkbox each for
     * spectator mode and debug mode, and a number field for the target FPS.
     *
     * @returns The lines to show in the settings popup.
     */
    protected buildContent(): PopupLine[] {
        return [
            [
                {content: "Camera follow mode: "},
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
    }
}
