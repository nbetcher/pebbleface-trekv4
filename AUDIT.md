# TrekV4 codebase audit

Audit date: 2026-08-13  
Audited release: 5.2.0

## Verdict

The integrated code has no known release-blocking correctness or dependency
security defect after the remediations in this pass. It parses, passes 64
regression tests, and compiles into one PBW for all seven declared platforms.

Public redistribution is **not cleared**, however. The bundled `LCARS.ttf` is a
commercial Bitstream font and no app-embedding/redistribution license is present;
the image-artwork provenance is also unknown. See `THIRD_PARTY_NOTICES.md`. This
is an asset-licensing gate, not a failure of the compiled code. This assessment
is a technical inventory, not legal advice.

The Settings renderer is exercised by a generated-DOM harness, and every target
compiles under SDK 4.17. Six legacy-platform binaries were previously installed
directly into QEMU, pinged, captured, and visually checked at native resolution.
The new Gabbro runtime and physical-watch matrix remain outstanding because the
host's Pebble CLI bridge timed out.

## Scope and method

The review covered:

- Native lifecycle, rendering, framebuffer effects, memory ownership, timers,
  AppSync/AppMessage, persistence migration, validation, Bluetooth alerts,
  battery display, health, heart rate, and platform preprocessor paths.
- PebbleKit JS configuration lifecycle, local persistence, typed message
  encoding, retry behavior, weather/geocoding, error paths, privacy, and
  per-watch capability selection.
- Settings information architecture, accessibility, color controls, responsive
  layout, and generated Clay pages for every supported hardware class.
- Package manifest, resources, dependencies, lockfile, build rules, warnings,
  tests, documentation, source provenance, and release reproducibility.

The audit used manual source review, targeted regression tests, generated-page
DOM checks, responsive browser screenshots, dependency inspection, and a strict
SDK 4.17 build across every target. It is not a substitute for hardware testing
or formal verification.

## Delivered redesign

### Standard configuration stack

The bespoke settings UI was replaced with the maintained `@rebble/clay` 1.0.10
configuration framework. `src/pkjs/config.js` is now a declarative schema and
`src/pkjs/clay-custom.js` adds only the TrekV4-specific live preview behavior.
Clay's own Pebble color component supplies the standard 64-color picker on color
watches and the black/white picker on monochrome watches.

The page now exposes only relevant controls:

| Watch class | Frame controls | Picker | Health | Heart rate |
| --- | --- | --- | --- | --- |
| Aplite | 13 vector pieces | Black/white | Hidden | Hidden |
| Basalt | 13 vector pieces | Pebble 64-color | Steps | Hidden |
| Chalk | Raster frame controls hidden | Pebble 64-color for drawn elements | Steps | Hidden |
| Pebble 2 SE | 13 vector pieces | Black/white | Steps | Hidden by model |
| Pebble 2 HR | 13 vector pieces | Black/white | Steps | Shown by model |
| Emery | 13 vector pieces | Pebble 64-color | Steps | Shown |
| Flint / Pebble 2 Duo | 13 vector pieces | Black/white | Steps | Hidden |
| Gabbro / Pebble Round 2 | 13 vector pieces | Pebble 64-color | Steps | Hidden |

Chalk's theme frame and Bluetooth rails remain raster assets, so per-pixel frame
recoloring is intentionally unavailable there. Text, screen background, and
drawn battery bars remain configurable.

### Per-element color protocol

Every vector frame segment is now independently selectable either by
tapping it in the preview or by using its corresponding Clay control. The watch
protocol packs version plus 13 frame colors, filled/empty battery colors,
Bluetooth color, popup accent, popup clock, and popup hint into one validated
20-byte ARGB8 tuple. Legacy four-region settings and the version-1 packed
palette are migrated without losing existing colors.

Primary text, secondary text, screen background, Bluetooth symbol, battery bars,
and popup accent also have relevant drawn-element controls. Monochrome selections
are reduced to the watch's actual black/white capability.

### Persistent real-time preview

The preview is a fixed, responsive SVG dock, so it remains visible while the
settings underneath it scroll. It redraws immediately for themes, all colors,
battery treatment, time mode, layout, date format, steps/heart-rate selection,
language, weather visibility, inversion, and the simulated disconnected state.
Its geometry follows the active 144x168, 180x180, 200x228, or 260x260 display.

