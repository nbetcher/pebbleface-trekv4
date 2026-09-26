/*
 * The active inversion effects are adapted from pebble-effect-layer by Yuriy
 * Galanter and contributors (MIT). See THIRD_PARTY_NOTICES.md.
 */
#include <pebble.h>
#include "effects.h"

typedef struct {
  GBitmap *bitmap;
  uint8_t *data;
  int bytes_per_row;
  GBitmapFormat format;
  GRect bounds;
} BitmapInfo;

static bool pixel_is_valid(const BitmapInfo *info, int x, int y) {
  if (!grect_contains_point(&info->bounds, &GPoint(x, y))) { return false; }
#ifdef PBL_ROUND
  if (info->format == GBitmapFormat8BitCircular) {
    GBitmapDataRowInfo row = gbitmap_get_data_row_info(info->bitmap, y);
    return x >= row.min_x && x <= row.max_x;
  }
#endif
  return true;
}

static uint8_t get_pixel(const BitmapInfo *info, int x, int y) {
  if (info->format == GBitmapFormat1Bit || info->format == GBitmapFormat1BitPalette) {
    return (info->data[y * info->bytes_per_row + x / 8] & (1 << (x % 8)))
        ? GColorWhiteARGB8 : GColorBlackARGB8;
  }
#ifdef PBL_ROUND
  if (info->format == GBitmapFormat8BitCircular) {
    return gbitmap_get_data_row_info(info->bitmap, y).data[x];
  }
#endif
  return info->data[y * info->bytes_per_row + x];
}

static void set_pixel(const BitmapInfo *info, int x, int y, uint8_t color) {
  if (info->format == GBitmapFormat1Bit || info->format == GBitmapFormat1BitPalette) {
    uint8_t *byte = &info->data[y * info->bytes_per_row + x / 8];
    uint8_t bit = (color & 0x3F) ? 1 : 0;
    *byte = (uint8_t)((*byte & ~(1 << (x % 8))) | (bit << (x % 8)));
    return;
  }
#ifdef PBL_ROUND
  if (info->format == GBitmapFormat8BitCircular) {
    gbitmap_get_data_row_info(info->bitmap, y).data[x] = color;
    return;
  }
#endif
  info->data[y * info->bytes_per_row + x] = color;
}

static bool capture_bitmap(GContext *ctx, GBitmap **framebuffer, BitmapInfo *info) {
  *framebuffer = graphics_capture_frame_buffer(ctx);
  if (!*framebuffer) { return false; }
  info->bitmap = *framebuffer;
  info->data = gbitmap_get_data(*framebuffer);
  info->bytes_per_row = gbitmap_get_bytes_per_row(*framebuffer);
  info->format = gbitmap_get_format(*framebuffer);
  info->bounds = gbitmap_get_bounds(*framebuffer);
  return info->data != NULL;
}

static void apply_invert(GContext *ctx, GRect position, bool black_white_only,
                         uint8_t background) {
  GBitmap *framebuffer;
  BitmapInfo info;
  if (!capture_bitmap(ctx, &framebuffer, &info)) {
    if (framebuffer) { graphics_release_frame_buffer(ctx, framebuffer); }
    return;
  }

  int min_x = position.origin.x;
  int min_y = position.origin.y;
  int max_x = min_x + position.size.w;
  int max_y = min_y + position.size.h;
  for (int y = min_y; y < max_y; y++) {
    for (int x = min_x; x < max_x; x++) {
      if (!pixel_is_valid(&info, x, y)) { continue; }
      uint8_t pixel = get_pixel(&info, x, y);
      if (!black_white_only) {
        set_pixel(&info, x, y, (uint8_t)(~pixel) | GColorBlackARGB8);
      } else if (pixel == GColorBlackARGB8) {
        set_pixel(&info, x, y, GColorWhiteARGB8);
      } else if (pixel == GColorWhiteARGB8) {
        set_pixel(&info, x, y, GColorBlackARGB8);
      } else {
        set_pixel(&info, x, y, background);
      }
    }
  }
  graphics_release_frame_buffer(ctx, framebuffer);
}

/* Saturating ("hard") inversion for the day-strip today marker.
 *
 * A plain complement is wrong once the strip is not pure white: inverting a grey
 * 0b101010 text colour yields another mid grey, so today reads as muddy grey-on-grey
 * instead of the original's hard black-on-white. Instead of complementing, snap every
 * pixel to one of the two colours that are actually in play - each pixel goes to
 * whichever of {ink, background} it is FURTHEST from. The block therefore fills solid
 * in the strip's own colour and the glyphs knock out to the screen background, at full
 * contrast, for ANY colour the user picks.
 *
 * param packs the two GColor8 bytes: (ink << 8) | background.
 */
static int argb_distance(uint8_t a, uint8_t b) {
  int dr = (int)((a >> 4) & 3) - (int)((b >> 4) & 3);
  int dg = (int)((a >> 2) & 3) - (int)((b >> 2) & 3);
  int db = (int)(a & 3) - (int)(b & 3);
  return dr * dr + dg * dg + db * db;
}

static void apply_hard_invert(GContext *ctx, GRect position, uint8_t ink, uint8_t bg) {
  GBitmap *framebuffer;
  BitmapInfo info;
  if (!capture_bitmap(ctx, &framebuffer, &info)) {
    if (framebuffer) { graphics_release_frame_buffer(ctx, framebuffer); }
    return;
  }
  int min_x = position.origin.x;
  int min_y = position.origin.y;
  int max_x = min_x + position.size.w;
  int max_y = min_y + position.size.h;
  for (int y = min_y; y < max_y; y++) {
    for (int x = min_x; x < max_x; x++) {
      if (!pixel_is_valid(&info, x, y)) { continue; }
      uint8_t pixel = get_pixel(&info, x, y);
      /* closer to the ink colour => it is a glyph pixel => knock it out to background,
         and vice versa. Anti-aliased edge pixels fall to whichever side they lean. */
      bool is_glyph = argb_distance(pixel, ink) <= argb_distance(pixel, bg);
      set_pixel(&info, x, y, is_glyph ? bg : ink);
    }
  }
  graphics_release_frame_buffer(ctx, framebuffer);
}

void effect_hard_invert(GContext *ctx, GRect position, void *param) {
  uintptr_t packed = (uintptr_t)param;
  apply_hard_invert(ctx, position, (uint8_t)((packed >> 8) & 0xFF), (uint8_t)(packed & 0xFF));
}

void effect_invert(GContext *ctx, GRect position, void *param) {
  (void)param;
  apply_invert(ctx, position, false, GColorBlackARGB8);
}

void effect_invert_bw_with_background(GContext *ctx, GRect position, void *param) {
  apply_invert(ctx, position, true, (uint8_t)(uintptr_t)param);
}
