/* TrekV4 settings-preview emulation layer - the layer tree.
 *
 * SPDX-License-Identifier: Apache-2.0
 * SPDX-FileCopyrightText: 2024 Google LLC
 * Translated from PebbleOS src/fw/applib/ui/layer.c, text_layer.c,
 * bitmap_layer.c and window.c, reduced to what the emery drawing path uses.
 * See NOTICE and LICENSES/pebbleos-APACHE-2.0.txt.
 *
 * The layer graph built by main.c:handle_init IS the z-order, and pgWalk()
 * replays it depth-first in add order: a layer paints itself, then its
 * children paint on top. Every layer render gets a fresh draw state (PebbleOS
 * resets it per layer), a drawing box at the layer's screen origin, and a clip
 * box that is the parent's clip box intersected with the layer's frame.
 *
 * A5 (the contract 80-face-emery.js depends on): a TextLayer or BitmapLayer may
 * carry .pgTag / .pgBgTag records of the form {key,label,role}. The update procs
 * below wrap their ink in pgTagBegin(ctx, t.key, t.label, t.role)/pgTagEnd(ctx)
 * and their opaque background fill in the .pgBgTag equivalent. Without this the
 * secs-mask / battery-text-mask / bracket-date-mask roles and the
 * textcol / othertextcol tap targets would never be recorded.
 */

/* @noinline */
/* Standalone (node --test / dump_preview.js) bindings for the symbols earlier
 * shim files contribute to the concatenated scope. make_shim.py strips this
 * fence, so the serialized config page never sees `require`.
 *
 * SAFETY: bare `var x;` declarations with no initializer do NOT clobber an
 * existing function declaration of the same name in the same scope, and every
 * assignment below is guarded on `typeof module`. */
var cdiv;
var GPoint, GRect, GColorWhite, GColorBlack, GColorClear, GCornerNone;
var GCompOpAssign, GCompOpSet, GTextAlignmentLeft, GTextOverflowModeTrailingEllipsis;
var gcolor_is_transparent;
var packIcon;
var fbIconBlit;
var pgPushLayer, pgPopLayer, pgTagBegin, pgTagEnd;
var graphics_context_set_fill_color, graphics_context_set_text_color;
var graphics_context_set_compositing_mode;
var graphics_fill_rect;
var graphics_draw_text;
if (typeof module !== 'undefined' && module.exports) {
  var _l = { c: null, g: null, p: null, f: null, x: null, r: null, t: null };
  try { _l.c = require('./00-cnum.js'); } catch (l0) { /* not landed yet */ }
  try { _l.g = require('./10-gcolor.js'); } catch (l1) { /* not landed yet */ }
  try { _l.p = require('./20-pack.js'); } catch (l2) { /* not landed yet */ }
  try { _l.f = require('./30-fb.js'); } catch (l3) { /* not landed yet */ }
  try { _l.x = require('./40-gcontext.js'); } catch (l4) { /* not landed yet */ }
  try { _l.r = require('./50-primitives.js'); } catch (l5) { /* not landed yet */ }
  try { _l.t = require('./60-text.js'); } catch (l6) { /* not landed yet */ }
  for (var _lk in _l) { if (!_l[_lk]) { _l[_lk] = {}; } }
  cdiv = _l.c.cdiv;
  GPoint = _l.g.GPoint; GRect = _l.g.GRect;
  GColorWhite = _l.g.GColorWhite !== undefined ? _l.g.GColorWhite : 0xFF;
  GColorBlack = _l.g.GColorBlack !== undefined ? _l.g.GColorBlack : 0xC0;
  GColorClear = _l.g.GColorClear !== undefined ? _l.g.GColorClear : 0x00;
  GCornerNone = _l.g.GCornerNone !== undefined ? _l.g.GCornerNone : 0;
  GCompOpAssign = _l.g.GCompOpAssign !== undefined ? _l.g.GCompOpAssign : 0;
  GCompOpSet = _l.g.GCompOpSet !== undefined ? _l.g.GCompOpSet : 4;
  GTextAlignmentLeft = _l.g.GTextAlignmentLeft !== undefined ? _l.g.GTextAlignmentLeft : 0;
  GTextOverflowModeTrailingEllipsis =
      _l.g.GTextOverflowModeTrailingEllipsis !== undefined ?
      _l.g.GTextOverflowModeTrailingEllipsis : 1;
  gcolor_is_transparent = _l.g.gcolor_is_transparent;
  packIcon = _l.p.packIcon;
  fbIconBlit = _l.f.fbIconBlit;
  pgPushLayer = _l.x.pgPushLayer; pgPopLayer = _l.x.pgPopLayer;
  pgTagBegin = _l.x.pgTagBegin; pgTagEnd = _l.x.pgTagEnd;
  graphics_context_set_fill_color = _l.x.graphics_context_set_fill_color;
  graphics_context_set_text_color = _l.x.graphics_context_set_text_color;
  graphics_context_set_compositing_mode = _l.x.graphics_context_set_compositing_mode;
  graphics_fill_rect = _l.r.graphics_fill_rect;
  graphics_draw_text = _l.t.graphics_draw_text;
}
/* @endnoinline */