Preview elements are keyboard-focusable and labelled, and every colorable
element also has a named Clay control in the settings list. Tapping a colorable
SVG element opens that control's standard picker. A frame tap stages the exact
displayed preset and commits the Custom theme only after a swatch is chosen;
canceling leaves the preset untouched. Likewise, a battery-bar tap commits the
custom-color opt-in only after a color is chosen.

### Battery default

Battery bars once again default to solid white for filled segments and a
white/black checker-dither for shaded-white empty segments. Custom full and empty
colors are used only after `Use custom bar colors` is explicitly enabled.

## Resolved findings

| ID | Original severity | Finding | Resolution |
| --- | --- | --- | --- |
| C-01 | Critical | All incoming values were truncated to `uint8_t`; 10-300 second Bluetooth intervals became 16-224 ms. | Typed 8/16/32-bit tuple decoding plus an allowlist for repeat intervals. |
| C-02 | Critical | Changing repeat to zero could leave an old callback that repeatedly scheduled a 0 ms timer. | Alert state is centrally reconciled; callbacks guard reconnect, disabled vibration, zero repeat, and inactive state. |
| C-03 | Critical | `effect_layer_destroy` wrote through layer-owned memory after freeing it. | Ownership order corrected; public layer coordinate APIs replace private-memory scanning. |
| C-04 | High | The effects layer scanned private `Layer` memory and could read/index out of bounds. | Removed; the layer uses `layer_convert_point_to_screen`, bounded effect iteration, and null-safe allocation helpers. |
| C-05 | High | Battery bars were hard-coded orange/maroon. | Classic white/shaded-white is restored; custom colors are opt-in. |
| C-06 | High | Only four custom colors represented 13 frame shapes. | Versioned 13-segment palette implemented and migrated on phone and watch. |
| C-07 | High | Persisted Steps could boot hidden or stop updating; Aplite could be offered unsupported health options. | Visibility and shared health subscriptions are restored and capability-gated. |
| C-08 | High | Heart Rate was offered to watches without a sensor, including Pebble 2 SE. | Both platform and model are checked on phone and watch. |
| C-09 | High | `date_in_bracket` was persisted but ignored. | It now controls the moved-date layout and only appears with relevant HR hardware. |
| C-10 | High | Popup-off was ignored when repeat vibration was enabled. | Visual popup and vibration reminder state are independent and immediately reconciled. |
| C-11 | High | Persisted inversion was not applied at boot. | Inversion is applied after ordinary layers are constructed. |
| C-12 | Medium | Background/battery/palette changes left dependent layers stale. | All affected layers are dirtied or restyled immediately. |
| C-13 | Medium | Migration could overwrite a user's existing Bluetooth-vibration opt-out. | Defaults are seeded only when the persisted key is absent. |
| C-14 | Medium | Persisted enum corruption could index render tables out of bounds. | Values are clamped before render; incoming validators now use full-width values. |
| C-15 | Medium | Weather icon expiry destroyed a potentially null bitmap. | Destruction and replacement are null-guarded. |
| JS-01 | High | `JSON.parse`, webview decoding, and broad `parseInt` handling could crash or create malformed AppMessages. | Safe parsing, explicit allowlists/types, range validation, and malformed-value omission. |
| JS-02 | High | Configuration capability filters exposed HR, health, custom frame, and colors on incompatible watches. | Clay capability filters plus Diorite model-specific HR filtering. |
| JS-03 | Medium | Failed AppMessages were dropped and a synchronous exception could wedge the sender. | FIFO sender retains the head and performs three bounded exponential retries; 4 regression tests cover it. |
| JS-04 | Medium | Weather used fragile request/response handling and stale calls. | Current Open-Meteo endpoints, URL encoding, timeouts, validation, cancellation, and stale-generation guards. |
| JS-05 | Medium | Settings from a monochrome watch could round and overwrite a color watch's palette. | Settings are profiled per watch token/platform/model with one-time legacy migration. |
| B-01 | High | The dependency was the obsolete `pebble-clay` package and briefly mismatched its import. | Exact `@rebble/clay@1.0.10` dependency and import; lockfile is aligned. |
| B-02 | High | Blanket `-Wno-error` hid native defects and JS linting was explicitly disabled. | Modern SDK build rules restore strict compilation; reported native warnings were fixed. |
| B-03 | Medium | Six manifest resources were unused and three more were over-targeted. | Unused declarations removed and fonts/footprint limited to actual consuming platforms. |
| B-04 | Medium | Large dormant effect/math code included unsafe paths and an unlicensed copied math file. | Removed the unused math files and all unused effects; retained two hardened inversion effects with upstream MIT notice. |
| B-05 | Medium | No meaningful build, platform, settings, or release documentation existed. | README, license, third-party notices, `.gitignore`, scripts, and tests added. |
| C-16 | Medium | Launching while already disconnected did not initialize alert state. | The first Bluetooth peek is now processed as an explicit state transition. |
| JS-06 | Medium | Chalk hid its drawn popup-color control and disconnected preview, and preview colors/battery/weather did not faithfully match native rendering. | Chalk exposes the drawn alert color and simulated popup; palette sunlight correction, inversion, 8/2 battery bars, checker shading, and round asset geometry now match the watch paths. |
| B-06 | High | Flint/Pebble 2 Duo was omitted despite sharing the supported monochrome 144x168 geometry and health APIs. | Flint is declared, capability-filtered, resource-targeted, preview-tested, and compiled as a sixth PBW binary. |
| B-07 | High | Gabbro/Pebble Round 2 was absent and would have inherited invalid 144x168 geometry. | Added a dedicated 260x260 round vector renderer, resources, capabilities, preview, tests, and seventh PBW binary. |
| JS-07 | High | New/partial profiles could display defaults without sending them, and silent ACK loss could wedge configuration. | Complete defaults, per-watch profiles, latest-value durable reconciliation, bounded retries, and an ACK watchdog now keep page and watch state aligned. |
| JS-08 | Medium | The palette dialog and one-second preview refresh could lose keyboard focus or let focus escape behind a modal overlay. | Keyboard-openable labels, Tab trapping, Escape handling, focus-by-element restoration, and hidden-palette tab suppression were added. |
| JS-09 | Medium | Untouched weather defaults could trigger empty requests, and Unicode truncation could create an invalid URI. | Weather remains unconfigured until GPS or a location is explicitly supplied; code-point-safe truncation and URI error handling were added. |
| C-17 | Medium | The production midnight step refresh was accidentally inside a test-only compiler guard. | The rollover refresh now compiles on every health-capable target and has a source regression test. |
| JS-10 | Medium | Switching watches while Settings was open could save a color/capability-specific page into the wrong profile. | The originating profile is snapshotted; a switch preserves those edits only for their origin and reconciles the newly connected watch's own profile. |
| C-18 | High | A refactor added guarded AppMessage setup but never invoked it, disabling all Settings/weather delivery. | Messaging now initializes after UI construction, validates its dictionary, retries bounded open failures, and tears down conditionally. |
| JS-11 | Medium | Tapping a preset frame piece switched to an unrelated saved Custom palette, changing all 13 pieces before a color was picked. | Preview taps seed Custom from the exact displayed preset (or displayed monochrome frame) before opening the selected picker. |
| C-19 | Medium | Popup clock and hint colors were hard-coded despite being code-drawn elements. | Palette v2 gives both independent standard Clay controls; the vector popup panel/notch follows the configured screen background. |
| JS-12 | Medium | Legacy Steps/heart-rate toggles could be overwritten by complete new defaults during phone-side profile migration. | Legacy toggles are translated to the new bottom-left/right selections before defaults are merged. |
| C-20 | Medium | A failed health-service subscription retried every five seconds forever, wasting battery while the service remained unavailable. | Subscription retries are bounded to three delayed attempts and reset after success or a later user re-enable. |
| C-21 | Medium | Chalk discarded its current Bluetooth bitmap before confirming a replacement, and an optional missing step label could be dereferenced by a live layout change. | Bitmap swaps are allocate-before-destroy and optional health-layer updates are null-guarded. |
| B-08 | Medium | Project-level MIT metadata could be mistaken as covering third-party assets, and npm publication was not explicitly blocked. | The package is private and the notice file now carries Clay's full MIT terms plus explicit asset, brand, and binary-distribution gates. |
| C-22 | High | Gabbro's lower frame, date/steps, and footprint geometry extended beyond the round screen or collided, while the top chord was clipped. | Gabbro-only native and preview rectangles now fit the 128-pixel safe circle, bottom labels have an explicit gap, and exact containment is regression-tested without changing the other six layouts. |
| JS-13 | Medium | Small frame stubs and bars were hard to tap, duplicate preview glyphs created excess keyboard stops, and merely opening some pickers could change settings. | A nearest-target tap radius favors the intended small element, duplicate representations share one accessibility stop, the modal traps/restores focus, and picker cancel/selection semantics prevent accidental mutations. |
| JS-14 | Medium | HR masking, Bluetooth runes, raster weather defaults, 144-pixel battery clipping, Chalk popup rail gaps, and Gabbro weather rays had drifted from native drawing. | Preview geometry and configured/default states now follow their native render paths with targeted cross-platform assertions. |

