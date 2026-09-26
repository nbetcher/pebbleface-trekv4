'use strict';

/*
 * WP-2 text subsystem tests for src/pkjs/shim/60-text.js.
 *
 * These run against test/fixtures/text-pfa1.fixture.json, a PFA1 atlas built from the REAL
 * emery PFO resources in build/emery/resources/fonts/. Every advance asserted here is the
 * integer FreeType baked at build time, so these tests pin the shim to the watch, not to a
 * reimplementation of it.
 *
 * When WP-1's make_preview_data.py lands, the fixture should be regenerated from the same
 * pipeline; the assertions are written against the fixture's own metadata, so they follow.
 */

var test = require('node:test');
var assert = require('node:assert');
var T = require('../src/pkjs/shim/60-text.js');
var FIX = require('./fixtures/text-pfa1.fixture.json');

var WORD_WRAP = 0, TRAILING_ELLIPSIS = 1, FILL = 2;
var ALIGN_LEFT = 0, ALIGN_CENTER = 1, ALIGN_RIGHT = 2;
var WILDCARD = 0x25AF;

var FONTS = T.pgFontsInit(FIX.pfa1);

function rect(x, y, w, h) { return { origin: { x: x, y: y }, size: { w: w, h: h } }; }

function fb(w, h) {
  return { w: w, h: h, d: new Uint8Array(w * h), t: new Uint8Array(w * h), tag: 7 };
}

function ctxOf(f, opts) {
  opts = opts || {};
  return {
    fb: f,
    ds: { text_color: opts.color === undefined ? 0xFF : opts.color, compositing_mode: 0 },
    dbox: opts.dbox || { x: 0, y: 0 },
    clip: opts.clip || { x0: 0, y0: 0, x1: f.w, y1: f.h }
  };
}

/* Every pixel index that received ink, as a "x,y" set. */
function inkSet(f) {
  var s = new Set();
  for (var i = 0; i < f.d.length; i++) {
    if (f.d[i] !== 0) { s.add((i % f.w) + ',' + Math.floor(i / f.w)); }
  }
  return s;
}

function inkBBox(f) {
  var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
  for (var i = 0; i < f.d.length; i++) {
    if (f.d[i] === 0) { continue; }
    var x = i % f.w, y = Math.floor(i / f.w);
    if (x < x0) { x0 = x; } if (x > x1) { x1 = x; }
    if (y < y0) { y0 = y; } if (y > y1) { y1 = y; }
    n++;
  }
  return { x0: x0, y0: y0, x1: x1, y1: y1, n: n };
}

function measure(s, key, w, h, overflow, align) {
  return T.graphics_text_layout_get_content_size(
    s, FONTS[key], rect(0, 0, w === undefined ? 1000 : w, h === undefined ? 40 : h),
    overflow === undefined ? WORD_WRAP : overflow,
    align === undefined ? ALIGN_LEFT : align);
}

/* ------------------------------------------------------------------ atlas decode */

test('PFA1 decodes every emery font with the metadata the build produced', function () {
  var keys = Object.keys(FIX.fonts).sort();
  assert.deepStrictEqual(Object.keys(FONTS).sort(), keys);
  keys.forEach(function (k) {
    assert.strictEqual(FONTS[k].max_height, FIX.fonts[k].max_height, k + ' max_height');
    assert.strictEqual(FONTS[k].wildcard_cp, FIX.fonts[k].wildcard, k + ' wildcard');
    assert.strictEqual(FONTS[k].n, FIX.fonts[k].n, k + ' glyph count');
    assert.strictEqual(T.fonts_get_font_height(FONTS[k]), FIX.fonts[k].max_height);
  });
});

test('the codepoint index is sorted ascending, so binary search is valid', function () {
  Object.keys(FONTS).forEach(function (k) {
    var cp = FONTS[k].cp;
    for (var i = 1; i < cp.length; i++) {
      assert.ok(cp[i] > cp[i - 1], k + ' index not ascending at ' + i);
    }
  });
});

