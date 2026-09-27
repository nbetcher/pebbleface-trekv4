/* PORT OF src/c/frame_render.c (colour + dispatch tier) and of the emery
 * drawing path of src/c/main.c.
 *
 * Translation rules: src/pkjs/shim/PORTING.txt. C function names, C parameter
 * names and C statement order are preserved; integer division is cdiv().
 *
 * WHAT IS *NOT* HERE, ON PURPOSE
 *   frame_render.c's geometry (build_shape / corner_out / rr_inside /
 *   shape_inside / shape_coverage / render_shape) is baked offline by
 *   pblgfx/frame_render.py into the FRM1 coverage masks in the pack, and its
 *   blend (blend_argb / quant_ch) is replayed by 30-fb.js's fbMaskRLE. Nothing
 *   in this file rasterises an antialiased edge - see spec sections 1.1 and 4.3.
 *   The BT glyphs are exact 1-bit bitmasks drawn as fill_rect runs, as in the C.
 *
 * INTERFACE NOTES for the packages built in parallel. A1-A4 and A6 have been
 * checked against the landed files; A5 is the one contract 70-layer.js still
 * has to honour and is called out in the hand-off report.
 *   A1. packFrameSeg(h, i, section) - section is 'frame' (default) or 'popup';
 *       both use the FRM1 layout of spec 2.5.                         [checked]
 *   A2. FRM1 segment x0/y0 are LAYER-LOCAL (baked with ox=oy=0) and are
 *       translated at replay by layer_convert_point_to_screen(). Exact: every
 *       translation involved is a whole number of pixels and frame_render.c's
 *       x16 shape tests are translation-invariant under whole pixels. [checked]
 *   A3. graphics_capture_frame_buffer() returns a GBitmap FACADE; its .fb is the
 *       raw framebuffer that fbMaskRLE writes into, and pgTagBegin already
 *       mirrors the active tag onto it.                               [checked]
 *   A4. graphics_draw_line(ctx, p0, p1, runeSegId) replays pack.rune segment
 *       runeSegId with p0-relative ops, and throws if the endpoint delta or the
 *       stroke width disagrees with what was baked.                   [checked]
 *   A5. TextLayer / BitmapLayer objects may carry .pgTag and .pgBgTag records
 *       ({key,label,role}); 70-layer.js's update procs must wrap their text /
 *       bitmap ink in pgTagBegin(ctx, t.key, t.label, t.role)/pgTagEnd(ctx) and
 *       their opaque background fill in the .pgBgTag equivalent. Layers without
 *       them draw untagged. Setters: faceTagInk() / faceTagBg(), below.
 *   A6. blend_argb / quant_ch live in 10-gcolor.js (fbMaskRLE's inner loop needs
 *       them). They are deliberately NOT duplicated here, so the concatenated
 *       shim has exactly one definition of each.                      [checked]
 */

/* @noinline */
/* Standalone (node --test / dump_preview.js) bindings for the symbols earlier
 * shim files contribute to the concatenated scope. make_shim.py strips this
 * fence, so the serialized config page never sees `require`.
 *
 * SAFETY: bare `var x;` declarations with no initializer do NOT clobber an
 * existing function declaration of the same name in the same scope, and every
 * assignment below is guarded on `typeof module`. */