## Security and privacy review

- No embedded API keys, account secrets, or credentials were found.
- Weather and geocoding use HTTPS. GPS is requested only when weather is visible
  and GPS mode is selected; coordinates are sent to Open-Meteo and not persisted
  by TrekV4.
- Saved settings are treated as untrusted input, parsed inside error handling,
  reduced to an allowlist, range-checked, and encoded with explicit message
  types. The native receiver independently validates types, widths, enums,
  colors, and packed-palette structure.
- `npm audit --omit=dev --ignore-scripts` reports zero known vulnerabilities.
- Open-Meteo attribution is present in both Settings and README.

No web content is rendered from weather responses. The configuration page does
use Clay's HTML-rendering text component for static, repository-authored footer
markup; no user-provided string reaches that path.

## Remaining findings and release risks

### R-01 — asset rights block public redistribution (release gate)

`resources/fonts/LCARS.ttf` identifies itself as Swiss911 UCm BT, Copyright
1990-1992 Bitstream Inc., all rights reserved. A standard desktop license does
not normally grant app embedding or redistribution. No qualifying license is in
the repository. Sixty-five distinct PNG sources are packaged across the seven
targets, and their authorship and redistribution terms are absent. Trek-, LCARS-,
and Borg-related branding also has no clearance record in the repository.

