# Characters

`manifest.json` tells the panel which animation to play for each session state. The shipped file uses
text faces as placeholders. Real Clawd designs are dropped in without touching code.

## Adding a design

1. Put the files under `characters/<id>/`, for example `characters/clawd-pixel/working-1.svg`.
2. Add the character to `manifest.json`:

```json
"clawd-pixel": {
  "name": "Clawd Pixel",
  "author": "who made it",
  "license": "licence of the art",
  "animations": {
    "idle":    { "fps": 2, "svg": ["clawd-pixel/idle-1.svg", "clawd-pixel/idle-2.svg"], "text": ["(-.-)zZ"] },
    "working": { "fps": 6, "svg": ["clawd-pixel/working-1.svg", "clawd-pixel/working-2.svg"], "text": ["(•̀ᴗ•́)"] }
  }
}
```

3. Set `defaultCharacter`, or choose at runtime with `/clawd <id>`.
4. Check it: `node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/check-characters.mjs`

## Rules

- Every character needs an `idle` animation. It is the fallback for any state it does not define.
- `stateMap` maps the ten session states to animation names. Several states can share one animation
  (`paused` uses `idle`, `lost` uses `error` by default).
- Frames: `text` works everywhere, `svg` is drawn on the desktop surface, `png` is reserved for the
  terminal (resolved, shown as text until image drawing is wired). Always keep a `text` fallback.
- Asset paths are relative to this folder, `.svg` or `.png` only, no `..`.
- `fps` is 0.2 to 30. At most 120 frames per animation.

## Variants (accessories, the "talking" version, plugin looks)

A variant lists only the animations it changes. Everything else comes from the base character:

```json
"variants": {
  "headset": { "name": "Talking version", "animations": { "talking": { "fps": 4, "svg": ["clawd-pixel/talk-headset-1.svg"], "text": ["(•o•)🎧…"] } } }
}
```

Switch with `/clawd clawd-pixel headset`, or `/clawd clawd-pixel` to drop the variant. Removing a variant
from the manifest is enough to unplug it.

## States

`idle` (asleep), `working`, `thinking`, `talking` (messaging another session), `waiting`, `saving_mode`,
`error`, `done`, plus `paused` and `lost`.