var cdiv, b64urlDecode;
var GPoint, GSize, GRect, GColorFromHEX;
var GColorWhite, GColorBlack, GColorClear, GCornerNone, GCornersAll, GCompOpSet;
var GTextOverflowModeWordWrap, GTextOverflowModeFill;
var GTextAlignmentLeft, GTextAlignmentCenter, GTextAlignmentRight;
var packOpen, packFrameSeg, packFrameCount, packFrameColors, packNobtRow, packRect;
var fbMaskRLE;
var pgTagBegin, pgTagEnd, gbitmap_get_bounds;
var graphics_context_set_fill_color, graphics_context_set_stroke_color;
var graphics_context_set_text_color, graphics_context_set_stroke_width;
var graphics_context_set_antialiased;
var graphics_capture_frame_buffer, graphics_release_frame_buffer;
var graphics_fill_rect, graphics_draw_pixel, graphics_draw_line;
var resource_get_handle, fonts_load_custom_font;
var graphics_draw_text, graphics_text_layout_get_content_size;
var layer_create, layer_set_update_proc, layer_add_child, layer_remove_from_parent;
var layer_get_bounds, layer_set_frame, layer_set_hidden, layer_get_hidden;
var layer_convert_point_to_screen;
var text_layer_create, text_layer_get_layer, text_layer_set_text;
var text_layer_set_text_color, text_layer_set_background_color;
var text_layer_set_font, text_layer_set_text_alignment;
var bitmap_layer_create, bitmap_layer_get_layer, bitmap_layer_set_bitmap;
var bitmap_layer_set_background_color, bitmap_layer_set_compositing_mode;
var window_create, window_get_root_layer, window_set_background_color, window_stack_push;
var gbitmap_create_with_resource;
var effect_layer_create, effect_layer_get_layer, effect_layer_set_frame;
var effect_layer_add_effect, effect_layer_destroy, effect_invert, effect_hard_invert;
if (typeof module !== 'undefined' && module.exports) {
  var _m = { c: null, g: null, p: null, f: null, x: null, r: null, t: null, l: null, e: null };
  try { _m.c = require('./00-cnum.js'); } catch (m0) { /* not landed yet */ }
  try { _m.g = require('./10-gcolor.js'); } catch (m1) { /* not landed yet */ }
  try { _m.p = require('./20-pack.js'); } catch (m2) { /* not landed yet */ }
  try { _m.f = require('./30-fb.js'); } catch (m3) { /* not landed yet */ }
  try { _m.x = require('./40-gcontext.js'); } catch (m4) { /* not landed yet */ }
  try { _m.r = require('./50-primitives.js'); } catch (m5) { /* not landed yet */ }
  try { _m.t = require('./60-text.js'); } catch (m6) { /* not landed yet */ }
  try { _m.l = require('./70-layer.js'); } catch (m7) { /* not landed yet */ }
  try { _m.e = require('./75-effects.js'); } catch (m8) { /* not landed yet */ }
  for (var _k in _m) { if (!_m[_k]) { _m[_k] = {}; } }
  cdiv = _m.c.cdiv;
  b64urlDecode = _m.p.b64urlDecode;
  GPoint = _m.g.GPoint; GSize = _m.g.GSize; GRect = _m.g.GRect;
  GColorFromHEX = _m.g.GColorFromHEX;
  GColorWhite = _m.g.GColorWhite !== undefined ? _m.g.GColorWhite : 0xFF;
  GColorBlack = _m.g.GColorBlack !== undefined ? _m.g.GColorBlack : 0xC0;
  GColorClear = _m.g.GColorClear !== undefined ? _m.g.GColorClear : 0x00;
  GCornerNone = _m.g.GCornerNone !== undefined ? _m.g.GCornerNone : 0;
  GCornersAll = _m.g.GCornersAll !== undefined ? _m.g.GCornersAll : 15;
  GCompOpSet = _m.g.GCompOpSet !== undefined ? _m.g.GCompOpSet : 4;
  GTextOverflowModeWordWrap = _m.g.GTextOverflowModeWordWrap !== undefined ? _m.g.GTextOverflowModeWordWrap : 0;
  GTextOverflowModeFill = _m.g.GTextOverflowModeFill !== undefined ? _m.g.GTextOverflowModeFill : 2;
  GTextAlignmentLeft = _m.g.GTextAlignmentLeft !== undefined ? _m.g.GTextAlignmentLeft : 0;
  GTextAlignmentCenter = _m.g.GTextAlignmentCenter !== undefined ? _m.g.GTextAlignmentCenter : 1;
  GTextAlignmentRight = _m.g.GTextAlignmentRight !== undefined ? _m.g.GTextAlignmentRight : 2;
  packOpen = _m.p.packOpen; packFrameSeg = _m.p.packFrameSeg;
  packFrameCount = _m.p.packFrameCount; packFrameColors = _m.p.packFrameColors;
  packNobtRow = _m.p.packNobtRow; packRect = _m.p.packRect;
  fbMaskRLE = _m.f.fbMaskRLE;
  pgTagBegin = _m.x.pgTagBegin; pgTagEnd = _m.x.pgTagEnd;
  gbitmap_get_bounds = _m.x.gbitmap_get_bounds;
  graphics_context_set_fill_color = _m.x.graphics_context_set_fill_color;
  graphics_context_set_stroke_color = _m.x.graphics_context_set_stroke_color;
  graphics_context_set_text_color = _m.x.graphics_context_set_text_color;
  graphics_context_set_stroke_width = _m.x.graphics_context_set_stroke_width;
  graphics_context_set_antialiased = _m.x.graphics_context_set_antialiased;
  graphics_capture_frame_buffer = _m.x.graphics_capture_frame_buffer;
  graphics_release_frame_buffer = _m.x.graphics_release_frame_buffer;
  graphics_fill_rect = _m.r.graphics_fill_rect;
  graphics_draw_pixel = _m.r.graphics_draw_pixel;
  graphics_draw_line = _m.r.graphics_draw_line;
  resource_get_handle = _m.t.resource_get_handle;
  fonts_load_custom_font = _m.t.fonts_load_custom_font;
  graphics_draw_text = _m.t.graphics_draw_text;
  graphics_text_layout_get_content_size = _m.t.graphics_text_layout_get_content_size;
  layer_create = _m.l.layer_create; layer_set_update_proc = _m.l.layer_set_update_proc;
  layer_add_child = _m.l.layer_add_child;
  layer_remove_from_parent = _m.l.layer_remove_from_parent;
  layer_get_bounds = _m.l.layer_get_bounds; layer_set_frame = _m.l.layer_set_frame;
  layer_set_hidden = _m.l.layer_set_hidden; layer_get_hidden = _m.l.layer_get_hidden;
  layer_convert_point_to_screen = _m.l.layer_convert_point_to_screen;
  text_layer_create = _m.l.text_layer_create;
  text_layer_get_layer = _m.l.text_layer_get_layer;
  text_layer_set_text = _m.l.text_layer_set_text;
  text_layer_set_text_color = _m.l.text_layer_set_text_color;
  text_layer_set_background_color = _m.l.text_layer_set_background_color;
  text_layer_set_font = _m.l.text_layer_set_font;
  text_layer_set_text_alignment = _m.l.text_layer_set_text_alignment;
  bitmap_layer_create = _m.l.bitmap_layer_create;
  bitmap_layer_get_layer = _m.l.bitmap_layer_get_layer;
  bitmap_layer_set_bitmap = _m.l.bitmap_layer_set_bitmap;
  bitmap_layer_set_background_color = _m.l.bitmap_layer_set_background_color;
  bitmap_layer_set_compositing_mode = _m.l.bitmap_layer_set_compositing_mode;
  window_create = _m.l.window_create;
  window_get_root_layer = _m.l.window_get_root_layer;
  window_set_background_color = _m.l.window_set_background_color;
  window_stack_push = _m.l.window_stack_push;
  gbitmap_create_with_resource = _m.l.gbitmap_create_with_resource;
  effect_layer_create = _m.e.effect_layer_create;
  effect_layer_get_layer = _m.e.effect_layer_get_layer;
  effect_layer_set_frame = _m.e.effect_layer_set_frame;
  effect_layer_add_effect = _m.e.effect_layer_add_effect;
  effect_layer_destroy = _m.e.effect_layer_destroy;
  effect_invert = _m.e.effect_invert;
  effect_hard_invert = _m.e.effect_hard_invert;
}
/* @endnoinline */

/* ==========================================================================
   PORT OF src/c/frame_render.c - colour selection and dispatch only
   ========================================================================== */

/* frame_tables.h */
var FRAME_NSEG = 13;
var FRAME_NBG = 12;
/* frame_render.c:143 - #define FRAME_BG_CUSTOM FRAME_NBG */
var FRAME_BG_CUSTOM = FRAME_NBG;

/* frame_render.c:144 - static uint8_t s_custom_colors[FRAME_NSEG] */
var s_custom_colors = [];

/* main.c's file-scope globals live on one object; faceBuild() binds it here so
   the update procs can read them exactly as the C reads its statics. */
var s_face = null;

/* Tap-target labels, byte-identical to the strings clay-custom.js already uses
   so targetAttributes() output (and the tests asserting on it) is unchanged. */
var LBL_BG = 'Change screen background color';
var LBL_PANEL = 'Change screen and dialog background color';
var LBL_PRIMARY = 'Change primary text color';
var LBL_SECONDARY = 'Change secondary text color';
var LBL_BT = 'Change Bluetooth symbol color';
var LBL_BATT_FULL = 'Change filled battery bar color';
var LBL_BATT_EMPTY = 'Change empty battery bar color';
var LBL_POPUP = 'Change disconnect alert accent color';
var LBL_POPUP_TIME = 'Change disconnect alert clock color';
var LBL_POPUP_HINT = 'Change disconnect alert hint color';

/* The 13 watch-side frame segments are exposed to the user as 3 grouped
   pickers; the packed payload stays 13 wide (clay-custom.js:307). */
var FRAME_GROUP = [0, 0, 0, 0, 4, 4, 4, 4, 8, 8, 8, 8, 8];
var FRAME_GROUP_LABELS = { 0: 'Top bar and left rail', 4: 'Middle section', 8: 'Bottom bar' };

function frameGroupLabel(i) {
  return 'Change ' + (FRAME_GROUP_LABELS[FRAME_GROUP[i]] || 'LCARS frame') + ' color';
}

/* Attach a tap-target record to a TextLayer / BitmapLayer (see A5). */
function faceTagInk(o, key, label, role) {
  if (o) { o.pgTag = { key: key, label: label, role: role || null }; }
  return o;
}

function faceTagBg(o, key, label, role) {
  if (o) { o.pgBgTag = { key: key, label: label, role: role || null }; }
  return o;
}

/* render_shape clips to the framebuffer bounds and nothing else. Same shape as
   ctx.clip so fbMaskRLE can consume it directly. */
function faceScreenClip(fb) {
  var b = gbitmap_get_bounds(fb);
  return { x0: 0, y0: 0, x1: b.size.w, y1: b.size.h };
}

/* PORT OF src/c/frame_render.c:frame_set_custom_colors */
function frame_set_custom_colors(segment_argb) {
  var i;
  for (i = 0; i < FRAME_NSEG; i++) { s_custom_colors[i] = segment_argb[i]; }
}

/* PORT OF src/c/frame_render.c:frame_draw_background
 *
 * Capture path: writes are absolute screen coordinates, clipped only to the
 * framebuffer, and bypass every GContext state (spec 4.4). The `if (!fb)`
 * degraded fallback in the C is unreachable on hardware and is not translated.
 * Segments are drawn in table order and each blends over the previous result.
 */