/* ==========================================================================
   PORT OF PebbleOS applib/ui/layer.c
   ========================================================================== */

/* PORT OF layer.c:layer_init + layer_create.
 * bounds starts at the origin with the frame's size, which is true of every
 * layer this watchface creates and is what makes layer_set_frame's bounds
 * adjustment collapse to "bounds = (0,0,new_w,new_h)". */
function layer_create(frame) {
  return {
    frame: GRect(frame.origin.x, frame.origin.y, frame.size.w, frame.size.h),
    bounds: GRect(0, 0, frame.size.w, frame.size.h),
    parent: null,
    children: [],
    update_proc: null,
    hidden: false,
    clips: true,
    data: null,
    owner: null      /* the TextLayer / BitmapLayer / EffectLayer that owns us */
  };
}

/* PORT OF layer.c:layer_create_with_data. The C hands back a block of scratch
 * memory sized by the caller; JS has no sizeof, so any non-zero size gets an
 * empty object that layer_get_data() returns by reference. */
function layer_create_with_data(frame, data_size) {
  var layer = layer_create(frame);
  if (data_size) { layer.data = {}; }
  return layer;
}

function layer_get_data(layer) { return layer.data; }

/* Teardown only - the preview renders once and throws the tree away. */
function layer_destroy(layer) {
  if (layer && layer.parent) { layer_remove_from_parent(layer); }
  return layer;
}

function layer_set_update_proc(layer, proc) { layer.update_proc = proc; }

/* PORT OF layer.c:layer_add_child - appends, so add order is paint order.
 * Re-adding a layer that already has a parent detaches it first, which is what
 * makes main.c:2279-2284's remove/re-add lift the day strip to the top. */
function layer_add_child(parent, child) {
  if (!parent || !child) { return; }
  if (child.parent) { layer_remove_from_parent(child); }
  child.parent = parent;
  parent.children.push(child);
}

function layer_remove_from_parent(layer) {
  if (!layer || !layer.parent) { return; }
  var kids = layer.parent.children;
  for (var i = 0; i < kids.length; i++) {
    if (kids[i] === layer) { kids.splice(i, 1); break; }
  }
  layer.parent = null;
}

/* Returned by value in the C, so callers are free to mutate their copy. Hand
 * back a fresh GRect for the same reason - effect_layer_update_proc and
 * battery_layer_update_proc both read this every render. */
function layer_get_bounds(layer) {
  var b = layer.bounds;
  return GRect(b.origin.x, b.origin.y, b.size.w, b.size.h);
}

function layer_get_frame(layer) {
  var f = layer.frame;
  return GRect(f.origin.x, f.origin.y, f.size.w, f.size.h);
}

/* PORT OF layer.c:layer_set_frame. The C adjusts bounds.size by the frame-size
 * delta and leaves bounds.origin alone; with bounds.origin at (0,0) - true for
 * every layer here - the result is bounds = (0,0,new_w,new_h). Both live
 * callers rely on this: effect_layer2 is re-framed every tick and reads its
 * bounds back in effect_layer_update_proc, and the bracket date is re-framed
 * to a different width and re-lays its text inside the new bounds. */
function layer_set_frame(layer, frame) {
  var dw = frame.size.w - layer.frame.size.w;
  var dh = frame.size.h - layer.frame.size.h;
  layer.frame = GRect(frame.origin.x, frame.origin.y, frame.size.w, frame.size.h);
  layer.bounds = GRect(layer.bounds.origin.x, layer.bounds.origin.y,
                       layer.bounds.size.w + dw, layer.bounds.size.h + dh);
  layer_mark_dirty(layer);
}

function layer_set_bounds(layer, bounds) {
  layer.bounds = GRect(bounds.origin.x, bounds.origin.y, bounds.size.w, bounds.size.h);
}

