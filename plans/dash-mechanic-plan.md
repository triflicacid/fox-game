# Dash Mechanic Plan

_Created 2026-07-26._

This document turns the `ideas.md` entry “A dash (like Celeste)” into an
implementation plan for the game's top-down, eight-direction movement. The
dash should feel like the fox commits to a short leap, not like ordinary
movement with a larger speed multiplier.

The recommended visual treatment is **a brief cool-blue/cyan trail and launch
flash**. Keep the fox's own orange palette intact. Blue gives the action a
clear silhouette against the mostly green/brown world and communicates the
special movement state, while the leap animation supplies the fox-specific
character. It should be an accent rather than a full-screen effect or a close
copy of Celeste's presentation.

---

## 1. Goals

- Make the dash immediately responsive and useful for quick traversal.
- Support all eight existing compass directions without making diagonals
  faster or farther than cardinal dashes.
- Show a readable leap pose throughout the burst.
- Make dash start, travel, and recovery visually distinct without obscuring
  the terrain or debug overlays.
- Keep normal walking, double-tap running, sleeping, spectator mode, and future
  obstacle collision predictable.
- Keep tuning values centralized and cover state transitions with unit tests.

## 2. Player-facing behavior

### 2.1 Input and direction

- Bind dash to `X`. Keep `Space` free for the separate vertical-jump idea in
  `ideas.md`, and keep `Z` as the fox's sleep action.
- On a fresh `X` keydown, resolve the dash direction from the arrow keys held
  at that instant.
- If no movement key is held, dash in the fox's current facing direction.
- Opposite held directions cancel on their axis, using the same resolution as
  normal movement. For example, Up + Down + Right resolves to East.
- Ignore key repeat. Holding `X` must not automatically dash again when the
  cooldown expires; another physical keydown is required.
- Add `{key: "X", description: "Dash"}` to the normal help bindings. Do not
  offer or trigger dash while spectator mode is active.

### 2.2 Motion

Start with these named tuning values, then adjust them during playtesting:

- dash duration: **160 ms**;
- dash speed: **800 world pixels per second**, expressed as a `DASH_SPEED_MULTIPLIER`
  (**3.2**) applied to the base movement speed rather than a standalone
  constant, so it stays adjustable relative to `SPEED` the same way
  `RUN_MULTIPLIER` already is. It's deliberately not affected by
  `RUN_MULTIPLIER` itself: sprinting into a dash must not stack with it (see
  "Running does not multiply dash velocity" below);
- cooldown after dash end: **450 ms**.

At those defaults a complete unobstructed dash travels 128 world pixels,
roughly one 120-pixel fox sprite cell. Direction vectors must remain normalized,
so every direction covers the same distance.

While the dash is active:

- lock the travel vector chosen at launch;
- replace normal/run velocity rather than multiplying it;
- do not let newly pressed arrows steer the leap;
- continue recording held movement input so normal movement can resume as soon
  as the dash ends;
- advance motion from elapsed time, clamping the final dash step to the
  remaining duration so a long frame cannot extend the dash distance.

When the dash ends, immediately recompute normal movement from currently held
keys. There is no recovery freeze in the first version; the animation's landing
frames provide the visual recovery without making controls feel sticky.

The dash cannot start during its active period or cooldown. Because this is a
top-down game with no current grounded/airborne resource cycle, use a short
time-based cooldown rather than Celeste's “one air dash until landing” rule.
Revisit that rule only if the vertical jump becomes a real gameplay state.

### 2.3 Sleep and interruption rules

- Pressing `X` while idle or walking starts a dash immediately.
- Pressing `X` while `curling`, `sleeping`, `sleepTurning`, or `uncurling`
  requests a wake-up and queues one dash in the requested direction. Launch it
  when `uncurling` completes, provided the controller is still bound to the fox
  and not in spectator mode.
- A second dash press while waking replaces the queued direction; it does not
  queue multiple dashes.
- Entering spectator mode, unbinding the entity, or teleporting it cancels an
  active/queued dash and clears the transient visual effect.
- A manual sleep request during an active dash should be ignored. The player
  may sleep after normal movement resumes.

### 2.4 Obstacles and later jump interaction

There is no obstacle collision in the current movement path. The dash must not
silently introduce phasing as a permanent rule. When solid obstacles arrive,
sweep the fox's stable gameplay bounds from the old position to the intended
position and stop at the first impact rather than checking only the endpoint.

If vertical jumping is implemented later, keep the concepts separate:

- jump controls airborne/height presentation and obstacle rules;
- dash controls the horizontal burst;
- explicitly decide then whether an airborne fox may dash and what resets the
  dash resource.

---

## 3. Fox leap animation

### 3.1 Art direction ✅

The dash uses a non-looping eight-phase `leap` animation. It should read as one
continuous bound:

1. **Launch:** body lowers slightly, front paws reach forward, rear legs push
   back. Do not add a long anticipation pose that delays input response.
2. **Extension:** body lengthens along the travel direction, ears flatten a
   little, and the tail streams behind.
