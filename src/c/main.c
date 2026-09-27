/*
Copyright (C) 2017 Mark Reed / Little Gem Software / Balázs Baranyai

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/


#include <pebble.h>
#include "languages.h"
#include "effect_layer.h"
#include "frame_render.h"

/* The LCARS frame, popup bars and BT glyphs are drawn at runtime with computed
   anti-aliasing (frame_render.c); no bitmap resources. Rectangular watches only. */

static const uint32_t WEATHER_ICONS[] = {
  RESOURCE_ID_CLEAR_DAY,
  RESOURCE_ID_CLEAR_NIGHT,
  RESOURCE_ID_WINDY,
  RESOURCE_ID_COLD,
  RESOURCE_ID_PARTLY_CLOUDY_DAY,
  RESOURCE_ID_PARTLY_CLOUDY_NIGHT,
  RESOURCE_ID_HAZE,
  RESOURCE_ID_CLOUD,
  RESOURCE_ID_RAIN,
  RESOURCE_ID_SNOW,
  RESOURCE_ID_HAIL,
  RESOURCE_ID_CLOUDY,
  RESOURCE_ID_STORM,
  RESOURCE_ID_FOG,
  RESOURCE_ID_NA,
};

// Setting values
static bool hideweather;
static bool secs_instead_of_ampm;
static bool bluetoothvibe_status;
static bool hourlyvibe_status;
static bool invert_format;
static GColor othertextcol;
static GColor textcol;
static GColor backgroundcol;
static bool startday_is_sunday; // not monday
static bool steps_status;
static bool battery_colorized;
static enum backgroundKeys { BGND_BLUE = 0, BGND_LTBLUE, BGND_PURPLES, BGND_YELLOW, BGND_WHITE, BGND_GREY, BGND_RED, BGND_DKBLUE, BGND_LTGREEN, BGND_DKGREEN, BGND_DKBLUE2, BGND_BORG, BGND_CUSTOM, BGND_END = BGND_CUSTOM } current_background;
static enum formatKeys { FORMAT_WEEK = 0, FORMAT_DOTY, FORMAT_DDMMYY, FORMAT_MMDDYY, FORMAT_WXDX, FORMAT_INT, FORMAT_DOT, FORMAT_YWD, FORMAT_END = FORMAT_YWD } current_format;
static enum languageKeys { LANG_EN = 0, LANG_NL, LANG_DE, LANG_FR, LANG_HR, LANG_ES, LANG_IT, LANG_NO, LANG_SW, LANG_FI, LANG_DA, LANG_TU, LANG_CA, LANG_SL, LANG_PO, LANG_HU, LANG_CZ, LANG_END = LANG_CZ } current_language;
static enum batteryBackgroundKeys { BATTBG_BLACK = 0, BATTBG_SAME_AS_BG_IMAGE, BATTBG_SAME_AS_BG_COLOR, BATTBG_END = BATTBG_SAME_AS_BG_COLOR } battery_background;

// Setting keys
enum settingKeys {
  SETTING_LANGUAGE_KEY = 1,
  SETTING_FORMAT_KEY,
  SETTING_TEMPERATURE_KEY,
  SETTING_ICON_KEY,
  SETTING_HIDEWEATHER_KEY,
  BLUETOOTHVIBE_KEY,
  HOURLYVIBE_KEY,
  SECS_KEY,
  BACKGROUND_KEY,
  SETTING_INVERT_KEY,
  SETTING_TEXTCOL_KEY,
  STARTDAY_KEY,
  STEPS_KEY,
  BACKGROUNDCOL_KEY,
  BATTERY_BACKGROUND_KEY,
  OTHER_TEXT_COL,
  BPM_MODE_KEY,
  DATE_BRACKET_KEY,
  BOTTOM_LEFT_KEY,
  BOTTOM_RIGHT_KEY,
  SETTINGS_VERSION_KEY,
  BT_VIBE_PATTERN_KEY,
  BT_VIBE_REPEAT_KEY,
  BT_POPUP_KEY,
  CUSTOMCOL0_KEY,        // 4 user "Custom" LCARS region colours (top/mid/bottom/stub)
  CUSTOMCOL1_KEY,
  CUSTOMCOL2_KEY,
  CUSTOMCOL3_KEY,
  DRAW_PALETTE_KEY,      // versioned bytes: frame, battery, BT, and popup colours
  BATTERY_COLORIZED_KEY
};

#define DRAW_PALETTE_VERSION 2
#define DRAW_PALETTE_V1_LEN 18
#define DRAW_FRAME_COUNT 13
#define DRAW_PALETTE_LEN 20
#define DRAW_PALETTE_FRAME_FIRST 1
#define DRAW_PALETTE_BATTERY_FULL 14
#define DRAW_PALETTE_BATTERY_EMPTY 15
#define DRAW_PALETTE_BT 16
#define DRAW_PALETTE_POPUP 17
#define DRAW_PALETTE_POPUP_TIME 18
#define DRAW_PALETTE_POPUP_HINT 19

/* GColor8 ARGB defaults. Battery custom colours retain the recent orange/maroon
   option, but are ignored until BATTERY_COLORIZED_KEY is explicitly enabled. */
static uint8_t draw_palette[DRAW_PALETTE_LEN] = {
  DRAW_PALETTE_VERSION,
  0xEB, 0xEB, 0xEB, 0xEB,
  0xE7, 0xE7, 0xE7, 0xE7,
  0xF5, 0xF5, 0xF5,
  0xF8, 0xF8,
  0xF8, 0xD0, 0xFF, 0xF0, 0xF8, 0xFF
};

// All UI elements
static Window         *window;

EffectLayer           *effect_layer;
EffectLayer           *effect_layer2;

static GBitmap        *icon_bitmap = NULL;

static GBitmap        *battery_charging;
static BitmapLayer    *charging_layer;

static Layer          *battery_layer;
static Layer          *bluetooth_layer;        /* glyph drawn from code tables */
static bool            bt_glyph_connected = false;
#define BT_LAYER_GET(l) (l)
static BitmapLayer    *icon_layer;
static Layer          *qt_layer;               /* Quiet Time "QT" indicator */

static TextLayer      *text_time_layer;
static TextLayer      *text_secs_ampm_layer;
static TextLayer      *text_days_layer;
static TextLayer      *text_date_layer;
static TextLayer      *text_week_layer;
static TextLayer      *battery_text_layer;
static TextLayer      *temp_layer;

static GFont          font_time;
static GFont          font_days;
static GFont          font_date;
static GFont          small_batt;
static GFont          small_batt2;
#if defined(PBL_PLATFORM_EMERY)
static GFont          batt_font;   // battery % only, sized so digits match the indicator-bar height
#endif

// Bluetooth-disconnect alert settings + state
static int  bt_vibe_pattern   = 1;      // BT_VIBE_PATTERN_KEY (default Red Alert)
static int  bt_vibe_repeat_ms = 0;      // BT_VIBE_REPEAT_KEY (0 = fire once)
static bool bt_popup          = false;  // BT_POPUP_KEY
// BT-disconnect alert state (all platforms; the dialog is drawn programmatically).
static AppTimer *bt_repeat_timer     = NULL;   // re-buzz cooldown (repeat reminder)
static AppTimer *bt_vibe_end_timer   = NULL;   // marks the end of the current buzz window
static AppTimer *bt_debounce_timer   = NULL;   // gap between shake-stop & shake-dismiss
static AppTimer *flash_timer         = NULL;   // 1s-on / 0.25s-off flash phase driver
static bool      bt_alert_active     = false;  // dialog/reminders are up (dismissable)
static bool      bt_disconnected     = false;  // BT is down (drives the flashing X)
static bool      bt_vibrating        = false;  // currently inside a buzz window
static bool      bt_shake_armed      = false;  // a shake will now DISMISS the dialog
static bool      flash_on            = true;   // current flash phase (true = visible)
static bool      bt_accel_on         = false;
static int       shake_accum         = 0;      // sustained violent-shake accumulator
static Layer    *popup_layer         = NULL;   // BT-disconnect dialog overlay
static GFont     popup_font;                   // "BLUETOOTH DISCONNECTED" (LCARS caps)
static GFont     popup_hint_font;              // shake hint (LCARS)
static GFont     popup_time_font;              // dialog clock (LCARS digits)

static AppSync        app;
static uint8_t        sync_buffer[448];   // preflighted for every AppSync key and the packed palette
static bool           app_message_opened;
static bool           app_sync_initialized;
static bool           runtime_services_subscribed;
static AppTimer      *messaging_retry_timer;
static uint8_t        messaging_retry_count;
static uint32_t       other_textcol_rgb;
static uint32_t       textcol_rgb;
static uint32_t       backgroundcol_rgb;
static uint8_t 		  weather_timeout_minutes = 0;

int charge_percent = 0;

static Layer       *frame_layer;               /* parametric LCARS frame */


// Define layer rectangles (x, y, width, height)

#if defined(PBL_PLATFORM_EMERY)
GRect TIME_RECT      = ConstantGRect(  44,   8, 149,  97 );
GRect AMPM_RECT      = ConstantGRect( 171,   0,  35,  28 );
GRect SECS_AMPM_RECT = ConstantGRect( 167,   0,  31,  28 );
GRect DATE_RECT      = ConstantGRect(  15, 184, 111,  68 );
GRect WEEK_RECT      = ConstantGRect(   2, 186, 191,  68 );
GRect DAYS_RECT      = ConstantGRect(  25, 129, 190,  41 );
GRect BATT_RECT      = ConstantGRect(  99, 107,  82,  26 );
GRect CHARGING_RECT  = ConstantGRect( 129, 107,  27,  23 );
GRect BT_RECT        = ConstantGRect( 180, 108,  20,  23 );  // w17->20: the icon's black bg is the LCARS notch; it must reach the screen's right edge (x199) or the navy mid-bracket bar bleeds through past it (was a 2px sliver at x198-199). Rune (11px) stays centred at x184-194; battery's last seg ends x178 so x180 start clears it.
GRect QT_RECT        = ConstantGRect(  22, 108,  23,  22 );  // original Trekv5 emery placement
GRect EMPTY_RECT     = ConstantGRect(   0,   0,   0,   0 );
GRect TEMP_RECT      = ConstantGRect(  26,  72,  54,  54 );
GRect ICON_RECT      = ConstantGRect(  24,  29,  27,  27 );
#else
GRect TIME_RECT      = ConstantGRect(  29,   5, 110,  72 );  // optimal - tested shifting left (width 108) = +539 RED (whole clock misaligns); the 51px thick red is the digit-width anamorphic, not position
GRect AMPM_RECT      = ConstantGRect( 123,   0,  25,  21 );
GRect SECS_AMPM_RECT = ConstantGRect( 123,   0,  23,  21 );
GRect DATE_RECT      = ConstantGRect(  11, 136,  80,  50 );
GRect WEEK_RECT      = ConstantGRect(   1, 137, 138,  50 );
GRect DAYS_RECT      = ConstantGRect(  17,  95, 140,  30 );
GRect BATT_RECT      = ConstantGRect(  71,  80,  59,  16 );
GRect CHARGING_RECT  = ConstantGRect(  97,  79,  20,  17 );
GRect BT_RECT        = ConstantGRect( 129,  79,  15,  17 );  // w11->15: notch must reach the right edge (x143) so the navy mid-bracket bar can't bleed past the icon (matches the emery fix). At w11 the 14px bluetooth-bw.png also crammed its right arm flush to the notch edge -> looked clipped; w15 fits the 14px art centred (content x132-139) with a clean black margin to the edge.
GRect QT_RECT        = ConstantGRect(  16,  80,  17,  16 );  // original Trekv5 144x168 placement
GRect EMPTY_RECT     = ConstantGRect(   0,   0,   0,   0 );
GRect TEMP_RECT      = ConstantGRect(  19,  53,  40,  40 );
GRect ICON_RECT      = ConstantGRect(  17,  21,  20,  20 );
#endif


// Define placeholders for time and date
static char time_text[] = "00:00";
static char secs_ampm_text[] = "00";
static char temperature_text[16] = "";

// save battery charge status
static uint8_t battery_charge_percent = 0;
static void draw_classic_battery_tile(GContext *ctx, GPoint p, bool full, GColor color);

// Previous Bluetooth state. The separate initialized flag ensures the first
// peek is treated as real state, including a watchface launched while offline.
static bool prev_bt_status;
static bool bt_status_initialized;

#ifdef LANGUAGE_TESTING
  static int ct = 1;
  static int speed = 5;
#endif

