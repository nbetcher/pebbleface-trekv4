/* PORT OF src/c/effects.c and src/c/effect_layer.c
 *
 * These two files are the watchface's own (pebble-effect-layer, MIT); there is
 * nothing in PebbleOS to port for them. They are translated 1:1 per
 * src/pkjs/shim/PORTING.txt: C names, C parameter names, C statement order.
 *
 * On emery the captured framebuffer is always GBitmapFormat8Bit, so:
 *   - get_pixel()/set_pixel()'s GBitmapFormat1Bit / 1BitPalette branches compile
 *     on emery but are unreachable (effects.c:28/41); they are aplite's real
 *     path and are deliberately NOT translated in phase 1. See DEVIATIONS below.
 *
 * DEVIATIONS from the C, all deliberate:
 *  1. The 1-bit pixel branches are omitted (dead on emery, and
 *     the shim's framebuffer is 1 byte/pixel by construction - spec section 4.1).
 *  2. apply_invert() writes the framebuffer directly rather than going through
 *     30-fb.js's fbInvert(). The maths is identical ((~v) | 0xC0); doing it here
 *     keeps the loop bounds and the grect_contains_point() guard textually
 *     identical to the C, and keeps the tag map untouched (an inversion has no
 *     colour setting of its own, so it must not claim ownership of the pixels
 *     it flips - the day-strip glyphs underneath stay the hit-test owners).
 */

/* @noinline */
/* Standalone (node --test / dump_preview.js) bindings for the symbols earlier
 * shim files contribute to the concatenated scope. make_shim.py strips this
 * fence, so the serialized config page never sees `require`.
 *
 * SAFETY: bare `var x;` declarations with no initializer do NOT clobber an
 * existing function declaration of the same name in the same scope, and every
 * assignment below is guarded on `typeof module`. Even if the fence survived
 * stripping, the concatenated shim would still see the real definitions. */
var GPoint, GRect, grect_contains_point, GColorBlackARGB8, GColorWhiteARGB8;
var graphics_capture_frame_buffer, graphics_release_frame_buffer;
var gbitmap_get_data, gbitmap_get_bytes_per_row, gbitmap_get_format, gbitmap_get_bounds;
var layer_create_with_data, layer_get_data, layer_destroy, layer_set_update_proc;
var layer_get_bounds, layer_set_frame, layer_convert_point_to_screen, cdiv;
if (typeof module !== 'undefined' && module.exports) {
  var _e00 = null, _e10 = null, _e40 = null, _e70 = null;
  try { _e00 = require('./00-cnum.js'); } catch (e3) { /* not landed yet */ }
  try { _e10 = require('./10-gcolor.js'); } catch (e0) { /* not landed yet */ }
  try { _e40 = require('./40-gcontext.js'); } catch (e1) { /* not landed yet */ }
  try { _e70 = require('./70-layer.js'); } catch (e2) { /* not landed yet */ }
  _e00 = _e00 || {}; _e10 = _e10 || {}; _e40 = _e40 || {}; _e70 = _e70 || {};
  cdiv = _e00.cdiv;
  GPoint = _e10.GPoint; GRect = _e10.GRect;
  grect_contains_point = _e10.grect_contains_point;
  GColorBlackARGB8 = _e10.GColorBlackARGB8 !== undefined ? _e10.GColorBlackARGB8 : 0xC0;
  GColorWhiteARGB8 = _e10.GColorWhiteARGB8 !== undefined ? _e10.GColorWhiteARGB8 : 0xFF;
  graphics_capture_frame_buffer = _e40.graphics_capture_frame_buffer;
  graphics_release_frame_buffer = _e40.graphics_release_frame_buffer;
  gbitmap_get_data = _e40.gbitmap_get_data;
  gbitmap_get_bytes_per_row = _e40.gbitmap_get_bytes_per_row;
  gbitmap_get_format = _e40.gbitmap_get_format;
  gbitmap_get_bounds = _e40.gbitmap_get_bounds;
  layer_create_with_data = _e70.layer_create_with_data;
  layer_get_data = _e70.layer_get_data;
  layer_destroy = _e70.layer_destroy;
  layer_set_update_proc = _e70.layer_set_update_proc;
  layer_get_bounds = _e70.layer_get_bounds;
  layer_set_frame = _e70.layer_set_frame;
  layer_convert_point_to_screen = _e70.layer_convert_point_to_screen;
}
/* @endnoinline */

