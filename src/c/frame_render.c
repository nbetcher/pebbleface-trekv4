/* Parametric LCARS renderer - see frame_render.h.

   All shape tests run in x16 fixed point (1 px = 16 units), so the quarter-pixel
   edge offsets from the fit are exact integers (1 quarter = 4 units). Coverage is
   8x8 supersampled (65 levels) but only on edge pixels: pixels whose 4 corners +
   centre agree are trivially full/empty. Each covered pixel is blended against
   the current framebuffer contents per channel and quantized to the 2-bit-per-
   channel panel palette - the same maths the bitmap pipeline's 2-bit alpha edges
   produced, so any (colour, background) pair gets its best representable ramp. */
#include "frame_render.h"
#include "frame_tables.h"

#define SS 8
#define COVMAX (SS * SS)

/* rtl..rbr = x-radii; ytl..ybr = y-radii for ELLIPTICAL corners (0 => circular,
   reuse the x-radius). Only the elbow outer big corner sets a y-radius != x. */
typedef struct { int32_t x0, y0, x1, y1; int32_t rtl, rtr, rbl, rbr;
                 int32_t ytl, ytr, ybl, ybr; } RR16;
#define RR_INF (1 << 22)

/* dxi,dyi = inward distances from a rect corner. True if the point is inside that
   corner's rounding box yet outside its (rx,ry) ellipse. ry<=0 => circular (rx). */
static inline bool corner_out(int32_t dxi, int32_t dyi, int32_t rx, int32_t ry) {
  if (rx <= 0) { return false; }
  if (ry <= 0) { ry = rx; }
  if (dxi >= rx || dyi >= ry) { return false; }
  int64_t dx = rx - dxi, dy = ry - dyi;
  return dx * dx * (int64_t)ry * ry + dy * dy * (int64_t)rx * rx
         > (int64_t)rx * rx * (int64_t)ry * ry;
}

static bool rr_inside(const RR16 *r, int32_t px, int32_t py) {
  if (px < r->x0 || px > r->x1 || py < r->y0 || py > r->y1) { return false; }
  if (corner_out(px - r->x0, py - r->y0, r->rtl, r->ytl)) { return false; }
  if (corner_out(r->x1 - px, py - r->y0, r->rtr, r->ytr)) { return false; }
  if (corner_out(px - r->x0, r->y1 - py, r->rbl, r->ybl)) { return false; }
  if (corner_out(r->x1 - px, r->y1 - py, r->rbr, r->ybr)) { return false; }
  return true;
}

/* shape = outer rounded rect, minus an inner rounded rect for elbows */
typedef struct { RR16 outer; RR16 inner; bool has_inner; } Shape16;

static bool shape_inside(const Shape16 *s, int32_t px, int32_t py) {
  return rr_inside(&s->outer, px, py) && !(s->has_inner && rr_inside(&s->inner, px, py));
}

static uint8_t shape_coverage(const Shape16 *s, int x, int y) {
  /* adaptive: 4 pixel corners + centre first */
  int32_t bx = x * 16, by = y * 16;
  uint8_t quick = 0;
  quick += shape_inside(s, bx,      by);
  quick += shape_inside(s, bx + 16, by);
  quick += shape_inside(s, bx,      by + 16);
  quick += shape_inside(s, bx + 16, by + 16);
  quick += shape_inside(s, bx + 8,  by + 8);
  if (quick == 5) { return COVMAX; }
  if (quick == 0) { return 0; }
  uint8_t cov = 0;
  for (int j = 0; j < SS; j++) {
    for (int i = 0; i < SS; i++) {
      cov += shape_inside(s, bx + 2 * i + 1, by + 2 * j + 1);
    }
  }
  return cov;
}