Obtain and document the required license, or replace the font with an
embedding-friendly OFL alternative and replace/clear the artwork. The Star Trek
and LCARS marks/art direction may require a separate rights review.

### R-02 — Aplite memory headroom needs physical-device testing (medium)

The compiler reports only about 4.3 KB of free heap on Aplite. Core and changed
allocation paths are now null-safe, but real peak use still depends on SDK
services and runtime event order. Further graceful-degradation work should be
driven by physical low-memory logs. Cold-start rendering passed in QEMU. Configuration updates,
inversion, weather icon replacement, and Bluetooth popup behavior should still
be exercised on a physical device.

### R-03 — runtime matrix is not automated (medium)

Compilation and generated Settings DOM tests do not prove framebuffer appearance,
vibration timing, health events, persistence across reboot, weather delivery, or
accelerometer dismissal on hardware. Run the manual matrix in README before a
release. Add a container/checksummed SDK and emulator workflow when those
artifacts can be pinned reproducibly.

### R-04 — remaining low-priority robustness gaps

- Messaging initialization failures are logged and retried three times; the
  watchface remains usable, but the native UI has no banner for a session whose
  phone-side configuration transport cannot be opened.
- Weather errors retain the previous reading and use bounded 30-second,
  2-minute, and 5-minute transient retries before the normal interval resumes.
- The PBW embeds timestamps and is not byte-reproducible. SDK/tool versions are
  pinned in README, but the SDK archive/container checksum is not.
- SDK 4.17 emits an RWX LOAD-segment linker warning for every target. This is a
  toolchain/linker-script property; no app-specific executable-memory mapping was
  introduced.
- The installed legacy SDK 4.5 could not be tested because its local Python venv
  is incomplete. SDK 4.17 is the authoritative build for this audit.

### R-05 — source archive cleanup (low)