test('every baked advance round-trips through pgAdvance', function () {
  var checked = 0;
  Object.keys(FIX.advances).forEach(function (k) {
    var font = FONTS[k];
    Object.keys(FIX.advances[k]).forEach(function (cpStr) {
      var cp = parseInt(cpStr, 10), want = FIX.advances[k][cpStr];
      assert.strictEqual(T.pgAdvance(font, cp), Math.max(want, 0),
        k + ' U+' + cp.toString(16) + ' advance');
      checked++;
    });
  });
  assert.ok(checked > 200, 'expected a real charset, got ' + checked);
});

test('glyph metrics are exposed as signed 8-bit, not unsigned', function () {
  var sawNegative = false;
  Object.keys(FONTS).forEach(function (k) {
    var f = FONTS[k];
    for (var i = 0; i < f.n; i++) {
      assert.ok(f.gl[i] >= -128 && f.gl[i] <= 127);
      assert.ok(f.gt[i] >= -128 && f.gt[i] <= 127);
      if (f.gl[i] < 0 || f.gt[i] < 0) { sawNegative = true; }
    }
  });
  assert.ok(sawNegative, 'no negative offset in any font -- i8 decode is untested');
});

/* ------------------------------------------------------------------ wildcard fallback */

test('codepoints Antonio was subset out of fall back to the wildcard box, as on the watch',
  function () {
    var font = FONTS.ANTONIO_21;
    var wcAdv = T.pgAdvance(font, WILDCARD);
    assert.ok(wcAdv > 0, 'fixture must contain U+25AF');
    /* Confirmed absent from the built font: Ř ř Ş Š ž (languages.h uses all five). */
    [0x0158, 0x0159, 0x015E, 0x0160, 0x017E].forEach(function (cp) {
      assert.strictEqual(T.pgGlyphIndex(font, cp), -1, 'U+' + cp.toString(16) + ' should be absent');
      assert.strictEqual(T.pgAdvance(font, cp), wcAdv);
      assert.strictEqual(T.text_resources_get_glyph(font, cp).cp, WILDCARD);
    });
  });

test('a present accented codepoint does NOT fall back', function () {
  var font = FONTS.ANTONIO_21;
  assert.notStrictEqual(T.pgGlyphIndex(font, 0x00E9), -1);
  assert.strictEqual(T.text_resources_get_glyph(font, 0x00E9).cp, 0x00E9);
});

/* ------------------------------------------------------------------ font loading */

test('fonts_load_custom_font accepts every spelling of a resource id', function () {
  var want = FONTS.LCARS_92;
  ['LCARS_92', 'FONT_LCARS_92', 'RESOURCE_ID_FONT_LCARS_92'].forEach(function (h) {
    assert.strictEqual(T.fonts_load_custom_font(T.resource_get_handle(h)), want, h);
  });
  assert.strictEqual(T.fonts_load_custom_font(want), want, 'GFont passthrough');
});

test('an unknown font fails loud rather than rendering blank', function () {
  assert.throws(function () { T.fonts_load_custom_font('FONT_NOPE_11'); }, /not in atlas/);
});

/* ------------------------------------------------------------------ measurement */

test('content size is the integer advance sum the watch computes', function () {
  FIX.widths.forEach(function (c) {
    assert.strictEqual(measure(c.s, c.font).w, c.w,
      JSON.stringify(c.s) + ' in ' + c.font);
  });
});

test('content height is max_height per line', function () {
  assert.strictEqual(measure('10:08', 'LCARS_92', 1000, 200).h, FONTS.LCARS_92.max_height);
  assert.strictEqual(measure('Su Mo', 'ANTONIO_21').h, FONTS.ANTONIO_21.max_height);
});

test('measuring in a box narrower than the string truncates rather than wrapping the width',
  function () {
    var full = measure('Su Mo Tu We Th Fr Sa', 'ANTONIO_21', 1000, 40).w;
    /* A short, single-line-tall box: TrailingEllipsis cannot spill to a second line. */
    var narrow = measure('Su Mo Tu We Th Fr Sa', 'ANTONIO_21', 60, 21, TRAILING_ELLIPSIS).w;
    assert.ok(narrow < full, 'narrow=' + narrow + ' full=' + full);
    assert.ok(narrow <= 60, 'must not exceed the box: ' + narrow);
  });

test('an empty string measures nothing', function () {
  assert.deepStrictEqual(measure('', 'ANTONIO_21'), { w: 0, h: 0 });
});

