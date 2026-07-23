import {DisplayLine} from "@display/input";
import {button, checkbox, hr, line, numberBox, radio, select, textbox} from "@display/builders";
import {KeyBinding} from "../help/key-binding";
import {KeyBindingPopupController} from "../popup/key-binding-popup-controller";
import {CameraFollowMode} from "../entities/movement-controller";
import {copyToClipboard} from "../util";

/**
 * Shows the game's settings in a {@link Popup}, opened with `#` and closed
 * with `Esc` or `#` again (or by selecting its `Close` button).
 */
export class SettingsController extends KeyBindingPopupController {
    /** How long the seed's "Copy" button reads "Copied" for after a click, in milliseconds. */
    private static readonly COPY_FEEDBACK_DURATION_MS = 1500;

    /** Characters the world-seed text box accepts - an optional leading `-` followed by digits. */
    private static readonly SEED_CHARS = [..."0123456789-"];

    /** Minimum width of the world-seed text box, in canvas pixels - wide enough for the longest seed `World.refreshWorldSeed` can generate, `4294967294` (10 digits, since it draws from `[0, 0xffffffff)`). */
    private static readonly SEED_BOX_MIN_WIDTH = 100;

    /** The seed line's Copy button's current label - see {@link handleCopyClick}. */
    private copyButtonLabel = "Copy";
    /** Pending revert-to-"Copy" timer from the last Copy click, if any. */
    private copyRevertTimeoutId: ReturnType<typeof setTimeout> | null = null;

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
     * @param getWorldSeed - Called on every {@link draw} to read the seed new chunks are generated from.
     * @param setWorldSeed - Invoked when the user commits a new value in the world-seed field.
     * @param refreshWorldSeed - Invoked when the user clicks the seed's Refresh button.
     * @param getMinChunkGenerationDelayMs - Called on every {@link draw} to read the debug minimum-delay-between-chunks knob.
     * @param setMinChunkGenerationDelayMs - Invoked when the user edits the minimum chunk generation delay field.
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
        private readonly getWorldSeed: () => number,
        private readonly setWorldSeed: (seed: number) => void,
        private readonly refreshWorldSeed: () => void,
        onOpenChange: (open: boolean) => void,
    ) {
        super("Settings", "#", {closeKeys: ["Escape", "#"], onOpenChange});
    }

    /**
     * This controller's own key bindings, for the help popup to list.
     *
     * @returns This controller's key bindings.
     */
    public override getKeyBindings(): KeyBinding[] {
        return [
            {key: "#", description: "Toggle the settings window"},
            {key: "Esc", description: "Close this popup"},
        ];
    }

    /**
     * Validates and commits a typed world-seed value.
     *
     * @param value - Text currently in the seed field.
     * @returns `true` if `value` parsed as an integer and was applied, `false` to reject and revert the field.
     */
    private handleSeedChange(value: string): boolean {
        const seed = Number(value);
        if (!Number.isInteger(seed)) {
            return false;
        }
        this.setWorldSeed(seed);
        return true;
    }

    /**
     * The seed field's Copy button's action: copies the current seed to the
     * clipboard, shows "Copied" for {@link COPY_FEEDBACK_DURATION_MS}, then
     * reverts to "Copy". Restarts the revert timer if clicked again mid-feedback.
     */
    private handleCopyClick(): void {
        copyToClipboard(String(this.getWorldSeed()));
        this.copyButtonLabel = "Copied";

        if (this.copyRevertTimeoutId !== null) {
            clearTimeout(this.copyRevertTimeoutId);
        }
        this.copyRevertTimeoutId = setTimeout(() => {
            this.copyRevertTimeoutId = null;
            this.copyButtonLabel = "Copy";
        }, SettingsController.COPY_FEEDBACK_DURATION_MS);
    }

    /**
     * Builds this popup's content.
     *
     * @returns The lines to show in the settings popup.
     */
    protected buildContent(): DisplayLine[] {
        const lines: DisplayLine[] = [
            line()
                .content("Camera follow mode: ")
                .content(radio({
                    selected: this.getCameraFollowMode() ?? "",
                    onSelect: (key) => this.setCameraFollowMode(key as CameraFollowMode),
                    options: [
                        {key: "edge", content: "Edge"},
                        {key: "center", content: "Centre"},
                    ],
                })),
            line().content(checkbox({checked: this.getSpectating(), onToggle: this.setSpectating, content: "Spectator mode"})),
            line().content(checkbox({checked: this.getDebugEnabled(), onToggle: this.setDebugEnabled, content: "Debug mode"})),
            line()
                .content("Target FPS: ")
                .content(numberBox({value: this.getTargetFps(), step: 1, min: 1, onChange: this.setTargetFps})),
            line()
                .content("World seed: ")
                .content(textbox({
                    value: String(this.getWorldSeed()),
                    allowedChars: SettingsController.SEED_CHARS,
                    maxWidth: Infinity,
                    minWidth: SettingsController.SEED_BOX_MIN_WIDTH,
                    onChange: (value) => this.handleSeedChange(value),
                }))
                .content(" ")
                .content(button({content: this.copyButtonLabel, onClick: () => this.handleCopyClick(), disabled: this.copyRevertTimeoutId !== null}))
                .content(" ")
                .content(button({content: "Refresh", onClick: () => this.refreshWorldSeed()})),
        ];

        if (this.getDebugEnabled()) {
            lines.push(
                line().content(hr()),
                line()
                    .content("Noise field: ")
                    .content(select({
                        selected: this.getNoiseFieldName() ?? "",
                        onSelect: (key) => this.setNoiseFieldName(key === "" ? undefined : key),
                        options: [
                            {key: "", content: "None"},
                            ...this.getNoiseFieldNames().map((name) => ({key: name, content: name})),
                        ],
                    })),
            );
            lines.push(line().content(checkbox({checked: this.getGenerationEnabled(), onToggle: this.setGenerationEnabled, content: "Chunk generation"})));
        }

        return lines;
    }
}