#if defined(PBL_HEALTH)
static TextLayer *steps_label;
static GBitmap *footprint_icon;
static BitmapLayer *footprint_layer;
#elif defined(PBL_HEALTH)
static TextLayer *steps_label;
static Layer *footprint_layer;
#endif
#if   defined(PBL_HEALTH)
#define FOOTPRINT_LAYER_GET(l) bitmap_layer_get_layer(l)
#endif

// Heart-rate readout + Month-Day date moved into the bottom LCARS bracket (emery).
static bool show_heart_rate;   // BPM_MODE_KEY: heart icon + last-BPM readout
static bool date_in_bracket;   // DATE_BRACKET_KEY: month-day date in the lower LCARS bracket (emery)
static bool hr_available;
// Platforms with a heart-rate sensor: Pebble Time 2 (emery) + Pebble 2 HR (diorite).
#if defined(PBL_PLATFORM_EMERY) || defined(PBL_PLATFORM_DIORITE)
#define HAS_HRM 1
#endif
#ifdef HAS_HRM
static char bpm_text[8] = "--";
static TextLayer  *bpm_layer;
static BitmapLayer *heart_layer;
static GBitmap    *heart_bitmap;
static void apply_bpm_layout(void);
static void refresh_bpm(void);
#endif
#ifdef PBL_HEALTH
static void refresh_steps(void);
#endif

#ifdef PBL_HEALTH
static bool health_subscribed;
static AppTimer *health_retry_timer;
static uint8_t health_retry_count;

#define HEALTH_RETRY_MAX 3

static void update_health_subscription(void);

static void health_retry_cb(void *context) {
  health_retry_timer = NULL;
  update_health_subscription();
}

static void health_handler(HealthEventType event, void *context) {
  if (event == HealthEventMovementUpdate || event == HealthEventSignificantUpdate) {
    refresh_steps();
  }
#ifdef HAS_HRM
  if (event == HealthEventHeartRateUpdate || event == HealthEventSignificantUpdate) {
    refresh_bpm();
  }
#endif
}

static void update_health_subscription(void) {
  bool want_health = steps_status;
#ifdef HAS_HRM
  bool want_hr = show_heart_rate && hr_available;
  want_health = want_health || want_hr;
  health_service_set_heart_rate_sample_period(want_hr ? 600 : 0);
#endif
  if (want_health && !health_subscribed) {
    health_subscribed = health_service_events_subscribe(health_handler, NULL);
    if (health_subscribed) {
      health_retry_count = 0;
    } else if (!health_retry_timer && health_retry_count < HEALTH_RETRY_MAX) {
      health_retry_timer = app_timer_register(5000, health_retry_cb, NULL);
      if (health_retry_timer) { health_retry_count++; }
    }
  } else if (!want_health && health_subscribed) {
    health_service_events_unsubscribe();
    health_subscribed = false;
  }
  if (!want_health && health_retry_timer) {
    app_timer_cancel(health_retry_timer);
    health_retry_timer = NULL;
  }
  if (!want_health) { health_retry_count = 0; }
  if (steps_status) { refresh_steps(); }
#ifdef HAS_HRM
  if (want_hr) { refresh_bpm(); }
#endif
}

static void stop_health_services(void) {
#ifdef HAS_HRM
  health_service_set_heart_rate_sample_period(0);
#endif
  if (health_retry_timer) {
    app_timer_cancel(health_retry_timer);
    health_retry_timer = NULL;
  }
  health_retry_count = 0;
  if (health_subscribed) {
    health_service_events_unsubscribe();
    health_subscribed = false;
  }
}
#endif

/*
  Setup new TextLayer
*/
static TextLayer * setup_text_layer( GRect rect, GTextAlignment align , GFont font ) {
  TextLayer *newLayer = text_layer_create( rect );
  if (!newLayer) { return NULL; }
  text_layer_set_text_color( newLayer, GColorWhite );
  text_layer_set_background_color( newLayer, GColorClear );
  text_layer_set_text_alignment( newLayer, align );
  text_layer_set_font( newLayer, font );

  return newLayer;
}

/* LCARS frame, drawn parametrically with computed AA (see frame_render.c) */
static void frame_layer_update( Layer *layer, GContext *ctx ) {
  frame_draw_background( ctx, layer, (uint8_t)current_background );
}

/* BT status glyph: opaque notch (covers the bracket bar) + code-table glyph */
static void bluetooth_layer_update( Layer *layer, GContext *ctx ) {
  GRect b = layer_get_bounds( layer );
  graphics_context_set_fill_color( ctx, backgroundcol );
  graphics_fill_rect( ctx, b, 0, GCornerNone );
  frame_draw_bt_glyph( ctx, b, bt_glyph_connected,
                       (GColor){ .argb = draw_palette[DRAW_PALETTE_BT] } );
}

/* Quiet Time indicator: shown only while the watch's Quiet Time is on, as the original
   Trekv5 did. The firmware has no Quiet Time event, so handle_tick re-polls it. */
static void qt_layer_update( Layer *layer, GContext *ctx ) {
  frame_draw_qt_glyph( ctx, layer, (GColor){ .argb = draw_palette[DRAW_PALETTE_BT] } );
}

static void update_quiet_time_indicator( void ) {
  if (qt_layer) { layer_set_hidden( qt_layer, !quiet_time_is_active() ); }
}

/* Quiet Time is usually toggled from a menu, which takes focus from the watchface;
   re-poll as soon as it returns instead of waiting for the next (minute) tick. */
static void handle_app_focus( bool in_focus ) {
  if (in_focus) { update_quiet_time_indicator(); }
}

/* ---- Bluetooth-disconnect alert: vibration patterns + repeat + LCARS popup ---- */

// Vibration patterns. Durations alternate ON/OFF in ms (max 10000 per segment).
static const uint32_t VP_STANDARD[]    = { 220 };
static const uint32_t VP_RED_ALERT[]   = { 360,140,360,140,360,140,360 };
static const uint32_t VP_COMM[]        = { 90,70,150 };
static const uint32_t VP_TRANSPORTER[] = { 70,60,110,60,170,60,250,60,360,60,520 };
static const uint32_t VP_PHASER[]      = { 1100,150,1100 };
static const uint32_t VP_TORPEDO[]     = { 450,250,450,850,650 };
static const uint32_t VP_WARP[]        = { 250,90,400,90,650,90,1000,90,1700,90,2600 };
static const uint32_t VP_KLINGON[]     = { 170,50,90,200,330,60,130,40,470,70,100 };
static const uint32_t VP_COMPUTER[]    = { 110,90,110 };

static uint32_t do_bt_vibe(void) {
  const uint32_t *segs; uint32_t n;
  switch (bt_vibe_pattern) {
    case 1: segs = VP_RED_ALERT;   n = ARRAY_LENGTH(VP_RED_ALERT);   break;
    case 2: segs = VP_COMM;        n = ARRAY_LENGTH(VP_COMM);        break;
    case 3: segs = VP_TRANSPORTER; n = ARRAY_LENGTH(VP_TRANSPORTER); break;
    case 4: segs = VP_PHASER;      n = ARRAY_LENGTH(VP_PHASER);      break;
    case 5: segs = VP_TORPEDO;     n = ARRAY_LENGTH(VP_TORPEDO);     break;
    case 6: segs = VP_WARP;        n = ARRAY_LENGTH(VP_WARP);        break;
    case 7: segs = VP_KLINGON;     n = ARRAY_LENGTH(VP_KLINGON);     break;
    case 8: segs = VP_COMPUTER;    n = ARRAY_LENGTH(VP_COMPUTER);    break;
    default: segs = VP_STANDARD;   n = ARRAY_LENGTH(VP_STANDARD);    break;
  }
  VibePattern pat = { .durations = segs, .num_segments = n };
  vibes_enqueue_custom_pattern(pat);
  uint32_t total = 0;                       // sum the segments -> buzz-window length (ms)
  for (uint32_t i = 0; i < n; i++) { total += segs[i]; }
  return total;
}

// Dismissal hint (shown only while buzzing, or on non-touch devices). On a
// touchscreen + not buzzing the slide-to-dismiss widget is drawn instead.
static const char *current_hint(void) {
  if (bt_vibrating)   { return "SHAKE to STOP"; }
  if (bt_shake_armed) { return "SHAKE to DISMISS"; }
  return "";   // brief 2s debounce after a SHAKE-to-STOP: a shake does nothing yet
}

// Draw the "BLUETOOTH DISCONNECTED" overlay programmatically (resolution-independent
// on every platform): a themed panel framed by accent LCARS rails (red on colour,
// white on b/w), with the live time, the FLASHING alert text, and a state-dependent
// shake hint. All metrics are relative to the dialog size + a per-platform font tier.
static void popup_update_proc(Layer *layer, GContext *ctx) {
  GRect b = layer_get_bounds(layer);
  int w = b.size.w, h = b.size.h;
  GColor accent = (GColor){ .argb = draw_palette[DRAW_PALETTE_POPUP] };
  // 1. Draw the LCARS pill-bar frame: themed panel + accent end-capped bars.
  //    Drawn parametrically with computed AA (geometry fitted from the original
  //    popup_lcars.html raster; see frame_render.c) - follows any accent colour.
  graphics_context_set_fill_color(ctx, backgroundcol);
  graphics_fill_rect(ctx, GRect(0, 0, w, h), 0, GCornerNone);
  frame_draw_popup_bars(ctx, layer, accent);
#if defined(PBL_PLATFORM_EMERY)
  const int bar = 12, lh_big = 30, lh_hint = 18, lh_time = 14;
#else
  const int bar = 9, lh_big = 21, lh_hint = 13, lh_time = 12;
#endif
  // 2. Live time in a themed LCARS notch on the top bar.
  char tbuf[12]; time_t now = time(NULL); struct tm *tt = localtime(&now);
  const char *disp = tbuf;
  if (clock_is_24h_style()) { strftime(tbuf, sizeof(tbuf), "%H:%M", tt); }
  else { strftime(tbuf, sizeof(tbuf), "%I:%M %p", tt); if (tbuf[0] == '0') { disp = tbuf + 1; } }
  if (popup_time_font) {
    GSize tsz = graphics_text_layout_get_content_size(disp, popup_time_font,
        GRect(0, 0, w, bar + 8), GTextOverflowModeFill, GTextAlignmentLeft);
    int nw = tsz.w + 8;
    int nx = w - nw - bar;                            // tucked inside the right end of the bar
    if (nx < bar) { nx = bar; }
    graphics_context_set_fill_color(ctx, backgroundcol);
    graphics_fill_rect(ctx, GRect(nx, 0, nw, bar), bar / 2, GCornersAll);
    graphics_context_set_text_color(ctx,
        (GColor){ .argb = draw_palette[DRAW_PALETTE_POPUP_TIME] });
    graphics_draw_text(ctx, disp, popup_time_font, GRect(nx, (bar - lh_time) / 2 - 2, nw, lh_time + 4),
                       GTextOverflowModeFill, GTextAlignmentCenter, NULL);
  }
  // 3. Message (2 LCARS-caps lines) + shake hint, centred in the panel interior (between bars).
  const int inner = h - 2 * bar;
  const int gap = lh_hint / 3;
  const int block_h = 2 * lh_big + gap + lh_hint;
  int ty = bar + (inner - block_h) / 2 + lh_hint / 6;   // +nudge: centre the VISIBLE content
  if (ty < bar + 1) { ty = bar + 1; }
  // FLASHING accent alert text (LCARS caps) (1s on / 0.25s off).
  if (flash_on && popup_font) {
    graphics_context_set_text_color(ctx, accent);
    graphics_draw_text(ctx, "BLUETOOTH", popup_font, GRect(0, ty, w, lh_big + 2),
                       GTextOverflowModeFill, GTextAlignmentCenter, NULL);
    graphics_draw_text(ctx, "DISCONNECTED", popup_font, GRect(0, ty + lh_big, w, lh_big + 2),
                       GTextOverflowModeFill, GTextAlignmentCenter, NULL);
  }
  // White shake hint (LCARS), below the message.
  if (popup_hint_font) {
    graphics_context_set_text_color(ctx,
        (GColor){ .argb = draw_palette[DRAW_PALETTE_POPUP_HINT] });
    graphics_draw_text(ctx, current_hint(), popup_hint_font, GRect(0, ty + 2 * lh_big + gap, w, lh_hint + 2),
                       GTextOverflowModeFill, GTextAlignmentCenter, NULL);
  }
}

// ---- buzz-window tracking -------------------------------------------------
static void bt_vibe_end_cb(void *data) {
  bt_vibe_end_timer = NULL;
  bt_vibrating = false;
  bt_shake_armed = true;                           // buzz ended -> a shake now dismisses
  if (popup_layer && !layer_get_hidden(popup_layer)) { layer_mark_dirty(popup_layer); }
}