test('TRAILING WHITESPACE IS COUNTED by content size -- it is NOT trimmed', function () {
  /* Surprising but correct. line->width_px is accumulated from WORD widths in line_add_words,
   * and a run of spaces forms the leading part of the following word (WordStateStart treats
   * ' ' as Growing). The trailing-whitespace trim lives inside walk_line, which the plain
   * non-overflowing path never invokes.
   *
   * This is exactly why main.c:1092 set_days_text() collapses space runs and strips trailing
   * spaces by hand before measuring the day strip -- if the shim silently trimmed here, the
   * today-highlight offsets would drift from the watch. */
  var sp = T.pgAdvance(FONTS.ANTONIO_21, 0x20);
  assert.ok(sp > 0);
  assert.strictEqual(measure(' ', 'ANTONIO_21').w, sp);
  assert.strictEqual(measure('Su ', 'ANTONIO_21').w, measure('Su', 'ANTONIO_21').w + sp);
});

test('an empty box measures nothing (grect_is_empty)', function () {
  assert.deepStrictEqual(
    T.graphics_text_layout_get_content_size('10:08', FONTS.LCARS_92, rect(0, 0, 0, 0),
      WORD_WRAP, ALIGN_LEFT),
    { w: 0, h: 0 });
});

/* ------------------------------------------------------------------ wrapping / ellipsis */

test('word wrap breaks on spaces and stacks lines at max_height', function () {
  var s = 'Su Mo Tu We Th Fr Sa Su Mo Tu';
  var oneLine = measure(s, 'ANTONIO_21', 1000, 100).w;
  assert.strictEqual(oneLine, 239, 'fixture sanity');
  var wrapped = measure(s, 'ANTONIO_21', 190, 100, WORD_WRAP);
  assert.strictEqual(wrapped.h, 2 * FONTS.ANTONIO_21.max_height, 'should occupy two lines');
  assert.ok(wrapped.w <= 190 && wrapped.w > 0, 'w=' + wrapped.w);
});

test('trailing ellipsis appends U+2026 and is charged to the line width', function () {
  var font = FONTS.LCARSP_18;
  var s = 'SHAKE to DISMISS SHAKE to DISMISS';
  var seen = [];
  T.pgTextWalk(s, font, rect(0, 0, 60, font.max_height), TRAILING_ELLIPSIS, ALIGN_LEFT,
    function (cp) { seen.push(cp); }, null);
  assert.strictEqual(seen[seen.length - 1], T.ELLIPSIS_CODEPOINT,
    'last glyph should be the ellipsis, got U+' + seen[seen.length - 1].toString(16));
});

test('word wrap does NOT append an ellipsis', function () {
  var font = FONTS.LCARSP_18;
  var seen = [];
  T.pgTextWalk('SHAKE to DISMISS SHAKE to DISMISS', font, rect(0, 0, 60, font.max_height * 4),
    WORD_WRAP, ALIGN_LEFT, function (cp) { seen.push(cp); }, null);
  assert.ok(seen.indexOf(T.ELLIPSIS_CODEPOINT) === -1);
});

test('a single word too long for an empty line is hyphenated, not overflowed', function () {
  var font = FONTS.LCARSA_30;
  var seen = [];
  T.pgTextWalk('DISCONNECTED', font, rect(0, 0, 40, font.max_height * 4), WORD_WRAP, ALIGN_LEFT,
    function (cp) { seen.push(cp); }, null);
  assert.ok(seen.indexOf(T.HYPHEN_CODEPOINT) !== -1, 'expected a hyphen suffix');
});

/* ------------------------------------------------------------------ alignment */

test('centre alignment uses C integer division and therefore biases LEFT', function () {
  var font = FONTS.LCARSA_30;
  var w = measure('BLUETOOTH', 'LCARSA_30').w;      /* 84 */
  var box = w + 5;                                   /* odd remainder: 5 -> shift 2, not 2.5/3 */
  var firstX = null;
  T.pgTextWalk('BLUETOOTH', font, rect(0, 0, box, font.max_height), FILL, ALIGN_CENTER,
    function (cp, x) { if (firstX === null) { firstX = x; } }, null);
  assert.strictEqual(firstX, 2, 'floor(5/2) = 2, a rounding port would give 3');
});