/* A one-shot static render always repaints, so dirtiness carries no
 * information. Kept so the port reads like the C (28 call sites). */
function layer_mark_dirty(layer) { return layer; }

function layer_set_hidden(layer, hidden) { if (layer) { layer.hidden = !!hidden; } }
function layer_get_hidden(layer) { return layer ? !!layer.hidden : false; }
function layer_set_clips(layer, clips) { layer.clips = !!clips; }

/* PORT OF layer.c:layer_convert_point_to_screen - walk to the root summing
 * frame and bounds origins. frame_draw_background, frame_draw_popup_bars and
 * effect_layer_update_proc all depend on this to place capture-path writes in
 * absolute framebuffer coordinates. */
function layer_convert_point_to_screen(layer, point) {
  var x = point.x, y = point.y;
  var l = layer;
  while (l) {
    x += l.frame.origin.x + l.bounds.origin.x;
    y += l.frame.origin.y + l.bounds.origin.y;
    l = l.parent;
  }
  return GPoint(x, y);
}

/* ==========================================================================
   PORT OF PebbleOS applib/ui/text_layer.c
   ========================================================================== */

/* PORT OF text_layer.c:text_layer_init. Every default except overflow_mode is
 * overwritten before display, which makes GTextOverflowModeTrailingEllipsis the
 * effective overflow mode for all nine on-face TextLayers - it is never set
 * explicitly anywhere in main.c. */
function text_layer_create(frame) {
  var tl = {
    layer: layer_create(frame),
    text: null,
    font: null,
    background_color: GColorWhite,
    text_color: GColorBlack,
    text_alignment: GTextAlignmentLeft,
    overflow_mode: GTextOverflowModeTrailingEllipsis,
    pgTag: null,
    pgBgTag: null
  };
  tl.layer.owner = tl;
  tl.layer.update_proc = text_layer_update_proc;
  return tl;
}

function text_layer_destroy(tl) { return tl; }
function text_layer_get_layer(tl) { return tl ? tl.layer : null; }

/* The C stores the POINTER and never copies; every caller passes a buffer with
 * a lifetime at least as long as the layer's. */
function text_layer_set_text(tl, text) { if (tl) { tl.text = text; } }
function text_layer_set_text_color(tl, argb) { if (tl) { tl.text_color = argb; } }
function text_layer_set_background_color(tl, argb) { if (tl) { tl.background_color = argb; } }
function text_layer_set_font(tl, font) { if (tl) { tl.font = font; } }
function text_layer_set_text_alignment(tl, align) { if (tl) { tl.text_alignment = align; } }
function text_layer_set_overflow_mode(tl, mode) { if (tl) { tl.overflow_mode = mode; } }

/* PORT OF text_layer.c:text_layer_update_proc.
 *
 * A GColorClear background paints nothing; anything else fills the whole
 * bounds with radius 0 - a hard, unantialiased scanline assign. That fill is
 * exactly what cuts the opaque notches into the LCARS bars (spec 5.2/5.3/5.6):
 * they are emergent here, not hand-placed rectangles as in the old SVG path.
 *
 * The A5 tag records bracket the two halves separately so a tap on the mask
 * opens the background picker while a tap on a glyph opens the text picker. */
function text_layer_update_proc(layer, ctx) {
  var tl = layer.owner;
  var bounds = layer.bounds;
  var t;
  if (!gcolor_is_transparent(tl.background_color)) {
    t = tl.pgBgTag;
    if (t) { pgTagBegin(ctx, t.key, t.label, t.role); }
    graphics_context_set_fill_color(ctx, tl.background_color);
    graphics_fill_rect(ctx, bounds, 0, GCornerNone);
    if (t) { pgTagEnd(ctx); }
  }
  graphics_context_set_text_color(ctx, tl.text_color);
  if (tl.text && tl.text.length > 0 && tl.font) {
    t = tl.pgTag;
    if (t) { pgTagBegin(ctx, t.key, t.label, t.role); }
    graphics_draw_text(ctx, tl.text, tl.font, bounds,
                       tl.overflow_mode, tl.text_alignment, null);
    if (t) { pgTagEnd(ctx); }
  }
}

/* ==========================================================================
   PORT OF PebbleOS applib/ui/bitmap_layer.c
   ========================================================================== */

var GAlignCenter = 0;

function bitmap_layer_create(frame) {
  var bl = {
    layer: layer_create(frame),
    bitmap: null,
    background_color: GColorClear,
    alignment: GAlignCenter,
    compositing_mode: GCompOpAssign,
    pgTag: null,
    pgBgTag: null
  };
  bl.layer.owner = bl;
  bl.layer.update_proc = bitmap_layer_update_proc;
  return bl;
}