static void bt_begin_vibe(void) {
  uint32_t dur = do_bt_vibe();
  bt_vibrating = true;
  shake_accum = 0;                                    // fresh SHAKE-to-STOP window
  if (bt_vibe_end_timer) { app_timer_cancel(bt_vibe_end_timer); }
  // Hold the "vibrating" (SHAKE to STOP) state ~1.5s past the motor so there is a
  // clean, motor-free window in which to land the (deliberately hard) shake.
  bt_vibe_end_timer = app_timer_register(dur + 1500, bt_vibe_end_cb, NULL);
  if (!bt_vibe_end_timer) {
    bt_vibrating = false;
    bt_shake_armed = true;
  }
  if (popup_layer && !layer_get_hidden(popup_layer)) { layer_mark_dirty(popup_layer); }
}

static void bt_stop_vibe(void) {                   // silence the current buzz now
  vibes_cancel();
  bt_vibrating = false;
  if (bt_vibe_end_timer) { app_timer_cancel(bt_vibe_end_timer); bt_vibe_end_timer = NULL; }
}

// ---- flashing: the red dialog text while it is up, then the BT-disconnect X
//      beside the indicator bars once the dialog is dismissed -----------------
static void flash_timer_cb(void *data) {
  flash_timer = NULL;
  if (!bt_disconnected) { flash_on = true; return; }
  flash_on = !flash_on;
  flash_timer = app_timer_register(flash_on ? 1000 : 250, flash_timer_cb, NULL);
  if (popup_layer && !layer_get_hidden(popup_layer)) {         // dialog up: flash its red text
    if (bluetooth_layer) { layer_set_hidden(BT_LAYER_GET(bluetooth_layer), false); }
    layer_mark_dirty(popup_layer);
  } else if (bluetooth_layer) {                                // dialog gone: flash the X
    layer_set_hidden(BT_LAYER_GET(bluetooth_layer), !flash_on);
  }
}

static void bt_flash_start(void) {
  bt_disconnected = true;
  flash_on = true;
  if (!flash_timer) { flash_timer = app_timer_register(1000, flash_timer_cb, NULL); }
}

static void bt_flash_stop(void) {
  bt_disconnected = false;
  flash_on = true;
  if (flash_timer) { app_timer_cancel(flash_timer); flash_timer = NULL; }
  if (bluetooth_layer) { layer_set_hidden(BT_LAYER_GET(bluetooth_layer), false); }
}

// ---- dismissal ------------------------------------------------------------
// User dismissed the dialog (BT may still be down): stop reminders + buzzing +
// gestures and hide the dialog, but KEEP flashing the X if still disconnected.
static void bt_alert_dismiss(void) {
  bt_alert_active = false;
  bt_vibrating    = false;
  bt_shake_armed  = false;
  if (bt_repeat_timer)   { app_timer_cancel(bt_repeat_timer);   bt_repeat_timer = NULL; }
  if (bt_vibe_end_timer) { app_timer_cancel(bt_vibe_end_timer); bt_vibe_end_timer = NULL; }
  if (bt_debounce_timer) { app_timer_cancel(bt_debounce_timer); bt_debounce_timer = NULL; }
  vibes_cancel();
  if (bt_accel_on) { accel_data_service_unsubscribe(); bt_accel_on = false; }
  if (popup_layer) { layer_set_hidden(popup_layer, true); }
}

// BT reconnected: full teardown including the flashing indicator.
static void bt_alert_stop(void) {
  bt_alert_dismiss();
  bt_flash_stop();
}

static void bt_debounce_cb(void *data) {           // non-touch: re-arm shake-to-dismiss after 2s
  bt_debounce_timer = NULL;
  bt_shake_armed = true;
  if (popup_layer && !layer_get_hidden(popup_layer)) { layer_mark_dirty(popup_layer); }
}

// "Most violent shake" detector: a sample only counts above a high vector-magnitude
// threshold, and the alert only fires after several such samples have SUSTAINED
// (brief jolts decay back to zero). Deliberately very insensitive.
#define SHAKE_MAG2_THRESH  9000000    // per-sample |accel|^2 (~3.0 g); a deliberate hard shake
#define SHAKE_TRIGGER      3          // net sustained over-threshold samples (~0.12 s @25 Hz)

static void accel_shake_handler(AccelData *data, uint32_t num_samples) {
  if (!bt_alert_active) { return; }
  for (uint32_t i = 0; i < num_samples; i++) {
    if (data[i].did_vibrate) { continue; }            // ignore the motor's own rumble
    int x = data[i].x, y = data[i].y, z = data[i].z;
    int32_t m = (int32_t)x*x + (int32_t)y*y + (int32_t)z*z;
    if (m > SHAKE_MAG2_THRESH) {
      if (shake_accum < 1000) { shake_accum++; }
    } else if (shake_accum > 0) {
      shake_accum--;                                  // must be sustained -> jolts decay away
    }
  }
  if (shake_accum < SHAKE_TRIGGER) { return; }
  shake_accum = 0;                                    // consume the shake
  if (bt_vibrating) {
    bt_stop_vibe();                                   // SHAKE to STOP: silence the current buzz...
    bt_shake_armed = false;                           // ...then a 2s debounce before SHAKE to DISMISS
    if (bt_debounce_timer) { app_timer_cancel(bt_debounce_timer); }
    bt_debounce_timer = app_timer_register(2000, bt_debounce_cb, NULL);
    if (popup_layer && !layer_get_hidden(popup_layer)) { layer_mark_dirty(popup_layer); }
  } else if (bt_shake_armed) {
    bt_alert_dismiss();                               // SHAKE to DISMISS
  }
}

static void bt_repeat_timer_cb(void *data);

/* Reconcile an already-disconnected alert after its live settings change.
   This deliberately does not buzz immediately when saving configuration; it
   stops a now-disabled buzz, restarts the reminder interval from now, and makes
   popup/gesture state match the new combination atomically. */
static void bt_alert_reconfigure(void) {
  if (bt_repeat_timer) {
    app_timer_cancel(bt_repeat_timer);
    bt_repeat_timer = NULL;
  }

  if (!bt_disconnected) {
    if (bt_alert_active || bt_vibrating || bt_accel_on || bt_vibe_end_timer ||
        bt_debounce_timer) {
      bt_alert_dismiss();
    }
    return;
  }

  bool do_repeat = bluetoothvibe_status && bt_vibe_repeat_ms > 0;
  bool want_active = do_repeat || bt_popup;

  if (!bluetoothvibe_status) { bt_stop_vibe(); }
  if (!want_active) {
    bt_alert_dismiss();
    return;
  }

  bt_alert_active = true;
  if (!bt_vibrating) { bt_shake_armed = true; }
  if (do_repeat) {
    bt_repeat_timer = app_timer_register(bt_vibe_repeat_ms, bt_repeat_timer_cb, NULL);
  }
  if (!bt_accel_on) {
    accel_data_service_subscribe(5, accel_shake_handler);
    accel_service_set_sampling_rate(ACCEL_SAMPLING_25HZ);
    bt_accel_on = true;
  }
  if (popup_layer) {
    layer_set_hidden(popup_layer, !bt_popup);
    layer_mark_dirty(popup_layer);
  }
}

static void bt_repeat_timer_cb(void *data) {
  bt_repeat_timer = NULL;
  if (!bt_alert_active || !bt_disconnected || !bluetoothvibe_status ||
      bt_vibe_repeat_ms <= 0) {
    bt_alert_reconfigure();
    return;
  }
  bt_begin_vibe();                                   // re-buzz (re-enters SHAKE to STOP)
  if (bt_alert_active && bt_disconnected && bluetoothvibe_status &&
      bt_vibe_repeat_ms > 0) {
    bt_repeat_timer = app_timer_register(bt_vibe_repeat_ms, bt_repeat_timer_cb, NULL);
  }
}

static void bt_alert_start(void) {
  bool do_vibe   = bluetoothvibe_status;
  bool do_repeat = do_vibe && (bt_vibe_repeat_ms > 0);
  bt_shake_armed = false;
  shake_accum    = 0;
  bt_alert_active = (do_repeat || bt_popup);
  if (do_vibe)   { bt_begin_vibe(); }
  else           { bt_shake_armed = true; }          // no buzz -> a shake dismisses immediately
  if (do_repeat) { bt_repeat_timer = app_timer_register(bt_vibe_repeat_ms, bt_repeat_timer_cb, NULL); }
  if (bt_alert_active) {                              // accelerometer = shake dismissal while active
    if (!bt_accel_on) {
      accel_data_service_subscribe(5, accel_shake_handler);
      accel_service_set_sampling_rate(ACCEL_SAMPLING_25HZ);
      bt_accel_on = true;
    }
    if (popup_layer && bt_popup) {
      layer_set_hidden(popup_layer, false);
      layer_mark_dirty(popup_layer);
    }
  }
}

/*
  Handle bluetooth events
*/
void handle_bluetooth( bool connected ) {
  bt_glyph_connected = connected;             // glyph picked at draw time (code tables)
  if (bluetooth_layer) { layer_mark_dirty(bluetooth_layer); }

  if ( !bt_status_initialized || prev_bt_status != connected ) {
    if ( connected ) {
      bt_alert_stop();                        // reconnect: tear down dialog + stop flashing
    } else {
      bt_flash_start();                       // start flashing the BT-disconnect X
      bt_alert_start();                       // vibrate / repeat / popup per settings
    }
  }

  prev_bt_status = connected;
  bt_status_initialized = true;
}

/*
  Handle battery events
*/
void handle_battery( BatteryChargeState charge_state ) {
  static char battery_text[8] = "+100";

  if (charging_layer) {
    layer_set_hidden(bitmap_layer_get_layer(charging_layer), !charge_state.is_charging);
  }

  if ( charge_state.is_charging )
    snprintf(battery_text, sizeof(battery_text), "+%u", charge_state.charge_percent);
  else
    snprintf(battery_text, sizeof(battery_text), "%u", charge_state.charge_percent);

  battery_charge_percent = charge_state.charge_percent;

  if (battery_layer) { layer_mark_dirty(battery_layer); }
  if (battery_text_layer) { text_layer_set_text(battery_text_layer, battery_text); }
}

static void update_secs_ampm_layer_background() {
  if (!text_secs_ampm_layer) { return; }
  // background should be clear, only if AM/PM mode is selected and the watch uses 24h style!
  text_layer_set_background_color(text_secs_ampm_layer,
      !secs_instead_of_ampm && clock_is_24h_style() ? GColorClear : backgroundcol);
}

static void battery_layer_update_proc(Layer *layer, GContext *ctx) {
    GRect rect = layer_get_bounds(layer);

    // Paint the whole battery box opaque first (unless the user wants the LCARS
    // image to show through) so the bracket never shows behind/between segments.
    if (battery_background != BATTBG_SAME_AS_BG_IMAGE) {
        graphics_context_set_fill_color(ctx,
            battery_background == BATTBG_BLACK ? GColorBlack : backgroundcol);
        graphics_fill_rect(ctx, rect, 0, GCornerNone);
    }

    // Exact classic platform sprite cells encoded as pixels, avoiding two extra
    // heap-backed GBitmaps while preserving masks and transparency.
    const int NSEG = 10;
#if defined(PBL_PLATFORM_EMERY)
    const int cell_w = 8, cell_h = 24, ink_left = 3, ink_right = 1;
#else
    const int cell_w = 5, cell_h = 17, ink_left = 1, ink_right = 1;
#endif

    int filled = (battery_charge_percent >= 100) ? NSEG
               : (battery_charge_percent == 0)    ? 0
               : (battery_charge_percent * NSEG + 50) / 100;   // rounded
    int yo = rect.origin.y + (rect.size.h - cell_h) / 2;
    int xo = rect.origin.x + rect.size.w - NSEG * cell_w;
    if (xo < rect.origin.x) { xo = rect.origin.x; }

    /* One ink colour for the whole indicator. Empty cells are the same colour rendered
       as a 50% dither, so a custom bar colour shades itself instead of needing a second
       picked colour - and the classic white bars keep their original grey-looking
       empties. (DRAW_PALETTE_BATTERY_EMPTY is consequently no longer read here.) */
    GColor bar_ink = battery_colorized
        ? (GColor){ .argb = draw_palette[DRAW_PALETTE_BATTERY_FULL] }
        : GColorWhite;

    for (int i = 0; i < NSEG; i++) {
        bool full = (i >= NSEG - filled);                      // filled bars on the right
        int seg_x = xo + i * cell_w;
        draw_classic_battery_tile(ctx, GPoint(seg_x, yo), full, bar_ink);
    }
    (void)ink_left; (void)ink_right;   /* cell ink box now lives in the tile drawer */
}