test('centre alignment is exact on an even remainder', function () {
  var font = FONTS.LCARSA_30;
  var w = measure('BLUETOOTH', 'LCARSA_30').w;
  var firstX = null;
  T.pgTextWalk('BLUETOOTH', font, rect(0, 0, w + 6, font.max_height), FILL, ALIGN_CENTER,
    function (cp, x) { if (firstX === null) { firstX = x; } }, null);
  assert.strictEqual(firstX, 3);
});

test('right alignment pins the cursor extent to the box edge', function () {
  var font = FONTS.LCARS_92;
  var w = measure('10:08', 'LCARS_92').w;
  var firstX = null;
  T.pgTextWalk('10:08', font, rect(0, 0, 149, font.max_height), FILL, ALIGN_RIGHT,
    function (cp, x) { if (firstX === null) { firstX = x; } }, null);
  assert.strictEqual(firstX, 149 - w);
});

test('box origin offsets every cursor', function () {
  var font = FONTS.LCARS_92;
  var firstX = null, firstY = null;
  T.pgTextWalk('10:08', font, rect(44, 8, 149, 97), FILL, ALIGN_LEFT,
    function (cp, x, y) { if (firstX === null) { firstX = x; firstY = y; } }, null);
  assert.strictEqual(firstX, 44);
  assert.strictEqual(firstY, 8);
});

/* ------------------------------------------------------------------ the today-highlight */

test('measure and render agree: the today-token lands exactly where the highlight is placed',
  function () {
    /* This is the main.c:1150/1154 computation that has repeatedly drifted in the SVG preview.
     * DAYS_RECT on emery is (25,134,190,41), font_days is ANTONIO_21, alignment Left. */
    var font = FONTS.ANTONIO_21;
    var strip = 'Su Mo Tu We Th Fr Sa';
    var DAYS_X = 25, DAYS_Y = 134, DAYS_W = 190;

    for (var today = 0; today < 7; today++) {
      var tokStart = 0, i, seen = 0;
      for (i = 0; i < strip.length && seen < today; i++) {
        if (strip.charAt(i) === ' ') { seen++; tokStart = i + 1; }
      }
      var tokEnd = strip.indexOf(' ', tokStart);
      if (tokEnd < 0) { tokEnd = strip.length; }
      var token = strip.substring(tokStart, tokEnd);

      var rightW = measure(strip.substring(0, tokEnd), 'ANTONIO_21').w;
      var tokW = measure(token, 'ANTONIO_21').w;
      var expectedX = DAYS_X + (rightW - tokW);

      /* Render the whole strip and capture where the token's first glyph cursor actually is. */
      var cursors = [];
      T.pgTextWalk(strip, font, rect(DAYS_X, DAYS_Y, DAYS_W, 41), TRAILING_ELLIPSIS, ALIGN_LEFT,
        function (cp, x) { cursors.push(x); }, null);
      assert.strictEqual(cursors.length, strip.length, 'every codepoint should be visited');
      assert.strictEqual(cursors[tokStart], expectedX,
        'token "' + token + '" cursor ' + cursors[tokStart] + ' != measured ' + expectedX);
    }
  });

test('rendering a token standalone at the measured offset is pixel-identical to rendering it '
   + 'inside the full strip', function () {
    var font = FONTS.ANTONIO_21;
    var strip = 'Su Mo Tu We Th Fr Sa';
    var tokStart = 9, tokEnd = 11, token = strip.substring(tokStart, tokEnd);   /* "We" */
    var rightW = measure(strip.substring(0, tokEnd), 'ANTONIO_21').w;
    var tokW = measure(token, 'ANTONIO_21').w;
    var x = 25 + (rightW - tokW);

    var fFull = fb(200, 228), fTok = fb(200, 228);
    /* Clip the full-strip render to just the token's cell so the two are comparable. */
    T.graphics_draw_text(ctxOf(fFull, { clip: { x0: x, y0: 0, x1: x + tokW, y1: 228 } }),
      strip, font, rect(25, 134, 190, 41), TRAILING_ELLIPSIS, ALIGN_LEFT, null);
    T.graphics_draw_text(ctxOf(fTok, { clip: { x0: x, y0: 0, x1: x + tokW, y1: 228 } }),
      token, font, rect(x, 134, tokW, 41), TRAILING_ELLIPSIS, ALIGN_LEFT, null);

    var a = inkBBox(fFull), b = inkBBox(fTok);
    assert.ok(a.n > 0, 'no ink rendered');
    assert.deepStrictEqual(a, b, 'token ink differs between the two renders');
  });

