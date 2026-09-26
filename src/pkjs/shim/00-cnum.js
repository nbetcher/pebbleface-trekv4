/* TrekV4 settings-preview emulation layer - C integer semantics.
 *
 * SPDX-License-Identifier: Apache-2.0
 * Portions translated from PebbleOS (google/pebble, coredevices/PebbleOS),
 * Apache-2.0, (c) 2024 Google LLC. See NOTICE and LICENSES/.
 *
 * Every arithmetic difference between C and JavaScript that can move a pixel
 * lives here. The shim is a transliteration of C, not a reimplementation, so
 * bare `/` is banned by ESLint inside src/pkjs/shim/ - use cdiv().
 *
 * Why this matters concretely: main.c:538 computes the popup clock notch y as
 * `(bar - lh_time) / 2 - 2`, with bar=12 and lh_time=14 on emery. In C that is
 * (-2)/2 - 2 = -3. Truncation and flooring agree there, but they disagree the
 * moment the numerator is odd and negative: C's (-3)/2 is -1, while
 * Math.floor(-3/2) is -2. One pixel, silently, forever. Always cdiv().
 */

/* Attribution string. make_shim.py strips comments when it inlines the shim
 * into clay-custom.js, so the Apache-2.0 attribution has to survive as DATA.
 * clay-custom.js's installPreview() writes it onto the dock element. */
var PEBBLEOS_ATTRIBUTION =
  'Graphics algorithms translated from PebbleOS (google/pebble, ' +
  'coredevices/PebbleOS), Apache-2.0, (c) 2024 Google LLC.';

/* C integer division: truncates toward zero. JS `/` is real division and
 * Math.floor() rounds toward -Infinity, which differs for negative operands. */
function cdiv(a, b) {
  /* The one sanctioned division in the shim. */
  /* eslint-disable-next-line no-restricted-syntax */
  var q = a / b;
  return q < 0 ? Math.ceil(q) : Math.floor(q);
}

/* C `%` truncates toward zero, and so does JS `%`. Kept as a named function so
 * ported code reads like the C and so the ESLint ban has an escape hatch. */
function cmod(a, b) {
  return a % b;
}

/* Storage-width truncation. Ported code assigning to a C variable of a given
 * width must pass through the matching helper (PORTING.txt rule 4/5). */
function u8(v) { return v & 0xFF; }
function i8(v) { return (v << 24) >> 24; }
function u16(v) { return v & 0xFFFF; }
function i16(v) { return (v << 16) >> 16; }

/* @noinline */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PEBBLEOS_ATTRIBUTION: PEBBLEOS_ATTRIBUTION,
    cdiv: cdiv, cmod: cmod, u8: u8, i8: i8, u16: u16, i16: i16
  };
}
/* @endnoinline */