3. **Airborne hold:** front and rear paws tuck beneath the body while the torso
   remains elongated. Use the middle phases for this readable silhouette.
4. **Landing:** front paws contact first, body compresses, then rear paws catch
   up toward the standing pose.

Keep the body's visual centre stable inside the 24×24 logical grid so changing
animation does not make the fox appear to wobble sideways. The animation
should imply height through foreshortening, tucked legs, and a small detached
shadow/effect; do not move the entity sprite upward in screen coordinates,
because “up” is also a world direction in the top-down view.

### 3.2 Sprite generation ✅

- Add `scripts/fox-sprites/leap.mjs` with `buildLeapFrame(phase)`.
- Add leap-specific pose constants to
  `scripts/fox-sprites/constants.mjs`; keep geometry/timing data out of the
  drawing function where practical.
- Add one `LEAP` row to `scripts/fox-sprites/sheet.mjs`, generated facing the
  same canonical `NW` direction used by the curl-family animations.
- Mark the descriptor row as `loops: false`.
- Add `"leap"` to `FoxSpriteType` in `src/sprites/fox.ts` and regenerate
  `static/fox-sprites.png` and `static/fox-sprites.json` together.
- Rotate the canonical leap frame in `Fox` to its actual dash direction using
  the existing `rotationFor` approach. This keeps the sheet compact and makes
  all eight directions use exactly the same pose timing.

The leap's opaque union bounds may be longer than the standing fox. Do not let
those animation-dependent sprite bounds become dash reach or collision reach.
Before solid collision is added, define stable fox gameplay bounds separately
from the current rendered-frame hull, or document that the current hull is
debug-only. Blue trail pixels and shadows must never be included in sprite
collision bounds.

### 3.3 Animation state

- Extend `FoxStatus` with `"dashing"`.
- Enter `dashing` and switch to the first rotated `leap` frame at dash launch.
- Step leap frames from dash progress, or give the leap a dash-specific frame
  interval derived from `dashDuration / 8`. Do not use the current 120 ms walk
  interval: eight frames would take 960 ms and outlive the movement burst.
- Hold the final landing phase only until dash motion ends, then switch directly
  to the correct walking or idle frame based on resumed velocity.
- Dash completion must be time/state driven, not dependent on asynchronous
  bitmap extraction finishing.

---

## 4. Blue dash effect

### Decision

**Yes, add a blue effect**, with the following restrained treatment:

- a compact cyan-white burst at the launch point;
- two or three translucent cyan afterimages behind the fox during travel;
- optional short blue speed strokes aligned with the dash vector;
- a fast fade finishing no later than about 100 ms after the dash ends.

Do not turn the fox solid blue, tint the entire screen, or use the effect as the
only dash indicator. Orange fox + cyan trail gives stronger contrast and keeps
the leap pose readable. The effect should be reduced or disabled when a future
“reduced motion” preference is enabled, while the leap animation remains.

### Rendering approach

Keep effects out of `static/fox-sprites.png`: embedding them would enlarge
opaque bounds, rotate a baked shadow unnaturally, and make effect tuning require
regenerating character art.

Introduce a small transient effect abstraction rather than coupling `World`
to `Fox` specifically. A dash effect records launch position, normalized
direction, age/lifetime, and a bounded list of recent fox render snapshots.
Update effects with simulation time and remove expired instances. Draw:

1. launch burst and afterimages behind entities;
2. the live fox through the existing entity path;
3. any foreground spark/stroke accents.

Save and restore canvas state around every effect draw. Explicitly set alpha,
filter/compositing mode, and transforms so the cyan treatment cannot leak into
terrain, entities, or debug rendering. Cap the afterimage count instead of
retaining an unbounded position history.

If a general effect abstraction is judged too large for the first pass, ship
only procedural cyan launch/speed strokes first. Do not add a fox-specific
branch inside `World.drawEntities` as the permanent design.

---

## 5. Code structure

### Movement ownership

`MovementController` should own input-level dash state:

- active direction and remaining duration;
- cooldown remaining;
- edge-triggered `X` handling;
- velocity override during dash;
- restoration through the existing direction resolver at completion;
- cancellation when spectating or rebinding.

Expose dash behavior through a small capability on controllable entities (for
example `DashableEntity`) rather than checking `instanceof Fox`. The capability
should notify the entity of dash start, cancellation, and completion so `Fox`
can manage leap/sleep state without moving controller rules into rendering
code. A non-dashable entity simply has no `X` action.

`Fox` should own presentation/state details:

- current `dashing`/queued-wake-dash state;
- selecting and rotating the leap row;
- returning to walking or idle presentation;
- requesting the transient effect through a callback/event supplied by the
  world layer.

Use one source of truth for dash duration shared by movement and animation.
Avoid separate controller and fox timers that can drift apart.

### Likely files