/* effect_layer.h: number of supported effects on a single effect_layer */
var MAX_EFFECTS = 4;

/* PORT OF src/c/effects.c:pixel_is_valid */
function pixel_is_valid(info, x, y) {
  if (!grect_contains_point(info.bounds, GPoint(x, y))) { return false; }
  return true;
}

/* PORT OF src/c/effects.c:get_pixel  (emery: the GBitmapFormat8Bit tail) */
function get_pixel(info, x, y) {
  return info.data[y * info.bytes_per_row + x];
}

/* PORT OF src/c/effects.c:set_pixel  (emery: the GBitmapFormat8Bit tail) */
function set_pixel(info, x, y, color) {
  info.data[y * info.bytes_per_row + x] = color;
}

/* PORT OF src/c/effects.c:capture_bitmap */
function capture_bitmap(ctx, info) {
  info.framebuffer = graphics_capture_frame_buffer(ctx);
  if (!info.framebuffer) { return false; }
  info.bitmap = info.framebuffer;
  info.data = gbitmap_get_data(info.framebuffer);
  info.bytes_per_row = gbitmap_get_bytes_per_row(info.framebuffer);
  info.format = gbitmap_get_format(info.framebuffer);
  info.bounds = gbitmap_get_bounds(info.framebuffer);
  return info.data !== null && info.data !== undefined;
}

/* PORT OF src/c/effects.c:apply_invert
 *
 * position is ALREADY in screen coordinates (effect_layer_update_proc converts
 * it), and the captured framebuffer is the whole screen - so this is a capture
 * path write: clipped only to the framebuffer bounds, never to a layer clip box
 * (spec section 4.4).
 *
 * black_white_only is never true in this codebase (effect_invert_bw_with_background
 * is exported by effects.h but never registered), so only the (~pixel) | 0xC0
 * branch is live. The dead branch is kept so the port reads like the C.
 */
function apply_invert(ctx, position, black_white_only, background) {
  var info = {};
  var min_x, min_y, max_x, max_y, x, y, pixel;

  if (!capture_bitmap(ctx, info)) {
    if (info.framebuffer) { graphics_release_frame_buffer(ctx, info.framebuffer); }
    return;
  }

  min_x = position.origin.x;
  min_y = position.origin.y;
  max_x = min_x + position.size.w;
  max_y = min_y + position.size.h;
  for (y = min_y; y < max_y; y++) {
    for (x = min_x; x < max_x; x++) {
      if (!pixel_is_valid(info, x, y)) { continue; }
      pixel = get_pixel(info, x, y);
      if (!black_white_only) {
        /* C: (uint8_t)(~pixel) | GColorBlackARGB8 -- per 2-bit channel v -> 3-v,
           alpha forced back to 3. JS ~ is 32-bit, so mask to a byte first. */
        set_pixel(info, x, y, ((~pixel) & 0xFF) | GColorBlackARGB8);
      } else if (pixel === GColorBlackARGB8) {
        set_pixel(info, x, y, GColorWhiteARGB8);
      } else if (pixel === GColorWhiteARGB8) {
        set_pixel(info, x, y, GColorBlackARGB8);
      } else {
        set_pixel(info, x, y, background);
      }
    }
  }
  graphics_release_frame_buffer(ctx, info.framebuffer);
}

/* PORT OF src/c/effects.c:effect_invert */
function effect_invert(ctx, position, param) {
  apply_invert(ctx, position, false, GColorBlackARGB8);
}

/* PORT OF src/c/effects.c:argb_distance - squared distance in 2-bit channel steps. */
function argb_distance(a, b) {
  var dr = ((a >> 4) & 3) - ((b >> 4) & 3);
  var dg = ((a >> 2) & 3) - ((b >> 2) & 3);
  var db = (a & 3) - (b & 3);
  return dr * dr + dg * dg + db * db;
}

/* PORT OF src/c/effects.c:apply_hard_invert - the today marker. Every pixel snaps to
 * whichever of {ink, bg} it is further from: the block fills in the day-strip colour
 * and the glyphs knock out to the screen background. A plain complement (effect_invert)
 * turned a grey strip into grey-on-white instead. Capture path, like apply_invert. */
