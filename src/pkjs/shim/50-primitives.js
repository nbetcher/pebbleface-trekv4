/* TrekV4 settings-preview emulation layer - drawing primitives.
 *
 * SPDX-License-Identifier: Apache-2.0
 * SPDX-FileCopyrightText: 2024 Google LLC
 * Translated from PebbleOS src/fw/applib/graphics/graphics.c and
 * graphics_private.c, reduced to the 8-bit rectangular colour path.
 * See NOTICE and LICENSES/pebbleos-APACHE-2.0.txt.
 *
 * THE HEADLINE FACT: graphics_fill_rect with radius 0 is NEVER antialiased,
 * even with antialiasing enabled. graphics_fill_rect maps to
 * graphics_fill_round_rect_by_value, which reaches prv_fill_rect_legacy2 - a
 * pure integer scanline assign - whenever the clamped radius is <= alt_radius,
 * and alt_radius is 0 on the AA path. Most of this watchface's rectangles are
 * therefore razor sharp, which is exactly what SVG's browser antialiasing kept
 * getting wrong.
 *
 * The only antialiased geometry that survives into the shipped code is REPLAY:
 * corner quadrants come from a baked 2-bit alpha LUT and the BT rune from a
 * baked plot list. No AA rasteriser ships.
 */

/* @noinline */
var _q10 = require('./10-gcolor.js');
var _q20 = require('./20-pack.js');
var _q30 = require('./30-fb.js');
var _q00 = require('./00-cnum.js');
var cdiv = _q00.cdiv;
var GRect = _q10.GRect;
var GColorWhite = _q10.GColorWhite;
var GCornerNone = _q10.GCornerNone;
var GCornerTopLeft = _q10.GCornerTopLeft;
var GCornerTopRight = _q10.GCornerTopRight;
var GCornerBottomLeft = _q10.GCornerBottomLeft;
var GCornerBottomRight = _q10.GCornerBottomRight;
var GCornersBottom = _q10.GCornersBottom;
var gcolor_is_transparent = _q10.gcolor_is_transparent;
var packCorner = _q20.packCorner;
var packRuneSeg = _q20.packRuneSeg;
var fbSpan = _q30.fbSpan;
var fbPixel = _q30.fbPixel;
var fbBlend = _q30.fbBlend;
var fbOps = _q30.fbOps;
/* @endnoinline */

/* ---- fail-loud stubs --------------------------------------------------- */

function TrekShimUnsupported(message) {
  this.name = 'TrekShimUnsupported';
  this.message = message;
  this.stack = (new Error(message)).stack;
}
TrekShimUnsupported.prototype = new Error();

/* Silence is the enemy here. An unimplemented call must stop the render so
 * clay-custom.js falls back to the legacy SVG preview, rather than quietly
 * omitting an element nobody notices until a user reports it. */
function notImplemented(name) {
  throw new TrekShimUnsupported('TrekShim: ' + name + ' is out of scope for this platform');
}

/* ---- prv_fill_rect_legacy2 --------------------------------------------- */

/* Row insets packed 4 bits each into a uint32, hence the 8px radius ceiling.
 * PORT OF graphics.c round_top_corner_lookup / round_bottom_corner_lookup.
 * Only reachable with antialiasing OFF (the AA path passes radius 0 here), so
 * on emery these are dormant - they are the aplite/1-bit path, kept because
 * they are the literal C and cost ~90 bytes. */
var ROUND_TOP_CORNER_LOOKUP = [
  0x0, 0x01, 0x01, 0x12, 0x113, 0x123, 0x1234, 0x11235, 0x112346
];
var ROUND_BOTTOM_CORNER_LOOKUP = [
  0x0, 0x01, 0x10, 0x210, 0x3110, 0x32100, 0x432100, 0x5321100, 0x64321100
];

/* PORT OF graphics.c:prv_fill_rect_legacy2.
 * rect is LAYER-LOCAL on entry; this is where it becomes absolute and where
 * clipping happens, so every span written below is already safe. */