static void build_shape(const FrameSeg *g, int ox, int oy, Shape16 *out) {
  int32_t X0 = (ox + g->x) * 16 - g->o[0] * 4;
  int32_t Y0 = (oy + g->y) * 16 - g->o[1] * 4;
  int32_t X1 = (ox + g->x + g->w) * 16 + g->o[2] * 4;
  int32_t Y1 = (oy + g->y + g->h) * 16 + g->o[3] * 4;
  out->has_inner = (g->kind != 0);
  if (g->kind == 0) {            /* rounded rect: p = radii tl,tr,bl,br (circular) */
    out->outer = (RR16){ X0, Y0, X1, Y1, g->p[0] * 16, g->p[1] * 16, g->p[2] * 16, g->p[3] * 16,
                         0, 0, 0, 0 };                   /* y-radii 0 => circular corners */
  } else if (g->kind == 1) {     /* elbow top-left: p = Rx, Ry, r, tip, arm_v, arm_h */
    out->outer = (RR16){ X0, Y0, X1, Y1, g->p[0] * 16, g->p[3] * 16, g->p[3] * 16, 0,
                         g->p[1] * 16, 0, 0, 0 };        /* ytl = Ry: elliptical sweep */
    out->inner = (RR16){ X0 + g->p[4] * 16 + g->o[4] * 4, Y0 + g->p[5] * 16 + g->o[5] * 4,
                         RR_INF, RR_INF, g->p[2] * 16, 0, 0, 0, 0, 0, 0, 0 };
  } else {                       /* elbow bottom-left */
    out->outer = (RR16){ X0, Y0, X1, Y1, g->p[3] * 16, 0, g->p[0] * 16, g->p[3] * 16,
                         0, 0, g->p[1] * 16, 0 };         /* ybl = Ry */
    out->inner = (RR16){ X0 + g->p[4] * 16 + g->o[4] * 4, -RR_INF,
                         RR_INF, Y1 - g->p[5] * 16 - g->o[5] * 4, 0, 0, g->p[2] * 16, 0, 0, 0, 0, 0 };
  }
}

static inline uint8_t quant_ch(int v) {           /* nearest of 0,85,170,255 -> 0..3 */
  int q = (v + 42) / 85;
  return q > 3 ? 3 : (uint8_t)q;
}

/* Blend fg over the framebuffer pixel. Coverage is FIRST quantized to the four
   2-bit-alpha levels {0, 1/3, 2/3, 1} - exactly what the bitmap pipeline stored -
   so edge colours and their placement match the original assets: hard long edges,
   a single dim column at bracket breaks, stepped curves. cov4 is 0..3. */
#ifdef PBL_COLOR
static inline uint8_t blend_argb(uint8_t bg, uint8_t fg, uint8_t cov4) {
  int br = ((bg >> 4) & 3) * 85, bgc = ((bg >> 2) & 3) * 85, bb = (bg & 3) * 85;
  int fr = ((fg >> 4) & 3) * 85, fgc = ((fg >> 2) & 3) * 85, fb = (fg & 3) * 85;
  int r = (fr * cov4 + br * (3 - cov4) + 1) / 3;
  int g = (fgc * cov4 + bgc * (3 - cov4) + 1) / 3;
  int b = (fb * cov4 + bb * (3 - cov4) + 1) / 3;
  return 0xC0 | (quant_ch(r) << 4) | (quant_ch(g) << 2) | quant_ch(b);
}
#endif

/* render one shape into the captured framebuffer over its (clipped) pixel box */
static void render_shape(GBitmap *fb, const Shape16 *sh, int x0, int y0, int x1, int y1,
                         uint8_t fg_argb) {
  GRect fbb = gbitmap_get_bounds(fb);
  if (x0 < 0) { x0 = 0; }
  if (y0 < 0) { y0 = 0; }
  if (x1 > fbb.size.w) { x1 = fbb.size.w; }
  if (y1 > fbb.size.h) { y1 = fbb.size.h; }
  for (int y = y0; y < y1; y++) {
    GBitmapDataRowInfo ri = gbitmap_get_data_row_info(fb, y);
    int rx0 = x0 > ri.min_x ? x0 : ri.min_x;
    int rx1 = x1 - 1 < ri.max_x ? x1 - 1 : ri.max_x;
    for (int x = rx0; x <= rx1; x++) {
      uint8_t cov = shape_coverage(sh, x, y);
      /* coverage -> 2-bit alpha step, nearest-rounded - validated against the
         bitmap pipeline by per-pixel regression (boundaries ~ 1/6, 1/2, 5/6). */
      uint8_t cov4 = (uint8_t)((cov * 3 + COVMAX / 2) / COVMAX);
      if (!cov4) { continue; }
#ifdef PBL_COLOR
      ri.data[x] = blend_argb(ri.data[x], fg_argb, cov4);
#else
      if (cov4 >= 2) {
        if ((fg_argb & 0x3F) != 0) { ri.data[x / 8] |=  (1 << (x % 8)); }
        else                        { ri.data[x / 8] &= ~(1 << (x % 8)); }
      }
#endif
    }
  }
}

/* Custom (user-themed) scheme: bg_index == FRAME_NBG selects one user-picked
   colour for each of the 13 independently drawn LCARS frame segments. */
#define FRAME_BG_CUSTOM FRAME_NBG
static uint8_t s_custom_colors[FRAME_NSEG];