Thirty-six unused legacy bitmap variants remain under `resources/images/`,
including eight old battery images and rectangular theme/BT variants no longer
referenced by the manifest. They do not enter the PBW, but they add provenance and
source-package noise. Remove them after confirming they are not intentionally kept
as design references, or move documented originals to a separate archival tree.

### R-06 — Chalk's raster frame limitation (accepted)

The round frame and Bluetooth rails are raster artwork. The Settings page hides
controls that cannot be honored. A future fully recolorable Chalk frame requires
new round vector geometry; recoloring bitmap pixels would not provide the same
per-element semantics.

### R-07 — repository state could not be verified (process)

This workspace has no `.git` metadata, so commit history, tracked-file status,
and the exact original-to-final diff could not be inspected. Generated `build/`,
`node_modules/`, Waf, and Python files are ignored, but source-zip tooling should
still exclude them explicitly.

## Verification record

### Automated checks

| Check | Result |
| --- | --- |
| `npm run check` | Passed; all five production JS modules parse |
| `npm test` | Passed; 69/69 schema, capability, preview, codec, migration, profile, protocol, queue, package-safety, and native-source tests |
| `npm audit --omit=dev --ignore-scripts` | Zero known vulnerabilities |
| `npm ls --all` | One production dependency: `@rebble/clay@1.0.10` |
| SDK 4.17 `pebble build` | Passed for aplite, basalt, chalk, diorite, emery, flint, and gabbro |

### Native build budgets

| Target | Resource bytes | RAM footprint | Reported free heap |
| --- | ---: | ---: | ---: |
| Emery | 60,104 | 22,660 | 108,412 |
| Diorite | 39,000 | 22,144 | 43,392 |
| Chalk | 40,323 | 19,124 | 46,412 |
| Basalt | 40,002 | 21,684 | 43,852 |
| Aplite | 37,858 | 20,292 | 4,284 |
| Flint | 38,844 | 21,288 | 44,248 |
| Gabbro | 55,928 | 22,356 | 108,716 |

The final PBW is `build/pebbleface-trekv4.pbw` (1,064,840 bytes). Its
audit-build SHA-256 is
`760FADC54D6A4369C7520F0506D4F6C53419664967B8B37D511071545C9E25A5`.
PBWs include generated timestamps, so a rebuild is expected to have a different
hash even with identical sources.

### Settings browser matrix

Generated `@rebble/clay` pages were loaded in Edge for Aplite, Basalt, Chalk,
Pebble 2 SE, Pebble 2 HR, Emery, Flint, and Gabbro. The matrix covered a 520x844
phone viewport, an effective approximately 347-CSS-pixel narrow viewport, and
844x390 landscape, with both the 64-color and black/white picker open. Checks
confirmed native display geometry, a visible fixed preview during page scroll,
an intact nine-column Pebble palette, no horizontal overflow, 13 versus zero
frame controls, Steps visibility, and HR/date-bracket model filtering.

### QEMU smoke matrix

The Aplite, Basalt, Chalk, Diorite, Emery, and Flint binaries were previously installed
through each emulator's direct watch transport, allowed to finish the launch
animation, pinged, and captured at 144x168, 180x180, or 200x228 as applicable.
All six legacy platforms reached the watchface without a crash and rendered the correct vector or
raster frame, font scale, monochrome/color treatment, and default battery bars.
The host's optional `pypkjs` bridge could not start because its Python 3.13
installation lacks `dbm`; that does not affect the direct native-watch smoke
test, but it prevents automated Settings-to-emulator round trips in this
workspace. Gabbro compiled and its geometry is covered by Settings/native-source
tests. A bounded direct QEMU boot reached firmware 4.17's `Starting Launcher` and
`Ready for communication` messages. Pebble Tool still timed out because this WSL
host accepted QEMU's transport on IPv6 while the tool's `localhost` wait path
could not connect over IPv4. This is an external host/toolchain validation gate,
not a repository boot failure.

## Recommended release gate

1. Clear or replace `LCARS.ttf` and all artwork whose redistribution terms are
   unknown.
2. Execute the README emulator/device matrix, prioritizing Aplite startup heap,
   each color save, persisted reboot state, health layouts, weather, and every
   disconnect-alert transition.
3. Add a pinned/checksummed SDK build plus emulator smoke tests to CI.