function frame_draw_background(ctx, layer, bg_index) {
  var S = s_face;
  var org, fb, clip, colors, i, seg, fg;
  if (bg_index > FRAME_BG_CUSTOM) { bg_index = 0; }
  org = layer_convert_point_to_screen(layer, GPoint(0, 0));
  fb = graphics_capture_frame_buffer(ctx);
  if (!fb) { return; }
  colors = packFrameColors(S.pack);
  clip = faceScreenClip(fb);
  for (i = 0; i < FRAME_NSEG; i++) {
    seg = packFrameSeg(S.pack, i, 'frame');
    fg = (bg_index === FRAME_BG_CUSTOM) ? s_custom_colors[i]
                                        : colors[bg_index * FRAME_NSEG + seg.ci];
    pgTagBegin(ctx, 'customcol' + FRAME_GROUP[i], frameGroupLabel(i), null);
    /* A2: seg.x0/y0 are layer-local; org is the layer's screen origin (0,0 for
       frame_layer, whose frame is the window bounds). A3: fb.fb is the raw
       framebuffer behind the GBitmap facade. */
    fbMaskRLE(fb.fb, org.x + seg.x0, org.y + seg.y0, seg, clip, fg);
    pgTagEnd(ctx);
  }
  graphics_release_frame_buffer(ctx, fb);
}

/* PORT OF src/c/frame_render.c:frame_draw_popup_bars
 * Same unclipped capture-path semantics as the frame; org is (21,53) on emery. */
function frame_draw_popup_bars(ctx, layer, accent) {
  var S = s_face;
  var org, fb, clip, n, i, seg;
  org = layer_convert_point_to_screen(layer, GPoint(0, 0));
  fb = graphics_capture_frame_buffer(ctx);
  if (!fb) { return; }
  clip = faceScreenClip(fb);
  n = packFrameCount(S.pack, 'popup');
  for (i = 0; i < n; i++) {
    seg = packFrameSeg(S.pack, i, 'popup');
    pgTagBegin(ctx, 'popup_color', LBL_POPUP, 'popup-rail');
    fbMaskRLE(fb.fb, org.x + seg.x0, org.y + seg.y0, seg, clip, accent);
    pgTagEnd(ctx);
  }
  graphics_release_frame_buffer(ctx, fb);
}

/* PORT OF src/c/frame_render.c:frame_popup_panel_size - emery GSize(157,122) */
function frame_popup_panel_size() {
  var p = s_face.pack.layout.POPUP;
  return GSize(p[0], p[1]);
}

/* frame_tables.h:GLYPH_RUNE_EM_ROWS - the Time 2 IMAGE_BLUETOOTH art 5.x shipped
   (bluetooth-bw~emery.png, 11x19, 2px strokes). Bit x of row y = ink. */
var BT_RUNE_W = 11;
var BT_RUNE_H = 19;
var BT_RUNE_ROWS = [
  0x0020, 0x0060, 0x00E0, 0x01A0, 0x0323, 0x0326, 0x012C, 0x01F8, 0x0070, 0x0070,
  0x00F0, 0x01F8, 0x0324, 0x0626, 0x0323, 0x01A0, 0x00E0, 0x0060, 0x0020
];

/* PORT OF src/c/frame_render.c:draw_glyph_rows - hard 1px run-length spans drawn with
   graphics_fill_rect, as the C does, so they ARE clipped to the layer. (30-fb.js's
   fbBits is the capture-path equivalent and is deliberately not used here.) */
function draw_glyph_rows(ctx, box, rowAt, gw, gh, color) {
  var ox = box.origin.x + cdiv(box.size.w - gw, 2);
  var oy = box.origin.y + cdiv(box.size.h - gh, 2);
  var y, bits, x, x0;
  graphics_context_set_fill_color(ctx, color);
  for (y = 0; y < gh; y++) {
    bits = rowAt(y);
    x = 0;
    while (bits) {
      while (x < gw && !(bits & (1 << x))) { x++; }
      if (x >= gw) { break; }
      x0 = x;
      while (x < gw && (bits & (1 << x))) { bits &= ~(1 << x); x++; }
      graphics_fill_rect(ctx, GRect(ox + x0, oy + y, x - x0, 1), 0, GCornerNone);
    }
  }
}

/* PORT OF src/c/frame_render.c:frame_draw_bt_glyph - both states are exact bitmasks. */
function frame_draw_bt_glyph(ctx, box, connected, color) {
  var S = s_face;
  if (connected) {
    draw_glyph_rows(ctx, box, function (y) { return BT_RUNE_ROWS[y]; },
                    BT_RUNE_W, BT_RUNE_H, color);
    return;
  }
  draw_glyph_rows(ctx, box, function (y) { return packNobtRow(S.pack, y); },
                  S.pack.p.nobt.w, S.pack.p.nobt.h, color);
}

/* ==========================================================================
   PORT OF src/c/main.c - the emery drawing path
   ========================================================================== */

/* main.c:104-109 - draw_palette indices */
var DRAW_PALETTE_FRAME_FIRST = 1;
var DRAW_PALETTE_BATTERY_FULL = 14;
var DRAW_PALETTE_BATTERY_EMPTY = 15;
var DRAW_PALETTE_BT = 16;
var DRAW_PALETTE_POPUP = 17;
var DRAW_PALETTE_POPUP_TIME = 18;
var DRAW_PALETTE_POPUP_HINT = 19;
/* env.colors keys for draw_palette[14..19], in index order. */
var PALETTE_TAIL = ['battery_full_color', 'battery_empty_color', 'bluetooth_color',
                    'popup_color', 'popup_time_color', 'popup_hint_color'];

/* main.c:60/63 - the enums the drawing path reads */
var BGND_CUSTOM = 12;
var BATTBG_BLACK = 0;
var BATTBG_SAME_AS_BG_IMAGE = 1;
var BATTBG_SAME_AS_BG_COLOR = 2;

/* main.c:29-45 - WEATHER_ICONS[], index order preserved. */
var WEATHER_ICONS = [
  'CLEAR_DAY', 'CLEAR_NIGHT', 'WINDY', 'COLD', 'PARTLY_CLOUDY_DAY',
  'PARTLY_CLOUDY_NIGHT', 'HAZE', 'CLOUD', 'RAIN', 'SNOW', 'HAIL', 'CLOUDY',
  'STORM', 'FOG', 'NA'
];

/* main.c's ConstantGRect layout rects, scraped into the pack by the generator.
   packRect() builds a fresh GRect per call, which matters: faceBuild mutates
   TIME_RECT's origin and applyBpmLayout/faceTick re-frame DATE_RECT. */
function faceRect(S, key) { return packRect(S.pack, key); }

/* main.c:239 - GRect EMPTY_RECT = ConstantGRect(0,0,0,0) */
function EMPTY_RECT() { return GRect(0, 0, 0, 0); }

/* PORT OF src/c/main.c:setup_text_layer */
function setup_text_layer(rect, align, font) {
  var newLayer = text_layer_create(rect);
  if (!newLayer) { return null; }
  text_layer_set_text_color(newLayer, GColorWhite);
  text_layer_set_background_color(newLayer, GColorClear);
  text_layer_set_text_alignment(newLayer, align);
  text_layer_set_font(newLayer, font);
  return newLayer;
}