/* ------------------------------------------------------------------ glyph rendering */

test('glyph blit sets exactly the bits in the 1bpp mask -- no anti-aliasing', function () {
  var font = FONTS.LCARS_92;
  var g = T.text_resources_get_glyph(font, 0x38);      /* '8' */
  assert.ok(g && g.w > 0 && g.h > 0);

  var expected = 0, bits = g.w * g.h, i;
  for (i = 0; i < bits; i++) {
    if ((font.bmp[g.off + (i >> 3)] >> (i & 7)) & 1) { expected++; }
  }
  assert.ok(expected > 0, 'glyph mask is empty');

  var f = fb(200, 228);
  T.pgRenderGlyph(ctxOf(f), g, 20, 20);
  var box = inkBBox(f);
  assert.strictEqual(box.n, expected, 'set-pixel count must equal the mask popcount');

  /* Every written pixel is the exact text colour: no partial coverage anywhere. */
  for (i = 0; i < f.d.length; i++) {
    if (f.d[i] !== 0) { assert.strictEqual(f.d[i], 0xFF, 'partial coverage at ' + i); }
  }
  /* Ink sits inside the glyph box translated by left/top offsets. */
  assert.strictEqual(box.x0 >= 20 + g.left, true);
  assert.strictEqual(box.x1 <= 20 + g.left + g.w - 1, true);
  assert.strictEqual(box.y0 >= 20 + g.top, true);
  assert.strictEqual(box.y1 <= 20 + g.top + g.h - 1, true);
});

test('the glyph blit writes the tag map alongside the framebuffer', function () {
  var f = fb(200, 228);
  T.pgRenderGlyph(ctxOf(f), T.text_resources_get_glyph(FONTS.LCARS_92, 0x38), 20, 20);
  var inked = 0, tagged = 0;
  for (var i = 0; i < f.d.length; i++) {
    if (f.d[i] !== 0) { inked++; }
    if (f.t[i] !== 0) { tagged++; assert.strictEqual(f.t[i], 7); }
  }
  assert.strictEqual(inked, tagged);
});

test('text colour alpha is forced opaque (GCompOpAssign)', function () {
  var f = fb(64, 64);
  T.pgRenderGlyph(ctxOf(f, { color: 0x2A }), T.text_resources_get_glyph(FONTS.LCARS_14, 0x38),
    4, 4);
  var seen = new Set();
  for (var i = 0; i < f.d.length; i++) { if (f.d[i] !== 0) { seen.add(f.d[i]); } }
  assert.deepStrictEqual(Array.from(seen), [0xEA], '0x2A | 0xC0');
});

test('glyph rendering is clipped to the context clip box, never past it', function () {
  var font = FONTS.LCARS_92;
  var g = T.text_resources_get_glyph(font, 0x38);
  var full = fb(200, 228), clipped = fb(200, 228);
  T.pgRenderGlyph(ctxOf(full), g, 20, 20);
  T.pgRenderGlyph(ctxOf(clipped, { clip: { x0: 25, y0: 30, x1: 40, y1: 60 } }), g, 20, 20);

  var box = inkBBox(clipped);
  assert.ok(box.n > 0 && box.n < inkBBox(full).n, 'clip should remove some but not all ink');
  assert.ok(box.x0 >= 25 && box.x1 < 40 && box.y0 >= 30 && box.y1 < 60, JSON.stringify(box));

  /* Clipped ink must be a strict subset of the unclipped ink -- same pixels, fewer of them. */
  var fullInk = inkSet(full);
  inkSet(clipped).forEach(function (k) { assert.ok(fullInk.has(k), 'stray pixel ' + k); });
});

