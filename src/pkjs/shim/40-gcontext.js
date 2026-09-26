/* TrekV4 settings-preview emulation layer - GContext and framebuffer capture.
 *
 * SPDX-License-Identifier: Apache-2.0
 * SPDX-FileCopyrightText: 2024 Google LLC
 * Draw-state model and capture semantics translated from PebbleOS
 * src/fw/applib/graphics/graphics.c and gbitmap.c. See NOTICE.
 *
 * THERE ARE TWO STRUCTURALLY DISTINCT WRITE PATHS AND THEY MUST NOT MIX:
 *
 *   capture  - raw framebuffer bytes at ABSOLUTE screen coordinates, clipped
 *              only to the screen. Used by frame_draw_background,
 *              frame_draw_popup_bars and both effect layers.
 *   GContext - translated by drawing_box.origin and clipped to clip_box.
 *              Everything else.
 *
 * Mixing them is the easiest way to produce a subtly wrong frame, so
 * pgPushLayer throws if a capture is still outstanding, and the primitives
 * honour ctx.lock the way the firmware does.
 */

/* @noinline */
var _g10 = require('./10-gcolor.js');
var _g20 = require('./20-pack.js');
var GRect = _g10.GRect;
var GColorWhite = _g10.GColorWhite;
var GColorBlack = _g10.GColorBlack;
var GCompOpAssign = _g10.GCompOpAssign;
var GBitmapFormat8Bit = _g10.GBitmapFormat8Bit;
var packOpen = _g20.packOpen;
/* @endnoinline */

function pgCtxCreate(fb, pack) {
  var ctx = {
    fb: fb,
    pack: pack ? packOpen(pack) : null,
    captured: false,
    lock: false,
    /* The whole screen, half-open. The capture path clips to exactly this. */
    screen: { x0: 0, y0: 0, x1: fb.w, y1: fb.h },
    dbox: { x: 0, y: 0 },
    clip: { x0: 0, y0: 0, x1: fb.w, y1: fb.h },
    ds: null,
    bmp: null,
    targets: [],
    tagStack: [],
    tag: 0,
    nextTag: 1
  };
  ctx.ds = pgDefaultDrawState();
  /* One reusable GBitmap facade; the firmware hands back the live framebuffer,
   * not a copy, and so do we. */
  ctx.bmp = {
    w: fb.w, h: fb.h,
    addr: fb.d,
    row_size_bytes: fb.w,
    format: GBitmapFormat8Bit,
    bounds: GRect(0, 0, fb.w, fb.h),
    fb: fb
  };
  return ctx;
}

/* PebbleOS graphics_context_init defaults. antialiased is true on colour
 * platforms (graphics.c:499, !compiled_with_legacy2_sdk), which is why
 * frame_render.c's explicit set_antialiased(true) is a no-op in practice. */
function pgDefaultDrawState() {
  return {
    fill_color: GColorWhite,
    stroke_color: GColorBlack,
    text_color: GColorBlack,
    stroke_width: 1,
    compositing_mode: GCompOpAssign,
    antialiased: true
  };
}

/* ---- layer push / pop -------------------------------------------------- */

/* screenRect is the layer's frame in SCREEN coordinates. parentClip is the
 * parent's half-open clip box; pass ctx.screen for the root. The draw state is
 * reset to the PebbleOS defaults per layer render, which is why every update
 * proc that cares sets its own fill/stroke/text colour before drawing. */
function pgPushLayer(ctx, screenRect, parentClip) {
  if (ctx.captured) {
    throw new Error('TrekShim: pgPushLayer while the framebuffer is captured');
  }
  var saved = { dbox: ctx.dbox, clip: ctx.clip, ds: ctx.ds };
  var sx0 = screenRect.origin.x, sy0 = screenRect.origin.y;
  var sx1 = sx0 + screenRect.size.w, sy1 = sy0 + screenRect.size.h;
  var p = parentClip || ctx.screen;
  ctx.dbox = { x: sx0, y: sy0 };
  ctx.clip = {
    x0: p.x0 > sx0 ? p.x0 : sx0,
    y0: p.y0 > sy0 ? p.y0 : sy0,
    x1: p.x1 < sx1 ? p.x1 : sx1,
    y1: p.y1 < sy1 ? p.y1 : sy1
  };
  if (ctx.clip.x1 < ctx.clip.x0) { ctx.clip.x1 = ctx.clip.x0; }
  if (ctx.clip.y1 < ctx.clip.y0) { ctx.clip.y1 = ctx.clip.y0; }
  ctx.ds = pgDefaultDrawState();
  return saved;
}

function pgPopLayer(ctx, saved) {
  ctx.dbox = saved.dbox;
  ctx.clip = saved.clip;
  ctx.ds = saved.ds;
}

/* ---- interactive target tagging ---------------------------------------- */

/* Opens a new target record. Each call is a distinct instance, so instance
 * ordering equals draw order - which is what the per-key target census in
 * clay-custom.js counts. Nesting is supported; the inner tag wins for the
 * pixels it paints and the outer one resumes afterwards. */
