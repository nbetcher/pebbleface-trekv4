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
static enum backgroundKeys { BGND_BLUE = 0, BGND_LTBLUE, BGND_PURPLES, BGND_YELLOW, BGND_WHITE, BGND_GREY, BGND_RED, BGND_DKBLUE, BGND_LTGREEN, BGND_DKGREEN, BGND_DKBLUE2, BGND_BORG, BGND_END = BGND_BORG } current_background;
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
  OTHER_TEXT_COL
};

// All UI elements
static Window         *window;
static Layer          *window_layer;

EffectLayer           *effect_layer;
EffectLayer           *effect_layer2;

static GBitmap        *battery_empty;
static GBitmap        *battery_filled;
static GBitmap        *bluetooth_image;
static GBitmap        *icon_bitmap = NULL;

#ifndef PBL_PLATFORM_CHALK
static GBitmap        *battery_charging;
static BitmapLayer    *charging_layer;
#endif

static Layer          *battery_layer;
static BitmapLayer    *bluetooth_layer;
static BitmapLayer    *icon_layer;

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

static AppSync        app;
static uint8_t        sync_buffer[256];
static uint8_t 		  weather_timeout_minutes = 0;

int charge_percent = 0;

static GBitmap     *background_image;
static BitmapLayer *background_layer;


// Define layer rectangles (x, y, width, height)

#ifdef PBL_PLATFORM_CHALK
GRect TIME_RECT      = ConstantGRect(  0,  11, 131,  72 );
GRect SECS_AMPM_RECT = ConstantGRect( 132,  27,  30,  21 );
GRect DATE_RECT      = ConstantGRect(   0,   0,   0,   0 );
GRect WEEK_RECT      = ConstantGRect(  40, 132, 180,  50 );
GRect DAYS_RECT      = ConstantGRect(  38, 104, 140,  30 );
GRect BATT_RECT      = ConstantGRect(  72,  83,  60,  11 );
GRect BT_RECT        = ConstantGRect( 155,  83,  28,  21 );
GRect EMPTY_RECT     = ConstantGRect(   0,   0,   0,   0 );
GRect TEMP_RECT      = ConstantGRect( 140,  57,  40,  40 );
GRect ICON_RECT      = ConstantGRect(   0,   0,   0,   0 );
#elif defined(PBL_PLATFORM_EMERY)
GRect TIME_RECT      = ConstantGRect(  44,   8, 149,  97 );
GRect AMPM_RECT      = ConstantGRect( 171,   0,  35,  28 );
GRect SECS_AMPM_RECT = ConstantGRect( 167,   0,  31,  28 );
GRect DATE_RECT      = ConstantGRect(  15, 179, 111,  68 );
GRect WEEK_RECT      = ConstantGRect(   2, 179, 194,  68 );
GRect DAYS_RECT      = ConstantGRect(  25, 129, 190,  41 );
GRect BATT_RECT      = ConstantGRect( 111, 107,  64,  23 );
GRect CHARGING_RECT  = ConstantGRect( 131, 107,  27,  23 );
GRect BT_RECT        = ConstantGRect( 175, 108,  25,  23 );
GRect EMPTY_RECT     = ConstantGRect(   0,   0,   0,   0 );
GRect TEMP_RECT      = ConstantGRect(  26,  72,  54,  54 );
GRect ICON_RECT      = ConstantGRect(  24,  29,  27,  27 );
#else
GRect TIME_RECT      = ConstantGRect(  29,   5, 110,  72 );
GRect AMPM_RECT      = ConstantGRect( 123,   0,  25,  21 );
GRect SECS_AMPM_RECT = ConstantGRect( 123,   0,  23,  21 );
GRect DATE_RECT      = ConstantGRect(  11, 132,  80,  50 );
GRect WEEK_RECT      = ConstantGRect(  0,  132, 143,  50 );
GRect DAYS_RECT      = ConstantGRect(  17,  95, 140,  30 );
GRect BATT_RECT      = ConstantGRect(  82,  79,  49,  17 );
GRect CHARGING_RECT  = ConstantGRect(  97,  79,  20,  17 );
GRect BT_RECT        = ConstantGRect( 131,  79,  14,  17 );
GRect EMPTY_RECT     = ConstantGRect(   0,   0,   0,   0 );
GRect TEMP_RECT      = ConstantGRect(  18,  53,  40,  40 );
GRect ICON_RECT      = ConstantGRect(  16,  21,  20,  20 );
#endif