/* Today marker geometry, from the original Trekv4/Trekv5 LCARS 20 strip: an 18x20
   block starting 3px above the letters and ending 3px below them, centred on the day,
   at least 2px from its letters and 2px clear of the neighbouring days. Time 2 uses the
   same block scaled for LCARS 27 (26x25), as the pre-6.0 Time 2 build did.
   DAY_HL_ACCENT is the empty band between the battery row and the block that accents
   (Ú, Č) rise into; effect_day_highlight grows the block into it when needed. */
#if defined(PBL_PLATFORM_EMERY)
#define DAY_HL_YOFF   5
#define DAY_HL_W      26
#define DAY_HL_H      25
#define DAY_HL_PAD    3
#define DAY_HL_ACCENT 3
#else
#define DAY_HL_YOFF   3
#define DAY_HL_W      18
#define DAY_HL_H      20
#define DAY_HL_PAD    2
#define DAY_HL_ACCENT 2
#endif
#define DAY_HL_MARGIN (DAY_HL_W / 2 + 1)

/* The day strip is drawn in othertextcol over the screen background, so those are
   exactly the pair the marker snaps between. */
static DayHighlightParams s_day_hl = {
  .box_w = DAY_HL_W, .min_pad = DAY_HL_PAD, .margin = DAY_HL_MARGIN,
  .accent = DAY_HL_ACCENT, .bottom_pad = 3, .gap = 2
};

/* Pick up colour changes, otherwise the marker keeps snapping to the previous palette
   and today's block stops matching the strip. */
static void refresh_today_highlight_effect(void) {
  s_day_hl.ink = othertextcol.argb;
  s_day_hl.bg = backgroundcol.argb;
  if (effect_layer2) { layer_mark_dirty(effect_layer_get_layer(effect_layer2)); }
}

void invert_screen(bool invert_format) {

 if (invert_format && effect_layer == NULL) {
    // Add inverter layer
    Layer *window_layer = window_get_root_layer(window);

    //creating effect layer with inverter effect
#if defined(PBL_PLATFORM_EMERY)
    effect_layer = effect_layer_create(GRect(0,0,200,228));
#else
    effect_layer = effect_layer_create(GRect(0,0,144,168));
#endif
    if (effect_layer) {
      effect_layer_add_effect(effect_layer, effect_invert, NULL);
      layer_add_child(window_layer, effect_layer_get_layer(effect_layer));
    }
  }
  else if (!invert_format && effect_layer != NULL) {
    // hide Inverter layer
    layer_remove_from_parent(effect_layer_get_layer(effect_layer));
    effect_layer_destroy(effect_layer);
    effect_layer = NULL;
  }
}

#ifdef PBL_COLOR
void bgcol() {
    if (frame_layer) { layer_mark_dirty(frame_layer); } // redraw from colour table
}
#endif

// Apply the 13 independently configurable frame-segment colours and repaint.
static void apply_custom_colors( void ) {
  frame_set_custom_colors( &draw_palette[DRAW_PALETTE_FRAME_FIRST] );
  if ( frame_layer ) { layer_mark_dirty( frame_layer ); }   // may run before the layer exists (init)
}

static bool replace_weather_icon(uint32_t resource_id) {
  GBitmap *replacement = gbitmap_create_with_resource(resource_id);
  if (!replacement) { return false; }
  if (icon_layer) { bitmap_layer_set_bitmap(icon_layer, replacement); }
  GBitmap *old = icon_bitmap;
  icon_bitmap = replacement;
  if (old) { gbitmap_destroy(old); }
  return true;
}


/* One battery cell. `full` picks solid vs the SHADED (dithered) empty treatment.
 *
 * The empty cell is a 50% checkerboard over exactly the same ink box as a full cell -
 * measured from the original Trekv4-OWM release (IMAGE_BATT_EMPTY), whose 144x168 art
 * alternates "#.#" / ".#." down a 3px-wide, 14px-tall box on a 5px pitch. Filled and
 * empty share the same width and pitch there; only the fill pattern differs. That
 * dither is what reads as a grey/shaded bar at arm's length.
 *
 * Both states are drawn in the SAME `color`, so a user-chosen bar colour automatically
 * yields a shaded version of itself for the inactive cells - no second colour needed.
 *
 * Previously emery drew a hollow outline and aplite/diorite a sparser every-other-row
 * dither, so no two platforms matched each other or the original.
 */
static void draw_classic_battery_tile(GContext *ctx, GPoint p, bool full, GColor color) {
  /* ink box inside the cell: x/y offset, then width/height */
#if defined(PBL_PLATFORM_EMERY)
  const int ix = 3, iy = 2, iw = 4, ih = 21;
#else   /* basalt / aplite / diorite / flint - the original 144x168 geometry */
  const int ix = 1, iy = 2, iw = 3, ih = 14;
#endif

  if (full) {
    graphics_context_set_fill_color(ctx, color);
    graphics_fill_rect(ctx, GRect(p.x + ix, p.y + iy, iw, ih), 0, GCornerNone);
    return;
  }
  /* ((x + y) & 1) == 0 reproduces the original art exactly: even rows light columns
     0 and 2 ("#.#"), odd rows light column 1 (".#."). */
  graphics_context_set_stroke_color(ctx, color);
  for (int y = 0; y < ih; y++) {
    for (int x = 0; x < iw; x++) {
      if (((x + y) & 1) == 0) {
        graphics_draw_pixel(ctx, GPoint(p.x + ix + x, p.y + iy + y));
      }
    }
  }
}

static bool draw_palette_is_valid(const uint8_t *palette, size_t length) {
  if (!palette || length != DRAW_PALETTE_LEN || palette[0] != DRAW_PALETTE_VERSION) {
    return false;
  }
  for (int i = 1; i < DRAW_PALETTE_LEN; i++) {
    if ((palette[i] & 0xC0) != 0xC0) { return false; }  // require an opaque GColor8
  }
  return true;
}

static void persist_draw_palette(void) {
  persist_write_data(DRAW_PALETTE_KEY, draw_palette, sizeof(draw_palette));
}

static void apply_legacy_custom_color(int group, uint32_t rgb) {
  static const uint8_t first[] = { 1, 5, 9, 12 };
  static const uint8_t count[] = { 4, 4, 3, 2 };
  if (group < 0 || group >= 4 || rgb > 0xFFFFFF) { return; }
  uint8_t argb = GColorFromHEX(rgb).argb;
  for (int i = 0; i < count[group]; i++) { draw_palette[first[group] + i] = argb; }
}

/*
  Handle tick events
*/
// The day strings as authored for the narrow LCARS face, double spaces included. The
// weekday highlight measures this same string.
static const char *days_text = "";
static void set_days_text( void ) {
  days_text = startday_is_sunday ? day_lines2[current_language]
                                 : day_lines[current_language];
  if (text_days_layer) { text_layer_set_text(text_days_layer, days_text); }
}

void handle_tick( struct tm *tick_time, TimeUnits notused ) {
  update_quiet_time_indicator();
  // Keep the disconnect popup's clock current while it is showing.
  if (popup_layer && !layer_get_hidden(popup_layer)) { layer_mark_dirty(popup_layer); }
  if (hourlyvibe_status &&
      tick_time->tm_min == 0 &&
      tick_time->tm_sec == 0)
  {
      static const uint32_t very_short_vibe_segments[] = { 50 };
      VibePattern pat = { .durations = very_short_vibe_segments, .num_segments = ARRAY_LENGTH(very_short_vibe_segments) };
      vibes_enqueue_custom_pattern(pat);
  }

  // Update text layer for current day if day has changed
  {
    int today;
    GRect hl = GRectZero;
    if (startday_is_sunday) {
      today = tick_time->tm_wday; if ( today < 0 ) { today = 6; }
    } else {
      today = tick_time->tm_wday - 1; if ( today < 0 ) { today = 6; }
    }
    // Locate today's token in the strip as rendered (any font or language), replacing
    // the old hand-placed per-language highlight_rect[] tables. The layer frame spans
    // the token plus DAY_HL_MARGIN either side; effect_day_highlight centres the block
    // on the token's drawn pixels.
    {
      const char *ds = days_text;
      int len = 0; while ( ds[len] ) { len++; }
      int idx = 0, start = -1, tok_start = 0, tok_end = len;
      for ( int i = 0; i <= len; i++ ) {
        int sp = ( i == len ) || ( ds[i] == ' ' );
        if ( !sp && start < 0 ) { start = i; }
        if ( sp && start >= 0 ) {
          if ( idx == today ) { tok_start = start; tok_end = i; break; }
          idx++; start = -1;
        }
      }
      char buf[48];
      const GRect mbox = GRect( 0, 0, 1000, 40 );
      int n = tok_end > 47 ? 47 : tok_end;
      for ( int i = 0; i < n; i++ ) { buf[i] = ds[i]; } buf[n] = '\0';
      int right_w = graphics_text_layout_get_content_size(
          buf, font_days, mbox, GTextOverflowModeWordWrap, GTextAlignmentLeft ).w;
      int tn = tok_end - tok_start; if ( tn < 0 ) { tn = 0; } if ( tn > 47 ) { tn = 47; }
      for ( int i = 0; i < tn; i++ ) { buf[i] = ds[tok_start + i]; } buf[tn] = '\0';
      int tok_w = graphics_text_layout_get_content_size(
          buf, font_days, mbox, GTextOverflowModeWordWrap, GTextAlignmentLeft ).w;
      hl.origin.x = DAYS_RECT.origin.x + ( right_w - tok_w ) - DAY_HL_MARGIN;
      hl.origin.y = DAYS_RECT.origin.y + DAY_HL_YOFF - DAY_HL_ACCENT;
      hl.size.w   = tok_w + 2 * DAY_HL_MARGIN;
      hl.size.h   = DAY_HL_H + DAY_HL_ACCENT;
    }
    if (effect_layer2) { layer_set_frame(effect_layer_get_layer(effect_layer2), hl); }
  }

#ifdef LANGUAGE_TESTING
  if (effect_layer2) {
    layer_set_frame(effect_layer_get_layer(effect_layer2), hightlight_rect[current_language][ct]);
  }
  if ( tick_time->tm_sec % speed == 0 ) { ct++; }
  if ( ct == 7 ) { ct = 0; }
#endif

#ifdef PBL_HEALTH
  /* Significant updates are not guaranteed at midnight. Refresh on a detected
     date transition so yesterday's total never lingers into the new day. Keep
     this outside LANGUAGE_TESTING so production builds execute it too. */
  static int last_yday = -1;
  if (last_yday != tick_time->tm_yday) {
    last_yday = tick_time->tm_yday;
    if (steps_status) { refresh_steps(); }
  }
#endif

  strftime( date_text, sizeof( date_text ),
            date_formats[current_language], tick_time );
  const char *date_suffix = current_language == LANG_EN
      ? ordinal_numbers[tick_time->tm_mday - 1]
      : month_names_arr[current_language][tick_time->tm_mon];
  size_t date_used = strlen(date_text);
  snprintf(date_text + date_used, sizeof(date_text) - date_used, "%s", date_suffix);

  text_layer_set_text( text_date_layer, date_text );
#ifdef HAS_HRM
  if (show_heart_rate && hr_available && date_in_bracket) {
    // Centre the date in the bracket with a fixed ~6px gap on the left (to the
    // bracket cut) and right (to the screen edge). Box right edge stays at the
    // screen edge so the solid bg covers the bracket in the right gap (no LCARS
    // bar exposed). diorite = emery geometry scaled x144/200, y168/228.
#if defined(PBL_PLATFORM_EMERY)
    const int br_right = 188, br_min = 96, br_y = 153, br_h = 28, scr_w = 200;
#else   // diorite (144x168): 135 (=188 scaled) + 3 - LCARSB_19 ink runs ~5% wide of the scaled
        // LCARSB_26 ink and the text is CENTRED, so +3 splits the excess evenly: every glyph
        // stroke lands within 2px of emery's (tested: 135 = 130px fringe, LCARSB_17 font = 161, 138 = 2)
    const int br_right = 138, br_min = 69, br_y = 113, br_h = 21, scr_w = 144;
#endif
    int dw = graphics_text_layout_get_content_size(date_text, small_batt,
               GRect(0, 0, 400, 40), GTextOverflowModeWordWrap, GTextAlignmentLeft).w;
    int bl = br_right - dw; if (bl < br_min) { bl = br_min; }
    layer_set_frame(text_layer_get_layer(text_date_layer), GRect(bl, br_y, scr_w - bl, br_h));
  }
#endif

  // Update week or day of the year (i.e. Week 15 or 2013-118)
  if ( current_format == FORMAT_WEEK ) {
    strftime( week_text, sizeof( week_text ),
              week_formats[current_language], tick_time );
    text_layer_set_text( text_week_layer, week_text );
  } else {
    strftime( alt_text, sizeof( alt_text ),
              alt_formats[current_format], tick_time );
    text_layer_set_text( text_week_layer, alt_text );
  }

  // Display hours (i.e. 18 or 06)
  strftime( time_text, sizeof( time_text ),
            clock_is_24h_style() ? "%H:%M" : "%I:%M", tick_time );

  // Remove leading zero (only in 12h-mode)
  if ( !clock_is_24h_style() && (time_text[0] == '0') ) {
    memmove( time_text, &time_text[1], sizeof( time_text ) - 1 );
  }
  text_layer_set_text( text_time_layer, time_text );

  if (secs_instead_of_ampm) {
    // Display seconds
    strftime( secs_ampm_text, sizeof( secs_ampm_text ), "%S", tick_time );
    text_layer_set_text( text_secs_ampm_layer, secs_ampm_text );
  } else {
    // Update AM/PM indicator (i.e. AM or PM or nothing when using 24-hour style)
    strftime( secs_ampm_text, sizeof( secs_ampm_text ),
              clock_is_24h_style() ? "" : "%p", tick_time );
    text_layer_set_text( text_secs_ampm_layer, secs_ampm_text );
    update_secs_ampm_layer_background();
  }

  // reset weather if outdated
  if (tick_time->tm_sec == 0 && // one minute passed
      weather_timeout_minutes)
  {
      weather_timeout_minutes--;
      if (! weather_timeout_minutes)
      {
          APP_LOG( APP_LOG_LEVEL_DEBUG, "Weather status timeouted!" );

          temperature_text[0] = '\0';
          if (temp_layer) { text_layer_set_text(temp_layer, temperature_text); }

          replace_weather_icon(RESOURCE_ID_NA);
      }
  }
}

