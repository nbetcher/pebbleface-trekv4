/* TrekV4 settings-preview emulation layer - the framebuffer.
 *
 * fb.d is a Uint8Array of ARGB8 bytes, one per pixel, 200 bytes per row on
 * emery, no padding - bit-identical to the real GBitmapFormat8Bit framebuffer
 * (FRAMEBUFFER_BYTES_PER_ROW == DISP_COLS, 8_bit/framebuffer.h:29).
 *
 * QUANTISATION IS NOT A PASS, IT IS THE ONLY REPRESENTATION. There is no
 * wide-gamut intermediate buffer. Every writer below stores a value whose
 * channels are already 0..3, because every producer emits one.
 *
 * Uint8Array deliberately, not Uint8ClampedArray: clamping would silently
 * absorb an out-of-range write instead of corrupting visibly. The one
 * Uint8ClampedArray in the whole shim is ImageData.data, filled by fbExpand.
 *
 * TAG MAP: fb.t, when present, records which interactive target owns each
 * pixel. It is written beside every store, so because later paint overwrites
 * earlier, t[i] always holds the TOPMOST VISIBLE owner - pixel-exact hit
 * testing, which the old SVG bbox layer never got right where opaque TextLayer
 * backgrounds overlap the LCARS bars.
 */

/* @noinline */
var _f10 = require('./10-gcolor.js');
var gcolor_blend = _f10.gcolor_blend;
var blend_argb = _f10.blend_argb;
var gcolor_sunlight_table = _f10.gcolor_sunlight_table;
/* @endnoinline */

function fbCreate(w, h, fillArgb, wantTags) {
  var n = w * h;
  var d = new Uint8Array(n);
  if (fillArgb) {
    /* Not d.fill(): TypedArray.prototype.fill is ES6 and absent from some of
     * the phone WebViews this config page has to run in. */
    if (d.fill) { d.fill(fillArgb); } else { for (var i = 0; i < n; i++) { d[i] = fillArgb; } }
  }
  return {
    w: w, h: h, d: d,
    t: wantTags ? new Uint8Array(n) : null,
    tag: 0,      /* current target id, 0 = untagged */
    box: null    /* current target record; writers grow its bbox */
  };
}

/* Grow the current target's bounding box. Called once per span, not per pixel.
 * x1/y1 are INCLUSIVE. */
function fbNote(fb, x0, y0, x1, y1) {
  var b = fb.box;
  if (!b) { return; }
  if (x0 < b.x0) { b.x0 = x0; }
  if (y0 < b.y0) { b.y0 = y0; }
  if (x1 > b.x1) { b.x1 = x1; }
  if (y1 > b.y1) { b.y1 = y1; }
}

/* Assign an inclusive horizontal run. NO CLIPPING - callers clip, exactly as
 * prv_assign_horizontal_line_raw relies on prv_fill_rect_legacy2 having
 * already clipped the rect. */
function fbSpan(fb, y, x0, x1, argb) {
  if (x1 < x0) { return; }
  var d = fb.d, t = fb.t, tag = fb.tag;
  var i = y * fb.w + x0, end = y * fb.w + x1;
  for (; i <= end; i++) {
    d[i] = argb;
    if (t) { t[i] = tag; }
  }
  fbNote(fb, x0, y, x1, y);
}

function fbPixel(fb, x, y, argb) {
  var i = y * fb.w + x;
  fb.d[i] = argb;
  if (fb.t) { fb.t[i] = fb.tag; }
  fbNote(fb, x, y, x, y);
}

/* Firmware-rule blend of one pixel (gcolor_alpha_blend with an explicit
 * factor). factor 0 leaves the destination, 3 assigns. */
function fbBlend(fb, x, y, argb, factor) {
  if (factor <= 0) { return; }
  var i = y * fb.w + x;
  fb.d[i] = factor >= 3 ? argb : gcolor_blend(argb, fb.d[i], factor);
  if (fb.t) { fb.t[i] = fb.tag; }
  fbNote(fb, x, y, x, y);
}

/* ---- baked coverage mask replay ---------------------------------------- */