- `src/entities/movement-controller.ts`
- `src/entities/movable-entity.ts` or a new dash capability beside it
- `src/entities/fox.ts`
- `src/sprites/fox.ts`
- `src/world/world.ts` and a new transient-effect module
- `scripts/fox-sprites/constants.mjs`
- `scripts/fox-sprites/leap.mjs`
- `scripts/fox-sprites/sheet.mjs`
- regenerated `static/fox-sprites.png`
- regenerated `static/fox-sprites.json`

---

## 6. Implementation phases

### Phase 1: Dash state and tests ✅

- Extract/reuse direction resolution for both normal movement and dash launch
  (`MovementController.resolveDirection`, shared by ordinary movement and
  `handleDashKeyDown`).
- Add `X` input, active timing, normalized velocity override, cooldown, and
  post-dash movement restoration.
  - Dash movement is applied directly via `teleportTo` rather than through
    the entity's normal velocity, so a long frame can be clamped to exactly
    the remaining dash duration instead of overshooting; the entity's
    velocity is held at zero for the dash's duration so `MovableEntity`'s own
    velocity-based movement doesn't also move it.
- Add the dash capability: optional `requestDash`/`onDashStart`/
  `onDashComplete`/`onDashCancel` hooks on `MovableEntity` (same pattern as
  `handleKeyPress`), not a separate `DashableEntity` type - keeps
  `MovementController` free of `instanceof Fox` checks. Since the sprite sheet
  already bakes one frame set per direction (see 3.2), `Fox` doesn't need the
  rotation step this section originally assumed - `onDashStart` just selects
  `` `dash${direction}` `` directly.
  - Since the same sleep/wake queuing already existed for ordinary movement
    (`pendingWakeVelocity`/`pendingWakeFacing`), `requestDash` reuses
    `beginWaking`/`finishWaking` rather than duplicating that state machine;
    `finishWaking` now checks a queued dash first.
  - Dash tuning values (`DASH_DURATION_MS`, `DASH_SPEED_MULTIPLIER`,
    `DASH_COOLDOWN_MS`) live in `src/entities/dash-constants.ts`, imported by
    both `MovementController` and `Fox`.
- Update help bindings (`X: Dash`, hidden while spectating or for a
  non-dashable entity).
- Test behavior with fake keyboard events and controlled `deltaMs` values
  (`movement-controller.spec.ts`, `fox.spec.ts`).
  - This required adding `resolve.alias` entries to the root `vitest.config.ts`
    (matching `vite.config.ts`'s) - nothing under `src/entities` was
    previously testable at all, since importing `MovableEntity` pulls in
    `@display/colors` via `debug-config.ts`.

### Phase 2: Leap sprite ✅

Mostly folded into Phase 1 above, since the sprite artifacts already existed
(3.2) and Phase 1 wired dash-duration animation timing directly. Remaining:

- Visually inspect all eight leap phases at the logical-grid level.
- Check every compass direction for centring, clipping, and clean transition
  back to idle/walk in the running game (not just via unit tests).

### Phase 3: Cyan effect and tuning

- Add bounded transient effect update/render support.
- Implement the launch burst and afterimages behind the fox.
- Tune opacity and lifetime on Plains, Desert, sand/grass borders, and water.
- Confirm effect canvas state cannot alter subsequent draws.

### Phase 4: Collision integration

Complete this phase when solid obstacles exist:

- give the fox stable gameplay collision bounds;
- use swept movement for dash travel;
- define whether impact cancels the remaining dash immediately;
- test thin obstacles, corners, diagonal impacts, and long-frame updates.

---

## 7. Tests and acceptance criteria

### Automated tests

- Cardinal and diagonal dashes cover equal distance within floating-point
  tolerance.
- A no-input dash uses current facing.
- Opposite inputs cancel consistently with ordinary movement.
- Running does not multiply dash velocity.
- Steering input during a dash does not change its vector.
- Held input resumes normal movement immediately after dash completion.
- A large `deltaMs` cannot move farther than the configured dash distance.
- Cooldown rejects early presses and accepts a new keydown after expiry.
- Key repeat and held `X` cannot auto-chain dashes.
- Spectator mode and rebinding cancel dash state and do not leave velocity set.
- Sleeping/waking retains at most one queued dash and launches it after uncurl.
- Leap animation is non-looping, uses eight phases, and returns to the correct
  idle/walk frame.
- Transient effects expire and retain no more than the configured number of
  snapshots.

### Visual acceptance

- The fox reads as leaping in every direction, including when viewed without
  the blue effect.
- Launch has no perceptible input delay.
- The live orange fox remains distinguishable from its cyan afterimages.
- The trail indicates direction but does not hide nearby terrain boundaries.
- There is no sprite clipping or sideways anchor wobble.
- Debug bounds/arrows remain readable and canvas effects do not tint them.
- Rapid movement across camera-follow margins remains smooth.

### Definition of done

The feature is done when dash mechanics, leap art, generated artifacts, help
text, automated tests, and visual-effect cleanup land together; all existing
tests and lint pass; and the three tuning values have been playtested rather
than treated as final solely because they were proposed in this plan.