function prv_fill_rect_legacy2(ctx, rect, radius, corner_mask, fill_argb) {
  if (gcolor_is_transparent(fill_argb)) { fill_argb = GColorWhite; }
  /* PBL_ASSERTN(radius <= 8) in the C - the insets are 4 bits each in a uint32.
   * Loud here rather than silently indexing past the lookup table. */
  if (radius > 8) { throw new TrekShimUnsupported('TrekShim: legacy2 radius ' + radius + ' > 8'); }

  /* translate to absolute bitmap coordinates */
  var rx = rect.origin.x + ctx.dbox.x;
  var ry = rect.origin.y + ctx.dbox.y;
  var rw = rect.size.w;
  var rh = rect.size.h;

  /* clipped_rect = rect, standardized, clipped to the bitmap and the clip box.
   * ctx.clip is already inside the bitmap, so one intersection covers both;
   * grect_clip on non-negative sizes is exactly this intersection. */
  var cx = rx, cy = ry, cw = rw, ch = rh;
  if (cw < 0) { cx += cw; cw = -cw; }
  if (ch < 0) { cy += ch; ch = -ch; }
  var clip = ctx.clip;
  var nx0 = cx < clip.x0 ? clip.x0 : cx;
  var ny0 = cy < clip.y0 ? clip.y0 : cy;
  var nx1 = (cx + cw) > clip.x1 ? clip.x1 : (cx + cw);
  var ny1 = (cy + ch) > clip.y1 ? clip.y1 : (cy + ch);
  if (nx1 <= nx0 || ny1 <= ny0) { return; }        /* grect_is_empty */
  var clipX = nx0, clipY = ny0, clipW = nx1 - nx0, clipH = ny1 - ny0;

  var insL = (corner_mask & GCornerTopLeft) ? ROUND_TOP_CORNER_LOOKUP[radius] : 0;
  var insR = (corner_mask & GCornerTopRight) ? ROUND_TOP_CORNER_LOOKUP[radius] : 0;

  var topCropped = clipY - ry;
  var leftCropped = clipX - rx; if (leftCropped < 0) { leftCropped = 0; }
  var rightCropped = rw - clipW - leftCropped; if (rightCropped < 0) { rightCropped = 0; }

  if (topCropped > 0) {
    /* The C shifts by 4 * MIN(topCropped, 8), i.e. up to 32 - which JS's >>>
     * would fold back to a no-op (shift counts are masked to 5 bits). All the
     * insets are consumed at that point, so zero is the intended result. */
    var sh = 4 * (topCropped < 8 ? topCropped : 8);
    if (sh >= 32) { insL = 0; insR = 0; } else { insL >>>= sh; insR >>>= sh; }
  }

  var fb = ctx.fb;
  var maxRowX = fb.w - 1;
  var bottomSwitchY = (ry + rh) - radius;
  var maxY = clipY + clipH;
  for (var y = clipY; y < maxY; y++) {
    if (y === bottomSwitchY && (corner_mask & GCornersBottom)) {
      if (corner_mask & GCornerBottomLeft) { insL = ROUND_BOTTOM_CORNER_LOOKUP[radius]; }
      if (corner_mask & GCornerBottomRight) { insR = ROUND_BOTTOM_CORNER_LOOKUP[radius]; }
    }

    var leftSide = (insL & 0xf) - leftCropped; if (leftSide < 0) { leftSide = 0; }
    var rightSide = (insR & 0xf) - rightCropped; if (rightSide < 0) { rightSide = 0; }
    var cornerInsets = leftSide + rightSide;
    var width = cornerInsets < clipW ? clipW - cornerInsets : 0;
    var x = clipX + leftSide;
    insL >>>= 4;
    insR >>>= 4;

    if (width <= 0) { continue; }
    /* graphics_private_draw_horizontal_line_integral: the end is inclusive
     * after its x2--, and prv_assign_horizontal_line_raw clamps to the data
     * row's [min_x, max_x]. */
    var xs = x < 0 ? 0 : x;
    var xe = x + width - 1; if (xe > maxRowX) { xe = maxRowX; }
    if (xs <= xe) { fbSpan(fb, y, xs, xe, fill_argb); }
  }
}

/* ---- rounded corners --------------------------------------------------- */

/* PORT OF graphics.c:prv_clamp_corner_radius. GCornerNone zeroes the radius
 * outright, which is why graphics_fill_rect(rect, r, GCornerNone) is a plain
 * rectangle no matter what r is. */
function prv_clamp_corner_radius(size, corner_mask, radius) {
  if (corner_mask === GCornerNone) { return 0; }
  var min_size = size.w < size.h ? size.w : size.h;
  if (min_size >= 2 * radius) { return radius; }
  return cdiv(min_size, 2);
}

