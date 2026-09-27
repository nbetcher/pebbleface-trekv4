/* Adapted from pebble-effect-layer (MIT). See THIRD_PARTY_NOTICES.md. */
#pragma once
#include <pebble.h>

typedef void effect_cb(GContext *ctx, GRect position, void *param);

effect_cb effect_invert;
effect_cb effect_invert_bw_with_background;

/* Day-strip today marker, see effects.c: a fixed-width block centred on today's
   drawn letters, hard-inverted - each pixel snaps to whichever of {ink, background}
   it is furthest from, so it stays solid black-on-colour for any strip colour.
   param = const DayHighlightParams *. */
typedef struct {
  uint8_t ink;       /* GColor8 of the day strip */
  uint8_t bg;        /* GColor8 of the screen background */
  uint8_t box_w;     /* block width */
  uint8_t min_pad;   /* minimum block-to-ink gap each side */
  uint8_t margin;    /* frame slack either side of the token (neighbour ink lives here) */
  uint8_t accent;    /* frame rows above the block, for accents; must hold no other ink */
  uint8_t bottom_pad;/* block rows below the letters; not scanned */
  uint8_t gap;       /* minimum clear pixels between the block and a neighbouring day */
} DayHighlightParams;
effect_cb effect_day_highlight;
