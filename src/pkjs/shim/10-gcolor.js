/* TrekV4 settings-preview emulation layer - colour and geometry types.
 *
 * SPDX-License-Identifier: Apache-2.0
 * SPDX-FileCopyrightText: 2024 Google LLC
 * gcolor_blend / gcolor_alpha_blend / GColorFromRGBA / grect_* are translations
 * of PebbleOS src/fw/applib/graphics/gtypes.c and gcolor_definitions.h,
 * reduced to the 8-bit rectangular colour path. See NOTICE.
 *
 * A GColor is a plain Number holding the ARGB8 byte 0bAARRGGBB. Opaque colours
 * are 0xC0 | (r<<4) | (g<<2) | b with each channel 0..3 (== 0/85/170/255).
 * The emery framebuffer is exactly this, one byte per pixel.
 */

/* @noinline */
/* Node/test-only imports. make_shim.py strips this fence, after which every
 * name below is already in scope from the earlier file in the same IIFE. */
var cdiv = require('./00-cnum.js').cdiv;
/* @endnoinline */

/* ---- geometry ---------------------------------------------------------- */

function GPoint(x, y) { return { x: x, y: y }; }
function GSize(w, h) { return { w: w, h: h }; }
function GRect(x, y, w, h) { return { origin: { x: x, y: y }, size: { w: w, h: h } }; }

/* PORT OF gtypes.c:grect_contains_point - half-open on the far edges, and
 * tolerant of non-standardized (negative-size) rects, exactly as the C is.
 * effects.c:17 calls this per pixel inside the invert loop. */
function grect_contains_point(rect, point) {
  var min_x = rect.origin.x;
  var max_x = rect.origin.x + rect.size.w;
  var t;
  if (min_x > max_x) { t = max_x; max_x = min_x; min_x = t; }
  var min_y = rect.origin.y;
  var max_y = rect.origin.y + rect.size.h;
  if (min_y > max_y) { t = max_y; max_y = min_y; min_y = t; }
  return (point.x >= min_x) && (point.x < max_x) &&
         (point.y >= min_y) && (point.y < max_y);
}

/* PORT OF gtypes.c:grect_standardize - in place, on a {x,y,w,h} tuple object. */
function grect_standardize_xywh(r) {
  if (r.w < 0) { r.x += r.w; r.w = -r.w; }
  if (r.h < 0) { r.y += r.h; r.h = -r.h; }
}

/* ---- colour constants -------------------------------------------------- */

var GColorWhite = 0xFF;
var GColorBlack = 0xC0;
var GColorClear = 0x00;
var GColorWhiteARGB8 = 0xFF;
var GColorBlackARGB8 = 0xC0;

var GCornerNone = 0;
var GCornerTopLeft = 1;
var GCornerTopRight = 2;
var GCornerBottomLeft = 4;
var GCornerBottomRight = 8;
var GCornersAll = 15;
var GCornersTop = 3;
var GCornersBottom = 12;

var GCompOpAssign = 0;
var GCompOpSet = 4;

var GTextOverflowModeWordWrap = 0;
var GTextOverflowModeTrailingEllipsis = 1;
var GTextOverflowModeFill = 2;

var GTextAlignmentLeft = 0;
var GTextAlignmentCenter = 1;
var GTextAlignmentRight = 2;

var GBitmapFormat1Bit = 0;
var GBitmapFormat8Bit = 1;

/* ---- colour conversion ------------------------------------------------- */

/* PORT OF gcolor_definitions.h:GColorFromRGBA (via GColorFromHEX).
 * TRUNCATING >>6, NOT rounding: 0xAA>>6 == 2, 0x7F>>6 == 1. main.c calls
 * GColorFromHEX 7x on user-picked colours; rounding here would put colours
 * near a boundary one whole step off. */
function GColorFromHEX(rgb) {
  return 0xC0 | (((rgb >> 22) & 3) << 4) | (((rgb >> 14) & 3) << 2) | ((rgb >> 6) & 3);
}

/* Expand an ARGB8 byte back to a 0xRRGGBB integer (channels 0/85/170/255). */
function gcolor_to_rgb24(argb) {
  return (((argb >> 4) & 3) * 85) * 65536 + (((argb >> 2) & 3) * 85) * 256 + ((argb & 3) * 85);
}