/* PORT OF src/c/main.c:frame_layer_update */
function frame_layer_update(layer, ctx) {
  frame_draw_background(ctx, layer, s_face.current_background);
}

/* PORT OF src/c/main.c:bluetooth_layer_update
 * The opaque notch covers frame segment 7 entirely; segment 7 exists only so
 * the bar continues underneath while the layer is hidden on the flash-off
 * phase of a disconnect (spec 5.4). */
function bluetooth_layer_update(layer, ctx) {
  var S = s_face;
  var b = layer_get_bounds(layer);
  pgTagBegin(ctx, 'backgroundcol', LBL_BG, null);
  graphics_context_set_fill_color(ctx, S.backgroundcol);
  graphics_fill_rect(ctx, b, 0, GCornerNone);
  pgTagEnd(ctx);
  pgTagBegin(ctx, 'bluetooth_color', LBL_BT, 'bluetooth-symbol');
  frame_draw_bt_glyph(ctx, b, S.bt_glyph_connected, S.draw_palette[DRAW_PALETTE_BT]);
  pgTagEnd(ctx);
}

/* PORT OF src/c/main.c:update_secs_ampm_layer_background
 * Clear ONLY when AM/PM mode is selected and the watch is in 24h style; every
 * other combination paints SECS_AMPM_RECT opaque, truncating frame segment 2's
 * top-right chord at x=167 (spec 5.3). */
function update_secs_ampm_layer_background() {
  var S = s_face;
  if (!S.text_secs_ampm_layer) { return; }
  text_layer_set_background_color(S.text_secs_ampm_layer,
      (!S.secs_instead_of_ampm && S.clock_is_24h) ? GColorClear : S.backgroundcol);
}

/* PORT OF src/c/main.c:draw_classic_battery_tile (emery branch)
 * A "full" cell is a solid 4x21 box; an "empty" cell is the SAME box filled with a 50%
 * checkerboard - the SHADED treatment measured off the original Trekv4-OWM art, whose
 * 144x168 empty cell alternates "#.#" / ".#." down the identical ink box. Both states
 * use the SAME colour, so a custom bar colour shades itself. Pure assign - no AA. */
function draw_classic_battery_tile(ctx, p, full, color) {
  var y, x;
  var ix = 3, iy = 2, iw = 4, ih = 21;          /* emery ink box inside the cell */
  if (full) {
    graphics_context_set_fill_color(ctx, color);
    graphics_fill_rect(ctx, GRect(p.x + ix, p.y + iy, iw, ih), 0, GCornerNone);
    return;
  }
  graphics_context_set_stroke_color(ctx, color);
  for (y = 0; y < ih; y++) {
    for (x = 0; x < iw; x++) {
      if (((x + y) & 1) === 0) {
        graphics_draw_pixel(ctx, GPoint(p.x + ix + x, p.y + iy + y));
      }
    }
  }
}

/* PORT OF src/c/main.c:battery_layer_update_proc
 * The opaque box fill covers all of frame segment 6 and the right end of
 * segment 5 (spec 5.5); BATTBG_SAME_AS_BG_IMAGE skips it and is a materially
 * different render. */
function battery_layer_update_proc(layer, ctx) {
  var S = s_face;
  var rect = layer_get_bounds(layer);
  var b = S.layout.BATT;
  var NSEG = b.n, cell_w = b.cw, cell_h = b.ch, ink_left = b.il, ink_right = b.ir;
  var filled, yo, xo, i, full, seg_x, key, label;

  if (S.battery_background !== BATTBG_SAME_AS_BG_IMAGE) {
    if (S.battery_background === BATTBG_SAME_AS_BG_COLOR) {
      pgTagBegin(ctx, 'backgroundcol', LBL_BG, null);
    }
    graphics_context_set_fill_color(ctx,
        S.battery_background === BATTBG_BLACK ? GColorBlack : S.backgroundcol);
    graphics_fill_rect(ctx, rect, 0, GCornerNone);
    if (S.battery_background === BATTBG_SAME_AS_BG_COLOR) { pgTagEnd(ctx); }
  }

  filled = (S.battery_charge_percent >= 100) ? NSEG
         : (S.battery_charge_percent === 0) ? 0
         : cdiv(S.battery_charge_percent * NSEG + 50, 100);   /* rounded */
  yo = rect.origin.y + cdiv(rect.size.h - cell_h, 2);
  xo = rect.origin.x + rect.size.w - NSEG * cell_w;
  if (xo < rect.origin.x) { xo = rect.origin.x; }

  /* One ink colour for the whole indicator; empty cells are the same colour dithered,
     so a custom bar colour shades itself (DRAW_PALETTE_BATTERY_EMPTY is no longer read). */
  var bar_ink = S.battery_colorized ? S.draw_palette[DRAW_PALETTE_BATTERY_FULL]
                                    : GColorWhite;

  for (i = 0; i < NSEG; i++) {
    full = (i >= NSEG - filled);                              /* filled bars on the right */
    seg_x = xo + i * cell_w;
    /* Classic (non-colourised) cells are drawn in GColorWhite, but they stay
       tappable under the battery colour keys: committing that picker is what
       turns battery_colorized on (spec 7.3). */
    key = full ? 'battery_full_color' : 'battery_empty_color';
    label = full ? LBL_BATT_FULL : LBL_BATT_EMPTY;
    pgTagBegin(ctx, key, label, null);
    draw_classic_battery_tile(ctx, GPoint(seg_x, yo), full, bar_ink);
    pgTagEnd(ctx);
  }
  void ink_left; void ink_right;   /* ink box now lives in the tile drawer */
}

/* PORT OF src/c/main.c:current_hint
 * The watch derives this from the buzz/shake state machine; the preview has no
 * timers, so the resolved string arrives on the state object. */
function current_hint() {
  return s_face.popup_hint_text || '';
}