static const uint32_t background_images_array[] ={
  RESOURCE_ID_IMAGE_BACKGROUND1,
#ifdef PBL_COLOR
  RESOURCE_ID_IMAGE_BACKGROUND2,
  RESOURCE_ID_IMAGE_BACKGROUND3,
  RESOURCE_ID_IMAGE_BACKGROUND4,
  RESOURCE_ID_IMAGE_BACKGROUND5,
  RESOURCE_ID_IMAGE_BACKGROUND6,
  RESOURCE_ID_IMAGE_BACKGROUND7,
  RESOURCE_ID_IMAGE_BACKGROUND8,
  RESOURCE_ID_IMAGE_BACKGROUND9,
  RESOURCE_ID_IMAGE_BACKGROUND10,
  RESOURCE_ID_IMAGE_BACKGROUND11,
  RESOURCE_ID_IMAGE_BACKGROUND12
#endif
};

// Define placeholders for time and date
static char time_text[] = "00:00";
static char secs_ampm_text[] = "00";

// save battery charge status
static uint8_t battery_charge_percent = 0;

// Previous bluetooth connection status
static bool prev_bt_status = false;

#ifdef LANGUAGE_TESTING
  static int ct = 1;
  static int speed = 5;
#endif

static TextLayer *steps_label;
static GBitmap *footprint_icon;
static BitmapLayer *footprint_layer;

#ifdef PBL_HEALTH

static void health_handler(HealthEventType event, void *context) {
  static char s_value_buffer[20];
  if (event == HealthEventMovementUpdate) {
    // display the step count
    snprintf(s_value_buffer, sizeof(s_value_buffer),
             "%d", (int)health_service_sum_today(HealthMetricStepCount));
    text_layer_set_text(steps_label, s_value_buffer);
  }
}
#endif

/*
  Setup new TextLayer
*/
static TextLayer * setup_text_layer( GRect rect, GTextAlignment align , GFont font ) {
  TextLayer *newLayer = text_layer_create( rect );
  text_layer_set_text_color( newLayer, GColorWhite );
  text_layer_set_background_color( newLayer, GColorClear );
  text_layer_set_text_alignment( newLayer, align );
  text_layer_set_font( newLayer, font );

  return newLayer;
}

/*
  Handle bluetooth events
*/
void handle_bluetooth( bool connected ) {
  if ( bluetooth_image != NULL ) {
    gbitmap_destroy( bluetooth_image );
  }

  if ( connected ) {
    bluetooth_image = gbitmap_create_with_resource( RESOURCE_ID_IMAGE_BLUETOOTH );

  } else {
    bluetooth_image = gbitmap_create_with_resource( RESOURCE_ID_IMAGE_NO_BLUETOOTH );

    if ( prev_bt_status != connected && bluetoothvibe_status) {
      vibes_short_pulse();
    }
  }

  prev_bt_status = connected;
  bitmap_layer_set_bitmap( bluetooth_layer, bluetooth_image );
}

/*
  Handle battery events
*/
void handle_battery( BatteryChargeState charge_state ) {
  static char battery_text[] = "+100";

#ifndef PBL_PLATFORM_CHALK
  layer_set_hidden(bitmap_layer_get_layer( charging_layer ), !charge_state.is_charging);

  if ( charge_state.is_charging )
    snprintf(battery_text, sizeof(battery_text), "+%u", charge_state.charge_percent);
  else
#endif
    snprintf(battery_text, sizeof(battery_text), "%u", charge_state.charge_percent);

  battery_charge_percent = charge_state.charge_percent;

  // TODO: bitmap_layer_set_bitmap( battery_layer, battery_image);
  layer_mark_dirty(battery_layer); // re-draw
  text_layer_set_text(battery_text_layer, battery_text);
}

static void update_secs_ampm_layer_background() {
  // background should be clear, only if AM/PM mode is selected and the watch uses 24h style!
  text_layer_set_background_color(text_secs_ampm_layer,
      !secs_instead_of_ampm && clock_is_24h_style() ? GColorClear : backgroundcol);
}