/*
  Handle update in settings
*/

// validate upper limit (can not be higher, than 1)
// mind: value is unsigned, so it can not be less than 0
#define VALIDATE_BOOL(value) if (value > 1) return;

#define VALIDATE_MAXIMUM(name, value, max) \
if (value > (uint32_t)(max)) \
{ \
    APP_LOG( APP_LOG_LEVEL_ERROR, "%s boundary error: %lu is not less or equal than %lu", name, (unsigned long)value, (unsigned long)(max) ); \
    return; \
}

static bool tuple_read_uint32(const Tuple *tuple, uint32_t *value) {
  if (!tuple || !value) { return false; }
  if (tuple->type == TUPLE_UINT) {
    switch (tuple->length) {
      case 1: *value = tuple->value->uint8;  return true;
      case 2: *value = tuple->value->uint16; return true;
      case 4: *value = tuple->value->uint32; return true;
      default: return false;
    }
  }
  if (tuple->type == TUPLE_INT) {
    int32_t signed_value;
    switch (tuple->length) {
      case 1: signed_value = tuple->value->int8;  break;
      case 2: signed_value = tuple->value->int16; break;
      case 4: signed_value = tuple->value->int32; break;
      default: return false;
    }
    if (signed_value < 0) { return false; }
    *value = (uint32_t)signed_value;
    return true;
  }
  return false;
}

static bool valid_bt_repeat(uint32_t value) {
  return value == 0 || value == 10000 || value == 30000 || value == 60000 ||
         value == 120000 || value == 300000;
}

static void tuple_changed_callback( const uint32_t key, const Tuple* tuple_new, const Tuple* tuple_old, void* context )
{
  uint32_t uint_value = 0;
  bool is_numeric = key != SETTING_TEMPERATURE_KEY && key != DRAW_PALETTE_KEY;
  if (is_numeric && !tuple_read_uint32(tuple_new, &uint_value)) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "wrong tuple type/size for key %lu", (unsigned long)key);
    return;
  }
  uint8_t value = (uint8_t)uint_value;

  // APP_LOG( APP_LOG_LEVEL_DEBUG, "tuple_changed_callback: %lu", key );

  switch ( key )
  {
    case SETTING_LANGUAGE_KEY:
      VALIDATE_MAXIMUM("SETTING_LANGUAGE_KEY", uint_value, LANG_END)

      persist_write_int( SETTING_LANGUAGE_KEY, value );
      current_language = value;
      set_days_text();        // refresh the day strip for the new language
      break;

    case SETTING_FORMAT_KEY:
      VALIDATE_MAXIMUM("SETTING_FORMAT_KEY", uint_value, FORMAT_END)

      persist_write_int( SETTING_FORMAT_KEY, value );
      current_format = value;
      break;

    case BACKGROUND_KEY:
      VALIDATE_MAXIMUM("BACKGROUND", uint_value, BGND_END)

      persist_write_int( BACKGROUND_KEY, value );
      current_background = value;
#ifdef PBL_COLOR
      bgcol();
#else
      if (frame_layer) { layer_mark_dirty(frame_layer); }
#endif
      break;

    case CUSTOMCOL0_KEY:
    case CUSTOMCOL1_KEY:
    case CUSTOMCOL2_KEY:
    case CUSTOMCOL3_KEY: {
      if (uint_value > 0xFFFFFF) { return; }
      persist_write_int( key, uint_value );
      apply_legacy_custom_color((int)key - CUSTOMCOL0_KEY, uint_value);
      persist_draw_palette();
      apply_custom_colors();
      break;
    }

    case DRAW_PALETTE_KEY:
      if (tuple_new->type != TUPLE_BYTE_ARRAY ||
          !draw_palette_is_valid(tuple_new->value->data, tuple_new->length)) {
        APP_LOG(APP_LOG_LEVEL_ERROR, "invalid draw palette");
        return;
      }
      memcpy(draw_palette, tuple_new->value->data, DRAW_PALETTE_LEN);
      persist_draw_palette();
      apply_custom_colors();
      if (battery_layer) { layer_mark_dirty(battery_layer); }
      if (qt_layer) { layer_mark_dirty(qt_layer); }
      if (bluetooth_layer) { layer_mark_dirty(bluetooth_layer); }
      if (popup_layer) { layer_mark_dirty(popup_layer); }
      break;

    case BATTERY_COLORIZED_KEY:
      VALIDATE_BOOL(uint_value)
      persist_write_int(BATTERY_COLORIZED_KEY, uint_value);
      battery_colorized = value;
      if (battery_layer) { layer_mark_dirty(battery_layer); }
      break;

    case SETTING_ICON_KEY:
      VALIDATE_MAXIMUM("SETTING_ICON_KEY", uint_value, ARRAY_LENGTH(WEATHER_ICONS) - 1)
      replace_weather_icon(WEATHER_ICONS[uint_value]);
      break;

    case SETTING_TEMPERATURE_KEY:
      if (tuple_new->type != TUPLE_CSTRING) { return; }
      if (tuple_new->length == 0) { return; }
      snprintf(temperature_text, sizeof(temperature_text), "%.*s",
               (int)tuple_new->length - 1, tuple_new->value->cstring);
      if (temp_layer) { text_layer_set_text(temp_layer, temperature_text); }

      weather_timeout_minutes = 240; // 4 hours
//      weather_timeout_minutes = 180; // 3 hours
      break;

    case SETTING_HIDEWEATHER_KEY:
      VALIDATE_BOOL(uint_value)

      persist_write_int( SETTING_HIDEWEATHER_KEY, value );
      hideweather = value;

      if (temp_layer) {
        layer_set_frame(text_layer_get_layer(temp_layer), !hideweather ? TEMP_RECT : EMPTY_RECT);
      }
      if (icon_layer) {
        layer_set_frame(bitmap_layer_get_layer(icon_layer), !hideweather ? ICON_RECT : EMPTY_RECT);
      }
      break;

    case BLUETOOTHVIBE_KEY:
      VALIDATE_BOOL(uint_value)

      persist_write_int( BLUETOOTHVIBE_KEY, value );
      bluetoothvibe_status = value;
      bt_alert_reconfigure();
      break;

    case HOURLYVIBE_KEY:
      VALIDATE_BOOL(uint_value)

      persist_write_int( HOURLYVIBE_KEY, value );
      hourlyvibe_status = value;
      break;

    case SECS_KEY:
      VALIDATE_BOOL(uint_value)

      persist_write_int( SECS_KEY, value );
      secs_instead_of_ampm = value;

      tick_timer_service_unsubscribe();
      if (secs_instead_of_ampm) {
        tick_timer_service_subscribe(SECOND_UNIT, handle_tick);
      } else {
        tick_timer_service_subscribe(MINUTE_UNIT, handle_tick);
      }

      update_secs_ampm_layer_background();
      break;

    case SETTING_INVERT_KEY:
      VALIDATE_BOOL(uint_value)

      persist_write_int( SETTING_INVERT_KEY, value );
      invert_format = value;

      invert_screen(invert_format);
      break;

    case SETTING_TEXTCOL_KEY:
      {
      if (uint_value > 0xFFFFFF) { return; }
      uint32_t textcol_int = uint_value;

      persist_write_int( SETTING_TEXTCOL_KEY, textcol_int);
      textcol_rgb = textcol_int;
      textcol = GColorFromHEX(textcol_int);

      text_layer_set_text_color(text_time_layer, textcol);
      text_layer_set_text_color(text_date_layer, textcol);
      }
      break;

    case BACKGROUNDCOL_KEY:
      {
      if (uint_value > 0xFFFFFF) { return; }
      uint32_t backgroundcol_int = uint_value;

      persist_write_int( BACKGROUNDCOL_KEY, backgroundcol_int);
      backgroundcol_rgb = backgroundcol_int;
      backgroundcol = GColorFromHEX(backgroundcol_int);

      window_set_background_color(window, backgroundcol);
      if (popup_layer) { layer_mark_dirty(popup_layer); }

      if (battery_text_layer) { text_layer_set_background_color(battery_text_layer, backgroundcol); }
      update_secs_ampm_layer_background();
      if (bluetooth_layer) { layer_mark_dirty(bluetooth_layer); }
#ifdef PBL_HEALTH
      if (footprint_layer) { bitmap_layer_set_background_color(footprint_layer, backgroundcol); }
#endif
      if (battery_layer) { layer_mark_dirty(battery_layer); }
#ifdef HAS_HRM
      apply_bpm_layout();
#endif
	  }
      break;

    case BATTERY_BACKGROUND_KEY:
      VALIDATE_MAXIMUM("BATTERY_BACKGROUND_KEY", uint_value, BATTBG_END)

      persist_write_int( BATTERY_BACKGROUND_KEY, value );
      battery_background = value;
      if (battery_layer) { layer_mark_dirty(battery_layer); }
      break;

    case STARTDAY_KEY:
      VALIDATE_BOOL(uint_value)

      persist_write_int( STARTDAY_KEY, value );
      startday_is_sunday = value;

      set_days_text();
      break;

    case BOTTOM_RIGHT_KEY:                  // 0 = Step Count, 1 = Extra Date
      VALIDATE_BOOL(uint_value)

      persist_write_int( BOTTOM_RIGHT_KEY, value );
      steps_status = (value == 0);

#ifdef PBL_HEALTH
      update_health_subscription();
#endif

#ifdef HAS_HRM
      apply_bpm_layout();
#elif defined(PBL_HEALTH)
      // steps_label / footprint_layer only exist when PBL_HEALTH is defined; on
      // health-less platforms (aplite) they are NULL and must not be touched.
      if (steps_label) { layer_set_hidden(text_layer_get_layer(steps_label), !steps_status); }
      if (footprint_layer) { layer_set_hidden(FOOTPRINT_LAYER_GET(footprint_layer), !steps_status); }
      layer_set_hidden(text_layer_get_layer(text_week_layer),    steps_status);
#endif
      break;
	  
	  case OTHER_TEXT_COL:
      {
      if (uint_value > 0xFFFFFF) { return; }
      uint32_t other_textcol_int = uint_value;

      persist_write_int( OTHER_TEXT_COL, other_textcol_int);
      other_textcol_rgb = other_textcol_int;
      othertextcol = GColorFromHEX(other_textcol_int);

      text_layer_set_text_color(temp_layer, othertextcol);
      text_layer_set_text_color(text_week_layer, othertextcol);
      text_layer_set_text_color(text_days_layer, othertextcol);
      refresh_today_highlight_effect();   /* the marker snaps between these two colours */
#ifdef PBL_HEALTH
      if (steps_label) { text_layer_set_text_color(steps_label, othertextcol); }
#endif
      text_layer_set_text_color(text_secs_ampm_layer, othertextcol);
      text_layer_set_text_color(battery_text_layer, othertextcol);
#ifdef HAS_HRM
      if (bpm_layer) { text_layer_set_text_color(bpm_layer, othertextcol); }
#endif
      }
      break;

    case BOTTOM_LEFT_KEY:                   // 0 = Heart Rate, 1 = Abbreviated Date
      VALIDATE_BOOL(uint_value)

      persist_write_int( BOTTOM_LEFT_KEY, value );
      show_heart_rate = (value == 0) && hr_available;
      if (value == 0 && !hr_available) { persist_write_int(BOTTOM_LEFT_KEY, 1); }

#ifdef HAS_HRM
#ifdef PBL_HEALTH
      update_health_subscription();
#endif
      apply_bpm_layout();
#endif
      break;

    case DATE_BRACKET_KEY:
      VALIDATE_BOOL(uint_value)

      persist_write_int( DATE_BRACKET_KEY, value );
      date_in_bracket = value;

#ifdef HAS_HRM
      apply_bpm_layout();
#endif
      break;

    case BT_VIBE_PATTERN_KEY:
      VALIDATE_MAXIMUM("BT_VIBE_PATTERN_KEY", uint_value, 8)
      persist_write_int( BT_VIBE_PATTERN_KEY, value );
      bt_vibe_pattern = value;
      break;

    case BT_VIBE_REPEAT_KEY:
      if (!valid_bt_repeat(uint_value)) { return; }
      persist_write_int( BT_VIBE_REPEAT_KEY, (int32_t)uint_value );
      bt_vibe_repeat_ms = (int)uint_value;
      bt_alert_reconfigure();
      break;

    case BT_POPUP_KEY:
      VALIDATE_BOOL(uint_value)
      persist_write_int( BT_POPUP_KEY, value );
      bt_popup = value;
      bt_alert_reconfigure();
      break;

    default:
      APP_LOG(APP_LOG_LEVEL_INFO, "unknown tuple key: %u", (uint8_t) key);
  }

  // Refresh display
  update_time();
}