/* Replays one FRM1 shape. This is the frame_render.c render_shape inner loop
 * with the geometry already decided:
 *     if (!cov4) continue;
 *     fb[x] = blend_argb(fb[x], fg, cov4);
 * cov4 == 3 short-circuits to a plain assign, which is exact: blend_argb with
 * cov4 == 3 reduces to quant_ch(ch*85) == ch for every channel.
 *
 * clip is a half-open screen-space box. The frame and popup bars use the
 * CAPTURE path, so their clip is the whole screen, never a layer clip box. */
function fbMaskRLE(fb, ox, oy, seg, clip, argb) {
  var d = fb.d, t = fb.t, tag = fb.tag, W = fb.w;
  var rows = seg.rows, ri = seg.ri;
  var touched = false, bx0 = 0, by0 = 0, bx1 = 0, by1 = 0;
  for (var yy = 0; yy < seg.h; yy++) {
    var y = oy + yy;
    if (y < clip.y0 || y >= clip.y1) { continue; }
    var row = rows[ri[yy]];
    var base = y * W;
    var x = ox;
    for (var k = 0; k < row.length; k += 2) {
      var run = row[k], a = row[k + 1];
      if (a) {
        /* Clip the run once instead of testing every pixel. */
        var s = x < clip.x0 ? clip.x0 : x;
        var e = x + run - 1;
        if (e >= clip.x1) { e = clip.x1 - 1; }
        if (s <= e) {
          if (a >= 3) {
            for (var i = base + s; i <= base + e; i++) { d[i] = argb; if (t) { t[i] = tag; } }
          } else {
            for (i = base + s; i <= base + e; i++) {
              d[i] = blend_argb(d[i], argb, a);
              if (t) { t[i] = tag; }
            }
          }
          if (!touched) { touched = true; bx0 = s; by0 = y; bx1 = e; by1 = y; }
          else {
            if (s < bx0) { bx0 = s; }
            if (e > bx1) { bx1 = e; }
            if (y < by0) { by0 = y; }
            if (y > by1) { by1 = y; }
          }
        }
      }
      x += run;
    }
  }
  if (touched) { fbNote(fb, bx0, by0, bx1, by1); }
}

/* ---- baked line op-list replay ----------------------------------------- */

/* Ops are { i8 dx, i8 dy, u8 alpha } relative to the line's own p0, replayed
 * IN ORDER because the firmware plots overlapping pixels more than once and
 * the later plot wins. */
function fbOps(fb, ox, oy, ops, clip, argb) {
  var n = ops.length;
  for (var k = 0; k < n; k += 3) {
    var x = ox + ((ops[k] << 24) >> 24);
    var y = oy + ((ops[k + 1] << 24) >> 24);
    if (x < clip.x0 || x >= clip.x1 || y < clip.y0 || y >= clip.y1) { continue; }
    fbBlend(fb, x, y, argb, ops[k + 2]);
  }
}

/* ---- 1bpp bitmask run extraction --------------------------------------- */

/* PORT OF frame_render.c:frame_draw_bt_glyph's no-BT branch. Bit x set = ink,
 * LSB leftmost, hard pixels with no AA. */
function fbBits(fb, ox, oy, mask, w, clip, argb) {
  var y = oy;
  if (y < clip.y0 || y >= clip.y1) { return; }
  var x = 0;
  while (x < w) {
    while (x < w && !(mask & (1 << x))) { x++; }
    if (x >= w) { return; }
    var x0 = x;
    while (x < w && (mask & (1 << x))) { x++; }
    var s = ox + x0, e = ox + x - 1;
    if (s < clip.x0) { s = clip.x0; }
    if (e >= clip.x1) { e = clip.x1 - 1; }
    if (s <= e) { fbSpan(fb, y, s, e, argb); }
  }
}

/* ---- GCompOpSet bitmap blit -------------------------------------------- */

/* On 8-bit, GCompOpSet is a per-pixel alpha-keyed blit: alpha 0 skips, alpha 3
 * assigns, anything between goes through gcolor_alpha_blend. The generator
 * asserts every icon pixel is 0 or 3, so the middle case is dead weight
 * insurance rather than a real path. */
