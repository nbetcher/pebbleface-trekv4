'use strict';

// The Settings preview redraws the Time 2 face once a second, so one render must stay
// well inside a tick. This lives outside test/ on purpose: `npm test` runs it after
// the main suite, on its own, because timing measured while the other test files run
// in parallel mostly measures the contention.

var test = require('node:test');
var assert = require('node:assert/strict');

var GFX = require('../src/pkjs/preview-data.js');
var shim = require('../src/pkjs/shim/90-render.js');

var BUDGET_MS = 1.5;

function env() {
  return {
    platform: 'emery', pack: GFX.emery, palette: 'literal', wantTags: true,
    colors: {
      backgroundcol: 0x000000, textcol: 0xFFFFFF, othertextcol: 0xFFFFFF,
      bluetooth_color: 0xFFFFFF, battery_full_color: 0xFFAA00,
      battery_empty_color: 0x550000, popup_color: 0xFF0000,
      popup_time_color: 0xFFAA00, popup_hint_color: 0xFFFFFF, customcol: []
    },
    opts: {
      background: 0, invert: false, battery_colorized: false, battery_background: 0,
      secs_instead_of_ampm: true, clock_is_24h: false, startday_is_sunday: true,
      show_heart_rate: false, steps_status: false, date_in_bracket: false,
      hideweather: false, weather_configured: true, bt_connected: true,
      bt_popup: false, preview_disconnected: false, flash_on: true
    },
    tm: { sec: 30, min: 8, hour: 10, mday: 13, mon: 7, year: 126, wday: 4 },
    strings: {
      time_text: '10:08', secs_ampm_text: '30', battery_text: '80',
      date_text: 'Aug 13th', week_text: 'Week 33',
      day_line_raw: 'Su  Mo  Tu  We  Th  Fr  Sa',
      temperature_text: '72°', bpm_text: '72', steps_text: '4321',
      popup_time_text: '10:08 AM', popup_hint_text: 'SHAKE to DISMISS'
    },
    runtime: { battery_pct: 80, is_charging: false, weather_icon: 'CLEAR_DAY' }
  };
}

test('renderFace stays inside the per-tick budget', function () {
  var e = env();
  var times = [];
  var i;
  // Warm up until the JIT has optimised the render path; a fresh process takes a few
  // dozen renders, and timing it any earlier measures compilation, not drawing.
  for (i = 0; i < 100; i++) { shim.renderFace(e); }
  for (i = 0; i < 51; i++) {
    var t0 = process.hrtime.bigint();
    shim.renderFace(e);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  times.sort(function (x, y) { return x - y; });
  var median = times[Math.floor(times.length / 2)];
  assert.ok(median <= BUDGET_MS,
    'median render ' + median.toFixed(2) + 'ms exceeds ' + BUDGET_MS + 'ms');
});