function gcolor_is_transparent(argb) { return ((argb >> 6) & 3) === 0; }

/* ---- AA RULE #1: the FIRMWARE blend ------------------------------------ */

/* PORT OF gtypes.c:gcolor_blend / gcolor_alpha_blend.
 *
 * PebbleOS ships this as a 4096-byte lookup table (s_blending_lookup_33_percent).
 * All 4096 entries were decoded and verified to be exactly, per 2-bit channel:
 *     factor 1 -> round((src + 2*dest) / 3)
 *     factor 2 -> round((dest + 2*src) / 3)
 * so we compute rather than ship the table (a 4 KB payload win). (s + 2d) with
 * s,d in 0..3 never lands on a half, so the rounding is unambiguous, and for
 * non-negative n, round(n/3) == cdiv(n + 1, 3).
 *
 * factor is GColor8.a: 0 = leave destination, 3 = assign source.
 * The blended result forces alpha to 3 - the framebuffer discards alpha. */
function gcolor_blend(srcArgb, dstArgb, factor) {
  if (factor <= 0) { return dstArgb; }
  if (factor >= 3) { return srcArgb; }
  var s, d;
  if (factor === 1) { s = srcArgb; d = dstArgb; } else { s = dstArgb; d = srcArgb; }
  /* out = round((s + 2*d) / 3) per channel, alpha forced opaque. */
  var r = cdiv(((s >> 4) & 3) + 2 * ((d >> 4) & 3) + 1, 3);
  var g = cdiv(((s >> 2) & 3) + 2 * ((d >> 2) & 3) + 1, 3);
  var b = cdiv((s & 3) + 2 * (d & 3) + 1, 3);
  return 0xC0 | (r << 4) | (g << 2) | b;
}

function gcolor_alpha_blend(srcArgb, dstArgb) {
  return gcolor_blend(srcArgb, dstArgb, (srcArgb >> 6) & 3);
}

/* Firmware coverage -> alpha, from graphics_private_raw.c:28-44:
 *     src_color.a = factor * 3 / (FIXED_S16_3_ONE.raw_value - 1)   // divisor 7
 * `factor` is the 3-bit sub-pixel fraction 0..7, and the division TRUNCATES.
 * A half-covered edge pixel therefore gets alpha 1, not 2. See the warning on
 * blend_argb below: this is NOT the rule frame_render.c uses. Only used
 * offline (pblgfx/pebble_*.py bake it into the corner LUT and rune op list);
 * kept here as the single documented statement of the rule. */
function gfx_factor_to_alpha(factor) { return cdiv(factor * 3, 7); }

/* ---- AA RULE #2: frame_render.c's OWN blend ---------------------------- */

/* PORT OF src/c/frame_render.c:quant_ch - nearest of 0/85/170/255 -> 0..3. */
function quant_ch(v) {
  var q = cdiv(v + 42, 85);
  return q > 3 ? 3 : q;
}

/* PORT OF src/c/frame_render.c:blend_argb.
 *
 * *** DO NOT UNIFY THIS WITH gcolor_blend. ***
 * frame_render.c is the WATCHFACE's own rasteriser, not firmware. It quantises
 * 8x8 supersampled coverage with NEAREST rounding, cov4 = (cov*3 + 32) / 64,
 * then blends in 0/85/170/255 space with a +1 round-half-up nudge. The
 * firmware, by contrast, truncates factor*3/7 and blends via the 33% LUT. The
 * two rules genuinely disagree (a half-covered pixel is alpha 2 here, alpha 1
 * there). Both are correct for their own callers. pblgfx has a pytest that
 * asserts they disagree, so a well-meaning merge fails loudly.
 *
 * Coverage geometry is baked offline into the FRM1 masks; this is the only
 * part of frame_render.c that must ship, because the COLOUR is runtime. */