void frame_set_custom_colors(const uint8_t segment_argb[FRAME_NSEG]) {
  memcpy(s_custom_colors, segment_argb, sizeof(s_custom_colors));
}

void frame_draw_background(GContext *ctx, Layer *layer, uint8_t bg_index) {
  if (bg_index > FRAME_BG_CUSTOM) { bg_index = 0; }
  GPoint org = layer_convert_point_to_screen(layer, GPointZero);
  GBitmap *fb = graphics_capture_frame_buffer(ctx);
  if (!fb) {                       /* degraded fallback: hard primitives, no AA */
    for (int i = 0; i < FRAME_NSEG; i++) {
      const FrameSeg *g = &FRAME_SEGS[i];
#ifdef PBL_COLOR
      graphics_context_set_fill_color(ctx, (GColor){ .argb = (bg_index == FRAME_BG_CUSTOM)
          ? s_custom_colors[i] : FRAME_COLORS[bg_index][g->color_idx] });
#else
      graphics_context_set_fill_color(ctx, bg_index == FRAME_BG_CUSTOM &&
          (s_custom_colors[i] & 0x3F) == 0 ? GColorBlack : GColorWhite);
#endif
      graphics_fill_rect(ctx, GRect(g->x, g->y, g->w, g->h), g->p[0], GCornersAll);
    }
    return;
  }
  for (int i = 0; i < FRAME_NSEG; i++) {
    const FrameSeg *g = &FRAME_SEGS[i];
    Shape16 sh;
    build_shape(g, org.x, org.y, &sh);
#ifdef PBL_COLOR
    uint8_t fg = (bg_index == FRAME_BG_CUSTOM) ? s_custom_colors[i]
                                               : FRAME_COLORS[bg_index][g->color_idx];
#else
    uint8_t fg = (bg_index == FRAME_BG_CUSTOM) ? s_custom_colors[i] : 0xFF;
#endif
    render_shape(fb, &sh, org.x + g->x - 1, org.y + g->y - 1,
                 org.x + g->x + g->w + 1, org.y + g->y + g->h + 1, fg);
  }
  graphics_release_frame_buffer(ctx, fb);
}

void frame_draw_popup_bars(GContext *ctx, Layer *layer, GColor accent) {
  GPoint org = layer_convert_point_to_screen(layer, GPointZero);
  GBitmap *fb = graphics_capture_frame_buffer(ctx);
  if (!fb) {
    graphics_context_set_fill_color(ctx, accent);
    for (int i = 0; i < 6; i++) {
      const PopupBar *b = &POPUP_BARS[i];
      graphics_fill_rect(ctx, GRect(b->x, b->y, b->w, b->h), b->r[0] ? b->r[0] : b->r[1],
                         b->r[0] ? (GCornerTopLeft | GCornerBottomLeft)
                                 : (b->r[1] ? (GCornerTopRight | GCornerBottomRight) : GCornerNone));
    }
    return;
  }
  for (int i = 0; i < 6; i++) {
    const PopupBar *b = &POPUP_BARS[i];
    Shape16 sh = { .has_inner = false };
    sh.outer = (RR16){ (org.x + b->x) * 16, (org.y + b->y) * 16,
                       (org.x + b->x + b->w) * 16, (org.y + b->y + b->h) * 16,
                       b->r[0] * 16, b->r[1] * 16, b->r[2] * 16, b->r[3] * 16, 0, 0, 0, 0 };
    render_shape(fb, &sh, org.x + b->x - 1, org.y + b->y - 1,
                 org.x + b->x + b->w + 1, org.y + b->y + b->h + 1, accent.argb);
  }
  graphics_release_frame_buffer(ctx, fb);
}

GSize frame_popup_panel_size(void) {
#if defined(PBL_PLATFORM_GABBRO)
  return GSize(205, 158);
#elif defined(PBL_PLATFORM_EMERY)
  return GSize(157, 122);
#else
  return GSize(113, 90);
#endif
}

/* Draw a 1-bit glyph bitmask (bit x of rows[y] = ink) centred in box, as hard
   1px horizontal runs - no anti-aliasing, so the art lands exactly as authored. */
static void draw_glyph_rows(GContext *ctx, GRect box, const uint32_t *rows,
                            int gw, int gh, GColor color) {
  int ox = box.origin.x + (box.size.w - gw) / 2;
  int oy = box.origin.y + (box.size.h - gh) / 2;
  graphics_context_set_fill_color(ctx, color);
  for (int y = 0; y < gh; y++) {
    uint32_t bits = rows[y];
    int x = 0;
    while (bits) {
      while (x < gw && !(bits & (1u << x))) { x++; }
      if (x >= gw) { break; }
      int x0 = x;
      while (x < gw && (bits & (1u << x))) { bits &= ~(1u << x); x++; }
      graphics_fill_rect(ctx, GRect(ox + x0, oy + y, x - x0, 1), 0, GCornerNone);
    }
  }
}

