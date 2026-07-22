# Working preferences

A running note of how this user likes code, comments, and docs written in
this project. Keep this updated as new preferences come up; don't remove
entries just because they're old, unless corrected.

## Punctuation

- No em dashes ("—"), anywhere: code comments, docs, chat responses. Use a
  plain hyphen (`-`) or, preferably, a colon (`:`) instead.

## Scripts

- Keep `package.json` scripts bare and minimal. No wrapper commands (e.g.
  don't wrap a command in `powershell -Command "..."` when the shell already
  runs the script directly) and prefer short native commands over verbose
  ones (`cp` over `Copy-Item`, etc.).

## Running / verification

- Don't use the `run` skill to launch or verify this app. Use the scripts in
  `package.json` directly via `pnpm run <script>` (e.g. `pnpm run
  build:client`, `pnpm run dev:client`, `pnpm run lint`).

## Git / GitHub

- Never touch GitHub: no creating or editing PRs or issues, no pushes, no
  `gh` CLI, no remote operations. The user manages all of that themselves.
  Read-only local git inspection (`git status`, `git log`, `git diff`) is
  fine. Track plans and progress in repo markdown docs, not GitHub issues.

## TypeScript / code style

- Add TSDoc/JSDoc-style comments to every function and method, not just
  exported/public ones.
- Always use explicit access modifiers on class members (`public`,
  `protected`, `private`), including on constructors. Don't rely on the
  implicit-public default.
- Always use the `override` keyword on methods that override a base class
  member. (`noImplicitOverride` is enabled in `tsconfig.json` to enforce
  this.)
- When a subclass overrides a method, only keep a doc comment on the
  override if it adds information beyond the base class's doc (e.g.
  concrete parameter semantics, specific `@throws` cases) - don't leave a
  comment that just repeats the generic base description.
- Prefer hiding implementation details behind class APIs over leaking them
  to callers. Example: callers of `FoxSpriteSheet` shouldn't need to know
  how many animation frames a row has (no hardcoded phase-count constants in
  `main.ts`) - the sheet exposes `next`/`previous` and `getSpriteTypes`/
  `getDirections` so callers can enumerate/step without that knowledge.
- Avoid duplicating the same literal data in two places; factor out a shared
  constant instead (e.g. `DIRECTIONS` reused to build `ROW_ORDER` in
  `fox.ts`, rather than repeating the 8 direction strings twice).
- Keep comments short and to the point, not wordy or context-heavy. E.g. for
  a class doc, "Orchestrates a chunk's generation" is good enough - don't pad
  it out with a rundown of every level/phase it touches.
- One or two lines is usually enough, even for a non-obvious field/method;
  resist the urge to justify a design choice inline (that belongs in a plan
  doc or PR description, not living code). If a comment needs several
  sentences to explain *why*, that's a sign to shorten it to the one-line
  takeaway, not to keep the reasoning.
- Don't restate type information already visible in the signature (e.g. a
  field doc saying "plain text, or rich `TextSegment[]` content" when the
  field is typed `string | TextSegment[]`), and don't tack on a
  rationale/comparison clause explaining why a construct reads better than
  some alternative (e.g. "...so it reads as `x()` instead of doing `y`
  by hand"). State only what a reader can't already see from the code.
- No historical context in comments: never mention what a field used to be
  called, what it replaced, or how the code used to work. The code describes
  the present; git holds the past.
- No step-by-step walls of implementation detail (e.g. narrating exactly how
  a cache is invalidated, how a caret scrolls, how indices stay in sync).
  Let the code carry the mechanism; a comment states intent, not a walkthrough.
