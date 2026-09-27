'use strict';

// End-to-end cover for the emulation layer. test/clay-custom.test.js deliberately
// exercises the SVG fallback (its fake DOM has no 2D canvas, which is exactly the
// condition that must degrade gracefully), so without this file `node --test`
// would never actually render a framebuffer.

var test = require('node:test');
var assert = require('node:assert/strict');

var GFX = require('../src/pkjs/preview-data.js');
var shim = require('../src/pkjs/shim/90-render.js');
var pack20 = require('../src/pkjs/shim/20-pack.js');
var face80 = require('../src/pkjs/shim/80-face-emery.js');

var PACK = GFX.emery;

function baseEnv(opts, strings) {
  var o = {
    background: 0, invert: false, battery_colorized: false, battery_background: 0,
    secs_instead_of_ampm: true, clock_is_24h: false, startday_is_sunday: true,
    show_heart_rate: false, steps_status: false, date_in_bracket: false,
    hideweather: false, weather_configured: true, bt_connected: true,
    bt_popup: false, preview_disconnected: false, flash_on: true
  };
  var k;
  for (k in (opts || {})) { o[k] = opts[k]; }
  var s = {
    time_text: '10:08', secs_ampm_text: '30', battery_text: '80%',
    date_text: 'Aug 13', week_text: 'W33',
    day_line_raw: 'Su  Mo  Tu  We  Th  Fr  Sa',
    temperature_text: '72°', bpm_text: '72', steps_text: '4321',
    popup_time_text: '10:08 AM', popup_hint_text: 'SHAKE to DISMISS'
  };
  for (k in (strings || {})) { s[k] = strings[k]; }
  return {
    platform: 'emery', pack: PACK, palette: 'literal', wantTags: true,
    colors: {
      backgroundcol: 0x000000, textcol: 0xFFFFFF, othertextcol: 0xFFFFFF,
      bluetooth_color: 0xFFFFFF, battery_full_color: 0xFFAA00,
      battery_empty_color: 0x550000, popup_color: 0xFF0000,
      popup_time_color: 0xFFAA00, popup_hint_color: 0xFFFFFF, customcol: []
    },
    opts: o,
    tm: { sec: 30, min: 8, hour: 10, mday: 13, mon: 7, year: 126, wday: 4 },
    strings: s,
    runtime: { battery_pct: 80, is_charging: false, weather_icon: 'CLEAR_DAY' }
  };
}

