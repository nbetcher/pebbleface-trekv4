# TrekV4

TrekV4 is an LCARS-inspired Pebble watchface for the classic Pebble platform
family. It combines a native C renderer with PebbleKit JS for configuration and
weather.

## Architecture

- `src/c/main.c` owns the watch lifecycle, persisted settings, AppMessage state,
  time/date, health, weather presentation, alerts, and battery rendering.
- `src/c/frame_render.c` and `src/c/frame_tables.h` render the LCARS frame from
  platform-specific vector geometry.
- `src/c/effect_layer.c` and `src/c/effects.c` provide the hardened
  inversion/effect layer used by the watchface.
- `src/pkjs/config.js` is the declarative
  [`@rebble/clay`](https://www.npmjs.com/package/@rebble/clay) settings schema.
- `src/pkjs/clay-custom.js` supplies the capability-aware, always-visible live
  preview and its interactions.
- `src/pkjs/app.js` validates settings, exchanges compact messages with the
  watch, and retrieves Open-Meteo weather data.
- `resources/` contains fonts and the bitmap assets still needed by the watch.

## Supported watches

| Platform | Display | Frame | Health/steps | Heart rate | Color settings |
| --- | --- | --- | --- | --- | --- |
| Aplite | 144x168, monochrome rectangle | Vector | No | No | Pebble black/white palette |
| Basalt | 144x168, color rectangle | Vector | Yes | No | Pebble 64-color palette |
| Diorite | 144x168, monochrome rectangle | Vector | Yes | Pebble 2 HR model only | Pebble black/white palette |
| Emery | 200x228, color rectangle | Vector | Yes | Yes | Pebble 64-color palette |
| Flint | 144x168, monochrome rectangle | Vector | Yes | No | Pebble black/white palette |

Round watches (Pebble Time Round and Pebble Round 2) are not supported.

Clay and the live preview use the connected watch's platform and model metadata
to hide unsupported choices. The Pebble 2 SE and Pebble 2 HR share the Diorite
platform, so model detection is also used for heart-rate controls.

## Settings behavior

The configuration page uses the maintained `@rebble/clay` package and Clay's
standard Pebble color picker. On vector-rendered watches, each of the 13 drawn LCARS
frame segments can be selected directly in the pinned preview or from its
corresponding setting. Clay limits that picker to 64 colors or black/white based
on the active watch. Other drawn elements expose relevant controls for primary
and secondary text, screen/dialog background, Bluetooth state, battery bars,
and each drawn disconnect-alert text treatment.

The preview remains fixed while the options scroll underneath it and redraws as
each choice changes. Changes reach the watch after **Save Settings** is selected.
Battery bars default to the classic white/shaded-white treatment; custom full
and empty colors are opt-in.

Weather and geocoding are provided by
[Open-Meteo](https://open-meteo.com/) under CC BY 4.0; attribution is also shown
on the Settings page.

## Prerequisites

- Node.js 20.17+ (or 22.9+) and npm 11.17.0.
- Python 3.13 and [`uv`](https://docs.astral.sh/uv/).
- The community-maintained Rebble Pebble Tool and an installed Pebble SDK. SDK
  4.17 is the verified development version; 4.5 remains useful for compatibility
  checks.
- QEMU/emulator dependencies, or a Pebble connected through the phone app, for
  runtime verification.

The emulator's optional `pypkjs` bridge also requires Python's `dbm` module
(`python313-dbm` on openSUSE). Native PBWs can still be installed through the
direct QEMU transport when that phone-side bridge is unavailable.

Install the command-line tool and SDK:

```sh
uv tool install "pebble-tool==5.0.39" --python 3.13
pebble sdk install 4.17
pebble sdk activate 4.17
pebble --version
```

These are the tool and SDK versions used for the verified build. Deliberately
upgrade them together and repeat the full platform matrix when moving the pin.

## Install dependencies and verify

From the repository root:

```sh
npm ci
npm run check
npm test
pebble build
```

`npm run check` performs fast JavaScript syntax checks, `npm test` runs the
schema, codec, capability, and generated-preview regression suite, and
`pebble build` compiles and bundles all five entries in `targetPlatforms`. The
resulting PBW is written beneath `build/`.

After editing `src/pkjs/clay-custom.js` or any file in `src/pkjs/shim/`, run
`python3 make_shim.py`. It inlines the shim into `clay-custom.js` and regenerates
the stripped `clay-custom.gen.js` that the phone actually loads;
`python3 make_shim.py --check` (also run in CI) reports stale output without
writing anything.

The preview's font data comes from the compiled fonts, not the TTFs: the glyph
atlas in `src/pkjs/preview-data.js` (and its copy in `clay-custom.js`) and the
day-strip metrics in `clay-custom.js`. After changing fonts, `font_days`, or the
day strings, run `pebble build`, then `python3 make_font_data.py`, then
`python3 make_shim.py`. CI runs `make_font_data.py --check` after its build.

## Emulator and device testing

Install the most recent build in an emulator:

```sh
pebble install --emulator basalt
pebble logs --emulator basalt
```

Repeat with `aplite`, `diorite`, `emery`, and `flint` before a release.
At a minimum, verify the following on each applicable platform:

1. The watchface starts without an AppMessage or persistence error.
2. Only device-supported settings appear.
3. The pinned preview follows theme, layout, language, weather, and color edits.
4. Tapping each vector segment opens its Clay color picker and the
   saved color appears on the watch.
5. Battery bars begin white/shaded-white and only use custom colors after the
   opt-in toggle is enabled.
6. Weather-disabled mode makes no location request, and enabled weather updates
   after launch.
7. Steps and heart-rate layouts behave correctly for the selected watch model.
8. Bluetooth vibration, repeat, popup, dismissal, and reconnection paths work.
9. The "QT" indicator appears while the watch's Quiet Time is on and hides when it ends.

For a physical watch reachable through the phone app, use:

```sh
pebble install --phone <phone-ip>
pebble logs --phone <phone-ip>
```

## Releases

`.github/workflows/build-pbw.yml` builds the PBW in GitHub Actions with the same
pinned tool/SDK pair listed above (`pebble-tool` 5.0.39, SDK 4.17), after running
`npm run check` and `npm test`. It is started manually from **Actions > Build PBW
> Run workflow**; there is no automatic trigger yet.

The release version is taken from `"version"` in `package.json`, which the SDK
also stamps into the PBW. To cut a release, bump that value (and
`package-lock.json`), commit, then run the workflow. With **release** checked
(the default) it creates the `v<version>` tag and a GitHub release carrying
`trekv4-v<version>.pbw`; unchecked, it only uploads the PBW as a build artifact.
The workflow refuses to reuse an existing tag. Emulator checks remain manual, so
walk the platform list above before publishing.

To publish a pre-release, fill in **prerelease** with `rcN`, `betaN`, or `alphaN`.
For example, `rc1` with version 6.0.0 publishes `v6.0.0-rc1` as a GitHub
pre-release titled "Release Candidate 1" and attaches `trekv4-v6.0.0-rc1.pbw`.
The suffix appears only in the tag, title, and file name. The SDK rejects it in
`package.json`, so the PBW itself still reports 6.0.0, and the final release can
be cut later from the same version by leaving **prerelease** empty.

Release notes use the first available source:

1. A hand-written `.github/release-notes/<tag>.md`, or
   `.github/release-notes/v<version>.md`, which covers every pre-release of that
   version and its final release.
2. A Claude-drafted, bullet-pointed summary of the commits and diff since the
   previous release, generated by `.github/scripts/release-notes.mjs`. This
   requires an `ANTHROPIC_API_KEY` repository secret. If the call fails, the
   release still goes out with GitHub's notes alone.
3. No extra notes.

GitHub's generated notes (contributors and a full-changelog link) are always
appended. Each run also shows its notes in the run summary, so running with
**release** unchecked previews them without publishing anything.

## License

The source code is distributed under the [MIT License](LICENSE), matching the
license notice already present in `src/c/main.c`. Third-party code and data are
listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Antonio is covered
by its bundled OFL text. `LCARS.ttf` identifies itself as a commercial Bitstream
font, and the image-artwork provenance is undocumented; clear or replace those
assets before a public redistribution.