function bitmap_layer_destroy(bl) { return bl; }
function bitmap_layer_get_layer(bl) { return bl ? bl.layer : null; }
function bitmap_layer_set_bitmap(bl, bitmap) { if (bl) { bl.bitmap = bitmap; } }
function bitmap_layer_set_background_color(bl, argb) { if (bl) { bl.background_color = argb; } }
function bitmap_layer_set_alignment(bl, align) { if (bl) { bl.alignment = align; } }
function bitmap_layer_set_compositing_mode(bl, mode) { if (bl) { bl.compositing_mode = mode; } }

/* PORT OF gtypes.c:grect_align, GAlignCenter only - the BitmapLayer default and
 * the only alignment this watchface ever uses. Integer division, so an odd
 * leftover biases up/left exactly as the C does. */
function prv_grect_align_center(rect, inside_rect) {
  return GRect(cdiv(inside_rect.size.w - rect.size.w, 2) + inside_rect.origin.x,
               cdiv(inside_rect.size.h - rect.size.h, 2) + inside_rect.origin.y,
               rect.size.w, rect.size.h);
}

/* PORT OF bitmap_layer.c:bitmap_layer_update_proc.
 *
 * The background fill happens first and covers the whole bounds - which is why
 * the footprint layer, whose background is backgroundcol, masks whatever is
 * beneath it once steps are enabled (spec 5.8). The blit itself is
 * GCompOpSet: on 8-bit that is a per-pixel alpha-keyed copy, so alpha 0 skips
 * and alpha 3 assigns. fbIconBlit is the capture-free equivalent of
 * graphics_draw_bitmap_in_rect's bitblt for that one mode. */
function bitmap_layer_update_proc(layer, ctx) {
  var bl = layer.owner;
  var bounds = layer.bounds;
  var t;
  if (!gcolor_is_transparent(bl.background_color)) {
    t = bl.pgBgTag;
    if (t) { pgTagBegin(ctx, t.key, t.label, t.role); }
    graphics_context_set_fill_color(ctx, bl.background_color);
    graphics_fill_rect(ctx, bounds, 0, GCornerNone);
    if (t) { pgTagEnd(ctx); }
  }
  if (!bl.bitmap || ctx.lock) { return; }
  graphics_context_set_compositing_mode(ctx, bl.compositing_mode);
  var rect = prv_grect_align_center(bl.bitmap.bounds, bounds);
  t = bl.pgTag;
  if (t) { pgTagBegin(ctx, t.key, t.label, t.role); }
  fbIconBlit(ctx.fb, ctx.dbox.x + rect.origin.x, ctx.dbox.y + rect.origin.y,
             bl.bitmap, ctx.clip);
  if (t) { pgTagEnd(ctx); }
}

/* ==========================================================================
   Bitmap resources
   ========================================================================== */

/* PORT OF gbitmap_create_with_resource, resolved against the baked ICA1 atlas
 * instead of a PNG decoder. Returns null when the resource is absent, which is
 * what the C does on a failed load and what main.c:2202 guards for. */
function gbitmap_create_with_resource(resourceId) {
  if (!pgIconPack) { return null; }
  var key = String(resourceId);
  var icon = packIcon(pgIconPack, key);
  if (!icon && key.indexOf('RESOURCE_ID_') === 0) {
    icon = packIcon(pgIconPack, key.substring(12));
  }
  if (!icon && key.indexOf('IMAGE_') === 0) {
    icon = packIcon(pgIconPack, key.substring(6));
  }
  if (!icon) { return null; }
  if (!icon.bounds) { icon.bounds = GRect(0, 0, icon.w, icon.h); }
  return icon;
}

function gbitmap_destroy(bitmap) { return bitmap; }

/* gbitmap_create_with_resource takes no context in the C (the resource system
 * is global), so the pack has to be bound once before the face is built.
 * 90-render.js calls this, exactly as it calls pgFontsInit. */
var pgIconPack = null;
function pgIconsInit(pack) { pgIconPack = pack || null; return pgIconPack; }

/* ==========================================================================
   PORT OF PebbleOS applib/ui/window.c
   ========================================================================== */

function window_create() {
  var w = { root_layer: null, background_color: GColorBlack };
  w.root_layer = layer_create(GRect(0, 0, 0, 0));
  w.root_layer.owner = w;
  return w;
}