/*
  Handle errors
*/
static void app_error_callback( DictionaryResult dict_error, AppMessageResult app_message_error, void* context ) {
  APP_LOG( APP_LOG_LEVEL_ERROR, "app error: %d", app_message_error );
//  vibes_double_pulse();
}

#define MESSAGING_RETRY_MAX 3
#define MESSAGING_RETRY_MS  5000

static void initialize_messaging(void);

static void messaging_retry_cb(void *context) {
  messaging_retry_timer = NULL;
  initialize_messaging();
}

static void schedule_messaging_retry(void) {
  if (messaging_retry_timer || messaging_retry_count >= MESSAGING_RETRY_MAX) { return; }
  messaging_retry_count++;
  messaging_retry_timer = app_timer_register(MESSAGING_RETRY_MS, messaging_retry_cb, NULL);
  if (!messaging_retry_timer) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "Unable to allocate AppMessage retry timer");
  }
}

/* AppSync has a void initializer, so validate both prerequisites ourselves:
   the backing dictionary size before initialization and a required tuple after
   initialization. A failed bridge never prevents the watchface from rendering;
   it merely leaves phone-side configuration unavailable for this session after
   bounded retries. */
static void initialize_messaging(void) {
  if (app_sync_initialized) { return; }

  Tuplet initial_values[] = { TupletInteger( SETTING_HIDEWEATHER_KEY, hideweather )
                            , TupletInteger( SETTING_LANGUAGE_KEY, current_language )
                            , TupletInteger( SETTING_FORMAT_KEY, current_format )
                            , TupletInteger( BACKGROUND_KEY, current_background )
                            , TupletInteger( BLUETOOTHVIBE_KEY, bluetoothvibe_status )
                            , TupletInteger( HOURLYVIBE_KEY, hourlyvibe_status )
                            , TupletInteger( SECS_KEY, secs_instead_of_ampm )
                            , TupletInteger( SETTING_ICON_KEY, (uint8_t) 14)
                            , TupletCString( SETTING_TEMPERATURE_KEY, "")
                            , TupletInteger( SETTING_INVERT_KEY, invert_format)
                            , TupletInteger( SETTING_TEXTCOL_KEY, textcol_rgb)
                            , TupletInteger( STARTDAY_KEY, startday_is_sunday )
                            , TupletInteger( BOTTOM_RIGHT_KEY, steps_status ? 0 : 1 )
                            , TupletInteger( BACKGROUNDCOL_KEY, backgroundcol_rgb )
                            , TupletInteger( BATTERY_BACKGROUND_KEY, battery_background )
                            , TupletInteger( OTHER_TEXT_COL, other_textcol_rgb)
                            , TupletInteger( BOTTOM_LEFT_KEY, show_heart_rate ? 0 : 1 )
                            , TupletInteger( DATE_BRACKET_KEY, date_in_bracket )
                            , TupletInteger( BT_VIBE_PATTERN_KEY, bt_vibe_pattern )
                            , TupletInteger( BT_VIBE_REPEAT_KEY, bt_vibe_repeat_ms )
                            , TupletInteger( BT_POPUP_KEY, bt_popup )
                            , TupletInteger( STEPS_KEY, steps_status )
                            , TupletInteger( BPM_MODE_KEY, 0 )
                            , TupletBytes( DRAW_PALETTE_KEY, draw_palette, DRAW_PALETTE_LEN )
                            , TupletInteger( BATTERY_COLORIZED_KEY, battery_colorized ) };

  uint32_t required = dict_calc_buffer_size_from_tuplets(
      initial_values, ARRAY_LENGTH(initial_values));
  if (!required || required > sizeof(sync_buffer)) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "AppSync buffer too small: need %lu, have %u",
            (unsigned long)required, (unsigned)sizeof(sync_buffer));
    return;  // deterministic configuration error; retrying cannot repair it
  }

  if (!app_message_opened) {
    AppMessageResult open_result = app_message_open(512, 256);
    if (open_result != APP_MSG_OK) {
      APP_LOG(APP_LOG_LEVEL_ERROR, "app_message_open failed: %d", open_result);
      schedule_messaging_retry();
      return;
    }
    app_message_opened = true;
  }

  app_sync_init(&app, sync_buffer, sizeof(sync_buffer), initial_values,
                ARRAY_LENGTH(initial_values), tuple_changed_callback,
                app_error_callback, NULL);
  app_sync_initialized = true;
  if (!app_sync_get(&app, SETTING_LANGUAGE_KEY)) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "app_sync_init did not create its initial dictionary");
    app_sync_deinit(&app);
    app_sync_initialized = false;
    schedule_messaging_retry();
    return;
  }
  messaging_retry_count = 0;
}

/*
  Force update of time
*/
void update_time() {
  // Get current time
  time_t now = time( NULL );
  struct tm *tick_time = localtime( &now );

  // Force update to avoid a blank screen at startup of the watchface
  handle_tick(tick_time, 0);
}

// Refresh the step-count readout from today's step total.
#ifdef PBL_HEALTH
static void refresh_steps(void) {
  static char s_steps_buf[16];
  snprintf(s_steps_buf, sizeof(s_steps_buf), "%d", (int)health_service_sum_today(HealthMetricStepCount));
  if (steps_label) { text_layer_set_text(steps_label, s_steps_buf); }
}
#endif

#ifdef HAS_HRM
// Refresh the heart-rate readout from the most recent BPM sample.
static void refresh_bpm(void) {
#ifdef PBL_HEALTH
  HealthValue v = health_service_peek_current_value(HealthMetricHeartRateBPM);
  if (v > 0) {
    int bpm = v > 999 ? 999 : (int)v;
    snprintf(bpm_text, sizeof(bpm_text), "%d", bpm);
  }
  else       { snprintf(bpm_text, sizeof(bpm_text), "--"); }
#else
  snprintf(bpm_text, sizeof(bpm_text), "--");
#endif
  if (bpm_layer) { text_layer_set_text(bpm_layer, bpm_text); }
}

// Lay out the bottom area per the Bottom-Left / Bottom-Right info choices.
static void apply_bpm_layout(void) {
  bool show_extra = !steps_status;   // bottom-right shows steps OR the extra date
  bool show_hr = show_heart_rate && hr_available;

  // Bottom-left: heart-rate readout (icon + BPM).
  if (bpm_layer) { layer_set_hidden(text_layer_get_layer(bpm_layer), !show_hr); }
  if (heart_layer) { layer_set_hidden(bitmap_layer_get_layer(heart_layer), !show_hr); }

  // Bottom-right: step count vs the extra date (mutually exclusive).
  if (steps_label) { layer_set_hidden(text_layer_get_layer(steps_label), !steps_status); }
  if (footprint_layer) { layer_set_hidden(FOOTPRINT_LAYER_GET(footprint_layer), !steps_status); }
  if (text_week_layer) { layer_set_hidden(text_layer_get_layer(text_week_layer), !show_extra); }

  // Month-day date: bottom-left when it is the chosen left info; in the lower
  // bracket when heart rate is left and "Date in LCARS Bracket" is on; else hidden.
  if (!show_hr) {
    layer_set_hidden(text_layer_get_layer(text_date_layer), false);
    layer_set_frame(text_layer_get_layer(text_date_layer), DATE_RECT);
    text_layer_set_font(text_date_layer, font_date);
    text_layer_set_text_alignment(text_date_layer, GTextAlignmentLeft);
    text_layer_set_background_color(text_date_layer, GColorClear);
  } else {
    // With heart rate on the left, the separate preference decides whether the
    // month-day date moves into the lower bracket or is omitted.
    layer_set_hidden(text_layer_get_layer(text_date_layer), !date_in_bracket);
    text_layer_set_font(text_date_layer, small_batt);
    text_layer_set_text_alignment(text_date_layer, GTextAlignmentCenter);
    text_layer_set_background_color(text_date_layer, backgroundcol);
  }

  if (show_hr)       { refresh_bpm(); }
  if (steps_status)    { refresh_steps(); }
}
#endif

/*
  Initialization
*/
/* Uncomment ONLY for emulator BT-dialog capture (forces the dialog on boot). Keep OFF for release. */
// #define FORCE_BT_DIALOG 1

