/* TrekV4 settings-preview emulation layer - generated-pack readers.
 *
 * The pack is DATA, not code. It arrives via clay.meta.userData.gfx (or, if
 * the meta round-trip gate fails, a generated marker block) and holds every
 * piece of geometry that is fixed by the C source and therefore rasterised
 * ONCE, offline, in Python, by a faithful port of the real algorithm:
 *
 *   FRM1  per-row RLE of 2-bit coverage for the 13 frame segments / 6 popup bars
 *   CRN1  a rounded-rect corner quadrant's 2-bit alphas, per radius
 *   RUN1  the firmware's plot order for one baked antialiased line
 *   PFA1  1-bit glyph bitmaps + integer advances lifted from the built PFO
 *   ICA1  RLE'd 8-bit icon pixels
 *
 * Consequence: NOT ONE anti-aliasing rasteriser ships in JavaScript. The two
 * irreconcilable AA rules (see 10-gcolor.js) both live offline.
 *
 * All blobs are base64url, unpadded (rule G-BLOB): no `$`, so they survive
 * String.replace's substitution syntax during page generation, and 1:1 through
 * encodeURIComponent instead of standard base64's 3x inflation on + / =.
 */

/* @noinline */
var _p10 = require('./10-gcolor.js');
var GRect = _p10.GRect;
var GCornerTopLeft = _p10.GCornerTopLeft;
var GCornerTopRight = _p10.GCornerTopRight;
var GCornerBottomLeft = _p10.GCornerBottomLeft;
var GCornerBottomRight = _p10.GCornerBottomRight;
/* @endnoinline */

/* ---- base64url --------------------------------------------------------- */

var B64U_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
var B64U_REV = null;

/* Own decoder rather than atob(): atob rejects the base64url alphabet's - and _
 * and it does not exist in every headless context the harness runs under. */
function b64urlDecode(s) {
  var i;
  if (!B64U_REV) {
    B64U_REV = new Int16Array(128);
    for (i = 0; i < 128; i++) { B64U_REV[i] = -1; }
    for (i = 0; i < 64; i++) { B64U_REV[B64U_ALPHA.charCodeAt(i)] = i; }
  }
  var n = s.length;
  var out = new Uint8Array((n * 3) >> 2);
  var o = 0, acc = 0, bits = 0;
  for (i = 0; i < n; i++) {
    var c = s.charCodeAt(i);
    var v = c < 128 ? B64U_REV[c] : -1;
    if (v < 0) { continue; }          /* tolerate stray padding / whitespace */
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 0xFF; }
  }
  return o === out.length ? out : out.subarray(0, o);
}

/* ---- little-endian cursor ---------------------------------------------- */

function Cur(buf) { this.b = buf; this.i = 0; }
Cur.prototype.u8 = function () { return this.b[this.i++]; };
Cur.prototype.i8 = function () { var v = this.b[this.i++]; return (v << 24) >> 24; };
Cur.prototype.u16 = function () { var v = this.b[this.i] | (this.b[this.i + 1] << 8); this.i += 2; return v; };
Cur.prototype.i16 = function () { return (this.u16() << 16) >> 16; };
Cur.prototype.u32 = function () {
  var b = this.b, i = this.i;
  this.i += 4;
  /* Multiply rather than shift: (x << 24) is signed in JS. */
  return b[i] + b[i + 1] * 256 + b[i + 2] * 65536 + b[i + 3] * 16777216;
};
Cur.prototype.str = function (n) {
  var s = '';
  for (var k = 0; k < n; k++) { s += String.fromCharCode(this.b[this.i++]); }
  return s;
};
Cur.prototype.magic = function (want) {
  var got = this.str(4);
  if (got !== want) { throw new Error('TrekShim: bad pack blob magic ' + got + ', want ' + want); }
};

/* ---- handle ------------------------------------------------------------ */

/* packOpen is idempotent so callers can pass either the raw pack or a handle. */
function packOpen(pack) {
  if (!pack) { throw new Error('TrekShim: no graphics pack'); }
  if (pack.__h) { return pack; }
  if (pack.v !== 1) { throw new Error('TrekShim: unsupported pack version ' + pack.v); }
  return {
    __h: true,
    p: pack,
    w: pack.w,
    h: pack.h,
    layout: pack.layout,
    _frame: null,
    _popup: null,
    _corner: {},
    _rune: null,
    _nobt: null,
    _font: {},
    _icon: {}
  };
}