function window_destroy(window) { return window; }
function window_get_root_layer(window) { return window ? window.root_layer : null; }

/* The base fill under everything, and therefore the colour every frame
 * antialiased edge blends against (spec 5.1). 90-render.js reads it back off
 * the window to fill the framebuffer before the walk. */
function window_set_background_color(window, argb) { if (window) { window.background_color = argb; } }

/* No window stack in a one-shot render. main.c:1820 pushes exactly one window. */
function window_stack_push(window, animated) { return window; }

/* ==========================================================================
   Render driver
   ========================================================================== */

/* Depth-first in add order: a layer's update proc paints, then its children
 * paint over it. A hidden layer skips its whole subtree, as it does on the
 * watch. orgX/orgY are the parent's screen origin; clip is the parent's
 * half-open clip box.
 *
 * The root layer of a Window has a zero-size frame in this shim, so it is
 * given the screen as its rect rather than an empty one - the C's root layer is
 * created with the window bounds and the distinction never arises there. */
function pgWalk(layer, ctx, orgX, orgY, clip) {
  if (!layer || layer.hidden) { return; }
  var isRoot = (layer.parent === null && layer.frame.size.w === 0 && layer.frame.size.h === 0);
  var rect = isRoot
      ? GRect(0, 0, ctx.fb.w, ctx.fb.h)
      : GRect(orgX + layer.frame.origin.x, orgY + layer.frame.origin.y,
              layer.frame.size.w, layer.frame.size.h);

  var saved = pgPushLayer(ctx, rect, clip);
  if (layer.update_proc) { layer.update_proc(layer, ctx); }
  /* A capture left outstanding by a buggy update proc would corrupt every
   * layer after it; the firmware asserts, and so do we. */
  if (ctx.captured) {
    throw new Error('TrekShim: update proc left the framebuffer captured');
  }
  var childOrgX = rect.origin.x + layer.bounds.origin.x;
  var childOrgY = rect.origin.y + layer.bounds.origin.y;
  var childClip = ctx.clip;
  for (var i = 0; i < layer.children.length; i++) {
    pgWalk(layer.children[i], ctx, childOrgX, childOrgY, childClip);
  }
  pgPopLayer(ctx, saved);
}

/* @noinline */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    layer_create: layer_create, layer_create_with_data: layer_create_with_data,
    layer_get_data: layer_get_data, layer_destroy: layer_destroy,
    layer_set_update_proc: layer_set_update_proc, layer_add_child: layer_add_child,
    layer_remove_from_parent: layer_remove_from_parent,
    layer_get_bounds: layer_get_bounds, layer_get_frame: layer_get_frame,
    layer_set_frame: layer_set_frame, layer_set_bounds: layer_set_bounds,
    layer_mark_dirty: layer_mark_dirty, layer_set_hidden: layer_set_hidden,
    layer_get_hidden: layer_get_hidden, layer_set_clips: layer_set_clips,
    layer_convert_point_to_screen: layer_convert_point_to_screen,
    text_layer_create: text_layer_create, text_layer_destroy: text_layer_destroy,
    text_layer_get_layer: text_layer_get_layer, text_layer_set_text: text_layer_set_text,
    text_layer_set_text_color: text_layer_set_text_color,
    text_layer_set_background_color: text_layer_set_background_color,
    text_layer_set_font: text_layer_set_font,
    text_layer_set_text_alignment: text_layer_set_text_alignment,
    text_layer_set_overflow_mode: text_layer_set_overflow_mode,
    text_layer_update_proc: text_layer_update_proc,
    bitmap_layer_create: bitmap_layer_create, bitmap_layer_destroy: bitmap_layer_destroy,
    bitmap_layer_get_layer: bitmap_layer_get_layer,
    bitmap_layer_set_bitmap: bitmap_layer_set_bitmap,
    bitmap_layer_set_background_color: bitmap_layer_set_background_color,
    bitmap_layer_set_alignment: bitmap_layer_set_alignment,
    bitmap_layer_set_compositing_mode: bitmap_layer_set_compositing_mode,
    bitmap_layer_update_proc: bitmap_layer_update_proc,
    gbitmap_create_with_resource: gbitmap_create_with_resource,
    gbitmap_destroy: gbitmap_destroy, pgIconsInit: pgIconsInit,
    window_create: window_create, window_destroy: window_destroy,
    window_get_root_layer: window_get_root_layer,
    window_set_background_color: window_set_background_color,
    window_stack_push: window_stack_push,
    pgWalk: pgWalk
  };
}
/* @endnoinline */