/* Stands in for graphics_internal_circle_quadrant_fill_aa by replaying the baked
 * CRN2 op list for this radius and quadrant. Ops are (dx, dy, alpha) offsets
 * from the corner's centre point, replayed IN ORDER because the firmware blends
 * some pixels twice in a scanline and the composition of two 33% blends is not
 * a 66% blend. See 20-pack.js for why all four quadrants are stored separately
 * rather than mirrored. */
function prv_fill_quadrant_aa(ctx, cx, cy, radius, quadrant, fill_argb) {
  var lut = packCorner(ctx.pack, radius);
  if (!lut) {
    /* The generator enumerates every reachable radius, so a miss means the C
     * grew a corner nobody baked. Fail loudly rather than draw a square one. */
    throw new TrekShimUnsupported('TrekShim: no baked corner ops for radius ' + radius);
  }
  var ops = lut.q[quadrant];
  if (!ops) {
    throw new TrekShimUnsupported('TrekShim: no baked corner quadrant ' + quadrant);
  }
  fbOps(ctx.fb, ctx.dbox.x + cx, ctx.dbox.y + cy, ops, ctx.clip, fill_argb);
}

/* PORT OF graphics.c:prv_fill_rect_internal - four quadrants then exactly
 * three straight rects. The rects are drawn AFTER the quadrants and overlap
 * them by one row/column, so a full-coverage assign wins over a partial
 * quadrant pixel at the seam. Do not reorder. */
function prv_fill_rect_internal(ctx, rect, radius, corner_mask, fill_argb, alt_radius, aa) {
  radius = prv_clamp_corner_radius(rect.size, corner_mask, radius);

  if (radius <= alt_radius) {
    prv_fill_rect_legacy2(ctx, rect, radius, corner_mask, fill_argb);
    return;
  }
  if (!aa) {
    /* graphics_circle_quadrant_fill_non_aa, radius > 8. Unreachable on emery:
     * antialiasing is on by default and never switched off. */
    notImplemented('non-antialiased rounded corners with radius > 8');
  }

  var x = rect.origin.x, y = rect.origin.y, w = rect.size.w, h = rect.size.h;
  var topX = x, topW = w, botX = x, botW = w;

  if (corner_mask & GCornerTopLeft) {
    prv_fill_quadrant_aa(ctx, x + radius, y + radius, radius, GCornerTopLeft, fill_argb);
    topX += radius; topW -= radius;
  }
  if (corner_mask & GCornerBottomLeft) {
    prv_fill_quadrant_aa(ctx, x + radius, y + h - radius - 1, radius, GCornerBottomLeft, fill_argb);
    botX += radius; botW -= radius;
  }
  if (corner_mask & GCornerTopRight) {
    prv_fill_quadrant_aa(ctx, x + w - radius - 1, y + radius, radius, GCornerTopRight, fill_argb);
    topW -= radius;
  }
  if (corner_mask & GCornerBottomRight) {
    prv_fill_quadrant_aa(ctx, x + w - radius - 1, y + h - radius - 1, radius,
                         GCornerBottomRight, fill_argb);
    botW -= radius;
  }

  prv_fill_rect_legacy2(ctx, GRect(topX, y, topW, radius), 0, GCornerNone, fill_argb);
  prv_fill_rect_legacy2(ctx, GRect(x, y + radius, w, h - 2 * radius), 0, GCornerNone, fill_argb);
  prv_fill_rect_legacy2(ctx, GRect(botX, y + h - radius, botW, radius), 0, GCornerNone, fill_argb);
}

/* PORT OF graphics.c:graphics_fill_round_rect. alt_radius is 0 on the AA path
 * and 8 on the non-AA path - the single line that decides whether a corner is
 * antialiased at all. */
function graphics_fill_round_rect(ctx, rect, radius, corner_mask) {
  if (!rect || ctx.lock) { return; }
  if (ctx.ds.antialiased) {
    prv_fill_rect_internal(ctx, rect, radius, corner_mask, ctx.ds.fill_color, 0, true);
    return;
  }
  prv_fill_rect_internal(ctx, rect, radius, corner_mask, ctx.ds.fill_color, 8, false);
}

/* The SDK's 4-argument graphics_fill_rect, which is what the watchface calls
 * (exported_symbols.json maps it to graphics_fill_round_rect_by_value). */
function graphics_fill_rect(ctx, rect, radius, corner_mask) {
  graphics_fill_round_rect(ctx, rect, radius || 0,
                           corner_mask === undefined ? GCornerNone : corner_mask);
}