/* PORT OF src/c/main.c:popup_update_proc (PARAMETRIC_LCARS branch) */
function popup_update_proc(layer, ctx) {
  var S = s_face;
  var b = layer_get_bounds(layer);
  var w = b.size.w, h = b.size.h;
  var accent = S.draw_palette[DRAW_PALETTE_POPUP];
  var m = S.layout.POPUP_M;
  var bar = m.bar, lh_big = m.lh_big, lh_hint = m.lh_hint, lh_time = m.lh_time;
  var disp, tsz, nw, nx, inner, gap, block_h, ty;

  /* 1. Themed panel + accent LCARS rails. */
  pgTagBegin(ctx, 'backgroundcol', LBL_PANEL, null);
  graphics_context_set_fill_color(ctx, S.backgroundcol);
  graphics_fill_rect(ctx, GRect(0, 0, w, h), 0, GCornerNone);
  pgTagEnd(ctx);
  frame_draw_popup_bars(ctx, layer, accent);

  /* 2. Live time in a themed LCARS notch on the top bar. */
  disp = S.popup_time_text;
  if (S.popup_time_font) {
    tsz = graphics_text_layout_get_content_size(disp, S.popup_time_font,
        GRect(0, 0, w, bar + 8), GTextOverflowModeFill, GTextAlignmentLeft);
    nw = tsz.w + 8;
    nx = w - nw - bar;                                /* tucked inside the right end */
    if (nx < bar) { nx = bar; }
    pgTagBegin(ctx, 'backgroundcol', LBL_PANEL, null);
    graphics_context_set_fill_color(ctx, S.backgroundcol);
    /* min(nw,bar) >= 2*(bar/2), so prv_clamp_corner_radius leaves radius 6. */
    graphics_fill_rect(ctx, GRect(nx, 0, nw, bar), cdiv(bar, 2), GCornersAll);
    pgTagEnd(ctx);
    pgTagBegin(ctx, 'popup_time_color', LBL_POPUP_TIME, null);
    graphics_context_set_text_color(ctx, S.draw_palette[DRAW_PALETTE_POPUP_TIME]);
    /* (bar - lh_time)/2 - 2 truncates toward zero in C: (12-14)/2 = -1, so -3. */
    graphics_draw_text(ctx, disp, S.popup_time_font,
        GRect(nx, cdiv(bar - lh_time, 2) - 2, nw, lh_time + 4),
        GTextOverflowModeFill, GTextAlignmentCenter, null);
    pgTagEnd(ctx);
  }

  /* 3. Message (2 LCARS-caps lines) + shake hint, centred between the bars. */
  inner = h - 2 * bar;
  gap = cdiv(lh_hint, 3);
  block_h = 2 * lh_big + gap + lh_hint;
  ty = bar + cdiv(inner - block_h, 2) + cdiv(lh_hint, 6);
  if (ty < bar + 1) { ty = bar + 1; }
  if (S.flash_on && S.popup_font) {
    pgTagBegin(ctx, 'popup_color', LBL_POPUP, null);
    graphics_context_set_text_color(ctx, accent);
    graphics_draw_text(ctx, 'BLUETOOTH', S.popup_font, GRect(0, ty, w, lh_big + 2),
                       GTextOverflowModeFill, GTextAlignmentCenter, null);
    pgTagEnd(ctx);
    pgTagBegin(ctx, 'popup_color', LBL_POPUP, null);
    graphics_draw_text(ctx, 'DISCONNECTED', S.popup_font, GRect(0, ty + lh_big, w, lh_big + 2),
                       GTextOverflowModeFill, GTextAlignmentCenter, null);
    pgTagEnd(ctx);
  }
  if (S.popup_hint_font) {
    pgTagBegin(ctx, 'popup_hint_color', LBL_POPUP_HINT, null);
    graphics_context_set_text_color(ctx, S.draw_palette[DRAW_PALETTE_POPUP_HINT]);
    graphics_draw_text(ctx, current_hint(), S.popup_hint_font,
        GRect(0, ty + 2 * lh_big + gap, w, lh_hint + 2),
        GTextOverflowModeFill, GTextAlignmentCenter, null);
    pgTagEnd(ctx);
  }
}

/* PORT OF src/c/main.c:set_days_text
 * The day strings carry double spaces (tuned for the old ultra-narrow font);
 * Antonio overflows at that spacing, so runs of spaces collapse to one and
 * trailing spaces are trimmed. The today-highlight measures THIS string, so the
 * collapse has to happen before any text measurement. */
function set_days_text(src) {
  var days_buf = [];
  var j = 0, prev_sp = 1, i;
  for (i = 0; i < src.length && j < 47; i++) {
    if (src.charAt(i) === ' ') {
      if (!prev_sp) { days_buf[j++] = ' '; prev_sp = 1; }
    } else {
      days_buf[j++] = src.charAt(i); prev_sp = 0;
    }
  }
  while (j > 0 && days_buf[j - 1] === ' ') { j--; }
  return days_buf.slice(0, j).join('');
}

/* PORT OF src/c/main.c:handle_tick lines 1121-1173 - the today-highlight rect.
 *
 * Measured, not tabulated: the strip prefix up to the end of today's token, and
 * today's token alone, are both measured with font_days through the SAME layout
 * walk that graphics_draw_text uses. That is what makes the box land on today
 * regardless of font metrics - and why any advance-width error here visibly
 * mis-places it. */
function todayHighlightRect(S) {
  var today, ds, len, idx, start, tok_start, tok_end, i, sp;
  var mbox, n, right_w, tn, tok_w, hl_pad, hl_h, hl_yoff, days_rect;

  if (S.startday_is_sunday) {
    today = S.tm.wday; if (today < 0) { today = 6; }
  } else {
    today = S.tm.wday - 1; if (today < 0) { today = 6; }
  }

  ds = S.days_buf;
  len = ds.length;
  idx = 0; start = -1; tok_start = 0; tok_end = len;
  for (i = 0; i <= len; i++) {
    sp = (i === len) || (ds.charAt(i) === ' ');
    if (!sp && start < 0) { start = i; }
    if (sp && start >= 0) {
      if (idx === today) { tok_start = start; tok_end = i; break; }
      idx++; start = -1;
    }
  }

  mbox = GRect(0, 0, 1000, 40);
  n = tok_end > 47 ? 47 : tok_end;
  right_w = graphics_text_layout_get_content_size(ds.substring(0, n), S.font_days,
      mbox, GTextOverflowModeWordWrap, GTextAlignmentLeft).w;
  tn = tok_end - tok_start; if (tn < 0) { tn = 0; } if (tn > 47) { tn = 47; }
  tok_w = graphics_text_layout_get_content_size(ds.substring(tok_start, tok_start + tn),
      S.font_days, mbox, GTextOverflowModeWordWrap, GTextAlignmentLeft).w;

  hl_pad = S.layout.HL.pad; hl_h = S.layout.HL.h; hl_yoff = S.layout.HL.yoff;
  days_rect = faceRect(S, 'DAYS_RECT');
  return GRect(days_rect.origin.x + (right_w - tok_w) - hl_pad,
               days_rect.origin.y + hl_yoff,
               tok_w + 2 * hl_pad,
               hl_h);
}

/* PORT OF src/c/main.c:apply_bpm_layout (the layout effects only; the health
   service reads it drives have no preview equivalent). */
function applyBpmLayout(S) {
  var show_extra = !S.steps_status;
  var show_hr = S.show_heart_rate && S.hr_available;

  if (S.bpm_layer) { layer_set_hidden(text_layer_get_layer(S.bpm_layer), !show_hr); }
  if (S.heart_layer) { layer_set_hidden(bitmap_layer_get_layer(S.heart_layer), !show_hr); }

  if (S.steps_label) { layer_set_hidden(text_layer_get_layer(S.steps_label), !S.steps_status); }
  if (S.footprint_layer) {
    layer_set_hidden(bitmap_layer_get_layer(S.footprint_layer), !S.steps_status);
  }
  if (S.text_week_layer) {
    layer_set_hidden(text_layer_get_layer(S.text_week_layer), !show_extra);
  }

  if (!show_hr) {
    layer_set_hidden(text_layer_get_layer(S.text_date_layer), false);
    layer_set_frame(text_layer_get_layer(S.text_date_layer), faceRect(S, 'DATE_RECT'));
    text_layer_set_font(S.text_date_layer, S.font_date);
    text_layer_set_text_alignment(S.text_date_layer, GTextAlignmentLeft);
    text_layer_set_background_color(S.text_date_layer, GColorClear);
    S.text_date_layer.pgBgTag = null;
  } else {
    layer_set_hidden(text_layer_get_layer(S.text_date_layer), !S.date_in_bracket);
    text_layer_set_font(S.text_date_layer, S.small_batt);
    text_layer_set_text_alignment(S.text_date_layer, GTextAlignmentCenter);
    text_layer_set_background_color(S.text_date_layer, S.backgroundcol);
    /* Opaque here, and pinned to the screen edge, specifically so it covers the
       lower bracket (segment 10) in the right gap - spec 5.6. */
    faceTagBg(S.text_date_layer, 'backgroundcol', LBL_BG, 'bracket-date-mask');
  }
}