void handle_init( void ) {
  window = window_create();
  if (!window) { return; }
  window_stack_push( window, true );
  Layer *window_layer = window_get_root_layer( window );

#if defined(PBL_PLATFORM_EMERY)
  hr_available = true;
#elif defined(PBL_PLATFORM_DIORITE)
  hr_available = watch_info_get_model() == WATCH_INFO_MODEL_PEBBLE_2_HR;
#else
  hr_available = false;
#endif

  // Read persistent data

#define GET_PERSIST_VALUE_OR_DEFAULT(key, def) \
  persist_exists( key ) ? persist_read_int( key ) : def

  // Read watchface settings from persistent data or use default values
  hideweather          = GET_PERSIST_VALUE_OR_DEFAULT( SETTING_HIDEWEATHER_KEY,   false);
  current_language     = GET_PERSIST_VALUE_OR_DEFAULT( SETTING_LANGUAGE_KEY,      LANG_EN);
  current_format       = GET_PERSIST_VALUE_OR_DEFAULT( SETTING_FORMAT_KEY,        FORMAT_WEEK);
  current_background   = GET_PERSIST_VALUE_OR_DEFAULT( BACKGROUND_KEY,            BGND_BLUE);
  bluetoothvibe_status = GET_PERSIST_VALUE_OR_DEFAULT( BLUETOOTHVIBE_KEY,         true);
  hourlyvibe_status    = GET_PERSIST_VALUE_OR_DEFAULT( HOURLYVIBE_KEY ,           false);
  secs_instead_of_ampm = GET_PERSIST_VALUE_OR_DEFAULT( SECS_KEY,                  true);
  invert_format        = GET_PERSIST_VALUE_OR_DEFAULT( SETTING_INVERT_KEY,        false);
  textcol_rgb          = GET_PERSIST_VALUE_OR_DEFAULT( SETTING_TEXTCOL_KEY,       0xFFFFFF);
  startday_is_sunday   = GET_PERSIST_VALUE_OR_DEFAULT( STARTDAY_KEY,              true);
  steps_status         = GET_PERSIST_VALUE_OR_DEFAULT( STEPS_KEY,                 false);
  backgroundcol_rgb    = GET_PERSIST_VALUE_OR_DEFAULT( BACKGROUNDCOL_KEY,         0);
  battery_background   = GET_PERSIST_VALUE_OR_DEFAULT( BATTERY_BACKGROUND_KEY,    BATTBG_BLACK);
  other_textcol_rgb    = GET_PERSIST_VALUE_OR_DEFAULT( OTHER_TEXT_COL,            0xFFFFFF);
  show_heart_rate      = GET_PERSIST_VALUE_OR_DEFAULT( BPM_MODE_KEY,              false);
  date_in_bracket      = GET_PERSIST_VALUE_OR_DEFAULT( DATE_BRACKET_KEY,          false);
  battery_colorized   = GET_PERSIST_VALUE_OR_DEFAULT( BATTERY_COLORIZED_KEY,      false);
  // Load the versioned per-element palette. Version 1 is migrated in place by
  // retaining bytes 1..17 and appending the two new popup text colours. Older
  // region colours are expanded only if no valid packed palette can be recovered.
  bool palette_loaded = false;
  int palette_size = persist_get_size(DRAW_PALETTE_KEY);
  if (palette_size == DRAW_PALETTE_LEN) {
    uint8_t stored_palette[DRAW_PALETTE_LEN];
    int read = persist_read_data(DRAW_PALETTE_KEY, stored_palette, sizeof(stored_palette));
    if (read == DRAW_PALETTE_LEN && draw_palette_is_valid(stored_palette, sizeof(stored_palette))) {
      memcpy(draw_palette, stored_palette, sizeof(draw_palette));
      palette_loaded = true;
    }
  } else if (palette_size == DRAW_PALETTE_V1_LEN) {
    uint8_t old_palette[DRAW_PALETTE_V1_LEN];
    int read = persist_read_data(DRAW_PALETTE_KEY, old_palette, sizeof(old_palette));
    bool valid_v1 = read == DRAW_PALETTE_V1_LEN && old_palette[0] == 1;
    for (int i = 1; valid_v1 && i < DRAW_PALETTE_V1_LEN; i++) {
      valid_v1 = (old_palette[i] & 0xC0) == 0xC0;
    }
    if (valid_v1) {
      memcpy(&draw_palette[1], &old_palette[1], DRAW_PALETTE_V1_LEN - 1);
      draw_palette[0] = DRAW_PALETTE_VERSION;
      persist_draw_palette();
      palette_loaded = true;
    }
  }
  if (!palette_loaded) {
    for (int i = 0; i < 4; i++) {
      if (persist_exists(CUSTOMCOL0_KEY + i)) {
        apply_legacy_custom_color(i, (uint32_t)persist_read_int(CUSTOMCOL0_KEY + i));
      }
    }
    persist_draw_palette();
  }
  apply_custom_colors();
  // Clamp persisted enums to valid ranges. Without this, a corrupt or older/newer
  // build's persisted value would index day_lines[]/background_images_array[]/etc.
  // out of bounds on the next render -> crash. (tuple_changed_callback validates
  // incoming messages, but load-from-persist did not.)
  if (current_language > LANG_END) {
    current_language = LANG_EN;
    persist_write_int(SETTING_LANGUAGE_KEY, current_language);
  }
  if (current_format > FORMAT_END) {
    current_format = FORMAT_WEEK;
    persist_write_int(SETTING_FORMAT_KEY, current_format);
  }
  if (current_background > BGND_END) {
    current_background = BGND_BLUE;
    persist_write_int(BACKGROUND_KEY, current_background);
  }
  if (battery_background > BATTBG_END) {
    battery_background = BATTBG_BLACK;
    persist_write_int(BATTERY_BACKGROUND_KEY, battery_background);
  }
  // Versioned settings migrations.
  int _sv = persist_exists(SETTINGS_VERSION_KEY) ? persist_read_int(SETTINGS_VERSION_KEY) : 0;
  if ( _sv < 1 ) {            // clear bad Bottom-Left/Right values (old macro-precedence bug)
    persist_delete(BOTTOM_LEFT_KEY);
    persist_delete(BOTTOM_RIGHT_KEY);
  }
  if ( _sv < 2 ) {            // seed alert defaults without overwriting an existing preference
    if (!persist_exists(BT_POPUP_KEY)) { persist_write_int(BT_POPUP_KEY, 1); }
    if (!persist_exists(BLUETOOTHVIBE_KEY)) {
      persist_write_int(BLUETOOTHVIBE_KEY, 1);
      bluetoothvibe_status = true;
    }
    persist_write_int(SETTINGS_VERSION_KEY, 2);
  }
  // Bottom-Left/Right info (new dropdowns) supersede the old Heart-Rate / Steps
  // toggles; migrate by defaulting to the old behaviour, overridden if set.
  // NB: capture the macro result first — the macro has no parens, so a trailing
  // "== 0" would otherwise bind inside its ternary.
  int bl_default = show_heart_rate ? 0 : 1;
  int br_default = steps_status    ? 0 : 1;
  int bl_val = GET_PERSIST_VALUE_OR_DEFAULT( BOTTOM_LEFT_KEY,  bl_default );
  int br_val = GET_PERSIST_VALUE_OR_DEFAULT( BOTTOM_RIGHT_KEY, br_default );
  if (bl_val < 0 || bl_val > 1 || (!hr_available && bl_val == 0)) {
    bl_val = 1;
    persist_write_int(BOTTOM_LEFT_KEY, bl_val);
  }
  if (br_val < 0 || br_val > 1) {
    br_val = br_default;
    persist_write_int(BOTTOM_RIGHT_KEY, br_val);
  }
  show_heart_rate = (bl_val == 0) && hr_available;
  steps_status    = (br_val == 0);
  bt_vibe_pattern   = GET_PERSIST_VALUE_OR_DEFAULT( BT_VIBE_PATTERN_KEY, 1 );    // Red Alert
  bt_vibe_repeat_ms = GET_PERSIST_VALUE_OR_DEFAULT( BT_VIBE_REPEAT_KEY,  0 );    // off (once)
  bt_popup          = GET_PERSIST_VALUE_OR_DEFAULT( BT_POPUP_KEY,        true );
  if (bt_vibe_pattern < 0 || bt_vibe_pattern > 8) {
    bt_vibe_pattern = 1;
    persist_write_int(BT_VIBE_PATTERN_KEY, bt_vibe_pattern);
  }
  if (!valid_bt_repeat((uint32_t)bt_vibe_repeat_ms)) {
    bt_vibe_repeat_ms = 0;
    persist_write_int(BT_VIBE_REPEAT_KEY, bt_vibe_repeat_ms);
  }

  // fixing colors...
  othertextcol = GColorFromHEX(other_textcol_rgb);
  textcol = GColorFromHEX(textcol_rgb);
  backgroundcol = GColorFromHEX(backgroundcol_rgb);

  // set background color
  window_set_background_color(window, backgroundcol);

  // Adjust GRect for Hours and Minutes to compensate for missing AM/PM indicator
  if ( clock_is_24h_style() ) {
    TIME_RECT.origin.y = TIME_RECT.origin.y + 1;
  }

  // Load fonts

#if defined(PBL_PLATFORM_EMERY)
  // emery (200x228) uses fonts scaled up ~1.35x from basalt to match the larger
  // canvas (the Trekv5 reference renders these enlarged sizes).
  font_days   = fonts_load_custom_font( resource_get_handle( RESOURCE_ID_FONT_LCARS_27 ) );
  font_date   = fonts_load_custom_font( resource_get_handle( RESOURCE_ID_FONT_ANTONIO_24 ) );
  small_batt  = fonts_load_custom_font( resource_get_handle( RESOURCE_ID_FONT_LCARSB_26 ) );
  batt_font   = fonts_load_custom_font( resource_get_handle( RESOURCE_ID_FONT_LCARSB_29 ) );
  small_batt2 = fonts_load_custom_font( resource_get_handle( RESOURCE_ID_FONT_LCARS_24  ) );
  font_time   = fonts_load_custom_font( resource_get_handle( RESOURCE_ID_FONT_LCARS_92  ) );
#else
  font_days   = fonts_load_custom_font( resource_get_handle( RESOURCE_ID_FONT_LCARS_20 ) );
  font_date   = fonts_load_custom_font( resource_get_handle( RESOURCE_ID_FONT_ANTONIO_17 ) );  // test width-match: emery ANTONIO_24 * 144/200 = 17.3 (was 18 height-match, rendered wide -> date/week letters spread right of emery)
  small_batt  = fonts_load_custom_font( resource_get_handle( RESOURCE_ID_FONT_LCARSB_19 ) );
  small_batt2 = fonts_load_custom_font( resource_get_handle( RESOURCE_ID_FONT_LCARS_18  ) );
  font_time   = fonts_load_custom_font( resource_get_handle( RESOURCE_ID_FONT_LCARS_68  ) );  // optimal: tested 66/67/68 - 66 +84 RED (height), 67 +11 (green), 68 best. The clock's 51px width-fringe is the floor at 144px height-match
#endif

  // Background LCARS frame

  frame_layer = layer_create( layer_get_bounds( window_layer ) );
  if (frame_layer) {
    layer_set_update_proc(frame_layer, frame_layer_update);
    layer_add_child(window_layer, frame_layer);
  }

  // Setup battery layer
	
  battery_layer = layer_create( BATT_RECT );
  if (battery_layer) {
    layer_set_update_proc(battery_layer, battery_layer_update_proc);
    layer_add_child(window_layer, battery_layer);
  }

  battery_charging = gbitmap_create_with_resource( RESOURCE_ID_IMAGE_CHARGING );
  
  charging_layer = bitmap_layer_create( CHARGING_RECT );
  if (charging_layer) {
    bitmap_layer_set_bitmap(charging_layer, battery_charging);
    bitmap_layer_set_compositing_mode(charging_layer, GCompOpSet);
    layer_add_child(window_layer, bitmap_layer_get_layer(charging_layer));
  }

  // Setup bluetooth layer

  bluetooth_layer = layer_create( BT_RECT );
  if (bluetooth_layer) {
    layer_set_update_proc(bluetooth_layer, bluetooth_layer_update);
    layer_add_child(window_layer, bluetooth_layer);
  }

  // Setup time layer
	
  text_time_layer = setup_text_layer( TIME_RECT,
          GTextAlignmentRight,
          font_time );
  if (text_time_layer) {
    text_layer_set_text_color(text_time_layer, textcol);
    layer_add_child(window_layer, text_layer_get_layer(text_time_layer));
  }

  // Setup seconds / AM/PM layer

  text_secs_ampm_layer = setup_text_layer( SECS_AMPM_RECT, GTextAlignmentCenter, small_batt );
  if (text_secs_ampm_layer) {
    text_layer_set_text_color(text_secs_ampm_layer, othertextcol);
    layer_add_child(window_layer, text_layer_get_layer(text_secs_ampm_layer));
  }
  update_secs_ampm_layer_background();

  // set up battery text layer

#if defined(PBL_PLATFORM_EMERY)
  battery_text_layer = text_layer_create(GRect(64, 101, 35, 41));
#else
  battery_text_layer = text_layer_create(GRect(46, 76, 25, 30));  // left edge x37->46 so the opaque bg stops eating the frame's temp block (matches emery's scaled extent x64-99); right edge stays x71 -> "80" unmoved
#endif
  if (battery_text_layer) {
#if defined(PBL_PLATFORM_EMERY)
    text_layer_set_font(battery_text_layer, batt_font);
    text_layer_set_text_alignment(battery_text_layer, GTextAlignmentRight);
#else
    text_layer_set_font(battery_text_layer, small_batt);
    text_layer_set_text_alignment(battery_text_layer, GTextAlignmentRight);
#endif
    text_layer_set_text_color(battery_text_layer, othertextcol);
    text_layer_set_background_color(battery_text_layer, backgroundcol);
    layer_add_child(window_layer, text_layer_get_layer(battery_text_layer));
  }

  // Setup days line layer
  text_days_layer = setup_text_layer( DAYS_RECT
                                    , GTextAlignmentLeft
                                    , font_days );
  if (text_days_layer) {
    text_layer_set_text_color(text_days_layer, othertextcol);
    set_days_text();
    layer_add_child(window_layer, text_layer_get_layer(text_days_layer));
  }

  effect_layer2 = effect_layer_create(EMPTY_RECT);
  if (effect_layer2) {
    /* SATURATING inversion, matching the original Trekv4-OWM look: the block fills
       solid in the strip's own colour and today's glyphs knock out to the screen
       background at full contrast. A plain complement washed out as soon as the day
       strip was not pure white (grey text inverted to grey text). Colours are refreshed
       whenever either preference changes - see refresh_today_highlight_effect(). */
    refresh_today_highlight_effect();
    effect_layer_add_effect(effect_layer2, effect_day_highlight, &s_day_hl);
    layer_add_child(window_layer, effect_layer_get_layer(effect_layer2));
  }

  // Setup date layer

 text_date_layer = setup_text_layer( DATE_RECT
                                   , GTextAlignmentLeft
                                   , font_date );
  if (text_date_layer) {
    text_layer_set_text_color(text_date_layer, textcol);
    layer_add_child(window_layer, text_layer_get_layer(text_date_layer));
  }

  // Setup week layer

 text_week_layer = setup_text_layer( WEEK_RECT
                                   , GTextAlignmentRight
                                   , font_date );
  if (text_week_layer) {
    text_layer_set_text_color(text_week_layer, othertextcol);
    layer_add_child(window_layer, text_layer_get_layer(text_week_layer));
  }

  // Setup weather info

  icon_layer = bitmap_layer_create( !hideweather ? ICON_RECT : EMPTY_RECT );
  if (icon_layer) {
    bitmap_layer_set_compositing_mode(icon_layer, GCompOpSet);
    layer_add_child(window_layer, bitmap_layer_get_layer(icon_layer));
  }

  temp_layer = setup_text_layer( !hideweather ? TEMP_RECT : EMPTY_RECT
                                , GTextAlignmentLeft
                                , small_batt );
  if (temp_layer) {
    text_layer_set_text_color(temp_layer, othertextcol);
    text_layer_set_text(temp_layer, temperature_text);
    layer_add_child(window_layer, text_layer_get_layer(temp_layer));
  }

  if (!text_time_layer || !text_secs_ampm_layer || !battery_text_layer ||
      !text_days_layer || !text_date_layer || !text_week_layer || !temp_layer) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "Insufficient memory for core watchface text layers");
    return;
  }