/* ---- pixels ------------------------------------------------------------ */

/* PORT OF graphics.c:graphics_draw_pixel + graphics_private_set_pixel +
 * set_pixel_raw_8bit. Uses the STROKE colour, forces alpha opaque, and never
 * blends. Drives the classic battery tile's hollow outline (11 call sites). */
function graphics_draw_pixel(ctx, point) {
  if (ctx.lock) { return; }
  var x = point.x + ctx.dbox.x;
  var y = point.y + ctx.dbox.y;
  var clip = ctx.clip;
  if (x < clip.x0 || x >= clip.x1 || y < clip.y0 || y >= clip.y1) { return; }
  var fb = ctx.fb;
  if (x < 0 || x >= fb.w || y < 0 || y >= fb.h) { return; }
  var color = ctx.ds.stroke_color;
  if (gcolor_is_transparent(color)) { return; }
  fbPixel(fb, x, y, color | 0xC0);
}

/* ---- lines ------------------------------------------------------------- */

/* The seven BT-rune strokes are the ONLY graphics_draw_line calls that reach
 * emery, and their geometry is fixed by BT_RUNE_SEG in frame_render.c. Rather
 * than ship Wu antialiasing plus the stroked-line rasteriser (and with them the
 * transliteration hazards - Math.sqrt for integer_sqrt, a missing & 0xFFFF on
 * the error accumulator, prv_adjust_stroked_line_width's rounding of even
 * widths UP to odd so width 2 draws as 3) the plot list is baked offline.
 *
 * runeSegId is REQUIRED. Its absence, an unknown id, a changed endpoint delta
 * or a changed stroke width all throw - the fail-loud coupling that takes the
 * place of a general rasteriser. */
function graphics_draw_line(ctx, p0, p1, runeSegId) {
  if (ctx.lock) { return; }
  if (runeSegId === undefined || runeSegId === null) {
    notImplemented('graphics_draw_line without a baked rune segment id');
  }
  var seg = packRuneSeg(ctx.pack, runeSegId);
  var dx = p1.x - p0.x, dy = p1.y - p0.y;
  if (dx !== seg.dx || dy !== seg.dy) {
    throw new TrekShimUnsupported(
      'TrekShim: rune segment ' + runeSegId + ' baked for delta (' + seg.dx + ',' + seg.dy +
      ') but drawn with (' + dx + ',' + dy + ') - regenerate the pack');
  }
  if (ctx.ds.stroke_width !== seg.width) {
    throw new TrekShimUnsupported(
      'TrekShim: rune segment ' + runeSegId + ' baked at stroke width ' + seg.width +
      ' but drawn at ' + ctx.ds.stroke_width + ' - regenerate the pack');
  }
  /* Ops are p0-relative, so the rune box can land anywhere. */
  fbOps(ctx.fb, ctx.dbox.x + p0.x, ctx.dbox.y + p0.y, seg.ops, ctx.clip, ctx.ds.stroke_color);
}

/* ---- out of scope ------------------------------------------------------ */

/* Gabbro only (main.c:942-998, #ifdef PBL_PLATFORM_GABBRO). */
function graphics_draw_circle() { notImplemented('graphics_draw_circle'); }
function graphics_fill_circle() { notImplemented('graphics_fill_circle'); }
/* Chalk only (main.c:509, #ifndef PARAMETRIC_LCARS). Note that the BitmapLayer
 * update proc's blit is NOT this call - that goes through fbIconBlit. */
function graphics_draw_bitmap_in_rect() { notImplemented('graphics_draw_bitmap_in_rect'); }

/* @noinline */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TrekShimUnsupported: TrekShimUnsupported, notImplemented: notImplemented,
    prv_fill_rect_legacy2: prv_fill_rect_legacy2,
    prv_clamp_corner_radius: prv_clamp_corner_radius,
    prv_fill_quadrant_aa: prv_fill_quadrant_aa,
    prv_fill_rect_internal: prv_fill_rect_internal,
    graphics_fill_round_rect: graphics_fill_round_rect,
    graphics_fill_rect: graphics_fill_rect,
    graphics_draw_pixel: graphics_draw_pixel,
    graphics_draw_line: graphics_draw_line,
    graphics_draw_circle: graphics_draw_circle,
    graphics_fill_circle: graphics_fill_circle,
    graphics_draw_bitmap_in_rect: graphics_draw_bitmap_in_rect
  };
}
/* @endnoinline */