/* PORT OF src/c/main.c:invert_screen */
function invert_screen(S, invert_format) {
  var window_layer;
  if (invert_format && S.effect_layer === null) {
    window_layer = window_get_root_layer(S.window);
    S.effect_layer = effect_layer_create(GRect(0, 0, S.w, S.h));
    if (S.effect_layer) {
      effect_layer_add_effect(S.effect_layer, effect_invert, null);
      layer_add_child(window_layer, effect_layer_get_layer(S.effect_layer));
    }
  } else if (!invert_format && S.effect_layer !== null) {
    layer_remove_from_parent(effect_layer_get_layer(S.effect_layer));
    effect_layer_destroy(S.effect_layer);
    S.effect_layer = null;
  }
}

/* PORT OF the layout-affecting half of src/c/main.c:handle_tick.
 * handle_init calls update_time() -> handle_tick after every layer exists, so
 * this runs last in faceBuild. */
function faceTick(S) {
  var hl, br, dw, bl;

  /* main.c:1242 and 1247/1252 - the clock and the seconds/AM-PM readout are the
     only two strings handle_tick installs that handle_init does not, so without
     these two lines the two biggest text layers on the face render empty. The
     strftime()/leading-zero-strip that produces them is locale work and stays in
     clay-custom.js; the resolved strings arrive on env.strings. */
  if (S.text_time_layer) {
    text_layer_set_text(S.text_time_layer, S.strings.time_text || '');
  }
  if (S.text_secs_ampm_layer) {
    text_layer_set_text(S.text_secs_ampm_layer, S.strings.secs_ampm_text || '');
  }

  hl = todayHighlightRect(S);
  if (S.effect_layer2) { effect_layer_set_frame(S.effect_layer2, hl); }

  /* main.c:1204-1220 - centre the bracket date with its right edge pinned to
     the screen edge so the opaque background covers the bracket's right gap. */
  if (S.show_heart_rate && S.hr_available && S.date_in_bracket) {
    br = S.layout.BRACKET;
    dw = graphics_text_layout_get_content_size(S.strings.date_text, S.small_batt,
        GRect(0, 0, 400, 40), GTextOverflowModeWordWrap, GTextAlignmentLeft).w;
    bl = br.right - dw; if (bl < br.min) { bl = br.min; }
    layer_set_frame(text_layer_get_layer(S.text_date_layer),
                    GRect(bl, br.y, S.w - bl, br.h));
  }
}

/* Build main.c's file-scope drawing globals from a renderFace() env (spec 3.11).
 * Everything locale- and clock-shaped stays in clay-custom.js and arrives as
 * env.strings; this only mirrors the C's own state. */
function faceState(env) {
  var pack = (env.packHandle || packOpen(env.pack));
  var layout = (pack && pack.layout) || (env.pack && env.pack.layout);
  var c = env.colors || {};
  var o = env.opts || {};
  var d = layout.PALETTE_DEFAULTS;
  var custom = c.customcol || [];
  var S, i;

  if (typeof d === 'string') { d = b64urlDecode(d); }

  S = {
    pack: pack,
    layout: layout,
    w: (pack && pack.w) || (env.pack && env.pack.w) || 200,
    h: (pack && pack.h) || (env.pack && env.pack.h) || 228,
    strings: env.strings || {},
    tm: env.tm || { wday: 0 },

    /* main.c:113-120 - draw_palette[DRAW_PALETTE_LEN] */
    draw_palette: [],

    /* GColorFromHEX TRUNCATES (>>6); it does not round (gcolor_definitions.h). */
    backgroundcol: GColorFromHEX(c.backgroundcol || 0),
    textcol: GColorFromHEX(c.textcol === undefined ? 0xFFFFFF : c.textcol),
    othertextcol: GColorFromHEX(c.othertextcol === undefined ? 0xFFFFFF : c.othertextcol),

    current_background: o.background === undefined ? 0 : o.background,
    invert_format: !!o.invert,
    battery_colorized: !!o.battery_colorized,
    battery_background: o.battery_background === undefined ? BATTBG_BLACK : o.battery_background,
    secs_instead_of_ampm: o.secs_instead_of_ampm === undefined ? true : !!o.secs_instead_of_ampm,
    clock_is_24h: !!o.clock_is_24h,
    startday_is_sunday: o.startday_is_sunday === undefined ? true : !!o.startday_is_sunday,
    show_heart_rate: !!o.show_heart_rate,
    steps_status: !!o.steps_status,
    date_in_bracket: !!o.date_in_bracket,
    hideweather: !!o.hideweather,
    weather_configured: !!o.weather_configured,
    bt_popup: !!o.bt_popup,
    bt_glyph_connected: o.bt_connected === undefined ? !o.preview_disconnected : !!o.bt_connected,
    bt_disconnected: !!o.preview_disconnected,
    flash_on: o.flash_on === undefined ? true : !!o.flash_on,

    battery_charge_percent: (env.runtime && env.runtime.battery_pct !== undefined)
        ? env.runtime.battery_pct : 80,
    is_charging: !!(env.runtime && env.runtime.is_charging),
    weather_icon: (env.runtime && env.runtime.weather_icon !== undefined)
        ? env.runtime.weather_icon : null,

    hr_available: true,                    /* main.c:1824 - emery */
    effect_layer: null,
    effect_layer2: null,
    popup_time_text: (env.strings && env.strings.popup_time_text) || '',
    popup_hint_text: (env.strings && env.strings.popup_hint_text) || '',
    days_buf: ''
  };

  /* settings-codec.js buildPalette() order: version, 13 frame, full, empty,
     bluetooth, popup, popup_time, popup_hint. A missing colour falls back to
     layout.PALETTE_DEFAULTS, which mirrors main.c:113-120. */
  S.draw_palette[0] = 2;
  for (i = 0; i < FRAME_NSEG; i++) {
    S.draw_palette[DRAW_PALETTE_FRAME_FIRST + i] = (custom[i] === undefined)
        ? d[DRAW_PALETTE_FRAME_FIRST + i] : GColorFromHEX(custom[i]);
  }
  for (i = 0; i < PALETTE_TAIL.length; i++) {
    var v = c[PALETTE_TAIL[i]];
    S.draw_palette[DRAW_PALETTE_BATTERY_FULL + i] =
        (v === undefined) ? d[DRAW_PALETTE_BATTERY_FULL + i] : GColorFromHEX(v);
  }

  return S;
}

/* PORT OF src/c/main.c:handle_init - the emery layer graph.
 *
 * The order of statements in handle_init IS the z-order; keep it. Returns the
 * Window, whose background_color is the base fill under everything (and the
 * colour every frame AA edge blends against - spec 5.1). */