test('a glyph entirely outside the clip box writes nothing', function () {
  var f = fb(200, 228);
  T.pgRenderGlyph(ctxOf(f, { clip: { x0: 0, y0: 0, x1: 10, y1: 10 } }),
    T.text_resources_get_glyph(FONTS.LCARS_92, 0x38), 100, 100);
  assert.strictEqual(inkBBox(f).n, 0);
});

/* ------------------------------------------------------------------ graphics_draw_text */

test('graphics_draw_text translates the box by the context drawing box', function () {
  var font = FONTS.LCARS_14;
  var a = fb(200, 228), b = fb(200, 228);
  T.graphics_draw_text(ctxOf(a), '10:08', font, rect(30, 40, 100, 20), FILL, ALIGN_LEFT, null);
  T.graphics_draw_text(ctxOf(b, { dbox: { x: 21, y: 53 } }), '10:08', font,
    rect(9, -13, 100, 20), FILL, ALIGN_LEFT, null);
  assert.ok(inkBBox(a).n > 0);
  assert.deepStrictEqual(inkBBox(a), inkBBox(b), '30,40 == (9,-13) + dbox(21,53)');
});

test('a box with negative origin.y still draws its visible part (popup clock case)', function () {
  /* main.c:541 draws the popup clock into GRect(nx, -3, nw, 18): (bar - lh_time)/2 - 2 with
   * C truncation gives -3, so the box starts above the layer and MUST clip, not bail. */
  var font = FONTS.LCARS_14;
  var f = fb(200, 228);
  T.graphics_draw_text(ctxOf(f, { dbox: { x: 21, y: 53 }, clip: { x0: 21, y0: 53, x1: 178, y1: 175 } }),
    '10:08', font, rect(10, -3, 60, 18), FILL, ALIGN_CENTER, null);
  var box = inkBBox(f);
  assert.ok(box.n > 0, 'popup clock drew nothing');
  assert.ok(box.y0 >= 53, 'drew above the layer clip box');
});

test('graphics_draw_text refuses a non-null GTextAttributes instead of silently ignoring it',
  function () {
    var f = fb(64, 64);
    assert.throws(function () {
      T.graphics_draw_text(ctxOf(f), 'A', FONTS.LCARSA_30, rect(0, 0, 60, 30), FILL,
        ALIGN_LEFT, {});
    }, /text_attributes not supported/);
  });

test('null and empty text draw nothing', function () {
  var f = fb(64, 64);
  var c = ctxOf(f);
  T.graphics_draw_text(c, null, FONTS.LCARSA_30, rect(0, 0, 60, 30), FILL, ALIGN_LEFT, null);
  T.graphics_draw_text(c, '', FONTS.LCARSA_30, rect(0, 0, 60, 30), FILL, ALIGN_LEFT, null);
  assert.strictEqual(inkBBox(f).n, 0);
});

/* ------------------------------------------------------------------ codepoint handling */

test('pgCps decodes surrogate pairs to a single codepoint and appends the NUL terminator',
  function () {
    assert.deepStrictEqual(T.pgCps('Aé'), [0x41, 0xE9, 0]);
    assert.deepStrictEqual(T.pgCps('😀'), [0x1F600, 0]);
    assert.deepStrictEqual(T.pgCps(''), [0]);
  });

test('zero-width codepoints contribute no advance', function () {
  var font = FONTS.ANTONIO_21;
  assert.strictEqual(T.pgAdvance(font, 0x200B), 0, 'zero-width space');
  assert.strictEqual(T.pgAdvance(font, 0x2060), 0, 'word joiner');
});

test('the base64url fallback decoder round-trips the atlas', function () {
  var bytes = T.pgB64UrlDecode(FIX.pfa1);
  assert.strictEqual(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]), 'PFA1');
  var again = T.pgFontsDecodePFA1(bytes);
  assert.strictEqual(Object.keys(again).length, Object.keys(FONTS).length);
});

test('a corrupt atlas is rejected rather than decoded into garbage', function () {
  assert.throws(function () { T.pgFontsDecodePFA1(new Uint8Array([1, 2, 3, 4, 5])); },
    /bad PFA1 magic/);
});

/* ------------------------------------------------------------------ real face strings */

