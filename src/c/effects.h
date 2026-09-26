/* Adapted from pebble-effect-layer (MIT). See THIRD_PARTY_NOTICES.md. */
#pragma once
#include <pebble.h>

typedef void effect_cb(GContext *ctx, GRect position, void *param);

effect_cb effect_invert;
effect_cb effect_invert_bw_with_background;

/* Saturating inversion: snaps each pixel to whichever of {ink, background} it is
   furthest from, so the day-strip today marker stays hard black-on-colour instead of
   degrading to grey-on-grey when the text colour is not white.
   param = (GColor8 ink << 8) | GColor8 background. */
effect_cb effect_hard_invert;