/* ---- FRM1: baked coverage masks ---------------------------------------- */

/* Record layout, one per shape, laid out back to back:
 *     i16 x0, i16 y0     mask box origin, LAYER-LOCAL (baked with ox=oy=0) and
 *                        NOT clipped, so it may be negative; the caller adds
 *                        layer_convert_point_to_screen() and fbMaskRLE clips.
 *                        Layer-local is exact: every translation involved is a
 *                        whole number of pixels and frame_render.c's x16 shape
 *                        tests are translation-invariant under whole pixels.
 *     u16 w,  u16 h      mask box size  (the C's (seg.x-1 .. seg.x+seg.w+1) box)
 *     u8  color_idx      index into FRAME_COLORS[bg]
 *     u16 uniq           number of distinct RLE rows
 *     u16 rowbytes       total bytes of row data that follow (used to advance)
 *     uniq x { u8 nPairs, nPairs x (u8 run, u8 alpha) }
 * Row y uses rows[ri[y]], with ri arriving as base64url u8[h] on the JSON side.
 * Runs are 2-bit alphas (frame_render.c's cov4) and cover exactly w pixels. */
function prvParseFRM1(group) {
  var c = new Cur(b64urlDecode(group.blob));
  c.magic('FRM1');
  var count = c.u8();
  var segs = [];
  for (var i = 0; i < count; i++) {
    var s = {
      x0: c.i16(), y0: c.i16(), w: c.u16(), h: c.u16(),
      ci: c.u8(), rows: [], ri: null
    };
    var uniq = c.u16();
    var rowbytes = c.u16();
    var rowsAt = c.i;
    for (var r = 0; r < uniq; r++) {
      var nPairs = c.u8();
      s.rows.push(c.b.subarray(c.i, c.i + nPairs * 2));
      c.i += nPairs * 2;
    }
    c.i = rowsAt + rowbytes;   /* authoritative advance; tolerates padding */
    var meta = group.seg && group.seg[i];
    s.ri = meta && meta.ri ? b64urlDecode(meta.ri) : null;
    if (!s.ri) {
      /* No index supplied: rows must be 1:1 with scanlines. */
      s.ri = new Uint8Array(s.h);
      for (var y = 0; y < s.h; y++) { s.ri[y] = y; }
    }
    segs.push(s);
  }
  return segs;
}

/* section is 'frame' (default) or 'popup'; both use the FRM1 layout. */
function prvSection(h, section) {
  if (section === 'popup') {
    if (!h._popup) { h._popup = prvParseFRM1(h.p.popup); }
    return h._popup;
  }
  if (!h._frame) { h._frame = prvParseFRM1(h.p.frame); }
  return h._frame;
}

function packFrameSeg(h, i, section) { return prvSection(h, section)[i]; }
function packFrameCount(h, section) { return prvSection(h, section).length; }
function packPopupBar(h, i) { return prvSection(h, 'popup')[i]; }
function packPopupCount(h) { return prvSection(h, 'popup').length; }

/* ---- CRN2: rounded-rect corner quadrants ------------------------------- */

/* PebbleOS fills a rounded rect as 4 quadrant circle fills plus 3 straight
 * rects (graphics.c:prv_fill_rect_internal). The quadrant is the only
 * antialiased part and its geometry depends solely on the radius, so it is
 * baked per radius - as FOUR INDEPENDENT ORDERED OP LISTS, one per quadrant.
 *
 * Not the spec's CRN1 single-alpha-per-cell top-left grid, because running the
 * real prv_fill_oval_quadrant disproves both halves of that design:
 *   - The quadrants are NOT mirrors of each other. The disc centre is offset by
 *     +0.5px in both axes, so the disc spans cx-r .. cx+r+1 and the left and
 *     right quadrants land on different pixels relative to their centres.
 *     graphics.c compensates by placing the right/bottom centres at
 *     (x + w - radius - 1) rather than (x + w - radius).
 *   - Some pixels are written TWICE in a single scanline: when x1.integer ==
 *     x2.integer with both fractions non-zero, prv_assign_horizontal_line_raw
 *     blends the leading edge and then the trailing edge over it. Two 33%
 *     blends are not one 66% blend, so no single-alpha table can express it.
 *
 * Layout: magic, u8 radius, then 4 quadrants in the order
 * TopLeft, TopRight, BottomLeft, BottomRight, each
 *     u16 nOps, nOps x { i8 dx, i8 dy, u8 alpha }
 * with dx/dy relative to the centre point graphics.c passes for that corner. */