function census(result) {
  var counts = {};
  result.targets.forEach(function (t) {
    var key = t.key === null ? '(role-only)' : t.key;
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

test('the emery face renders into a quantised 200x228 framebuffer', function () {
  var r = shim.renderFace(baseEnv());
  assert.equal(r.w, 200);
  assert.equal(r.h, 228);
  assert.equal(r.fb.length, 200 * 228);
  assert.equal(r.rgba.length, 200 * 228 * 4);

  // Every byte is a valid opaque GColor8: alpha bits forced to 11, channels 0..3.
  // A single escaped intermediate value would show up here.
  var i;
  for (i = 0; i < r.fb.length; i++) {
    assert.equal(r.fb[i] & 0xC0, 0xC0, 'pixel ' + i + ' lost its opaque alpha');
  }
  // ...and the expansion only ever emits 0/85/170/255 per channel.
  var allowed = { 0: 1, 85: 1, 170: 1, 255: 1 };
  for (i = 0; i < r.rgba.length; i += 4) {
    assert.ok(allowed[r.rgba[i]] && allowed[r.rgba[i + 1]] && allowed[r.rgba[i + 2]],
      'unquantised RGBA at byte ' + i);
    assert.equal(r.rgba[i + 3], 255);
  }
});

test('the default face paints the frame, the clock, the day strip and the battery', function () {
  var r = shim.renderFace(baseEnv());
  var counts = census(r);

  // The three grouped frame pickers, split exactly as FRAME_GROUP maps the 13
  // watch-side segments onto 3 user-visible controls.
  assert.equal(counts.customcol0, 4);
  assert.equal(counts.customcol4, 4);
  assert.equal(counts.customcol8, 5);

  // 10 classic battery cells at 80%: 8 full, 2 empty.
  assert.equal(counts.battery_full_color, 8);
  assert.equal(counts.battery_empty_color, 2);

  assert.equal(counts.bluetooth_color, 1);
  assert.ok(counts.textcol >= 1, 'the clock and date target textcol');
  assert.ok(counts.othertextcol >= 3, 'seconds, battery %, day strip, week');

  // The popup is hidden by default, so none of its colours may be tappable.
  assert.equal(counts.popup_color, undefined);
  assert.equal(counts.popup_time_color, undefined);
});

test('the disconnect popup adds its own targets and covers the centre of the face', function () {
  var plain = shim.renderFace(baseEnv());
  var popped = shim.renderFace(baseEnv({ preview_disconnected: true, bt_popup: true,
                                         bt_connected: false }));
  var counts = census(popped);
  assert.equal(counts.popup_color, 6 + 2, '6 LCARS rails + 2 caps lines');
  assert.equal(counts.popup_time_color, 1);
  assert.equal(counts.popup_hint_color, 1);

  // The panel is opaque over GRect(21,53,157,122), so the centre must differ.
  var centre = 120 * 200 + 100;
  assert.notEqual(plain.fb[centre], popped.fb[centre]);
});

test('the today highlight inverts the day strip in place', function () {
  var r = shim.renderFace(baseEnv());
  var inverted = 0;
  var y;
  var x;
  // DAYS_RECT is (25,134,190,41) and the highlight is 24 rows tall from its top.
  for (y = 134; y < 158; y++) {
    for (x = 25; x < 215 && x < 200; x++) {
      if (r.fb[y * 200 + x] !== 0xC0) { inverted++; }
    }
  }
  assert.ok(inverted > 100, 'the highlight box should invert a run of pixels');
});

test('the global invert flips every channel of every pixel', function () {
  var plain = shim.renderFace(baseEnv());
  var flipped = shim.renderFace(baseEnv({ invert: true }));
  var i;
  for (i = 0; i < plain.fb.length; i++) {
    assert.equal(flipped.fb[i], ((~plain.fb[i]) & 0x3F) | 0xC0,
      'invert must be (~v)|0xC0 at pixel ' + i);
  }
});

test('the tag map names the topmost owner of every painted pixel', function () {
  var r = shim.renderFace(baseEnv());
  var byTag = {};
  r.targets.forEach(function (t) { byTag[t.tag] = t; });

  // Every tag present in the map must belong to a target that survived the
  // "painted nothing" filter, and must lie inside that target's recorded bbox.
  var seen = {};
  var i;
  for (i = 0; i < r.tags.length; i++) {
    var tag = r.tags[i];
    if (!tag || seen[tag]) { continue; }
    seen[tag] = true;
    var t = byTag[tag];
    assert.ok(t, 'tag ' + tag + ' has no surviving target record');
  }
  for (i = 0; i < r.tags.length; i += 997) {   // sparse sweep, coprime stride
    var tg = r.tags[i];
    if (!tg) { continue; }
    var owner = byTag[tg];
    var x = i % 200;
    var y = (i - x) / 200;
    assert.ok(x >= owner.x0 && x <= owner.x1 && y >= owner.y0 && y <= owner.y1,
      'pixel (' + x + ',' + y + ') tagged ' + tg + ' is outside its bbox');
  }

  // The BT notch is drawn over frame segment 7 and then the rune over the notch,
  // so the rune's own pixels must be owned by bluetooth_color, not by the frame.
  var runeOwners = {};
  for (y = 108; y < 131; y++) {
    for (x = 180; x < 200; x++) {
      var o = byTag[r.tags[y * 200 + x]];
      if (o) { runeOwners[o.key] = true; }
    }
  }
  assert.ok(runeOwners.bluetooth_color, 'the rune must own its own pixels');
});

test('the baked pack carries every radius the face draws', function () {
  var h = pack20.packOpen(PACK);
  // graphics_fill_rect reaches radius 1 (colourised battery pips) and radius 6
  // (the popup clock notch); a missing LUT throws rather than drawing a square.
  assert.ok(pack20.packCorner(h, 1), 'radius 1 corner ops');
  assert.ok(pack20.packCorner(h, 6), 'radius 6 corner ops');
  assert.equal(pack20.packFrameCount(h, 'frame'), 13);
  assert.equal(pack20.packFrameCount(h, 'popup'), 6);
});

test('the today highlight is a hard two-colour inversion, as on the watch', function () {
  // main.c registers effect_hard_invert(othertextcol, backgroundcol): the block fills
  // in the strip colour and today's glyphs knock out to the background. A plain
  // complement turned a grey strip into grey letters on a white block.
  var env = baseEnv();
  env.colors.othertextcol = 0xAAAAAA;
  var r = shim.renderFace(env);
  var seen = {};
  var x, y, i;
  for (y = 134; y < 160; y++) {
    for (x = 0; x < r.w; x++) {
      i = (y * r.w + x) * 4;
      seen[(r.rgba[i] << 16) | (r.rgba[i + 1] << 8) | r.rgba[i + 2]] = true;
    }
  }
  assert.deepEqual(Object.keys(seen).map(Number).sort(function (a, b) { return a - b; }),
    [0x000000, 0xAAAAAA], 'day strip and highlight use only the strip and background colours');
});

test('the preview BT rune is the same bitmask the watch draws', function () {
  // The rune is an exact-pixel bitmask in frame_tables.h (from the original
  // IMAGE_BLUETOOTH art); the preview must carry the identical emery rows.
  var tables = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src', 'c', 'frame_tables.h'), 'utf8');
  var m = /GLYPH_RUNE_EM_ROWS\[(\d+)\]\s*=\s*\{([^}]*)\}/.exec(tables);
  assert.ok(m, 'GLYPH_RUNE_EM_ROWS present in frame_tables.h');
  var rows = m[2].split(',').map(function (v) { return parseInt(v, 16); });
  assert.equal(rows.length, Number(m[1]));
  assert.deepEqual(face80.BT_RUNE_ROWS, rows);
  assert.equal(face80.BT_RUNE_H, rows.length);
  assert.equal(face80.BT_RUNE_W,
    Number(/#define GLYPH_RUNE_EM_W\s+(\d+)/.exec(tables)[1]));
});

test('colourised battery and the bracket date render without unsupported calls', function () {
  // Both paths reach geometry the default render never touches: radius-1 rounded
  // pips and a re-framed opaque TextLayer. They must not throw.
  var r = shim.renderFace(baseEnv({ battery_colorized: true }));
  assert.equal(census(r).battery_full_color, 8);

  var bracket = shim.renderFace(baseEnv({
    show_heart_rate: true, date_in_bracket: true, steps_status: true
  }));
  var counts = census(bracket);
  assert.ok(counts.othertextcol >= 3);
  assert.ok(bracket.targets.length > 20);
});

test('rendering is deterministic for identical input', function () {
  var a = shim.renderFace(baseEnv());
  var b = shim.renderFace(baseEnv());
  assert.deepEqual(Array.from(a.fb), Array.from(b.fb));
});

test('renderFace stays inside the per-tick budget', function () {
  var env = baseEnv();
  shim.renderFace(env);                     // warm up
  var times = [];
  var i;
  for (i = 0; i < 25; i++) {
    var t0 = process.hrtime.bigint();
    shim.renderFace(env);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  times.sort(function (x, y) { return x - y; });
  var median = times[Math.floor(times.length / 2)];
  assert.ok(median <= 1.5, 'median render ' + median.toFixed(2) + 'ms exceeds 1.5ms');
});
