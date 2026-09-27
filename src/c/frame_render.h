/* Parametric LCARS rendering: background frame, popup pill bars, BT glyphs.
   Replaces the per-platform PNG assets on every (rectangular) platform.
   Geometry + colour tables are maintained in frame_tables.h and fitted from
   verified-aligned assets; anti-aliasing is computed per pixel (8x8
   supersampled coverage, blended against the framebuffer and quantized to the
   panel's palette - identical maths to the asset pipeline's alpha edges). */
#pragma once
#include <pebble.h>

/* Draw the LCARS background frame for the given background index (backgroundKeys
   enum order). Colour platforms use the per-segment palette; b/w renders white.
   bg_index == FRAME_NBG draws the user "Custom" scheme (see frame_set_custom_colors). */
void frame_draw_background(GContext *ctx, Layer *layer, uint8_t bg_index);

/* Set one user-selected colour (GColor8 .argb byte) for each of the 13 drawn
   LCARS frame segments, in FRAME_SEGS order. */
void frame_set_custom_colors(const uint8_t segment_argb[13]);

/* Draw the BT-popup pill bars (top + bottom, end caps + centre bar) in the given
   accent colour. Call after filling the panel background, before drawing text. */
void frame_draw_popup_bars(GContext *ctx, Layer *layer, GColor accent);

/* Panel size of the popup frame (was the bitmap's size). */
GSize frame_popup_panel_size(void);

/* Draw the bluetooth rune (connected) or the no-BT glyph, centred in box,
   in the given colour. Exact pixels of the original art (code tables). */
void frame_draw_bt_glyph(GContext *ctx, GRect box, bool connected, GColor color);
/* Draw the Quiet Time "QT" glyph centred in the layer. Pixels that would match their
   backdrop are knocked out to black or white so the indicator is always visible. */
void frame_draw_qt_glyph(GContext *ctx, Layer *layer, GColor color);