#ifdef PBL_HEALTH

  // setup health layers
  footprint_icon = gbitmap_create_with_resource(RESOURCE_ID_IMAGE_FOOTPRINT);
  GRect footprintbounds = footprint_icon ? gbitmap_get_bounds(footprint_icon) : GRectZero;
#if defined(PBL_PLATFORM_EMERY)
  GRect footprintframe = GRect(170, 184, footprintbounds.size.w, footprintbounds.size.h);
#else
  GRect footprintframe = GRect(122, 135, footprintbounds.size.w, footprintbounds.size.h);
#endif
  footprint_layer = bitmap_layer_create(footprintframe);
  if (footprint_layer) {
    bitmap_layer_set_compositing_mode(footprint_layer, GCompOpSet);
    bitmap_layer_set_bitmap(footprint_layer, footprint_icon);
    bitmap_layer_set_background_color(footprint_layer, backgroundcol);
    layer_add_child(window_layer, bitmap_layer_get_layer(footprint_layer));
  }


#if defined(PBL_PLATFORM_EMERY)
  steps_label = text_layer_create(GRect(  94, 186, 74,  35 ));
#else
  steps_label = text_layer_create(GRect(  68, 137, 55,  26 ));
#endif
  if (steps_label) {
    text_layer_set_text_color(steps_label, othertextcol);
    text_layer_set_background_color(steps_label, GColorClear);
  text_layer_set_text_alignment(steps_label, GTextAlignmentRight);
  text_layer_set_font(steps_label, font_date);
    layer_add_child(window_layer, text_layer_get_layer(steps_label));
    layer_set_hidden(text_layer_get_layer(steps_label), true);
  }
  if (footprint_layer) { layer_set_hidden(bitmap_layer_get_layer(footprint_layer), true); }

#endif

#ifdef HAS_HRM
  // Heart-rate readout (heart icon + BPM). On emery it sits in the Month-Day date's
  // old spot (the date moves into the bracket); on diorite (Pebble 2 HR) it sits in
  // the bottom-left where the date would otherwise be.
  heart_bitmap = gbitmap_create_with_resource(RESOURCE_ID_IMAGE_HEART);
#if defined(PBL_PLATFORM_EMERY)
  heart_layer  = bitmap_layer_create(GRect(19, 191, 20, 18));
  bpm_layer    = setup_text_layer(GRect(44, 186, 72, 30), GTextAlignmentLeft, font_date);
#else  // diorite (144x168)
  heart_layer  = bitmap_layer_create(GRect(13, 140, 14, 13));
  bpm_layer    = setup_text_layer(GRect(32, 137, 55, 24), GTextAlignmentLeft, font_date);
#endif
  if (heart_layer) {
    bitmap_layer_set_bitmap(heart_layer, heart_bitmap);
    bitmap_layer_set_compositing_mode(heart_layer, GCompOpSet);
    layer_add_child(window_layer, bitmap_layer_get_layer(heart_layer));
  }
  if (bpm_layer) {
    text_layer_set_text_color(bpm_layer, othertextcol);
    text_layer_set_text(bpm_layer, bpm_text);
    layer_add_child(window_layer, text_layer_get_layer(bpm_layer));
  }

  apply_bpm_layout();
  // Draw the day strip + its today-highlight last (on top) so the moved date's
  // background can't clip them where the bracket-date box overlaps the strip.
  layer_remove_from_parent(text_layer_get_layer(text_days_layer));
  layer_add_child(window_layer, text_layer_get_layer(text_days_layer));
  if (effect_layer2) {
    layer_remove_from_parent(effect_layer_get_layer(effect_layer2));
    layer_add_child(window_layer, effect_layer_get_layer(effect_layer2));
  }

#endif

#ifdef PBL_HEALTH
#ifndef HAS_HRM
  if (steps_label) { layer_set_hidden(text_layer_get_layer(steps_label), !steps_status); }
  if (footprint_layer) { layer_set_hidden(FOOTPRINT_LAYER_GET(footprint_layer), !steps_status); }
  layer_set_hidden(text_layer_get_layer(text_week_layer), steps_status);
#endif
  update_health_subscription();
#endif

  // Quiet Time indicator. Added after every other watchface layer so nothing can paint
  // over it; only the disconnect popup and the full-screen inversion sit above it.
  qt_layer = layer_create( QT_RECT );
  if (qt_layer) {
    layer_set_update_proc(qt_layer, qt_layer_update);
    layer_set_hidden(qt_layer, true);
    layer_add_child(window_layer, qt_layer);
  }

  // Bluetooth-disconnect popup overlay (all platforms; drawn programmatically, hidden until needed).
  {
    // Classic LCARS dialog fonts (per-platform sizes; condensed LCARS face).
#if defined(PBL_PLATFORM_EMERY)
    popup_font      = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_LCARSA_30));
    popup_hint_font = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_LCARSP_18));
    popup_time_font = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_LCARS_14));
#else
    popup_font      = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_LCARSA_21));
    popup_hint_font = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_LCARSP_14));
    popup_time_font = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_FONT_LCARS_12));
#endif
    GRect _wb = layer_get_bounds(window_layer);
    // Panel sized to the parametric pill-bar frame geometry, centred on screen.
    GSize _fs = frame_popup_panel_size();
    popup_layer = layer_create(GRect((_wb.size.w - _fs.w) / 2, (_wb.size.h - _fs.h) / 2, _fs.w, _fs.h));
    if (popup_layer) {
      layer_set_update_proc(popup_layer, popup_update_proc);
      layer_add_child(window_layer, popup_layer);
      layer_set_hidden(popup_layer, true);
    }
  }

  // Subscribe to services
  initialize_messaging();
  tick_timer_service_subscribe( secs_instead_of_ampm ? SECOND_UNIT : MINUTE_UNIT, handle_tick );
  battery_state_service_subscribe(&handle_battery);
  bluetooth_connection_service_subscribe(&handle_bluetooth);
  app_focus_service_subscribe(handle_app_focus);
  runtime_services_subscribed = true;

  // init battery and bluetooth
  handle_battery( battery_state_service_peek() );
  handle_bluetooth( bluetooth_connection_service_peek() );

  // Force update to avoid a blank screen at startup of the watchface
  update_time();
  // Persisted inversion must be applied only after every ordinary layer exists,
  // so its effect layer remains above the complete watchface.
  invert_screen(invert_format);
#ifdef FORCE_BT_DIALOG   /* emulator capture only: force the BT dialog on boot (emu can't simulate a real disconnect) */
  if (popup_layer) { layer_set_hidden(popup_layer, false); flash_on = true; bt_shake_armed = true; layer_mark_dirty(popup_layer); }
#endif
}

/*
  Destroy GBitmap and BitmapLayer
*/
void destroy_graphics( GBitmap *image, BitmapLayer *layer ) {
  if (!layer) {
    if (image) { gbitmap_destroy(image); }
    return;
  }
  layer_remove_from_parent( bitmap_layer_get_layer( layer ) );
  bitmap_layer_destroy( layer );
  if ( image != NULL ) {
    gbitmap_destroy( image );
  }
}

/*
  dealloc
*/
void handle_deinit( void ) {
  if (messaging_retry_timer) {
    app_timer_cancel(messaging_retry_timer);
    messaging_retry_timer = NULL;
  }
  if (app_sync_initialized) {
    app_sync_deinit(&app);
    app_sync_initialized = false;
  } else if (app_message_opened) {
    app_message_deregister_callbacks();
  }
  app_message_opened = false;

  // Unsubscribe from services
  if (runtime_services_subscribed) {
    tick_timer_service_unsubscribe();
    battery_state_service_unsubscribe();
    bluetooth_connection_service_unsubscribe();
    app_focus_service_unsubscribe();
    runtime_services_subscribed = false;
  }

  // Destroy image objects
  if (frame_layer) { layer_destroy(frame_layer); }
  if (bluetooth_layer) { layer_destroy(bluetooth_layer); }
  destroy_graphics( icon_bitmap, icon_layer );

  // Battery layer images
  if (battery_layer) { layer_destroy(battery_layer); }

  if (battery_charging) { gbitmap_destroy(battery_charging); }
  if (charging_layer) { bitmap_layer_destroy(charging_layer); }

  // Destroy text objects
#ifdef HAS_HRM
  if (bpm_layer) { text_layer_destroy(bpm_layer); }
  destroy_graphics( heart_bitmap, heart_layer );
#endif
  // BT-disconnect alert teardown (all platforms)
  if (bt_repeat_timer)   { app_timer_cancel(bt_repeat_timer); }
  if (bt_vibe_end_timer) { app_timer_cancel(bt_vibe_end_timer); }
  if (bt_debounce_timer) { app_timer_cancel(bt_debounce_timer); }
  if (flash_timer)       { app_timer_cancel(flash_timer); }
  if (bt_accel_on)       { accel_data_service_unsubscribe(); }
  vibes_cancel();
  if (popup_layer)       { layer_destroy(popup_layer); }
  if (popup_font)      { fonts_unload_custom_font(popup_font); }
  if (popup_hint_font) { fonts_unload_custom_font(popup_hint_font); }
  if (popup_time_font) { fonts_unload_custom_font(popup_time_font); }
  if (text_time_layer) { text_layer_destroy(text_time_layer); }
  if (text_secs_ampm_layer) { text_layer_destroy(text_secs_ampm_layer); }
  if (text_days_layer) { text_layer_destroy(text_days_layer); }
  if (text_date_layer) { text_layer_destroy(text_date_layer); }
  if (text_week_layer) { text_layer_destroy(text_week_layer); }
  if (temp_layer) { text_layer_destroy(temp_layer); }
  if (qt_layer) { layer_destroy(qt_layer); }
  if (battery_text_layer) { text_layer_destroy(battery_text_layer); }

#ifdef PBL_HEALTH
  stop_health_services();
  if (steps_label) { text_layer_destroy(steps_label); }
  destroy_graphics( footprint_icon, footprint_layer );
#endif

  // other layers

  effect_layer_destroy(effect_layer2);
  if (effect_layer != NULL) {
      effect_layer_destroy(effect_layer);
  }

  // Destroy font objects
  if (font_time) { fonts_unload_custom_font(font_time); }
  if (font_days) { fonts_unload_custom_font(font_days); }
  if (font_date) { fonts_unload_custom_font(font_date); }
  if (small_batt) { fonts_unload_custom_font(small_batt); }
#if defined(PBL_PLATFORM_EMERY)
  if (batt_font) { fonts_unload_custom_font(batt_font); }
#endif
  if (small_batt2) { fonts_unload_custom_font(small_batt2); }

  // Destroy window (window_destroy frees its root layer; don't touch it separately)
  if (window) { window_destroy(window); }
}

/*
  Main process
*/
int main( void ) {
  handle_init();
  app_event_loop();
  handle_deinit();
}