function fbIconBlit(fb, ox, oy, icon, clip) {
  var d = fb.d, t = fb.t, tag = fb.tag, W = fb.w;
  var src = icon.argb, iw = icon.w, ih = icon.h;
  for (var yy = 0; yy < ih; yy++) {
    var y = oy + yy;
    if (y < clip.y0 || y >= clip.y1) { continue; }
    var base = y * W, srow = yy * iw;
    for (var xx = 0; xx < iw; xx++) {
      var x = ox + xx;
      if (x < clip.x0 || x >= clip.x1) { continue; }
      var v = src[srow + xx];
      var a = (v >> 6) & 3;
      if (!a) { continue; }
      var i = base + x;
      d[i] = a >= 3 ? v : gcolor_blend(v, d[i], a);
      if (t) { t[i] = tag; }
      fbNote(fb, x, y, x, y);
    }
  }
}

/* ---- invert effect ----------------------------------------------------- */

/* PORT OF effects.c:apply_invert - new = (~old) | GColorBlackARGB8, i.e. each
 * 2-bit channel becomes 3-v with alpha forced opaque. Half-open box, clipped
 * to the framebuffer only: the effect layer writes raw framebuffer bytes and
 * never sees a layer clip box. */
function fbInvert(fb, x0, y0, x1, y1) {
  if (x0 < 0) { x0 = 0; }
  if (y0 < 0) { y0 = 0; }
  if (x1 > fb.w) { x1 = fb.w; }
  if (y1 > fb.h) { y1 = fb.h; }
  if (x0 >= x1 || y0 >= y1) { return; }
  var d = fb.d, W = fb.w;
  for (var y = y0; y < y1; y++) {
    var base = y * W;
    for (var x = x0; x < x1; x++) {
      d[base + x] = ((~d[base + x]) & 0x3F) | 0xC0;
    }
  }
  /* Records the extent but deliberately does NOT touch the tag map. Inverting
   * recolours pixels somebody else painted; a tap on the inverted today box
   * should still open the day strip's colour picker, so ownership stays with
   * whoever laid the ink down. The extent is still worth recording, because a
   * role-only marker (data-preview-role="today-highlight") needs a rect. */
  fbNote(fb, x0, y0, x1 - 1, y1 - 1);
}

/* ---- expansion to RGBA ------------------------------------------------- */

var PAL_CACHE = {};

function prvPalette(palette) {
  if (PAL_CACHE[palette]) { return PAL_CACHE[palette]; }
  var R = new Uint8Array(64), G = new Uint8Array(64), B = new Uint8Array(64);
  var i;
  if (palette === 'sunlight') {
    var s = gcolor_sunlight_table();
    for (i = 0; i < 64; i++) {
      R[i] = (s[i] >> 16) & 0xFF; G[i] = (s[i] >> 8) & 0xFF; B[i] = s[i] & 0xFF;
    }
  } else {
    for (i = 0; i < 64; i++) {
      R[i] = ((i >> 4) & 3) * 85; G[i] = ((i >> 2) & 3) * 85; B[i] = (i & 3) * 85;
    }
  }
  PAL_CACHE[palette] = { R: R, G: G, B: B };
  return PAL_CACHE[palette];
}

/* Expand the framebuffer into an RGBA byte buffer for putImageData.
 * palette "literal" reproduces the framebuffer as captured (what watch2.png
 * holds, and therefore what pv.py must diff against); "sunlight" applies
 * Pebble's display correction so the preview matches Clay's own picker. */
function fbExpand(fb, out8, palette) {
  var p = prvPalette(palette || 'literal');
  var R = p.R, G = p.G, B = p.B, d = fb.d, n = fb.w * fb.h;
  for (var i = 0, j = 0; i < n; i++, j += 4) {
    var c = d[i] & 0x3F;
    out8[j] = R[c];
    out8[j + 1] = G[c];
    out8[j + 2] = B[c];
    out8[j + 3] = 255;
  }
  return out8;
}

/* @noinline */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fbCreate: fbCreate, fbNote: fbNote, fbSpan: fbSpan, fbPixel: fbPixel,
    fbBlend: fbBlend, fbMaskRLE: fbMaskRLE, fbOps: fbOps, fbBits: fbBits,
    fbIconBlit: fbIconBlit, fbInvert: fbInvert, fbExpand: fbExpand,
    /* Re-exported: 80-face-emery.js assumption A6 places blend_argb / quant_ch
     * here, since fbMaskRLE's inner loop is their only caller. They are DEFINED
     * once, in 10-gcolor.js, next to the firmware blend they must never be
     * merged with. */
    blend_argb: blend_argb, quant_ch: _f10.quant_ch
  };
}
/* @endnoinline */