static void battery_layer_update_proc(Layer *layer, GContext *ctx) {
    // init to battery layer's rectangle size
    GRect rect_empty  = layer_get_bounds(layer);
    GRect rect_filled = rect_empty;

    graphics_context_set_compositing_mode(ctx, (battery_background == BATTBG_BLACK ? GCompOpAssign : GCompOpSet));

    if (battery_background == BATTBG_SAME_AS_BG_COLOR)
    {
        graphics_context_set_fill_color(ctx, backgroundcol);
        graphics_fill_rect(ctx, rect_filled, 0, GCornerNone);
    }

    // Snap the filled/empty split to WHOLE bars. graphics_draw_bitmap_in_rect()
    // tiles the segment bitmap to fill the rect, and CLIPS when the rect is not a
    // whole multiple of the bitmap. The original code split the bar region at a raw
    // percentage of the pixel width, so the empty/filled boundary almost never fell
    // on a bar edge: the boundary bar was clipped to a thin stub, and a box width
    // that is not an exact multiple of the bar width clipped the final bar too.
    // Snapping the split AND the drawn widths to whole bars makes every bar render
    // in full, on a fixed grid, on every platform.
    int bar_w = gbitmap_get_bounds(battery_filled).size.w;
    if (bar_w < 1) bar_w = 1;
    int num_bars = rect_empty.size.w / bar_w;            // whole bars that fit the box
    int filled_bars;
    if      (battery_charge_percent >= 100) filled_bars = num_bars;
    else if (battery_charge_percent ==   0) filled_bars = 0;
    else    filled_bars = (battery_charge_percent * num_bars + 50) / 100; // rounded
    int empty_bars = num_bars - filled_bars;

    rect_empty.size.w     = empty_bars  * bar_w;         // empty bars on the left
    rect_filled.size.w    = filled_bars * bar_w;         // filled bars on the right
    rect_filled.origin.x += empty_bars  * bar_w;         // filled start after the empty

    // draw, if needed
    if (rect_empty.size.w)  graphics_draw_bitmap_in_rect(ctx, battery_empty,  rect_empty);
    if (rect_filled.size.w) graphics_draw_bitmap_in_rect(ctx, battery_filled, rect_filled);
}