function blend_argb(bg, fg, cov4) {
  var br = ((bg >> 4) & 3) * 85, bgc = ((bg >> 2) & 3) * 85, bb = (bg & 3) * 85;
  var fr = ((fg >> 4) & 3) * 85, fgc = ((fg >> 2) & 3) * 85, fbv = (fg & 3) * 85;
  var r = cdiv(fr * cov4 + br * (3 - cov4) + 1, 3);
  var g = cdiv(fgc * cov4 + bgc * (3 - cov4) + 1, 3);
  var b = cdiv(fbv * cov4 + bb * (3 - cov4) + 1, 3);
  return 0xC0 | (quant_ch(r) << 4) | (quant_ch(g) << 2) | quant_ch(b);
}

/* ---- sunlight display palette ------------------------------------------ */

/* Clay renders its colour picker through Pebble's sunlight-corrected table, so
 * the preview must be able to display through it too - otherwise selecting a
 * colour appears to change it. Indexed by (argb & 0x3F) == (r<<4)|(g<<2)|b.
 * Packed as hex to keep the payload at 384 chars instead of a 64-entry literal.
 *
 * NOTE: pv.py diffs against watch2.png, a raw FRAMEBUFFER capture, so the
 * verification path must expand with palette:"literal". Sunlight is a DISPLAY
 * transform applied after the pixel pipeline, never inside it. */
var SUNLIGHT_HEX =
  '000000001e410043870068ca2b4a2c27514f16638d007dce5e98605c9b7257a5a24cb4db' +
  '8ee3918ee69e8aebc084f5f14a161b48274840488a2f6bcc564e365454544f67904180d0' +
  '759a64759d7671a6a469b5dd9ee5949de7a09becc295f6f299353f983e5a9556948f74d2' +
  '9d5b4d9d60649a70999587d5afa072aea382abababa7bae2c9e89dc9eaa7c7f0c8c3f9f7' +
  'e35462e25874e16aa3de83dce66e6be6727ce37fa7e194dff1aa86f1ad93efb5b8ecc3eb' +
  'ffeeabfff1b5fff6d3ffffff';

var SUNLIGHT_RGB = null;
function gcolor_sunlight_table() {
  if (!SUNLIGHT_RGB) {
    SUNLIGHT_RGB = new Uint32Array(64);
    for (var i = 0; i < 64; i++) {
      SUNLIGHT_RGB[i] = parseInt(SUNLIGHT_HEX.substr(i * 6, 6), 16);
    }
  }
  return SUNLIGHT_RGB;
}

/* @noinline */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GPoint: GPoint, GSize: GSize, GRect: GRect,
    grect_contains_point: grect_contains_point,
    grect_standardize_xywh: grect_standardize_xywh,
    GColorWhite: GColorWhite, GColorBlack: GColorBlack, GColorClear: GColorClear,
    GColorWhiteARGB8: GColorWhiteARGB8, GColorBlackARGB8: GColorBlackARGB8,
    GCornerNone: GCornerNone, GCornerTopLeft: GCornerTopLeft,
    GCornerTopRight: GCornerTopRight, GCornerBottomLeft: GCornerBottomLeft,
    GCornerBottomRight: GCornerBottomRight, GCornersAll: GCornersAll,
    GCornersTop: GCornersTop, GCornersBottom: GCornersBottom,
    GCompOpAssign: GCompOpAssign, GCompOpSet: GCompOpSet,
    GTextOverflowModeWordWrap: GTextOverflowModeWordWrap,
    GTextOverflowModeTrailingEllipsis: GTextOverflowModeTrailingEllipsis,
    GTextOverflowModeFill: GTextOverflowModeFill,
    GTextAlignmentLeft: GTextAlignmentLeft,
    GTextAlignmentCenter: GTextAlignmentCenter,
    GTextAlignmentRight: GTextAlignmentRight,
    GBitmapFormat1Bit: GBitmapFormat1Bit, GBitmapFormat8Bit: GBitmapFormat8Bit,
    GColorFromHEX: GColorFromHEX, gcolor_to_rgb24: gcolor_to_rgb24,
    gcolor_is_transparent: gcolor_is_transparent,
    gcolor_blend: gcolor_blend, gcolor_alpha_blend: gcolor_alpha_blend,
    gfx_factor_to_alpha: gfx_factor_to_alpha,
    quant_ch: quant_ch, blend_argb: blend_argb,
    gcolor_sunlight_table: gcolor_sunlight_table
  };
}
/* @endnoinline */
