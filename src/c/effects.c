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
  return true;
}

static uint8_t get_pixel(const BitmapInfo *info, int x, int y) {
  if (info->format == GBitmapFormat1Bit || info->format == GBitmapFormat1BitPalette) {
    return (info->data[y * info->bytes_per_row + x / 8] & (1 << (x % 8)))
        ? GColorWhiteARGB8 : GColorBlackARGB8;
  }
  return info->data[y * info->bytes_per_row + x];
}

static void set_pixel(const BitmapInfo *info, int x, int y, uint8_t color) {
  if (info->format == GBitmapFormat1Bit || info->format == GBitmapFormat1BitPalette) {
    uint8_t *byte = &info->data[y * info->bytes_per_row + x / 8];
    uint8_t bit = (color & 0x3F) ? 1 : 0;
    *byte = (uint8_t)((*byte & ~(1 << (x % 8))) | (bit << (x % 8)));
    return;
  }
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
 * contrast, for ANY colour the user picks. Used by effect_day_highlight.
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

/* Today marker for the day strip: a fixed-size block, centred on the glyphs.
 *
 * The layer frame (position) spans today's token plus `margin` pixels either side,
 * and the block's rows plus `accent` rows above them. Today's ink is found in the
 * framebuffer (pixels nearer the strip colour than the background, as
 * apply_hard_invert classifies them), so the block follows what is actually drawn for
 * any font or language instead of glyph advances:
 *   - it is box_w wide, centred on the ink, or wider when the ink needs min_pad a side;
 *   - its sides pull in evenly (never below min_pad) to stay `gap` pixels clear of a
 *     neighbouring day's ink;
 *   - it grows upward, into the accent rows, to sit 1px above an accent (Ú, Č).
 * The rows below the letters (bottom_pad) are not scanned, so nothing drawn under the
 * strip can move the block. It is then hard-inverted. */
#define DAY_HL_OVERHANG 2
void effect_day_highlight(GContext *ctx, GRect position, void *param) {
  const DayHighlightParams *p = (const DayHighlightParams *)param;
  if (!p) { return; }
  GBitmap *framebuffer;
  BitmapInfo info;
  if (!capture_bitmap(ctx, &framebuffer, &info)) {
    if (framebuffer) { graphics_release_frame_buffer(ctx, framebuffer); }
    return;
  }
  int frame_x0 = position.origin.x;
  int frame_x1 = position.origin.x + position.size.w;              /* exclusive */
  int block_top = position.origin.y + p->accent;
  int block_bottom = position.origin.y + position.size.h;           /* exclusive */
  /* Today's columns: the token's advance widened by DAY_HL_OVERHANG, since glyph ink
     can start before its pen position or run past its advance (LCARS 27 "a" and "j"
     do). The double spaces keep neighbouring days clear of that slack. */
  int scan_x0 = frame_x0 + p->margin - DAY_HL_OVERHANG;
  int scan_x1 = frame_x1 - p->margin + DAY_HL_OVERHANG;
  int ink_x0 = INT16_MAX, ink_x1 = INT16_MIN, ink_top = INT16_MAX;
  int nb_left = INT16_MIN, nb_right = INT16_MAX;
  for (int y = position.origin.y; y < block_bottom - p->bottom_pad; y++) {
    for (int x = frame_x0; x < frame_x1; x++) {
      if (!pixel_is_valid(&info, x, y)) { continue; }
      uint8_t pixel = get_pixel(&info, x, y);
      if (argb_distance(pixel, p->ink) > argb_distance(pixel, p->bg)) { continue; }
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
  graphics_release_frame_buffer(ctx, framebuffer);
  if (ink_x1 < ink_x0) {                 /* nothing drawn: centre on the token */
    ink_x0 = scan_x0;
    ink_x1 = scan_x1 - 1;
  }
  int ink_w = ink_x1 - ink_x0 + 1;
  int box_w = p->box_w;
  if (box_w < ink_w + 2 * p->min_pad) { box_w = ink_w + 2 * p->min_pad; }
  int pad_left = (box_w - ink_w) / 2;
  int pad_right = box_w - ink_w - pad_left;
  int room_left = ink_x0 - nb_left - 1 - p->gap;     /* huge when there is no neighbour */
  int room_right = nb_right - ink_x1 - 1 - p->gap;
  if (pad_left > room_left || pad_right > room_right) {
    int pad = pad_left;
    if (room_left < pad) { pad = room_left; }
    if (room_right < pad) { pad = room_right; }
    if (pad < p->min_pad) { pad = p->min_pad; }
    pad_left = pad_right = pad;
  }
  int top = block_top;
  if (ink_top - 1 < top) { top = ink_top - 1; }
  if (top < position.origin.y) { top = position.origin.y; }
  GRect box = GRect(ink_x0 - pad_left, top, ink_w + pad_left + pad_right, block_bottom - top);
  apply_hard_invert(ctx, box, p->ink, p->bg);
}

void effect_invert(GContext *ctx, GRect position, void *param) {
  (void)param;
  apply_invert(ctx, position, false, GColorBlackARGB8);
}

void effect_invert_bw_with_background(GContext *ctx, GRect position, void *param) {
  apply_invert(ctx, position, true, (uint8_t)(uintptr_t)param);
}