function faceBuild(S) {
  var window_layer, wb, fs, icon, footprintbounds, footprintframe, time_rect;

  s_face = S;

  S.window = window_create();
  window_stack_push(S.window, true);
  window_layer = window_get_root_layer(S.window);

  /* main.c:1888 - apply_custom_colors() */
  frame_set_custom_colors(S.draw_palette.slice(DRAW_PALETTE_FRAME_FIRST,
                                               DRAW_PALETTE_FRAME_FIRST + FRAME_NSEG));

  window_set_background_color(S.window, S.backgroundcol);

  /* main.c:1968-1970 - TIME_RECT.origin.y += 1 in 24h style, once, before the
     time layer is created. */
  time_rect = faceRect(S, 'TIME_RECT');
  if (S.clock_is_24h) { time_rect.origin.y = time_rect.origin.y + 1; }

  /* Load fonts (main.c:1977-1982). */
  S.font_days = fonts_load_custom_font(resource_get_handle('FONT_ANTONIO_21'));
  S.font_date = fonts_load_custom_font(resource_get_handle('FONT_ANTONIO_24'));
  S.small_batt = fonts_load_custom_font(resource_get_handle('FONT_LCARSB_26'));
  S.batt_font = fonts_load_custom_font(resource_get_handle('FONT_LCARSB_29'));
  S.font_time = fonts_load_custom_font(resource_get_handle('FONT_LCARS_92'));
  /* small_batt2 (FONT_LCARS_24) is loaded by the C but every text_layer_set_font
     using it is inside #ifdef PBL_PLATFORM_CHALK - dead weight on emery. */

  /* 1. Background LCARS frame. */
  S.frame_layer = layer_create(GRect(0, 0, S.w, S.h));
  layer_set_update_proc(S.frame_layer, frame_layer_update);
  layer_add_child(window_layer, S.frame_layer);

  /* 2. Battery layer. */
  S.battery_layer = layer_create(faceRect(S, 'BATT_RECT'));
  layer_set_update_proc(S.battery_layer, battery_layer_update_proc);
  layer_add_child(window_layer, S.battery_layer);

  /* 3. Charging indicator. */
  S.battery_charging = gbitmap_create_with_resource('IMAGE_CHARGING');
  S.charging_layer = bitmap_layer_create(faceRect(S, 'CHARGING_RECT'));
  bitmap_layer_set_bitmap(S.charging_layer, S.battery_charging);
  bitmap_layer_set_compositing_mode(S.charging_layer, GCompOpSet);
  layer_add_child(window_layer, bitmap_layer_get_layer(S.charging_layer));

  /* 4. Bluetooth notch + glyph. */
  S.bluetooth_layer = layer_create(faceRect(S, 'BT_RECT'));
  layer_set_update_proc(S.bluetooth_layer, bluetooth_layer_update);
  layer_add_child(window_layer, S.bluetooth_layer);

  /* 5. Time. */
  S.text_time_layer = setup_text_layer(time_rect, GTextAlignmentRight, S.font_time);
  text_layer_set_text_color(S.text_time_layer, S.textcol);
  faceTagInk(S.text_time_layer, 'textcol', LBL_PRIMARY, null);
  layer_add_child(window_layer, text_layer_get_layer(S.text_time_layer));

  /* 6. Seconds / AM-PM. */
  S.text_secs_ampm_layer = setup_text_layer(faceRect(S, 'SECS_AMPM_RECT'),
      GTextAlignmentCenter, S.small_batt);
  text_layer_set_text_color(S.text_secs_ampm_layer, S.othertextcol);
  faceTagInk(S.text_secs_ampm_layer, 'othertextcol', LBL_SECONDARY, null);
  faceTagBg(S.text_secs_ampm_layer, 'backgroundcol', LBL_BG, 'secs-mask');
  layer_add_child(window_layer, text_layer_get_layer(S.text_secs_ampm_layer));
  update_secs_ampm_layer_background();

  /* 7. Battery percentage. Opaque: this is what stops the middle bar short of
        the readout instead of running under it (spec 5.2). */
  S.battery_text_layer = text_layer_create(faceRect(S, 'BATT_TEXT_RECT'));
  text_layer_set_font(S.battery_text_layer, S.batt_font);
  text_layer_set_text_alignment(S.battery_text_layer, GTextAlignmentRight);
  text_layer_set_text_color(S.battery_text_layer, S.othertextcol);
  text_layer_set_background_color(S.battery_text_layer, S.backgroundcol);
  faceTagInk(S.battery_text_layer, 'othertextcol', LBL_SECONDARY, null);
  faceTagBg(S.battery_text_layer, 'backgroundcol', LBL_BG, 'battery-text-mask');
  layer_add_child(window_layer, text_layer_get_layer(S.battery_text_layer));

  /* 8. Day strip. */
  S.text_days_layer = setup_text_layer(faceRect(S, 'DAYS_RECT'),
      GTextAlignmentLeft, S.font_days);
  text_layer_set_text_color(S.text_days_layer, S.othertextcol);
  faceTagInk(S.text_days_layer, 'othertextcol', LBL_SECONDARY, null);
  S.days_buf = set_days_text(S.strings.day_line_raw || '');
  text_layer_set_text(S.text_days_layer, S.days_buf);
  layer_add_child(window_layer, text_layer_get_layer(S.text_days_layer));

  /* 9. Today highlight - main.c's saturating effect_hard_invert between the strip
        colour and the screen background (today_highlight_param). Frame is set by
        faceTick. */
  S.effect_layer2 = effect_layer_create(EMPTY_RECT());
  effect_layer_add_effect(S.effect_layer2, effect_hard_invert,
      ((S.othertextcol & 0xFF) << 8) | (S.backgroundcol & 0xFF));
  layer_add_child(window_layer, effect_layer_get_layer(S.effect_layer2));

  /* 10. Month-day date. */
  S.text_date_layer = setup_text_layer(faceRect(S, 'DATE_RECT'),
      GTextAlignmentLeft, S.font_date);
  text_layer_set_text_color(S.text_date_layer, S.textcol);
  text_layer_set_text(S.text_date_layer, S.strings.date_text || '');
  faceTagInk(S.text_date_layer, 'textcol', LBL_PRIMARY, null);
  layer_add_child(window_layer, text_layer_get_layer(S.text_date_layer));

  /* 11. Week / extra date. */
  S.text_week_layer = setup_text_layer(faceRect(S, 'WEEK_RECT'),
      GTextAlignmentRight, S.font_date);
  text_layer_set_text_color(S.text_week_layer, S.othertextcol);
  text_layer_set_text(S.text_week_layer, S.strings.week_text || '');
  faceTagInk(S.text_week_layer, 'othertextcol', LBL_SECONDARY, null);
  layer_add_child(window_layer, text_layer_get_layer(S.text_week_layer));

  /* 12. Weather icon. hideweather COLLAPSES the frame to (0,0,0,0); it does not
         hide the layer (spec 5.10). */
  S.icon_layer = bitmap_layer_create(!S.hideweather ? faceRect(S, 'ICON_RECT') : EMPTY_RECT());
  bitmap_layer_set_compositing_mode(S.icon_layer, GCompOpSet);
  /* The C only has an icon once a weather message has arrived (replace_weather_icon);
     the preview is handed the resolved icon on env.runtime. */
  icon = S.weather_icon;
  if (icon !== null && icon !== undefined) {
    if (typeof icon === 'number') { icon = WEATHER_ICONS[icon] || WEATHER_ICONS[14]; }
    S.icon_bitmap = gbitmap_create_with_resource(icon);
    bitmap_layer_set_bitmap(S.icon_layer, S.icon_bitmap);
  }
  /* The emery weather icon is a fixed-colour PNG, so it carries a role but no
     colour key - tapping it must not open a picker that cannot change it. */
  faceTagInk(S.icon_layer, null, null, 'weather-icon');
  layer_add_child(window_layer, bitmap_layer_get_layer(S.icon_layer));

  /* 13. Temperature. */
  S.temp_layer = setup_text_layer(!S.hideweather ? faceRect(S, 'TEMP_RECT') : EMPTY_RECT(),
      GTextAlignmentLeft, S.small_batt);
  text_layer_set_text_color(S.temp_layer, S.othertextcol);
  text_layer_set_text(S.temp_layer, S.strings.temperature_text || '');
  faceTagInk(S.temp_layer, 'othertextcol', LBL_SECONDARY, null);
  layer_add_child(window_layer, text_layer_get_layer(S.temp_layer));

  /* 14. Footprint icon (PBL_HEALTH). Its background is painted with
         backgroundcol under GCompOpSet, so it masks whatever is beneath. */
  S.footprint_icon = gbitmap_create_with_resource('IMAGE_FOOTPRINT');
  footprintbounds = S.footprint_icon ? gbitmap_get_bounds(S.footprint_icon)
                                     : GRect(0, 0, 0, 0);
  footprintframe = GRect(170, 184, footprintbounds.size.w, footprintbounds.size.h);
  S.footprint_layer = bitmap_layer_create(footprintframe);
  bitmap_layer_set_compositing_mode(S.footprint_layer, GCompOpSet);
  bitmap_layer_set_bitmap(S.footprint_layer, S.footprint_icon);
  bitmap_layer_set_background_color(S.footprint_layer, S.backgroundcol);
  faceTagInk(S.footprint_layer, null, null, 'footprint-icon');
  faceTagBg(S.footprint_layer, 'backgroundcol', LBL_BG, null);
  layer_add_child(window_layer, bitmap_layer_get_layer(S.footprint_layer));

  /* 15. Step count. */
  S.steps_label = text_layer_create(faceRect(S, 'STEPS_RECT'));
  text_layer_set_text_color(S.steps_label, S.othertextcol);
  text_layer_set_background_color(S.steps_label, GColorClear);
  text_layer_set_text_alignment(S.steps_label, GTextAlignmentRight);
  text_layer_set_font(S.steps_label, S.font_date);
  text_layer_set_text(S.steps_label, S.strings.steps_text || '');
  faceTagInk(S.steps_label, 'othertextcol', LBL_SECONDARY, null);
  layer_add_child(window_layer, text_layer_get_layer(S.steps_label));
  layer_set_hidden(text_layer_get_layer(S.steps_label), true);
  layer_set_hidden(bitmap_layer_get_layer(S.footprint_layer), true);

  /* 16. Heart rate (HAS_HRM). */
  S.heart_bitmap = gbitmap_create_with_resource('IMAGE_HEART');
  S.heart_layer = bitmap_layer_create(faceRect(S, 'HEART_RECT'));
  bitmap_layer_set_bitmap(S.heart_layer, S.heart_bitmap);
  bitmap_layer_set_compositing_mode(S.heart_layer, GCompOpSet);
  faceTagInk(S.heart_layer, null, null, 'heart-icon');
  layer_add_child(window_layer, bitmap_layer_get_layer(S.heart_layer));

  S.bpm_layer = setup_text_layer(faceRect(S, 'BPM_RECT'), GTextAlignmentLeft, S.font_date);
  text_layer_set_text_color(S.bpm_layer, S.othertextcol);
  text_layer_set_text(S.bpm_layer, S.strings.bpm_text || '--');
  faceTagInk(S.bpm_layer, 'othertextcol', LBL_SECONDARY, null);
  layer_add_child(window_layer, text_layer_get_layer(S.bpm_layer));

  applyBpmLayout(S);

  /* main.c:2277-2284 - lift the day strip and its highlight above the moved
     date / heart / bpm so the bracket date's opaque background cannot clip them. */
  layer_remove_from_parent(text_layer_get_layer(S.text_days_layer));
  layer_add_child(window_layer, text_layer_get_layer(S.text_days_layer));
  layer_remove_from_parent(effect_layer_get_layer(S.effect_layer2));
  layer_add_child(window_layer, effect_layer_get_layer(S.effect_layer2));

  /* 17. Bluetooth-disconnect popup overlay. */
  S.popup_font = fonts_load_custom_font(resource_get_handle('FONT_LCARSA_30'));
  S.popup_hint_font = fonts_load_custom_font(resource_get_handle('FONT_LCARSP_18'));
  S.popup_time_font = fonts_load_custom_font(resource_get_handle('FONT_LCARS_14'));
  wb = GRect(0, 0, S.w, S.h);
  fs = frame_popup_panel_size();
  S.popup_layer = layer_create(GRect(cdiv(wb.size.w - fs.w, 2), cdiv(wb.size.h - fs.h, 2),
                                     fs.w, fs.h));
  layer_set_update_proc(S.popup_layer, popup_update_proc);
  layer_add_child(window_layer, S.popup_layer);
  layer_set_hidden(S.popup_layer, true);

  /* handle_battery(battery_state_service_peek()) */
  layer_set_hidden(bitmap_layer_get_layer(S.charging_layer), !S.is_charging);
  text_layer_set_text(S.battery_text_layer, S.strings.battery_text || '');

  /* handle_bluetooth(bluetooth_connection_service_peek()) -> bt_alert_start()
     shows the popup only when the alert dialog is enabled. */
  if (S.bt_disconnected && S.bt_popup) { layer_set_hidden(S.popup_layer, false); }

  /* flash_timer_cb (main.c:598-609): while the dialog is up the notch stays
     visible and the dialog's red text flashes; once the dialog is gone (or was
     never enabled) the notch itself flashes, exposing frame segment 7 beneath. */
  if (S.bt_disconnected) {
    layer_set_hidden(S.bluetooth_layer,
        layer_get_hidden(S.popup_layer) ? !S.flash_on : false);
  }

  /* update_time() -> handle_tick */
  faceTick(S);

  /* Persisted inversion is applied only after every ordinary layer exists, so
     its effect layer stays above the complete watchface. */
  invert_screen(S, S.invert_format);

  return S.window;
}