void invert_screen(bool invert_format) {

 if (invert_format && effect_layer == NULL) {
    // Add inverter layer
    Layer *window_layer = window_get_root_layer(window);

    //creating effect layer with inverter effect
#ifdef PBL_PLATFORM_CHALK
    effect_layer = effect_layer_create(GRect(0,0,180,180));
#elif defined(PBL_PLATFORM_EMERY)
    effect_layer = effect_layer_create(GRect(0,0,200,228));
#else
    effect_layer = effect_layer_create(GRect(0,0,144,168));
#endif
    effect_layer_add_effect(effect_layer, effect_invert, NULL);
    layer_add_child(window_layer, effect_layer_get_layer(effect_layer));
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
    gbitmap_destroy(background_image);

    background_image = gbitmap_create_with_resource(
            background_images_array[current_background]);

    bitmap_layer_set_bitmap(background_layer, background_image);
    layer_set_hidden(bitmap_layer_get_layer(background_layer), false);
}
#endif

/*
  Handle tick events
*/
void handle_tick( struct tm *tick_time, TimeUnits notused ) {
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
    GRect hl;
    if (startday_is_sunday) {
      today = tick_time->tm_wday; if ( today < 0 ) { today = 6; }
      hl = highlight_rect2[current_language][today];
    } else {
      today = tick_time->tm_wday - 1; if ( today < 0 ) { today = 6; }
      hl = highlight_rect[current_language][today];
    }
#ifdef PBL_PLATFORM_EMERY
    // emery falls through to the basalt day-strip tables and uses the same 20px
    // day font, so the per-day highlight offsets are identical; only the strip's
    // origin differs. Shift the basalt highlight onto the emery day strip
    // (DAYS_RECT delta: x 25-17=+8, y ~131-98=+33).
    hl.origin.x += 8;
    hl.origin.y += 33;
#endif
    layer_set_frame( effect_layer_get_layer(effect_layer2), hl );
  }

#ifdef LANGUAGE_TESTING
  layer_set_frame( effect_layer_get_layer(effect_layer2), hightlight_rect[current_language][ct] );
  if ( tick_time->tm_sec % speed == 0 ) { ct++; }
  if ( ct == 7 ) { ct = 0; }
#endif

  strftime( date_text, sizeof( date_text ),
            date_formats[current_language], tick_time );
  if ( current_language == LANG_EN ) {
    strcat( date_text, ordinal_numbers[tick_time->tm_mday - 1] );
  } else {
    strcat( date_text, month_names_arr[current_language][tick_time->tm_mon] );
  }

  text_layer_set_text( text_date_layer, date_text );

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

          text_layer_set_text(temp_layer, "");

          gbitmap_destroy(icon_bitmap);
          icon_bitmap = gbitmap_create_with_resource(RESOURCE_ID_NA);
          bitmap_layer_set_bitmap(icon_layer, icon_bitmap);
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
if (value > (uint8_t)max) \
{ \
    APP_LOG( APP_LOG_LEVEL_ERROR, "%s boundary error: %u is not less or equal than %u", name, value, max ); \
    return; \
}

static void tuple_changed_callback( const uint32_t key, const Tuple* tuple_new, const Tuple* tuple_old, void* context )
{
  uint8_t value = tuple_new->value->uint8;

  // APP_LOG( APP_LOG_LEVEL_DEBUG, "tuple_changed_callback: %lu", key );

  switch ( key )
  {
    case SETTING_LANGUAGE_KEY:
      VALIDATE_MAXIMUM("SETTING_LANGUAGE_KEY", value, LANG_END)

      persist_write_int( SETTING_LANGUAGE_KEY, value );
      current_language = value;
      break;

    case SETTING_FORMAT_KEY:
      VALIDATE_MAXIMUM("SETTING_FORMAT_KEY", value, FORMAT_END)

      persist_write_int( SETTING_FORMAT_KEY, value );
      current_format = value;
      break;

    case BACKGROUND_KEY:
      VALIDATE_MAXIMUM("BACKGROUND", value, BGND_END)

#ifdef PBL_COLOR
      persist_write_int( BACKGROUND_KEY, value );
      current_background = value;

      bgcol();
#endif
      break;

    case SETTING_ICON_KEY:
      VALIDATE_MAXIMUM("SETTING_ICON_KEY", value, ARRAY_LENGTH(WEATHER_ICONS))

      if (icon_bitmap) {
        gbitmap_destroy(icon_bitmap);
      }
      icon_bitmap = gbitmap_create_with_resource(WEATHER_ICONS[tuple_new->value->uint8]);

      bitmap_layer_set_bitmap(icon_layer, icon_bitmap);
      break;

    case SETTING_TEMPERATURE_KEY:
      text_layer_set_text(temp_layer, tuple_new->value->cstring);

      weather_timeout_minutes = 240; // 4 hours
//      weather_timeout_minutes = 180; // 3 hours
      break;

    case SETTING_HIDEWEATHER_KEY:
      VALIDATE_BOOL(value)

      persist_write_int( SETTING_HIDEWEATHER_KEY, value );
      hideweather = value;

      layer_set_frame( text_layer_get_layer( temp_layer ),   !hideweather ? TEMP_RECT : EMPTY_RECT );
      layer_set_frame( bitmap_layer_get_layer( icon_layer ), !hideweather ? ICON_RECT : EMPTY_RECT );
      break;

    case BLUETOOTHVIBE_KEY:
      VALIDATE_BOOL(value)

      persist_write_int( BLUETOOTHVIBE_KEY, value );
      bluetoothvibe_status = value;
      break;

    case HOURLYVIBE_KEY:
      VALIDATE_BOOL(value)

      persist_write_int( HOURLYVIBE_KEY, value );
      hourlyvibe_status = value;
      break;

    case SECS_KEY:
      VALIDATE_BOOL(value)

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
      VALIDATE_BOOL(value)

      persist_write_int( SETTING_INVERT_KEY, value );
      invert_format = value;

      invert_screen(invert_format);
      break;

    case SETTING_TEXTCOL_KEY:
      {
#ifdef PBL_COLOR
      // TODO: value validation !
      uint32_t textcol_int = tuple_new->value->uint32;

      persist_write_int( SETTING_TEXTCOL_KEY, textcol_int);
      textcol = GColorFromHEX(textcol_int);

      text_layer_set_text_color(text_time_layer, textcol);
      text_layer_set_text_color(text_date_layer, textcol);
#else
      text_layer_set_text_color(text_time_layer, GColorWhite);
      text_layer_set_text_color(text_date_layer, GColorWhite);		  
#endif
      }
      break;

    case BACKGROUNDCOL_KEY:
      {
#ifdef PBL_COLOR
      // TODO: value validation !
      uint32_t backgroundcol_int = tuple_new->value->uint32;

      persist_write_int( BACKGROUNDCOL_KEY, backgroundcol_int);
      backgroundcol = GColorFromHEX(backgroundcol_int);

      window_set_background_color(window, backgroundcol);

      text_layer_set_background_color(battery_text_layer, backgroundcol);
      bitmap_layer_set_background_color( bluetooth_layer, backgroundcol);
      bitmap_layer_set_background_color( footprint_layer, backgroundcol);
#else
     window_set_background_color(window, GColorBlack);

      text_layer_set_background_color(battery_text_layer, GColorBlack);
      bitmap_layer_set_background_color( bluetooth_layer, GColorBlack);
 //     bitmap_layer_set_background_color( footprint_layer, GColorBlack);
#endif
	  }
      break;

    case BATTERY_BACKGROUND_KEY:
      VALIDATE_MAXIMUM("BATTERY_BACKGROUND_KEY", value, BATTBG_END)

      persist_write_int( BATTERY_BACKGROUND_KEY, value );
      battery_background = value;
      break;

    case STARTDAY_KEY:
      VALIDATE_BOOL(value)

      persist_write_int( STARTDAY_KEY, value );
      startday_is_sunday = value;

      if (startday_is_sunday) {
        text_layer_set_text( text_days_layer, day_lines2[current_language] );
      } else {
        text_layer_set_text( text_days_layer, day_lines[current_language] );
      }
      break;

    case STEPS_KEY:
      VALIDATE_BOOL(value)

      persist_write_int( STEPS_KEY, value );
      steps_status = value;

#ifdef PBL_HEALTH
      if (steps_status)
      {
        health_service_events_subscribe(health_handler, NULL);

        // force initial steps display
        health_handler(HealthEventMovementUpdate, NULL);

        layer_set_hidden(text_layer_get_layer(steps_label), false);
        layer_set_hidden(bitmap_layer_get_layer(footprint_layer), false);

#ifdef PBL_PLATFORM_CHALK
		  layer_set_hidden(text_layer_get_layer(text_week_layer), false);
#else
		  layer_set_hidden(text_layer_get_layer(text_week_layer), true);
#endif
	  } else {
        health_service_events_unsubscribe();

        layer_set_hidden(text_layer_get_layer(steps_label), true);
        layer_set_hidden(bitmap_layer_get_layer(footprint_layer), true);

        layer_set_hidden(text_layer_get_layer(text_week_layer), false);
      }
#endif
      break;
	  
	  case OTHER_TEXT_COL:
      {
#ifdef PBL_COLOR
      // TODO: value validation !
      uint32_t other_textcol_int = tuple_new->value->uint32;

      persist_write_int( OTHER_TEXT_COL, other_textcol_int);
      othertextcol = GColorFromHEX(other_textcol_int);

      text_layer_set_text_color(temp_layer, othertextcol);
      text_layer_set_text_color(text_week_layer, othertextcol);
      text_layer_set_text_color(steps_label, othertextcol);
      text_layer_set_text_color(text_secs_ampm_layer, othertextcol);
      text_layer_set_text_color(battery_text_layer, othertextcol);
#else
      text_layer_set_text_color(temp_layer, GColorWhite);
      text_layer_set_text_color(text_week_layer, GColorWhite);
   //   text_layer_set_text_color(steps_label, GColorWhite);
      text_layer_set_text_color(text_secs_ampm_layer, GColorWhite);
      text_layer_set_text_color(battery_text_layer, GColorWhite);
#endif
      }
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

/*
  Initialization
*/
void handle_init( void ) {
  uint32_t other_textcol_int, textcol_int, backgroundcol_int;

  window = window_create();
  window_stack_push( window, true );
  Layer *window_layer = window_get_root_layer( window );

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
  textcol_int          = GET_PERSIST_VALUE_OR_DEFAULT( SETTING_TEXTCOL_KEY,       (int)0xffffffff);
  startday_is_sunday   = GET_PERSIST_VALUE_OR_DEFAULT( STARTDAY_KEY,              true);
  steps_status         = GET_PERSIST_VALUE_OR_DEFAULT( STEPS_KEY,                 false);
  backgroundcol_int    = GET_PERSIST_VALUE_OR_DEFAULT( BACKGROUNDCOL_KEY,         0);
  battery_background   = GET_PERSIST_VALUE_OR_DEFAULT( BATTERY_BACKGROUND_KEY,    BATTBG_BLACK);
  other_textcol_int    = GET_PERSIST_VALUE_OR_DEFAULT( OTHER_TEXT_COL,            (int)0xffffffff);

  // fixing colors...
  othertextcol = GColorFromHEX(other_textcol_int);
  textcol = GColorFromHEX(textcol_int);
  backgroundcol = GColorFromHEX(backgroundcol_int);

  // Initial settings
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
                            , TupletInteger( SETTING_TEXTCOL_KEY, textcol_int)
                            , TupletInteger( STARTDAY_KEY, startday_is_sunday )
                            , TupletInteger( STEPS_KEY, steps_status )
                            , TupletInteger( BACKGROUNDCOL_KEY, backgroundcol_int )
                            , TupletInteger( BATTERY_BACKGROUND_KEY, battery_background )
                            , TupletInteger( OTHER_TEXT_COL, other_textcol_int)
                            };

  // Open AppMessage to transfers
  app_message_open( 256, 256 );

  // Initialize AppSync
  app_sync_init( &app, sync_buffer
               , sizeof( sync_buffer )
               , initial_values
               , ARRAY_LENGTH( initial_values )
               , tuple_changed_callback
               , app_error_callback
               , NULL
               );

  // set background color
  window_set_background_color(window, backgroundcol);

  // Adjust GRect for Hours and Minutes to compensate for missing AM/PM indicator
  if ( clock_is_24h_style() ) {
    TIME_RECT.origin.y = TIME_RECT.origin.y + 1;
  }

  // Load fonts

  font_days   = fonts_load_custom_font( resource_get_handle( RESOURCE_ID_FONT_LCARS_20  ) );
  font_date   = fonts_load_custom_font( resource_get_handle( RESOURCE_ID_FONT_LCARS_22  ) );
  small_batt  = fonts_load_custom_font( resource_get_handle( RESOURCE_ID_FONT_LCARSB_19 ) );
  small_batt2 = fonts_load_custom_font( resource_get_handle( RESOURCE_ID_FONT_LCARS_18  ) );
#ifdef PBL_PLATFORM_CHALK
  font_time   = fonts_load_custom_font( resource_get_handle( RESOURCE_ID_FONT_LCARS_64 ) );
#else
  font_time   = fonts_load_custom_font( resource_get_handle( RESOURCE_ID_FONT_LCARS_68  ) );
#endif

  // Background image
	
  background_image = gbitmap_create_with_resource(
          background_images_array[current_background]);
  background_layer = bitmap_layer_create( layer_get_bounds( window_layer ) );
  bitmap_layer_set_bitmap( background_layer, background_image );
  bitmap_layer_set_compositing_mode( background_layer, GCompOpSet);
  layer_add_child( window_layer, bitmap_layer_get_layer( background_layer ) );

  // Setup battery layer
	
  battery_layer = layer_create( BATT_RECT );
  layer_set_update_proc( battery_layer, battery_layer_update_proc );
  layer_add_child( window_layer, battery_layer );

  battery_empty = gbitmap_create_with_resource( RESOURCE_ID_IMAGE_BATT_EMPTY );
  battery_filled = gbitmap_create_with_resource( RESOURCE_ID_IMAGE_BATT_FILLED );
  
#ifndef PBL_PLATFORM_CHALK
  battery_charging = gbitmap_create_with_resource( RESOURCE_ID_IMAGE_CHARGING );
  
  charging_layer = bitmap_layer_create( CHARGING_RECT );
  bitmap_layer_set_bitmap(charging_layer, battery_charging);
  bitmap_layer_set_compositing_mode(charging_layer, GCompOpSet);
  layer_add_child( window_layer, bitmap_layer_get_layer( charging_layer ) );
#endif

  // Setup bluetooth layer
	
  bluetooth_layer = bitmap_layer_create( BT_RECT );
  bitmap_layer_set_compositing_mode(bluetooth_layer, GCompOpSet);
  bitmap_layer_set_background_color( bluetooth_layer, backgroundcol);
  layer_add_child( window_layer, bitmap_layer_get_layer( bluetooth_layer ) );

  // Setup time layer
	
  text_time_layer = setup_text_layer( TIME_RECT,
          GTextAlignmentRight,
          font_time );
  text_layer_set_text_color(text_time_layer, textcol);
  layer_add_child( window_layer, text_layer_get_layer( text_time_layer ) );

  // Setup seconds / AM/PM layer

  text_secs_ampm_layer = setup_text_layer( SECS_AMPM_RECT, GTextAlignmentCenter, small_batt );
  text_layer_set_text_color(text_secs_ampm_layer, othertextcol);
  layer_add_child( window_layer, text_layer_get_layer( text_secs_ampm_layer ) );
  update_secs_ampm_layer_background();

  // set up battery text layer

#ifdef PBL_PLATFORM_CHALK
  battery_text_layer = text_layer_create(GRect(49, 77, 22, 20));
  text_layer_set_font(battery_text_layer, small_batt2);
  text_layer_set_text_alignment(battery_text_layer, GTextAlignmentLeft);
#elif defined(PBL_PLATFORM_EMERY)
  battery_text_layer = text_layer_create(GRect(76, 102, 35, 41));
  text_layer_set_font(battery_text_layer, small_batt);
  text_layer_set_text_alignment(battery_text_layer, GTextAlignmentRight);
#else
  battery_text_layer = text_layer_create(GRect(48, 76, 34, 30));
  text_layer_set_font(battery_text_layer, small_batt);
  text_layer_set_text_alignment(battery_text_layer, GTextAlignmentRight);
#endif
  text_layer_set_text_color(battery_text_layer, othertextcol);
  text_layer_set_background_color(battery_text_layer, backgroundcol);
  layer_add_child(window_layer, text_layer_get_layer(battery_text_layer));

  // Setup days line layer
  text_days_layer = setup_text_layer( DAYS_RECT
                                    , GTextAlignmentLeft
                                    , font_days );
//   text_layer_set_text_color(text_days_layer, othertextcol);
	
 if (startday_is_sunday) {
    text_layer_set_text( text_days_layer, day_lines2[current_language] );
  } else {
    text_layer_set_text( text_days_layer, day_lines[current_language] );
  }
  layer_add_child( window_layer, text_layer_get_layer( text_days_layer ) );

  effect_layer2 = effect_layer_create(EMPTY_RECT);
  effect_layer_add_effect(effect_layer2,
#if PBL_COLOR
          effect_invert_bw_with_background, (void*)GColorWhiteARGB8);
#else
          effect_invert, NULL);
#endif
  layer_add_child((window_layer), effect_layer_get_layer(effect_layer2));

  // Setup date layer

#ifdef PBL_PLATFORM_CHALK
  text_date_layer = setup_text_layer( DATE_RECT
                                    , GTextAlignmentCenter
                                    , small_batt );
  text_layer_set_text_color(text_date_layer, textcol);
//  text_layer_set_text_color(text_date_layer, GColorBlack);
  text_layer_set_background_color(text_date_layer, GColorClear);
#else
 text_date_layer = setup_text_layer( DATE_RECT
                                   , GTextAlignmentLeft
                                   , font_date );
#endif
  layer_add_child( window_layer, text_layer_get_layer( text_date_layer ) );

  // Setup week layer

#ifdef PBL_PLATFORM_CHALK
  text_week_layer = setup_text_layer( WEEK_RECT
                                    , GTextAlignmentLeft
                                    , font_date );
#else
 text_week_layer = setup_text_layer( WEEK_RECT
                                   , GTextAlignmentRight
                                   , font_date );
#endif
  text_layer_set_text_color(text_week_layer, othertextcol);
  layer_add_child( window_layer, text_layer_get_layer( text_week_layer ) );

  // Setup weather info

  icon_layer = bitmap_layer_create( !hideweather ? ICON_RECT : EMPTY_RECT );
  bitmap_layer_set_compositing_mode( icon_layer, GCompOpSet);
  layer_add_child(window_layer, bitmap_layer_get_layer(icon_layer));

  temp_layer = setup_text_layer( !hideweather ? TEMP_RECT : EMPTY_RECT
                                , GTextAlignmentLeft
                                , small_batt );
    text_layer_set_text_color(temp_layer, othertextcol);
layer_add_child(window_layer, text_layer_get_layer(temp_layer));

#ifdef PBL_HEALTH

  // setup health layers
  footprint_icon = gbitmap_create_with_resource(RESOURCE_ID_IMAGE_FOOTPRINT);
  GRect footprintbounds = gbitmap_get_bounds(footprint_icon);
#ifdef PBL_PLATFORM_CHALK
  GRect footprintframe = GRect(57, 159, footprintbounds.size.w, footprintbounds.size.h);
#elif defined(PBL_PLATFORM_EMERY)
  GRect footprintframe = GRect(169, 183, footprintbounds.size.w, footprintbounds.size.h);
#else
  GRect footprintframe = GRect(122, 135, footprintbounds.size.w, footprintbounds.size.h);
#endif
  footprint_layer = bitmap_layer_create(footprintframe);
  bitmap_layer_set_compositing_mode(footprint_layer, GCompOpSet);
  bitmap_layer_set_bitmap(footprint_layer, footprint_icon);
  bitmap_layer_set_background_color( footprint_layer, backgroundcol);
  layer_add_child(window_layer, bitmap_layer_get_layer(footprint_layer));


#if defined(PBL_PLATFORM_EMERY)
  steps_label = text_layer_create(GRect(  94, 181, 74,  35 ));
#else
  steps_label = text_layer_create(PBL_IF_ROUND_ELSE(
    GRect(  71, 154, 90,  20 ),
    GRect(  68, 133, 55,  26 )));
#endif
  text_layer_set_text_color(steps_label, GColorWhite  );
  text_layer_set_background_color(steps_label, GColorClear);
#ifdef PBL_PLATFORM_CHALK
  text_layer_set_text_alignment(steps_label, GTextAlignmentLeft);
  text_layer_set_font(steps_label, small_batt2);
#else
  text_layer_set_text_alignment(steps_label, GTextAlignmentRight);
  text_layer_set_font(steps_label, font_date);
#endif
  layer_add_child(window_layer, text_layer_get_layer(steps_label));
  layer_set_hidden(text_layer_get_layer(steps_label), true);

#endif

  // Subscribe to services
  tick_timer_service_subscribe( secs_instead_of_ampm ? SECOND_UNIT : MINUTE_UNIT, handle_tick );
  battery_state_service_subscribe(&handle_battery);
  bluetooth_connection_service_subscribe(&handle_bluetooth);

  // init battery and bluetooth
  handle_battery( battery_state_service_peek() );
  handle_bluetooth( bluetooth_connection_service_peek() );

  // Force update to avoid a blank screen at startup of the watchface
  update_time();
}

/*
  Destroy GBitmap and BitmapLayer
*/
void destroy_graphics( GBitmap *image, BitmapLayer *layer ) {
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
  // Unsubscribe from services
  tick_timer_service_unsubscribe();
  battery_state_service_unsubscribe();
  bluetooth_connection_service_unsubscribe();

  // Destroy image objects
  destroy_graphics( background_image, background_layer );
  destroy_graphics( bluetooth_image, bluetooth_layer );
  destroy_graphics( icon_bitmap, icon_layer );

  // Battery layer images
  layer_destroy( battery_layer );
  gbitmap_destroy( battery_empty );
  gbitmap_destroy( battery_filled );

#ifndef PBL_PLATFORM_CHALK
  gbitmap_destroy( battery_charging );
  bitmap_layer_destroy(charging_layer);
#endif

  // Destroy text objects
  text_layer_destroy( text_time_layer );
  text_layer_destroy( text_secs_ampm_layer );
  text_layer_destroy( text_days_layer );
  text_layer_destroy( text_date_layer );
  text_layer_destroy( text_week_layer );
  text_layer_destroy( temp_layer );
  text_layer_destroy( battery_text_layer );

#ifdef PBL_COLOR
  health_service_events_unsubscribe();
  text_layer_destroy( steps_label );
  destroy_graphics( footprint_icon, footprint_layer );
#endif

  // other layers

  effect_layer_destroy(effect_layer2);
  if (effect_layer != NULL) {
      effect_layer_destroy(effect_layer);
  }

  // Destroy font objects
  fonts_unload_custom_font( font_time );
  fonts_unload_custom_font( font_days );
  fonts_unload_custom_font( font_date );
  fonts_unload_custom_font( small_batt );
  fonts_unload_custom_font( small_batt2 );

  // Clean up AppSync system
  app_sync_deinit( &app );

  // Destroy window
  layer_remove_from_parent(window_layer);
  layer_destroy(window_layer);

  window_destroy( window );
}

/*
  Main process
*/
int main( void ) {
  handle_init();
  app_event_loop();
  handle_deinit();
}