function apply_hard_invert(ctx, position, ink, bg) {
  var info = {};
  var min_x, min_y, max_x, max_y, x, y, pixel, is_glyph;
  if (!capture_bitmap(ctx, info)) {
    if (info.framebuffer) { graphics_release_frame_buffer(ctx, info.framebuffer); }
    return;
  }
  min_x = position.origin.x;
  min_y = position.origin.y;
  max_x = min_x + position.size.w;
  max_y = min_y + position.size.h;
  for (y = min_y; y < max_y; y++) {
    for (x = min_x; x < max_x; x++) {
      if (!pixel_is_valid(info, x, y)) { continue; }
      pixel = get_pixel(info, x, y);
      is_glyph = argb_distance(pixel, ink) <= argb_distance(pixel, bg);
      set_pixel(info, x, y, is_glyph ? bg : ink);
    }
  }
  graphics_release_frame_buffer(ctx, info.framebuffer);
}

/* effects.c: DAY_HL_OVERHANG - glyph ink may overhang the token's advance. */
var DAY_HL_OVERHANG = 2;

/* PORT OF src/c/effects.c:effect_day_highlight - param mirrors DayHighlightParams
 * { ink, bg, box_w, min_pad, margin, accent, bottom_pad, gap }. See the C for the rules:
 * box_w centred on today's ink (wider for min_pad), sides pulled in to stay `gap` clear
 * of a neighbour's ink, top raised to 1px above an accent. */
function effect_day_highlight(ctx, position, p) {
  var info = {};
  var frame_x0, frame_x1, block_top, block_bottom, scan_x0, scan_x1;
  var ink_x0, ink_x1, ink_top, nb_left, nb_right, x, y, pixel;
  var ink_w, box_w, pad_left, pad_right, room_left, room_right, pad, top;
  if (!p) { return; }
  if (!capture_bitmap(ctx, info)) {
    if (info.framebuffer) { graphics_release_frame_buffer(ctx, info.framebuffer); }
    return;
  }
  frame_x0 = position.origin.x;
  frame_x1 = position.origin.x + position.size.w;
  block_top = position.origin.y + p.accent;
  block_bottom = position.origin.y + position.size.h;
  scan_x0 = frame_x0 + p.margin - DAY_HL_OVERHANG;
  scan_x1 = frame_x1 - p.margin + DAY_HL_OVERHANG;
  ink_x0 = 32767; ink_x1 = -32768; ink_top = 32767;
  nb_left = -32768; nb_right = 32767;
  for (y = position.origin.y; y < block_bottom - p.bottom_pad; y++) {
    for (x = frame_x0; x < frame_x1; x++) {
      if (!pixel_is_valid(info, x, y)) { continue; }
      pixel = get_pixel(info, x, y);
      if (argb_distance(pixel, p.ink) > argb_distance(pixel, p.bg)) { continue; }
      if (x < scan_x0) {
        if (x > nb_left) { nb_left = x; }
      } else if (x >= scan_x1) {
        if (x < nb_right) { nb_right = x; }
      } else {
        if (x < ink_x0) { ink_x0 = x; }
        if (x > ink_x1) { ink_x1 = x; }
        if (y < ink_top) { ink_top = y; }
      }
    }
  }
  graphics_release_frame_buffer(ctx, info.framebuffer);
  if (ink_x1 < ink_x0) {
    ink_x0 = scan_x0;
    ink_x1 = scan_x1 - 1;
  }
  ink_w = ink_x1 - ink_x0 + 1;
  box_w = p.box_w;
  if (box_w < ink_w + 2 * p.min_pad) { box_w = ink_w + 2 * p.min_pad; }
  pad_left = cdiv(box_w - ink_w, 2);
  pad_right = box_w - ink_w - pad_left;
  room_left = ink_x0 - nb_left - 1 - p.gap;
  room_right = nb_right - ink_x1 - 1 - p.gap;
  if (pad_left > room_left || pad_right > room_right) {
    pad = pad_left;
    if (room_left < pad) { pad = room_left; }
    if (room_right < pad) { pad = room_right; }
    if (pad < p.min_pad) { pad = p.min_pad; }
    pad_left = pad_right = pad;
  }
  top = block_top;
  if (ink_top - 1 < top) { top = ink_top - 1; }
  if (top < position.origin.y) { top = position.origin.y; }
  apply_hard_invert(ctx, GRect(ink_x0 - pad_left, top, ink_w + pad_left + pad_right,
      block_bottom - top), p.ink, p.bg);
}