/* @noinline */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FRAME_NSEG: FRAME_NSEG,
    FRAME_NBG: FRAME_NBG,
    FRAME_BG_CUSTOM: FRAME_BG_CUSTOM,
    FRAME_GROUP: FRAME_GROUP,
    FRAME_GROUP_LABELS: FRAME_GROUP_LABELS,
    BT_RUNE_ROWS: BT_RUNE_ROWS,
    BT_RUNE_W: BT_RUNE_W,
    BT_RUNE_H: BT_RUNE_H,
    WEATHER_ICONS: WEATHER_ICONS,
    frame_set_custom_colors: frame_set_custom_colors,
    frame_draw_background: frame_draw_background,
    frame_draw_popup_bars: frame_draw_popup_bars,
    frame_draw_bt_glyph: frame_draw_bt_glyph,
    frame_popup_panel_size: frame_popup_panel_size,
    faceTagInk: faceTagInk,
    faceTagBg: faceTagBg,
    setup_text_layer: setup_text_layer,
    frame_layer_update: frame_layer_update,
    bluetooth_layer_update: bluetooth_layer_update,
    battery_layer_update_proc: battery_layer_update_proc,
    draw_classic_battery_tile: draw_classic_battery_tile,
    popup_update_proc: popup_update_proc,
    update_secs_ampm_layer_background: update_secs_ampm_layer_background,
    current_hint: current_hint,
    set_days_text: set_days_text,
    todayHighlightRect: todayHighlightRect,
    applyBpmLayout: applyBpmLayout,
    invert_screen: invert_screen,
    faceTick: faceTick,
    faceState: faceState,
    faceBuild: faceBuild
  };
}
/* @endnoinline */