/* Bluetooth status glyph. Both states are exact-pixel bitmasks (frame_tables.h): the
   connected rune is the original IMAGE_BLUETOOTH ink, the no-BT glyph the original
   slashed symbol. Earlier revisions stroked the rune as anti-aliased lines, which
   smeared its 1px dotted construction into a blob. */
void frame_draw_bt_glyph(GContext *ctx, GRect box, bool connected, GColor color) {
  if (connected) {
    draw_glyph_rows(ctx, box, GLYPH_RUNE_ROWS, GLYPH_RUNE_W, GLYPH_RUNE_H, color);
  } else {
    draw_glyph_rows(ctx, box, GLYPH_NOBT_ROWS, GLYPH_NOBT_W, GLYPH_NOBT_H, color);
  }
}

#ifdef PBL_COLOR
/* Squared distance between two ARGB8 colours in 2-bit channel steps (0..27). */
static int argb_dist2(uint8_t a, uint8_t b) {
  int dr = (int)((a >> 4) & 3) - (int)((b >> 4) & 3);
  int dg = (int)((a >> 2) & 3) - (int)((b >> 2) & 3);
  int db = (int)(a & 3) - (int)(b & 3);
  return dr * dr + dg * dg + db * db;
}
#endif

/* Quiet Time "QT" indicator (original IMAGE_ICON_QT art, see frame_tables.h).

   The glyph sits on top of whatever is under QT_RECT - an LCARS bar on most layouts -
   so a fixed ink colour can vanish: white QT on the white monochrome frame was invisible
   on aplite/diorite/flint. Each ink pixel is therefore written straight into the
   framebuffer, and any pixel whose backdrop is too close to the ink flips to black or
   white, whichever is further from that backdrop. Over a contrasting backdrop (the
   default colour themes) the glyph is drawn exactly in `color`. */
#define QT_MIN_CONTRAST 4   /* below this dist2 the ink reads as the backdrop */
void frame_draw_qt_glyph(GContext *ctx, Layer *layer, GColor color) {
  GRect box = layer_get_bounds(layer);
  GPoint org = layer_convert_point_to_screen(layer, GPointZero);
  GBitmap *fb = graphics_capture_frame_buffer(ctx);
  if (!fb) {                       /* degraded fallback: plain ink */
    draw_glyph_rows(ctx, box, GLYPH_QT_ROWS, GLYPH_QT_W, GLYPH_QT_H, color);
    return;
  }
  GRect fbb = gbitmap_get_bounds(fb);
  int ox = org.x + box.origin.x + (box.size.w - GLYPH_QT_W) / 2;
  int oy = org.y + box.origin.y + (box.size.h - GLYPH_QT_H) / 2;
  for (int y = 0; y < GLYPH_QT_H; y++) {
    int sy = oy + y;
    if (sy < 0 || sy >= fbb.size.h) { continue; }
    GBitmapDataRowInfo ri = gbitmap_get_data_row_info(fb, sy);
    for (int x = 0; x < GLYPH_QT_W; x++) {
      if (!(GLYPH_QT_ROWS[y] & (1u << x))) { continue; }
      int sx = ox + x;
      if (sx < ri.min_x || sx > ri.max_x) { continue; }
#ifdef PBL_COLOR
      uint8_t under = ri.data[sx];
      uint8_t ink = color.argb;
      if (argb_dist2(ink, under) < QT_MIN_CONTRAST) {
        ink = argb_dist2(GColorBlackARGB8, under) >= argb_dist2(GColorWhiteARGB8, under)
            ? GColorBlackARGB8 : GColorWhiteARGB8;
      }
      ri.data[sx] = ink;
#else
      /* 1-bit: ink is white unless the colour is black; knock out to the opposite of
         the backdrop whenever the ink would match it. */
      bool under_white = (ri.data[sx / 8] >> (sx % 8)) & 1;
      bool ink_white = (color.argb & 0x3F) != 0;
      if (ink_white == under_white) { ink_white = !under_white; }
      if (ink_white) { ri.data[sx / 8] |=  (1 << (sx % 8)); }
      else           { ri.data[sx / 8] &= ~(1 << (sx % 8)); }
#endif
    }
  }
  graphics_release_frame_buffer(ctx, fb);
}