var CRN_QUADRANT_ORDER = [GCornerTopLeft, GCornerTopRight,
                          GCornerBottomLeft, GCornerBottomRight];

function packCorner(h, radius) {
  var key = String(radius);
  if (h._corner[key] !== undefined) { return h._corner[key]; }
  var src = h.p.corner && h.p.corner[key];
  if (!src) { h._corner[key] = null; return null; }
  var c = new Cur(b64urlDecode(src));
  c.magic('CRN2');
  var r = c.u8();
  if (r !== radius) { throw new Error('TrekShim: corner radius mismatch ' + r + '/' + radius); }
  var quads = {};
  for (var q = 0; q < CRN_QUADRANT_ORDER.length; q++) {
    var nOps = c.u16();
    quads[CRN_QUADRANT_ORDER[q]] = c.b.subarray(c.i, c.i + nOps * 3);
    c.i += nOps * 3;
  }
  var lut = { r: r, q: quads };
  h._corner[key] = lut;
  return lut;
}

/* ---- RUN1: baked antialiased line op lists ----------------------------- */

/* The seven BT-rune strokes are the only graphics_draw_line calls on emery.
 * Their Wu/stroked rasterisation is baked offline into an ordered plot list,
 * so no line rasteriser ships. Ops are stored RELATIVE TO THE LINE'S OWN p0,
 * which makes them position independent: for integer endpoints the firmware's
 * error accumulator depends only on (dx, dy), so one baked list is valid
 * wherever the rune box lands.
 *
 * Layout: magic, u8 nSeg, then per segment
 *     i8 dx, i8 dy      p1 - p0; verified at draw time (fail-loud coupling)
 *     u8 width          the stroke width the list was baked at
 *     u16 nOps
 *     nOps x { i8 x, i8 y, u8 alpha }   in firmware plot order, p0-relative
 *
 * SPEC DEVIATION, documented: the specification's RUN1 stores rune-box-local
 * u8 coordinates and no per-segment header, which leaves the replay with no
 * way to locate the rune box from graphics_draw_line's arguments and no way to
 * detect BT_RUNE_SEG drift. p0-relative + the delta/width header fixes both. */
function prvParseRUN1(h) {
  var c = new Cur(b64urlDecode(h.p.rune.blob));
  c.magic('RUN1');
  var n = c.u8();
  var segs = [];
  for (var i = 0; i < n; i++) {
    var dx = c.i8(), dy = c.i8(), width = c.u8();
    var nOps = c.u16();
    var ops = c.b.subarray(c.i, c.i + nOps * 3);
    c.i += nOps * 3;
    segs.push({ dx: dx, dy: dy, width: width, nOps: nOps, ops: ops });
  }
  return segs;
}

function packRuneSeg(h, i) {
  if (!h._rune) { h._rune = prvParseRUN1(h); }
  if (i < 0 || i >= h._rune.length) {
    throw new Error('TrekShim: no baked rune segment ' + i);
  }
  return h._rune[i];
}

/* ---- no-BT glyph bitmask ----------------------------------------------- */

/* GLYPH_NOBT_*_ROWS verbatim: one u32 per row, bit x set = ink, LSB leftmost.
 * Drawn as hard pixels (frame_render.c extracts runs and fill_rects them). */
function packNobtRow(h, y) {
  if (!h._nobt) {
    var b = b64urlDecode(h.p.nobt.blob);
    var rows = new Uint32Array(h.p.nobt.h);
    for (var i = 0; i < rows.length; i++) {
      rows[i] = b[i * 4] + b[i * 4 + 1] * 256 + b[i * 4 + 2] * 65536 + b[i * 4 + 3] * 16777216;
    }
    h._nobt = rows;
  }
  return h._nobt[y];
}

/* ---- PFA1: glyph atlas ------------------------------------------------- */