function pgTagBegin(ctx, key, label, role) {
  if (ctx.nextTag > 254) {
    throw new Error('TrekShim: more than 254 interactive targets');
  }
  var rec = {
    key: key, label: label || '', role: role || null,
    x0: 32767, y0: 32767, x1: -32768, y1: -32768,
    tag: ctx.nextTag++
  };
  ctx.targets.push(rec);
  ctx.tagStack.push({ tag: ctx.fb.tag, box: ctx.fb.box });
  ctx.fb.tag = rec.tag;
  ctx.fb.box = rec;
  /* Mirror on the context too: the capture path writes straight into the
   * framebuffer and needs to restore fb.tag from ctx.tag afterwards. */
  ctx.tag = rec.tag;
  return rec.tag;
}

function pgTagEnd(ctx) {
  var prev = ctx.tagStack.pop();
  if (!prev) { return; }
  ctx.fb.tag = prev.tag;
  ctx.fb.box = prev.box;
  ctx.tag = prev.tag;
}

/* Targets that actually painted something. A record whose bbox never grew
 * painted no pixels, so its tag id can never appear in the tag map and it must
 * not become a tappable rect. */
function pgTargets(ctx) {
  var out = [];
  for (var i = 0; i < ctx.targets.length; i++) {
    var r = ctx.targets[i];
    if (r.x1 >= r.x0 && r.y1 >= r.y0) { out.push(r); }
  }
  return out;
}

/* ---- draw state setters ------------------------------------------------ */

function graphics_context_set_fill_color(ctx, argb) { ctx.ds.fill_color = argb; }
function graphics_context_set_stroke_color(ctx, argb) { ctx.ds.stroke_color = argb; }
function graphics_context_set_text_color(ctx, argb) { ctx.ds.text_color = argb; }

/* PORT OF graphics.c:graphics_context_set_stroke_width - 0 is silently ignored. */
function graphics_context_set_stroke_width(ctx, w) {
  if (w === 0) { return; }
  ctx.ds.stroke_width = w;
}

function graphics_context_set_antialiased(ctx, on) { ctx.ds.antialiased = !!on; }
function graphics_context_set_compositing_mode(ctx, m) { ctx.ds.compositing_mode = m; }

/* ---- framebuffer capture ----------------------------------------------- */

/* Returns the LIVE framebuffer. While captured, ctx.lock makes the ordinary
 * primitives no-ops, exactly as the firmware does - and a second capture
 * returns null, which is the condition frame_render.c's (unreachable on real
 * hardware) degraded fallbacks test for. */
function graphics_capture_frame_buffer(ctx) {
  if (ctx.captured) { return null; }
  ctx.captured = true;
  ctx.lock = true;
  return ctx.bmp;
}

function graphics_release_frame_buffer(ctx, bitmap) {
  if (!ctx.captured || bitmap !== ctx.bmp) { return false; }
  ctx.captured = false;
  ctx.lock = false;
  return true;
}

/* ---- GBitmap accessors ------------------------------------------------- */

function gbitmap_get_bounds(bmp) { return bmp.bounds; }
function gbitmap_get_data(bmp) { return bmp.addr; }
function gbitmap_get_bytes_per_row(bmp) { return bmp.row_size_bytes; }
function gbitmap_get_format(bmp) { return bmp.format; }

/* PORT OF gbitmap.c:gbitmap_get_data_row_info, rectangular branch. `off` is
 * the systematic deviation from the C: pointer arithmetic becomes
 * (array, offset), so ri.data[x] in C is ri.data[ri.off + x] here. */
function gbitmap_get_data_row_info(bmp, y) {
  return { data: bmp.addr, off: y * bmp.row_size_bytes, min_x: 0, max_x: bmp.w - 1 };
}

/* @noinline */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    pgCtxCreate: pgCtxCreate, pgDefaultDrawState: pgDefaultDrawState,
    pgPushLayer: pgPushLayer, pgPopLayer: pgPopLayer,
    pgTagBegin: pgTagBegin, pgTagEnd: pgTagEnd, pgTargets: pgTargets,
    graphics_context_set_fill_color: graphics_context_set_fill_color,
    graphics_context_set_stroke_color: graphics_context_set_stroke_color,
    graphics_context_set_text_color: graphics_context_set_text_color,
    graphics_context_set_stroke_width: graphics_context_set_stroke_width,
    graphics_context_set_antialiased: graphics_context_set_antialiased,
    graphics_context_set_compositing_mode: graphics_context_set_compositing_mode,
    graphics_capture_frame_buffer: graphics_capture_frame_buffer,
    graphics_release_frame_buffer: graphics_release_frame_buffer,
    gbitmap_get_bounds: gbitmap_get_bounds, gbitmap_get_data: gbitmap_get_data,
    gbitmap_get_bytes_per_row: gbitmap_get_bytes_per_row,
    gbitmap_get_format: gbitmap_get_format,
    gbitmap_get_data_row_info: gbitmap_get_data_row_info
  };
}
/* @endnoinline */