test('the strings the emery face actually draws all fit their layers on one line', function () {
  /* SPEC 5.2 step 6. Strings and box widths taken from main.c: time "%H:%M"/"%I:%M",
   * secs/ampm "00"/"AM", battery "%u", temperature from the weather service, date/week via
   * strftime, popup literals at main.c:553/555/562. If this ever fails, the wrap machinery
   * becomes live and layout no longer collapses to sum-of-advances. */
  var cases = [
    ['10:08', 'LCARS_92', 149], ['23:59', 'LCARS_92', 149],
    ['08', 'LCARSB_26', 31], ['PM', 'LCARSB_26', 31], ['AM', 'LCARSB_26', 31],
    ['100', 'LCARSB_29', 35], ['9', 'LCARSB_29', 35],       /* handle_battery: "%u" */
    ['Su Mo Tu We Th Fr Sa', 'ANTONIO_21', 190],
    ['Mo Tu We Th Fr Sa Su', 'ANTONIO_21', 190],
    ['Wed 13', 'ANTONIO_24', 111], ['Wednesday', 'ANTONIO_24', 111],
    ['72°', 'LCARSB_26', 54], ['-12°', 'LCARSB_26', 54],
    ['BLUETOOTH', 'LCARSA_30', 157], ['DISCONNECTED', 'LCARSA_30', 157],
    ['SHAKE to DISMISS', 'LCARSP_18', 157], ['SHAKE to STOP', 'LCARSP_18', 157],
    ['10:08 AM', 'LCARS_14', 157]
  ];
  cases.forEach(function (c) {
    var w = measure(c[0], c[1]).w;
    assert.ok(w <= c[2], JSON.stringify(c[0]) + ' in ' + c[1] + ': ' + w + ' > box ' + c[2]);
    /* Re-measure in the real box under the TextLayer's real (never-overridden) overflow mode. */
    var h = measure(c[0], c[1], c[2], 200, TRAILING_ELLIPSIS).h;
    assert.strictEqual(h, FONTS[c[1]].max_height,
      JSON.stringify(c[0]) + ' wrapped to ' + h + 'px in a ' + c[2] + 'px box');
  });
});

test('the CHARGING battery string overflows its layer and is truncated, as on the watch',
  function () {
    /* handle_battery (main.c:810) formats "+%u" while charging. LCARS.ttf's '+' is 25px wide
     * at size 29, so "+100" needs 58px in a 35px-wide layer (main.c:2080). The watch cannot
     * fit it: line_add_word hyphenates, then set_ellipsis_on_overflow_last_line_cb replaces
     * the hyphen with U+2026 (present in LCARSB_29) and the layer shows the ellipsis alone.
     *
     * Pinned deliberately. This is real watch behaviour the preview must reproduce, and it is
     * invisible to a browser-font preview, which would just draw "+100" overflowing. */
    var font = FONTS.LCARSB_29;
    assert.strictEqual(T.pgAdvance(font, 0x2B), 25, "LCARS '+' advance at 29px");
    assert.strictEqual(measure('+100', 'LCARSB_29').w, 58, 'unbounded width');

    var box = rect(64, 101, 35, 41);   /* the real emery battery_text_layer */
    var seen = [];
    T.pgTextWalk('+100', font, box, TRAILING_ELLIPSIS, ALIGN_RIGHT,
      function (cp) { seen.push(cp); }, null);
    assert.deepStrictEqual(seen, [T.ELLIPSIS_CODEPOINT]);
    assert.notStrictEqual(T.pgGlyphIndex(font, T.ELLIPSIS_CODEPOINT), -1,
      'LCARSB_29 does have a real ellipsis glyph');
    /* Still one line: the ellipsis replaces the second line rather than creating one. */
    assert.strictEqual(measure('+100', 'LCARSB_29', 35, 41, TRAILING_ELLIPSIS).h,
      font.max_height);
  });