/* Glyphs are 1 bit per pixel with ZERO antialiasing and integer advances,
 * because the watch's PFO fonts are FreeType FT_LOAD_TARGET_MONO renders with
 * advance = floor(hinted_advance_26.6 / 64) + trackingAdjust. No browser and no
 * pure-JS TTF library reproduces that, so we ship the answers, not the question.
 *
 * Layout: magic, u8 font_count, then per font
 *     u8 key_len, key
 *     u8 max_height          line height AND the datum top_offset is measured from
 *     u16 wildcard_cp        0x25AF; missing codepoints resolve to it
 *     u16 glyph_count        index sorted ascending by codepoint
 *     glyph_count x { u16 cp, u8 w, u8 h, i8 left, i8 top, i8 adv, u16 bmp_off }
 *     u32 bitmap_len, bitmap bytes   1bpp, LSB-first, continuous, NO row padding
 */
function prvParsePFA1(h) {
  var c = new Cur(b64urlDecode(h.p.glyphs));
  c.magic('PFA1');
  var nFonts = c.u8();
  var fonts = {};
  for (var f = 0; f < nFonts; f++) {
    var keyLen = c.u8();
    var key = c.str(keyLen);
    var maxH = c.u8();
    var wildcard = c.u16();
    var n = c.u16();
    var font = {
      key: key, max_height: maxH, wildcard_cp: wildcard, count: n,
      cp: new Uint16Array(n), gw: new Uint8Array(n), gh: new Uint8Array(n),
      left: new Int8Array(n), top: new Int8Array(n), adv: new Int8Array(n),
      off: new Uint32Array(n), bmp: null
    };
    for (var i = 0; i < n; i++) {
      font.cp[i] = c.u16();
      font.gw[i] = c.u8();
      font.gh[i] = c.u8();
      font.left[i] = c.i8();
      font.top[i] = c.i8();
      font.adv[i] = c.i8();
      font.off[i] = c.u16();
    }
    var bmpLen = c.u32();
    font.bmp = c.b.subarray(c.i, c.i + bmpLen);
    c.i += bmpLen;
    fonts[key] = font;
  }
  return fonts;
}

function packFont(h, key) {
  if (!h._font.__all) { h._font.__all = prvParsePFA1(h); }
  var f = h._font.__all[key];
  if (!f) { throw new Error('TrekShim: font "' + key + '" not in atlas'); }
  return f;
}

/* ---- ICA1: icon atlas -------------------------------------------------- */

/* Layout: magic, u8 count, then per icon
 *     u8 keyLen, key, u16 w, u16 h, u32 rleLen, rleLen x { u8 run, u8 argb }
 * Every argb has alpha 0 or 3 (asserted by the generator), which is what makes
 * the GCompOpSet blit a pure skip-or-assign. */
function prvParseICA1(h) {
  var c = new Cur(b64urlDecode(h.p.icons));
  c.magic('ICA1');
  var n = c.u8();
  var icons = {};
  for (var i = 0; i < n; i++) {
    var key = c.str(c.u8());
    var w = c.u16(), hh = c.u16();
    var rleLen = c.u32();
    var argb = new Uint8Array(w * hh);
    var o = 0;
    var end = c.i + rleLen;
    while (c.i < end) {
      var run = c.b[c.i++], v = c.b[c.i++];
      for (var k = 0; k < run; k++) { argb[o++] = v; }
    }
    c.i = end;
    icons[key] = { w: w, h: hh, argb: argb };
  }
  return icons;
}

function packIcon(h, key) {
  if (!h._icon.__all) { h._icon.__all = prvParseICA1(h); }
  return h._icon.__all[key] || null;
}

/* ---- layout constants -------------------------------------------------- */

/* Layout rects are scraped from main.c by the generator and arrive as
 * [x, y, w, h] tuples so they cost 4 numbers instead of a nested object. */
function packRect(h, name) {
  var t = h.layout[name];
  if (!t) { throw new Error('TrekShim: no layout rect ' + name); }
  return GRect(t[0], t[1], t[2], t[3]);
}

function packFrameColors(h) {
  if (!h._fc) { h._fc = b64urlDecode(h.layout.FRAME_COLORS); }
  return h._fc;    /* flat u8[12][13], index bg*13 + color_idx */
}

/* @noinline */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    b64urlDecode: b64urlDecode, packOpen: packOpen,
    packFrameSeg: packFrameSeg, packFrameCount: packFrameCount,
    packPopupBar: packPopupBar, packPopupCount: packPopupCount,
    packCorner: packCorner, packRuneSeg: packRuneSeg, packNobtRow: packNobtRow,
    packFont: packFont, packIcon: packIcon,
    packRect: packRect, packFrameColors: packFrameColors
  };
}
/* @endnoinline */
