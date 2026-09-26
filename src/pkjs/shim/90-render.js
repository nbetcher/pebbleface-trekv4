/* TrekV4 settings-preview emulation layer - the single public entry point.
 *
 * renderFace(env) runs the whole emery pipeline of spec section 4.2 and hands
 * back a finished framebuffer, its RGBA expansion, the tag map and the list of
 * interactive targets. It is a PURE FUNCTION: no DOM, no Date, no clayConfig.
 * Everything locale-, clock- and settings-shaped is resolved by clay-custom.js
 * and arrives on env.strings / env.opts / env.colors, which is what lets
 * dump_preview.js and node --test drive the identical code path the phone runs.
 */

/* @noinline */
var _r00, _r10, _r20, _r30, _r40, _r60, _r70, _r80;
var cdiv;
var GRect, GColorBlack;
var packOpen;
var fbCreate, fbSpan, fbExpand;
var pgCtxCreate, pgTagBegin, pgTagEnd, pgTargets;
var pgFontsInit;
var pgIconsInit, pgWalk, window_get_root_layer;
var faceState, faceBuild;
if (typeof module !== 'undefined' && module.exports) {
  _r00 = require('./00-cnum.js');
  _r10 = require('./10-gcolor.js');
  _r20 = require('./20-pack.js');
  _r30 = require('./30-fb.js');
  _r40 = require('./40-gcontext.js');
  _r60 = require('./60-text.js');
  _r70 = require('./70-layer.js');
  _r80 = require('./80-face-emery.js');
  cdiv = _r00.cdiv;
  GRect = _r10.GRect; GColorBlack = _r10.GColorBlack;
  packOpen = _r20.packOpen;
  fbCreate = _r30.fbCreate; fbSpan = _r30.fbSpan; fbExpand = _r30.fbExpand;
  pgCtxCreate = _r40.pgCtxCreate; pgTagBegin = _r40.pgTagBegin;
  pgTagEnd = _r40.pgTagEnd; pgTargets = _r40.pgTargets;
  pgFontsInit = _r60.pgFontsInit;
  pgIconsInit = _r70.pgIconsInit; pgWalk = _r70.pgWalk;
  window_get_root_layer = _r70.window_get_root_layer;
  faceState = _r80.faceState; faceBuild = _r80.faceBuild;
}
/* @endnoinline */

var TREK_SHIM_VERSION = '1.0.0';

/* Byte-identical to 80-face-emery.js's LBL_BG. The screen fill is stage 1 of
 * the pipeline rather than a layer draw, so its target is opened here. */
var RENDER_LBL_BG = 'Change screen background color';

/* Stage 1 of spec 4.2: the whole screen is filled with backgroundcol before any
 * layer runs. Load-bearing beyond the obvious - every antialiased edge of the
 * LCARS frame blends against THIS, not against an assumed black, so changing
 * the background colour changes every frame edge pixel. */
function prvFillScreen(ctx, argb) {
  var fb = ctx.fb;
  pgTagBegin(ctx, 'backgroundcol', RENDER_LBL_BG, null);
  for (var y = 0; y < fb.h; y++) { fbSpan(fb, y, 0, fb.w - 1, argb); }
  pgTagEnd(ctx);
}

/* env, per spec 3.11:
 *   { platform, pack, palette:"literal"|"sunlight", wantTags,
 *     colors:{ backgroundcol, textcol, othertextcol, bluetooth_color,
 *              battery_full_color, battery_empty_color, popup_color,
 *              popup_time_color, popup_hint_color, customcol:[13] },
 *     opts:{ background, invert, battery_colorized, battery_background,
 *            secs_instead_of_ampm, clock_is_24h, startday_is_sunday,
 *            show_heart_rate, steps_status, date_in_bracket, hideweather,
 *            weather_configured, bt_connected, bt_popup, preview_disconnected,
 *            flash_on },
 *     tm:{ sec,min,hour,mday,mon,year,wday },
 *     strings:{ ... }, runtime:{ battery_pct, is_charging, weather_icon } }
 *
 * Returns { w, h, fb, rgba, tags, targets, version }.
 */
function renderFace(env) {
  if (!env || !env.pack) { throw new Error('TrekShim: renderFace needs env.pack'); }
  var pack = packOpen(env.pack);

  /* The resource system is global in the C, so both atlases are bound once,
   * before anything can ask for a font or a bitmap. */
  pgFontsInit(pack.p.glyphs, pack.layout && pack.layout.FONTS);
  pgIconsInit(pack);

  var S = faceState(env);
  S.packHandle = pack;

  /* Build the layer graph first: faceBuild measures text (the today-highlight
   * and the bracket date) but draws nothing, so it needs no context. */
  var win = faceBuild(S);

  var fb = fbCreate(S.w, S.h, 0, env.wantTags !== false);
  var ctx = pgCtxCreate(fb, pack);

  prvFillScreen(ctx, win.background_color);
  pgWalk(window_get_root_layer(win), ctx, 0, 0, ctx.screen);

  var rgba = new Uint8ClampedArray(S.w * S.h * 4);
  fbExpand(fb, rgba, env.palette || 'literal');

  return {
    w: S.w, h: S.h,
    fb: fb.d,
    rgba: rgba,
    tags: fb.t,
    targets: pgTargets(ctx),
    version: TREK_SHIM_VERSION
  };
}

/* @noinline */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderFace: renderFace, TREK_SHIM_VERSION: TREK_SHIM_VERSION };
}
/* @endnoinline */