test('Antonio has no ellipsis glyph, so overflow there falls back to the wildcard box',
  function () {
    /* Both Antonio faces are subset without U+2026. text_resources.c's fallback chain sends
     * the ellipsis to U+25AF, so an overflowing date/day string ends in a tofu box on the
     * watch -- not in "...". A browser-font preview gets this wrong every time. */
    var font = FONTS.ANTONIO_24;
    assert.strictEqual(T.pgGlyphIndex(font, T.ELLIPSIS_CODEPOINT), -1);
    assert.strictEqual(T.text_resources_get_glyph(font, T.ELLIPSIS_CODEPOINT).cp, WILDCARD);
    assert.strictEqual(T.pgAdvance(font, T.ELLIPSIS_CODEPOINT), T.pgAdvance(font, WILDCARD));
  });

/* ------------------------------------------------------------------ multi-line / newlines */

test('wrapped lines advance by exactly max_height and restart at the box left edge',
  function () {
    var font = FONTS.ANTONIO_21, lh = font.max_height;
    var rows = {};
    T.pgTextWalk('Su Mo Tu We Th Fr Sa Su Mo Tu', font, rect(25, 134, 190, 100),
      WORD_WRAP, ALIGN_LEFT, function (cp, x, y) {
        if (!rows[y]) { rows[y] = []; }
        rows[y].push(x);
      }, null);
    var ys = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
    assert.strictEqual(ys.length, 2, 'expected two lines, got ' + ys.length);
    assert.strictEqual(ys[0], 134);
    assert.strictEqual(ys[1], 134 + lh);
    assert.strictEqual(rows[ys[0]][0], 25, 'line 1 starts at the box left edge');
    assert.strictEqual(rows[ys[1]][0], 25, 'line 2 restarts at the box left edge');
  });

test('the space that caused a wrap is trimmed from the start of the next line', function () {
  var font = FONTS.ANTONIO_21;
  var lines = {};
  T.pgTextWalk('Su Mo Tu We Th Fr Sa Su Mo Tu', font, rect(0, 0, 190, 100),
    WORD_WRAP, ALIGN_LEFT, function (cp, x, y) {
      if (!lines[y]) { lines[y] = ''; }
      lines[y] += String.fromCharCode(cp);
    }, null);
  var ys = Object.keys(lines).map(Number).sort(function (a, b) { return a - b; });
  assert.strictEqual(lines[ys[1]].charAt(0) === ' ', false,
    'second line begins with a space: ' + JSON.stringify(lines[ys[1]]));
});

test('WordWrap breaks on a newline; Fill treats it as a space', function () {
  var font = FONTS.LCARSP_18, lh = font.max_height;
  var wrapYs = {};
  T.pgTextWalk('ab\ncd', font, rect(0, 0, 190, 100), WORD_WRAP, ALIGN_LEFT,
    function (cp, x, y) { wrapYs[y] = true; }, null);
  assert.deepStrictEqual(Object.keys(wrapYs).map(Number).sort(function (a, b) { return a - b; }),
    [0, lh], 'newline should start a new line under WordWrap');

  var fillYs = {}, fillCps = [];
  T.pgTextWalk('ab\ncd', font, rect(0, 0, 190, 100), FILL, ALIGN_LEFT,
    function (cp, x, y) { fillYs[y] = true; fillCps.push(cp); }, null);
  assert.deepStrictEqual(Object.keys(fillYs).map(Number), [0], 'Fill keeps it on one line');
  assert.strictEqual(String.fromCharCode.apply(null, fillCps), 'ab cd',
    'Fill substitutes SPACE for NEWLINE');
});

test('a string exactly as wide as its box does not wrap', function () {
  var font = FONTS.ANTONIO_21;
  var w = measure('Su Mo Tu We Th Fr Sa', 'ANTONIO_21').w;
  assert.strictEqual(measure('Su Mo Tu We Th Fr Sa', 'ANTONIO_21', w, 100, WORD_WRAP).h,
    font.max_height, 'exact fit must stay on one line');
  assert.strictEqual(measure('Su Mo Tu We Th Fr Sa', 'ANTONIO_21', w - 1, 100, WORD_WRAP).h,
    2 * font.max_height, 'one pixel narrower must wrap');
});

test('measurement is stable across repeated calls (no iterator state leaks)', function () {
  var first = measure('Su Mo Tu We Th Fr Sa', 'ANTONIO_21').w;
  for (var i = 0; i < 5; i++) {
    assert.strictEqual(measure('Su Mo Tu We Th Fr Sa', 'ANTONIO_21').w, first);
  }
});