/* PORT OF src/c/effect_layer.c:effect_layer_update_proc
 *
 * layer_get_bounds() gives (0,0,w,h); layer_convert_point_to_screen() lifts the
 * origin into screen space, so the rect handed to each effect is exactly the
 * layer's frame in screen coordinates. For effect_layer2 that is the
 * today-highlight box computed in handle_tick.
 */
function effect_layer_update_proc(me, ctx) {
  var effect_layer = layer_get_data(me);
  var b = layer_get_bounds(me);
  /* The C mutates its by-value copy of the bounds; build a fresh GRect instead
     so a shared bounds object from 70-layer.js cannot be corrupted. */
  var origin = layer_convert_point_to_screen(me, b.origin);
  var layer_frame = GRect(origin.x, origin.y, b.size.w, b.size.h);
  var i;

  for (i = 0; i < MAX_EFFECTS && effect_layer.effects[i]; ++i) {
    effect_layer.effects[i](ctx, layer_frame, effect_layer.params[i]);
  }
}

/* PORT OF src/c/effect_layer.c:effect_layer_create */
function effect_layer_create(frame) {
  /* sizeof(EffectLayer) has no JS meaning; any non-zero size makes
     layer_get_data() hand back the layer's data object. */
  var layer = layer_create_with_data(frame, 1);
  var effect_layer;
  if (!layer) { return null; }
  layer_set_update_proc(layer, effect_layer_update_proc);
  effect_layer = layer_get_data(layer);
  /* memset(effect_layer, 0, sizeof(EffectLayer)) */
  effect_layer.effects = [null, null, null, null];
  effect_layer.params = [null, null, null, null];
  effect_layer.next_effect = 0;
  effect_layer.layer = layer;
  return effect_layer;
}

/* PORT OF src/c/effect_layer.c:effect_layer_destroy */
function effect_layer_destroy(effect_layer) {
  var layer;
  if (effect_layer !== null && effect_layer !== undefined && effect_layer.layer) {
    layer = effect_layer.layer;
    effect_layer.layer = null;
    layer_destroy(layer);
  }
}

/* PORT OF src/c/effect_layer.c:effect_layer_get_layer */
function effect_layer_get_layer(effect_layer) {
  return effect_layer ? effect_layer.layer : null;
}

/* PORT OF src/c/effect_layer.c:effect_layer_set_frame */
function effect_layer_set_frame(effect_layer, frame) {
  if (effect_layer && effect_layer.layer) { layer_set_frame(effect_layer.layer, frame); }
}

/* PORT OF src/c/effect_layer.c:effect_layer_add_effect */
function effect_layer_add_effect(effect_layer, effect, param) {
  if (effect_layer && effect && effect_layer.next_effect < MAX_EFFECTS) {
    effect_layer.effects[effect_layer.next_effect] = effect;
    effect_layer.params[effect_layer.next_effect] = param;
    ++effect_layer.next_effect;
  }
}

/* PORT OF src/c/effect_layer.c:effect_layer_remove_effect */
function effect_layer_remove_effect(effect_layer) {
  if (effect_layer && effect_layer.next_effect > 0) {
    effect_layer.effects[effect_layer.next_effect - 1] = null;
    effect_layer.params[effect_layer.next_effect - 1] = null;
    --effect_layer.next_effect;
  }
}

/* Spec section 3.9 name for the same entry point, for callers that want the
   effect applied without an EffectLayer wrapper. */
function effects_apply_invert(ctx, screenRect) {
  apply_invert(ctx, screenRect, false, GColorBlackARGB8);
}

/* @noinline */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MAX_EFFECTS: MAX_EFFECTS,
    pixel_is_valid: pixel_is_valid,
    get_pixel: get_pixel,
    set_pixel: set_pixel,
    capture_bitmap: capture_bitmap,
    apply_invert: apply_invert,
    effect_invert: effect_invert,
    argb_distance: argb_distance,
    apply_hard_invert: apply_hard_invert,
    effect_day_highlight: effect_day_highlight,
    effects_apply_invert: effects_apply_invert,
    effect_layer_update_proc: effect_layer_update_proc,
    effect_layer_create: effect_layer_create,
    effect_layer_destroy: effect_layer_destroy,
    effect_layer_get_layer: effect_layer_get_layer,
    effect_layer_set_frame: effect_layer_set_frame,
    effect_layer_add_effect: effect_layer_add_effect,
    effect_layer_remove_effect: effect_layer_remove_effect
  };
}
/* @endnoinline */
