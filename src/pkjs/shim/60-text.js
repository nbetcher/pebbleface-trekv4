/*
 * 60-text.js -- TrekV4 preview shim: text layout, glyph metrics and glyph rendering.
 *
 * SPDX-License-Identifier: Apache-2.0
 * SPDX-FileCopyrightText: 2024 Google LLC
 *
 * This file is a C-to-JavaScript translation, reduced to the 8-bit rectangular colour path
 * (emery), of the following PebbleOS sources:
 *     src/fw/applib/graphics/text_layout.c     (layout walk, word/line iteration, justify)
 *     src/fw/applib/graphics/text_render.c     (render_glyph)
 *     src/fw/applib/graphics/text_resources.c  (glyph lookup + wildcard fallback)
 *     src/fw/applib/fonts/codepoint.c          (codepoint classification tables)
 *     src/fw/applib/fonts/fonts.c              (fonts_get_font_height)
 * Upstream: github.com/google/pebble @ 4051c5b, github.com/coredevices/PebbleOS main.
 * Modified: translated to JavaScript, pointer iteration replaced by codepoint-array indices,
 * text-flow/paging/perimeter/orphan-avoidance and the 1-bit framebuffer path removed (all
 * unreachable for this watchface), PFO resource access replaced by the baked PFA1 atlas.
 *
 * THE THREE FACTS THIS FILE EXISTS TO PRESERVE
 *   1. Advances are INTEGERS baked at build time by FreeType in FT_LOAD_TARGET_MONO, summed
 *      with no kerning and no subpixel accumulation. Never measure text with the browser.
 *   2. Glyphs are 1 BIT PER PIXEL and are blitted set-pixel-or-skip. Watch text has ZERO
 *      anti-aliasing. There is no coverage, no blending (outside GCompOpSet), no gamma.
 *   3. graphics_text_layout_get_content_size runs the SAME walk as graphics_draw_text.
 *      Measurement and rendering can therefore never disagree -- which is precisely the
 *      class of bug (mis-placed today-highlight) that this rewrite is here to kill.
 */

/* @noinline */
/* Standalone (node --test / dump_preview.js) bindings for the symbols that 00-cnum.js,
 * 10-gcolor.js and 20-pack.js contribute to the concatenated shim. make_shim.py strips this
 * fence, so the serialized config page never sees `require`.
 *
 * SAFETY: these `var` declarations are assignment-free at the top level and every assignment
 * below is guarded on `typeof module !== 'undefined'`. A bare `var x;` does NOT clobber an
 * existing function or var of the same name in the same scope, so even if the fence survived
 * stripping the concatenated shim would still see the real definitions. */
var cdiv, gcolor_alpha_blend, b64urlDecode;
var GTextOverflowModeWordWrap, GTextOverflowModeTrailingEllipsis, GTextOverflowModeFill;
var GTextAlignmentLeft, GTextAlignmentCenter, GTextAlignmentRight, GCompOpSet;
if (typeof module !== 'undefined' && module.exports) {
  try { cdiv = require('./00-cnum.js').cdiv; } catch (e0) { /* 00-cnum.js not landed yet */ }
  try { b64urlDecode = require('./20-pack.js').b64urlDecode; } catch (e1) { /* 20-pack.js not landed yet */ }
  var pgG = null;
  try { pgG = require('./10-gcolor.js'); } catch (e2) { /* 10-gcolor.js not landed yet */ }
  pgG = pgG || {};
  gcolor_alpha_blend = pgG.gcolor_alpha_blend;
  /* Values per SPEC 3.2; 10-gcolor.js is authoritative once it lands. */
  GTextOverflowModeWordWrap = pgG.GTextOverflowModeWordWrap !== undefined ? pgG.GTextOverflowModeWordWrap : 0;
  GTextOverflowModeTrailingEllipsis = pgG.GTextOverflowModeTrailingEllipsis !== undefined ? pgG.GTextOverflowModeTrailingEllipsis : 1;
  GTextOverflowModeFill = pgG.GTextOverflowModeFill !== undefined ? pgG.GTextOverflowModeFill : 2;
  GTextAlignmentLeft = pgG.GTextAlignmentLeft !== undefined ? pgG.GTextAlignmentLeft : 0;
  GTextAlignmentCenter = pgG.GTextAlignmentCenter !== undefined ? pgG.GTextAlignmentCenter : 1;
  GTextAlignmentRight = pgG.GTextAlignmentRight !== undefined ? pgG.GTextAlignmentRight : 2;
  GCompOpSet = pgG.GCompOpSet !== undefined ? pgG.GCompOpSet : 4;
}
/* @endnoinline */

/* ------------------------------------------------------------------------------------------
 * Local C-semantics helpers
 * ---------------------------------------------------------------------------------------- */

/* C '/' on integers truncates toward zero. Delegates to 00-cnum.js's cdiv when present; the
 * fallback exists only so this module is testable before that file lands. */
function pgCdiv(a, b) {
  if (typeof cdiv === 'function') { return cdiv(a, b); }
  /* eslint-disable-next-line no-restricted-syntax -- C-semantics fallback, see PORTING.txt */
  var q = a / b;
  return q < 0 ? Math.ceil(q) : Math.floor(q);
}

/* PORT OF PebbleOS gtypes.c:gcolor_alpha_blend -- only reached under GCompOpSet, which no
 * emery text draw uses. Local fallback keeps this module standalone-testable. */
function pgTextAlphaBlend(src, dst) {
  if (typeof gcolor_alpha_blend === 'function') { return gcolor_alpha_blend(src, dst); }
  var f = (src >> 6) & 3;
  if (f === 0) { return dst; }
  if (f === 3) { return src; }
  var o = 0xC0, sh;
  for (sh = 4; sh >= 0; sh -= 2) {
    var s = (src >> sh) & 3, d = (dst >> sh) & 3;
    /* The firmware's 33%/66% blend LUT is exactly round((a + 2*b) / 3) per 2-bit channel. */
    var v = (f === 1) ? Math.round((s + 2 * d) / 3) : Math.round((d + 2 * s) / 3);
    o |= v << sh;
  }
  return o;
}

/* ------------------------------------------------------------------------------------------
 * PORT OF PebbleOS applib/fonts/codepoint.c -- classification tables
 * ---------------------------------------------------------------------------------------- */

var NULL_CODEPOINT = 0x0000;
var NEWLINE_CODEPOINT = 0x000A;
var SPACE_CODEPOINT = 0x0020;
var HYPHEN_CODEPOINT = 0x002D;
var ZERO_WIDTH_SPACE_CODEPOINT = 0x200B;
var WORD_JOINER_CODEPOINT = 0x2060;
var ELLIPSIS_CODEPOINT = 0x2026;
var WILDCARD_CODEPOINT = 0x25AF;   /* WHITE VERTICAL RECTANGLE, the PFO "tofu" box */

var MIN_IDEOGRAPH_CODEPOINT = 0x2E80;
var MIN_SPECIAL_CODEPOINT = 0xE0A0;
var MAX_SPECIAL_CODEPOINT = 0xE0A2;
var MIN_SKIN_TONE_CODEPOINT = 0x1F3FB;
var MAX_SKIN_TONE_CODEPOINT = 0x1F3FF;

/* END_OF_WORD_CODEPOINTS, sorted, from codepoint.c. */
function pgCpIsEndOfWord(cp) {
  return cp === NULL_CODEPOINT || cp === NEWLINE_CODEPOINT || cp === SPACE_CODEPOINT ||
         cp === HYPHEN_CODEPOINT || cp === ZERO_WIDTH_SPACE_CODEPOINT;
}

/* FORMATTING_CODEPOINTS, sorted, from codepoint.c. */
function pgCpIsFormatting(cp) {
  return cp === 0x7F || cp === 0x200C || cp === 0x200D || cp === 0x200E || cp === 0x200F ||
         cp === 0x202A || cp === 0x202C || cp === 0x202D || cp === 0xFE0E || cp === 0xFE0F ||
         cp === 0xFEFF;
}

/* ZERO_WIDTH_CODEPOINTS. These contribute no advance (prv_codepoint_get_horizontal_advance). */
function pgCpIsZeroWidth(cp) {
  return cp === ZERO_WIDTH_SPACE_CODEPOINT || cp === WORD_JOINER_CODEPOINT;
}

function pgCpShouldSkip(cp) {
  return (cp < 0x20 && cp !== NEWLINE_CODEPOINT) ||
         (cp >= MIN_SKIN_TONE_CODEPOINT && cp <= MAX_SKIN_TONE_CODEPOINT);
}

/* Strict '>' matches codepoint.c exactly (0x2E80 itself is NOT an ideograph there). */
function pgCpIsIdeograph(cp) { return cp > MIN_IDEOGRAPH_CODEPOINT; }

/* render_glyph hands these to a special-codepoint handler which this watchface never installs,
 * so they draw nothing at all. */
function pgCpIsSpecial(cp) { return cp >= MIN_SPECIAL_CODEPOINT && cp <= MAX_SPECIAL_CODEPOINT; }

/* ------------------------------------------------------------------------------------------
 * PFA1 glyph atlas
 *
 * Layout (little-endian), per SPEC 5.3:
 *   'P','F','A','1' | u8 font_count
 *   per font: u8 key_len, key bytes | u8 max_height | u16 wildcard_cp | u16 glyph_count
 *             glyph_count x 9 bytes: u16 cp, u8 w, u8 h, i8 left, i8 top, i8 adv, u16 bmp_off
 *             u32 bitmap_len | bitmap_len bytes (1bpp, LSB-first, continuous, NO row padding)
 * The glyph index is sorted ascending by codepoint so lookup is a binary search, mirroring the
 * PFO hash-table lookup's result (not its mechanism -- only the answer has to match).
 * ---------------------------------------------------------------------------------------- */

var pgFonts = null;      /* key -> GFont. Module-global exactly as the PebbleOS resource system is. */
var pgFontAlias = null;  /* optional resource-name -> atlas-key map, from pack.layout.FONTS */

var PG_B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/* Fallback base64url decoder, used only when 20-pack.js has not been concatenated ahead of us. */
function pgB64UrlDecode(s) {
  if (typeof b64urlDecode === 'function') { return b64urlDecode(s); }
  var lut = {}, i;
  for (i = 0; i < 64; i++) { lut[PG_B64URL.charAt(i)] = i; }
  var n = s.length, outLen = (n * 6) >> 3, out = new Uint8Array(outLen), acc = 0, bits = 0, o = 0;
  for (i = 0; i < n; i++) {
    var v = lut[s.charAt(i)];
    if (v === undefined) { continue; }
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 0xFF; }
  }
  return o === outLen ? out : out.subarray(0, o);
}

/* PORT OF the PFO reader in text_resources.c, retargeted at the baked PFA1 atlas.
 * Decodes into struct-of-arrays typed arrays: one allocation per field, zero per glyph lookup. */
function pgFontsDecodePFA1(bytes) {
  if (bytes.length < 5 || bytes[0] !== 0x50 || bytes[1] !== 0x46 || bytes[2] !== 0x41 ||
      bytes[3] !== 0x31) {
    throw new Error('TrekShim: bad PFA1 magic');
  }
  var p = 4, count = bytes[p++], out = {}, f, i;
  for (f = 0; f < count; f++) {
    var keyLen = bytes[p++], key = '';
    for (i = 0; i < keyLen; i++) { key += String.fromCharCode(bytes[p + i]); }
    p += keyLen;
    var maxHeight = bytes[p++];
    var wildcard = bytes[p] | (bytes[p + 1] << 8); p += 2;
    var n = bytes[p] | (bytes[p + 1] << 8); p += 2;

    var cp = new Uint16Array(n), gw = new Uint8Array(n), gh = new Uint8Array(n);
    var gl = new Int8Array(n), gt = new Int8Array(n), ga = new Int8Array(n);
    var go = new Uint16Array(n);
    for (i = 0; i < n; i++) {
      var q = p + i * 9;
      cp[i] = bytes[q] | (bytes[q + 1] << 8);
      gw[i] = bytes[q + 2];
      gh[i] = bytes[q + 3];
      gl[i] = (bytes[q + 4] << 24) >> 24;   /* i8 */
      gt[i] = (bytes[q + 5] << 24) >> 24;   /* i8 */
      ga[i] = (bytes[q + 6] << 24) >> 24;   /* i8 */
      go[i] = bytes[q + 7] | (bytes[q + 8] << 8);
    }
    p += n * 9;
    var bmpLen = (bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) |
                  (bytes[p + 3] << 24)) >>> 0;
    p += 4;
    var bmp = bytes.subarray(p, p + bmpLen);
    p += bmpLen;

    out[key] = { key: key, max_height: maxHeight, wildcard_cp: wildcard, n: n,
                 cp: cp, gw: gw, gh: gh, gl: gl, gt: gt, ga: ga, go: go, bmp: bmp };
  }
  return out;
}

/* pgFontsInit -- ADDITION beyond SPEC 3.7. fonts_load_custom_font() takes no pack argument
 * (faithful to the C, where the resource system is global), so the atlas has to be bound once
 * before the face is built. 90-render.js must call this with pack.glyphs.
 * Accepts: PFA1 bytes | base64url PFA1 string | a pack object with .glyphs | a key->GFont map. */
function pgFontsInit(src, aliases) {
  pgFontAlias = aliases || null;
  if (!src) { pgFonts = null; return null; }
  if (typeof src === 'string') { pgFonts = pgFontsDecodePFA1(pgB64UrlDecode(src)); }
  else if (typeof src.length === 'number' && typeof src.subarray === 'function') {
    pgFonts = pgFontsDecodePFA1(src);
  } else if (src.glyphs) {
    if (!pgFontAlias && src.layout && src.layout.FONTS) { pgFontAlias = src.layout.FONTS; }
    pgFonts = pgFontsDecodePFA1(typeof src.glyphs === 'string' ?
                                pgB64UrlDecode(src.glyphs) : src.glyphs);
  } else {
    pgFonts = src;   /* already-decoded key -> GFont map (test injection) */
  }
  return pgFonts;
}

/* PORT OF resource_get_handle -- identity in the shim, as SPEC 3.7 specifies. */
function resource_get_handle(resourceId) { return resourceId; }

/* PORT OF fonts_load_custom_font. Resolves a resource identifier to an atlas GFont.
 * Accepts 'RESOURCE_ID_FONT_LCARS_92', 'FONT_LCARS_92' or 'LCARS_92', or an alias-map key.
 * Throws rather than returning a null font: a missing face must fail loud (SPEC 6.5 #5). */
function fonts_load_custom_font(handle) {
  if (handle && typeof handle === 'object' && typeof handle.max_height === 'number') {
    return handle;   /* already a GFont */
  }
  if (!pgFonts) { throw new Error('TrekShim: pgFontsInit() not called before font load'); }
  var key = String(handle);
  if (pgFontAlias && pgFontAlias[key]) { key = pgFontAlias[key]; }
  if (!pgFonts[key] && key.indexOf('RESOURCE_ID_') === 0) { key = key.substring(12); }
  if (!pgFonts[key] && key.indexOf('FONT_') === 0) { key = key.substring(5); }
  var font = pgFonts[key];
  if (!font) { throw new Error('TrekShim: font not in atlas: ' + handle); }
  return font;
}

/* Teardown only -- no drawing behaviour (main.c:2424-2460). */
function fonts_unload_custom_font(font) { return font; }

/* PORT OF fonts.c:fonts_get_font_height. max_height IS the line height AND the y-datum that
 * every glyph's top_offset_px is measured from; the baseline sits at line.origin.y + max_height.
 * There is no separate ascent/descent metric anywhere in the format. */
function fonts_get_font_height(font) { return font.max_height; }

/* Binary search over the ascending codepoint index. Returns the glyph slot, or -1. */
function pgGlyphIndex(font, codepoint) {
  var lo = 0, hi = font.n - 1, cp = font.cp;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1, v = cp[mid];
    if (v === codepoint) { return mid; }
    if (v < codepoint) { lo = mid + 1; } else { hi = mid - 1; }
  }
  return -1;
}

/* PORT OF text_resources.c:prv_get_glyph -- the fallback chain is
 * { codepoint, font->wildcard_codepoint, ' ' } and only then failure. This is what makes the
 * preview render the tofu box for the five Czech/Turkish glyphs Antonio was subset out of,
 * exactly as the watch does. Returns -1 if even ' ' is absent. */
function pgGlyphSlot(font, codepoint) {
  var i = pgGlyphIndex(font, codepoint);
  if (i >= 0) { return i; }
  i = pgGlyphIndex(font, font.wildcard_cp);
  if (i >= 0) { return i; }
  return pgGlyphIndex(font, SPACE_CODEPOINT);
}

/* PORT OF text_resources.c:text_resources_get_glyph. Returns a metrics+bitmap record, or null. */
function text_resources_get_glyph(font, codepoint) {
  var i = pgGlyphSlot(font, codepoint);
  if (i < 0) { return null; }
  return { font: font, cp: font.cp[i], w: font.gw[i], h: font.gh[i],
           left: font.gl[i], top: font.gt[i], adv: font.ga[i], off: font.go[i] };
}

/* PORT OF text_layout.c:prv_codepoint_get_horizontal_advance combined with
 * text_resources.c:text_resources_get_glyph_horiz_advance.
 * Hot path: resolves through the index without allocating a glyph record.
 * MAX(advance, 0) and the zero-width short-circuit are both load-bearing. */
function pgAdvance(font, codepoint) {
  if (pgCpIsZeroWidth(codepoint)) { return 0; }
  var i = pgGlyphSlot(font, codepoint);
  if (i < 0) { return 0; }          /* text_resources_get_glyph_horiz_advance returns 0 on miss */
  var a = font.ga[i];
  return a > 0 ? a : 0;
}

/* ------------------------------------------------------------------------------------------
 * Codepoint stream
 *
 * The C iterates UTF-8 bytes and keeps utf8_t* pointers in Word/Line. We decode once into an
 * array of codepoints and keep INDICES instead. cps[n] is the NULL terminator, so index n is
 * the exact analogue of the C's `bounds->end` pointer and every pointer comparison in the
 * original (word->end == current, *start == NULL_CODEPOINT, ...) translates one-for-one.
 * ---------------------------------------------------------------------------------------- */

function pgCps(text) {
  var s = (text === null || text === undefined) ? '' : String(text);
  var out = [], i = 0, n = s.length;
  while (i < n) {
    var c = s.charCodeAt(i++);
    if (c >= 0xD800 && c <= 0xDBFF && i < n) {
      var c2 = s.charCodeAt(i);
      if (c2 >= 0xDC00 && c2 <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00); i++; }
    }
    out.push(c);
  }
  out.push(NULL_CODEPOINT);   /* terminator, mirroring the C string's '\0' */
  return out;
}

/* PORT OF text_layout.c:char_iter_next. `st` is { cps, n, i }. `n` is the terminator index. */
function pgCharNext(st) {
  while (true) {
    if (st.i >= st.n) { return false; }             /* current >= bounds->end */
    st.i++;
    if (st.i >= st.n) { return false; }             /* landed on the terminator: !is_utf8_advanced */
    var cp = st.cps[st.i];
    if (pgCpIsFormatting(cp)) { continue; }
    if (pgCpShouldSkip(cp)) { continue; }
    return true;
  }
}

/* PORT OF text_layout.c:char_iter_prev. */
function pgCharPrev(st) {
  while (true) {
    if (st.i <= 0) { return false; }
    st.i--;
    var cp = st.cps[st.i];
    if (pgCpIsFormatting(cp)) { continue; }
    if (pgCpShouldSkip(cp)) { continue; }
    return true;
  }
}

function pgCpAt(st) { return st.i >= st.n ? NULL_CODEPOINT : st.cps[st.i]; }

/* PORT OF text_layout.c:prv_char_iter_next_start_of_word. */
function pgCharNextStartOfWord(st) {
  var cp = pgCpAt(st);
  if (pgCpShouldSkip(cp) || pgCpIsFormatting(cp)) {
    if (!pgCharNext(st)) { return false; }
  }
  while (pgCpIsZeroWidth(pgCpAt(st))) {
    if (pgCpAt(st) === 0) { return false; }
    if (!pgCharNext(st)) { break; }
  }
  return true;
}

/* ------------------------------------------------------------------------------------------
 * Word iteration -- PORT OF text_layout.c word_state_update / word_init / word_iter_next
 * ---------------------------------------------------------------------------------------- */

var WS_START = 0, WS_GROWING = 1, WS_IDEOGRAPH = 2, WS_JOINING = 3, WS_END = 4;

/* PORT OF text_layout.c:word_state_update.
 * NOTE: the C's `case WordStateIdeograph:` has NO `break`, so it falls through into
 * `case WordStateGrowing:`, whose assignment unconditionally overwrites the one the
 * Ideograph block just made. The Ideograph block is therefore DEAD CODE and the two states
 * behave identically. Merging the cases here is not a simplification -- it is what the C
 * actually does, and writing the Ideograph block out would change behaviour (e.g. Ideograph
 * followed by a Latin letter yields Growing, not End). Unreachable for this watchface either
 * way, since nothing here renders CJK. */
function pgWordStateUpdate(state, cp) {
  var s = state;
  switch (state) {
    case WS_START:
      if (cp === NEWLINE_CODEPOINT) { s = WS_END; }
      else if (pgCpIsIdeograph(cp)) { s = WS_IDEOGRAPH; }
      else { s = WS_GROWING; }
      break;
    case WS_IDEOGRAPH:
    case WS_GROWING:
      if (cp === WORD_JOINER_CODEPOINT) { s = WS_JOINING; }
      else if (pgCpIsIdeograph(cp) || pgCpIsEndOfWord(cp)) { s = WS_END; }
      else { s = WS_GROWING; }
      break;
    case WS_JOINING:
      if (cp === NEWLINE_CODEPOINT) { s = WS_END; }
      else if (pgCpIsIdeograph(cp)) { s = WS_IDEOGRAPH; }
      else if (cp === WORD_JOINER_CODEPOINT) { s = WS_JOINING; }
      else { s = WS_GROWING; }
      break;
    case WS_END:
      s = WS_END;
      break;
  }
  return s;
}

/* PORT OF text_layout.c:word_init. `word` is { start, end, width_px }; start === -1 means NULL.
 * Returns is_success. */
function pgWordInit(word, tbp, start) {
  word.width_px = 0;
  if (tbp.cps[start] === NULL_CODEPOINT) {
    word.start = start; word.end = start;
    return false;
  }
  var st = { cps: tbp.cps, n: tbp.n, i: start };
  if (!pgCharNextStartOfWord(st)) {
    word.start = start; word.end = start;
    return false;
  }
  word.start = st.i;
  var state = pgWordStateUpdate(WS_START, pgCpAt(st));
  do {
    if (state === WS_GROWING || state === WS_IDEOGRAPH) {
      word.width_px += pgAdvance(tbp.font, pgCpAt(st));
    }
    pgCharNext(st);                          /* return value deliberately ignored, as in the C */
    state = pgWordStateUpdate(state, pgCpAt(st));
  } while (state !== WS_END);
  word.end = st.i;
  return true;
}

/* PORT OF text_layout.c:word_iter_next. */
function pgWordIterNext(wi) {
  if (wi.tbp.cps[wi.current.end] === NULL_CODEPOINT) { return false; }
  return pgWordInit(wi.current, wi.tbp, wi.current.end);
}

/* PORT OF text_layout.c:word_trim_preceeding_codepoint. */
function pgWordTrimPreceedingCodepoint(word, codepoint, tbp) {
  var st = { cps: tbp.cps, n: tbp.n, i: word.start };
  if (pgCpAt(st) !== codepoint) { return false; }
  if (!pgCharNext(st)) { word.start = -1; return false; }
  if (word.end === st.i) {
    /* Word has been completely trimmed; init a new word. */
    var isEndOfText = (word.end < 0 || st.i >= tbp.n);
    if (!isEndOfText) { pgWordInit(word, tbp, word.end); }
    return false;
  }
  word.width_px -= pgAdvance(tbp.font, codepoint);
  word.start = st.i;
  return true;
}

function pgWordTrimPreceedingWhitespace(word, tbp) {
  while (pgWordTrimPreceedingCodepoint(word, SPACE_CODEPOINT, tbp)) { /* loop */ }
}

/* ------------------------------------------------------------------------------------------
 * Line walking -- PORT OF text_layout.c:walk_line
 *
 * `visitor` is null for the measure pass (update_dimensions_char_visitor_cb) and a function
 * for the render pass (render_chars_char_visitor_cb). That single boolean is what selects
 * available_horiz_px between line.max_width_px and line.width_px, exactly as the C's
 * `char_visitor_cb == update_dimensions_char_visitor_cb` comparison does.
 * Returns the index of the last visited character, or -1 (NULL).
 * ---------------------------------------------------------------------------------------- */

function pgWalkLine(line, tbp, visitor) {
  /* line.start < 0 is the C's line->start == NULL: reached only when the text was empty or
   * entirely trimmed away, in which case there is nothing to walk. */
  if (line.start < 0) { return -1; }
  var isMeasure = !visitor;
  var availableHorizPx = isMeasure ? line.max_width_px : line.width_px;
  var lineHeight = fonts_get_font_height(tbp.font);
  var suffixWidthPx = 0;

  if (line.suffix_codepoint) { suffixWidthPx = pgAdvance(tbp.font, line.suffix_codepoint); }
  if (availableHorizPx < suffixWidthPx) { return -1; }

  var st = { cps: tbp.cps, n: tbp.n, i: line.start };
  var isNewlineAsSpace = (tbp.overflow_mode === GTextOverflowModeFill);
  var currentCp = pgCpAt(st);
  if (currentCp === NEWLINE_CODEPOINT) {
    if (isNewlineAsSpace) { currentCp = SPACE_CODEPOINT; }
    else { return st.i; }
  }

  var walkedWidthPx = 0;
  var nextGlyphWidthPx = pgAdvance(tbp.font, currentCp);
  var lastVisited = -1;

  while (walkedWidthPx + nextGlyphWidthPx + suffixWidthPx <= availableHorizPx) {
    var cx = line.origin_x + walkedWidthPx;
    if (visitor) {
      /* render_chars_char_visitor_cb skips zero-width codepoints before render_glyph. */
      if (!pgCpIsZeroWidth(currentCp)) { visitor(currentCp, cx, line.origin_y, lineHeight); }
    } else {
      /* update_dimensions_char_visitor_cb: width is the cursor extent, NOT an ink box. */
      line.width_px = (cx + nextGlyphWidthPx) - line.origin_x;
    }
    walkedWidthPx += nextGlyphWidthPx;
    lastVisited = st.i;

    if (!pgCharNext(st)) { break; }
    currentCp = pgCpAt(st);
    if (currentCp === NEWLINE_CODEPOINT) {
      if (isNewlineAsSpace) { currentCp = SPACE_CODEPOINT; }
      else { break; }
    }
    nextGlyphWidthPx = pgAdvance(tbp.font, currentCp);
  }

  /* Trim trailing whitespace. Newlines contribute no width; spaces give theirs back. */
  if (lastVisited >= 0) {
    while (currentCp === NEWLINE_CODEPOINT || currentCp === SPACE_CODEPOINT) {
      nextGlyphWidthPx = (currentCp === NEWLINE_CODEPOINT) ? 0 : pgAdvance(tbp.font, currentCp);
      if (walkedWidthPx < nextGlyphWidthPx) { break; }
      walkedWidthPx -= nextGlyphWidthPx;
      if (!pgCharPrev(st)) { break; }
      currentCp = pgCpAt(st);
    }
  }

  if (line.suffix_codepoint) {
    var sx = line.origin_x + walkedWidthPx;
    if (visitor) {
      if (!pgCpIsZeroWidth(line.suffix_codepoint)) {
        visitor(line.suffix_codepoint, sx, line.origin_y, lineHeight);
      }
    } else {
      line.width_px = (sx + pgAdvance(tbp.font, line.suffix_codepoint)) - line.origin_x;
    }
  }
  return lastVisited;
}

/* ------------------------------------------------------------------------------------------
 * Line composition -- PORT OF text_layout.c line_add_word / line_add_words / prv_line_justify
 * ---------------------------------------------------------------------------------------- */

function pgLineAddWord(line, word, tbp) {
  if (line.width_px > line.max_width_px) { return false; }

  line.height_px = fonts_get_font_height(tbp.font);

  var isNewlineFirst = (tbp.cps[word.start] === NEWLINE_CODEPOINT);
  if (isNewlineFirst) {
    pgWordTrimPreceedingCodepoint(word, NEWLINE_CODEPOINT, tbp);
    if (tbp.overflow_mode !== GTextOverflowModeFill) { return false; }
    if (word.start < 0) { return false; }
  }

  var isOverflow = (line.width_px + word.width_px > line.max_width_px);
  var isStartOfLine = (line.width_px === 0);
  var shouldHyphenate = (isOverflow && isStartOfLine);

  if (isStartOfLine) { line.start = word.start; }

  if (shouldHyphenate) {
    /* A word too long for an empty line is broken mid-word with a trailing hyphen rather than
     * being allowed to overflow. */
    line.suffix_codepoint = HYPHEN_CODEPOINT;
    var lastVisited = pgWalkLine(line, tbp, null);
    if (lastVisited < 0) { lastVisited = word.start; }
    var suffixWidthPx = pgAdvance(tbp.font, HYPHEN_CODEPOINT);
    var truncatedWordLengthPx = line.width_px - suffixWidthPx;
    word.width_px -= truncatedWordLengthPx;
    word.start = (lastVisited + 1 <= tbp.n) ? lastVisited + 1 : tbp.n;  /* utf8_get_next */
    return false;
  }

  if (!isOverflow) {
    line.width_px += word.width_px;
    return true;
  }

  pgWordTrimPreceedingWhitespace(word, tbp);
  return false;
}

/* PORT OF text_layout.c:prv_line_justify.
 * `/ 2` is C integer division on a non-negative remainder, so CENTER BIASES LEFT by half a
 * pixel on odd remainders. Reproducing that bias is mandatory: the popup's centred strings
 * and the seconds/AMPM cell both land one pixel differently if this rounds. */
function pgLineJustify(line, tbp) {
  var horizPxRemaining = line.max_width_px - line.width_px;
  if (tbp.alignment === GTextAlignmentCenter) {
    line.origin_x = line.origin_x + pgCdiv(horizPxRemaining, 2);
  } else if (tbp.alignment === GTextAlignmentRight) {
    line.origin_x = line.origin_x + horizPxRemaining;
  }
}

/* PORT OF text_layout.c:line_add_words. */
function pgLineAddWords(line, wi, lastLineCb) {
  var tbp = wi.tbp;
  line.start = wi.current.start;
  var isTextRemaining = (line.start >= 0);

  while (isTextRemaining && line.max_width_px > 0) {
    var nextWord = { start: wi.current.start, end: wi.current.end, width_px: wi.current.width_px };
    var isAdded = pgLineAddWord(line, nextWord, tbp);
    if (!isAdded) {
      wi.current = nextWord;
      isTextRemaining = (nextWord.start >= 0);
      break;
    }
    isTextRemaining = pgWordIterNext(wi);
  }

  if (lastLineCb) { lastLineCb(line, tbp, isTextRemaining); }
  pgLineJustify(line, tbp);
  return isTextRemaining;
}

/* PORT OF text_layout.c:prv_get_line_height. line_spacing_delta is always 0 here: it is only
 * non-zero via graphics_text_attributes_*, which this watchface never calls. */
function pgLineHeight(tbp) { return fonts_get_font_height(tbp.font) + tbp.line_spacing_delta; }

/* PORT OF text_layout.c:TEXT_LINE_DESCENDER_LINE -- DIVIDE_CEIL(height_px, 5). */
function pgDescender(line) { return pgCdiv(line.height_px + 4, 5); }

/* PORT OF text_layout.c:prv_line_iter_is_vertical_overflow. */
function pgLineIterIsVerticalOverflow(line, tbp) {
  var nextLineYExtent;
  var truncating = (tbp.overflow_mode === GTextOverflowModeTrailingEllipsis ||
                    tbp.overflow_mode === GTextOverflowModeFill);
  if (truncating && line.origin_y !== tbp.box_y) {
    nextLineYExtent = line.origin_y + pgLineHeight(tbp);
  } else {
    /* First line of a truncating mode, or a non-truncating mode: lay out one more line than
     * fits so it can still be drawn (clipped). */
    nextLineYExtent = line.origin_y;
  }
  return nextLineYExtent > (tbp.box_y + tbp.box_h);
}

/* PORT OF text_layout.c:set_ellipsis_on_overflow_last_line_cb. */
function pgSetEllipsisOnOverflow(line, tbp, isTextRemaining) {
  if (!isTextRemaining) { return; }
  var isLastLine = (line.origin_y + 2 * pgLineHeight(tbp)) > (tbp.box_y + tbp.box_h);
  if (!isLastLine) { return; }
  line.suffix_codepoint = ELLIPSIS_CODEPOINT;
  pgWalkLine(line, tbp, null);   /* recompute line.width_px with the ellipsis included */
}

/* ------------------------------------------------------------------------------------------
 * pgTextWalk -- the single layout walk shared by draw and measure
 *
 * PORT OF text_layout.c:prv_text_walk_lines + prv_walk_lines_down, with the paging /
 * perimeter / orphan-avoidance branches removed: they are gated on TextLayoutFlowData, which
 * is only populated by text_layer_enable_screen_text_flow_and_paging(), a call this watchface
 * never makes. With flow data zeroed, uses_paging and uses_perimeter are both false and those
 * branches are unreachable.
 *
 * `visitor(codepoint, x, y, lineHeight)` renders one glyph cursor; pass null to measure only.
 * `clipY` is { y0, y1 } in the SAME space as `box` (an ADDITION to the SPEC 3.7 signature --
 * the render gate and the bottom stop condition genuinely need the clip box, which the C
 * reads off the GContext). Pass null to disable both, which is what the measure path does.
 *
 * Returns max_used_size as { w, h }.
 * ---------------------------------------------------------------------------------------- */

function pgTextWalk(text, font, box, overflowMode, alignment, visitor, clipY) {
  var used = { w: 0, h: 0 };
  if (!font) { return used; }
  if (box.size.w <= 0 || box.size.h <= 0) { return used; }   /* grect_is_empty */

  var cps = pgCps(text);
  var n = cps.length - 1;                                    /* index of the NULL terminator */
  if (n === 0) { return used; }                              /* is_string_empty */

  var tbp = {
    cps: cps, n: n, font: font, overflow_mode: overflowMode, alignment: alignment,
    line_spacing_delta: 0, box_x: box.origin.x, box_y: box.origin.y,
    box_w: box.size.w, box_h: box.size.h
  };

  var truncating = (overflowMode === GTextOverflowModeTrailingEllipsis ||
                    overflowMode === GTextOverflowModeFill);
  var lastLineCb = truncating ? pgSetEllipsisOnOverflow : null;

  var line = {
    start: 0, origin_x: box.origin.x, origin_y: box.origin.y,
    max_width_px: box.size.w, width_px: 0, height_px: fonts_get_font_height(font),
    suffix_codepoint: 0
  };

  var wi = { tbp: tbp, current: { start: 0, end: 0, width_px: 0 } };
  pgWordInit(wi.current, tbp, 0);

  while (!pgLineIterIsVerticalOverflow(line, tbp)) {
    var isTextRemaining = pgLineAddWords(line, wi, lastLineCb);

    if (visitor) {
      var lineMaxY = line.origin_y + line.height_px + pgDescender(line) + tbp.line_spacing_delta;
      if (!clipY || lineMaxY > clipY.y0) { pgWalkLine(line, tbp, visitor); }
    }

    /* PORT OF update_all_layout_update_cb. */
    used.h = (line.origin_y - box.origin.y) + line.height_px + tbp.line_spacing_delta;
    if (line.width_px > used.w) { used.w = line.width_px; }

    /* PORT OF is_clip_box_overflow_bottom_stop_condition_cb (draw path only). */
    if (visitor && clipY) {
      if (line.origin_y + line.height_px + tbp.line_spacing_delta > clipY.y1) { break; }
    }
    if (!isTextRemaining) { break; }

    /* PORT OF line_iter_next. */
    if (pgLineIterIsVerticalOverflow(line, tbp)) { break; }
    line.origin_x = box.origin.x;
    line.origin_y += pgLineHeight(tbp);
    line.width_px = 0;
    line.max_width_px = box.size.w;
    line.suffix_codepoint = 0;
    line.start = -1;
  }
  return used;
}

/* ------------------------------------------------------------------------------------------
 * Rendering
 * ---------------------------------------------------------------------------------------- */

/* PORT OF text_render.c:render_glyph (8-bit colour path).
 * gx/gy are the CURSOR origin in screen coordinates; left_offset_px / top_offset_px are added
 * here, exactly as glyph_target is built in the C.
 *
 * The glyph mask is 1 BIT PER PIXEL, LSB-first, laid out as a continuous bitstream with NO
 * per-row padding: bit index = y * width_px + x. Set bits write the text colour; CLEAR BITS
 * LEAVE THE DESTINATION UNTOUCHED. There is no anti-aliasing and no coverage -- reproducing
 * that hard edge is the entire point of shipping baked glyphs instead of a browser font.
 *
 * The C does this via a 32-bit block bitblt; a per-pixel loop is behaviourally identical and
 * roughly 300 lines shorter. Clipping is per-pixel against ctx.clip (half-open) plus the
 * framebuffer bounds, which subsumes grect_clip + the data-row min_x/max_x guard on emery. */
function pgRenderGlyph(ctx, g, gx, gy) {
  if (!g || g.w === 0 || g.h === 0) { return; }
  var fb = ctx.fb, clip = ctx.clip;
  var x0 = gx + g.left, y0 = gy + g.top;
  var cx0 = clip ? clip.x0 : 0, cy0 = clip ? clip.y0 : 0;
  var cx1 = clip ? clip.x1 : fb.w, cy1 = clip ? clip.y1 : fb.h;
  if (cx0 < 0) { cx0 = 0; }
  if (cy0 < 0) { cy0 = 0; }
  if (cx1 > fb.w) { cx1 = fb.w; }
  if (cy1 > fb.h) { cy1 = fb.h; }

  var setColor = ctx.ds.text_color | 0xC0;          /* dest_color.a = 3 under GCompOpAssign */
  var isSet = (ctx.ds.compositing_mode === GCompOpSet);
  var bmp = g.font.bmp, base = g.off, gw = g.w, d = fb.d, t = fb.t;
  /* SPEC 3.4 hangs the current tag off the framebuffer, SPEC 3.5 off the context. Accept
   * either so this file does not depend on which 30-fb.js / 40-gcontext.js settles on. */
  var tag = (fb.tag !== undefined && fb.tag !== null) ? fb.tag : (ctx.tag || 0);

  var sy = (cy0 - y0) > 0 ? (cy0 - y0) : 0;
  var ey = (cy1 - y0) < g.h ? (cy1 - y0) : g.h;
  var sx = (cx0 - x0) > 0 ? (cx0 - x0) : 0;
  var ex = (cx1 - x0) < gw ? (cx1 - x0) : gw;

  /* Grow the active interactive target's bounding box, once per glyph rather
   * than per pixel. 30-fb.js's writers call fbNote() for this; the glyph blit
   * bypasses them for speed, so it has to do the same bookkeeping itself or the
   * text target would report an empty bbox and pgTargets() would drop it as
   * "painted nothing" - which is how textcol and othertextcol vanished from the
   * target census. Kept inline so this file stays standalone-testable. */
  var box = fb.box;
  var painted = false;

  for (var y = sy; y < ey; y++) {
    var rowBit = y * gw;
    var di = (y0 + y) * fb.w + x0;
    for (var x = sx; x < ex; x++) {
      var bi = rowBit + x;
      if ((bmp[base + (bi >> 3)] >> (bi & 7)) & 1) {
        var o = di + x;
        d[o] = isSet ? pgTextAlphaBlend(ctx.ds.text_color, d[o]) : setColor;
        if (t) { t[o] = tag; }
        painted = true;
      }
    }
  }

  if (box && painted) {
    /* The clipped glyph rect is a tight enough bound: every set bit lies inside
     * it, and it is at most one glyph larger than the true ink box. */
    if (x0 + sx < box.x0) { box.x0 = x0 + sx; }
    if (y0 + sy < box.y0) { box.y0 = y0 + sy; }
    if (x0 + ex - 1 > box.x1) { box.x1 = x0 + ex - 1; }
    if (y0 + ey - 1 > box.y1) { box.y1 = y0 + ey - 1; }
  }
}

/* PORT OF text_layout.c:graphics_draw_text.
 * `attrs` must be null: a non-null GTextAttributes implies text flow / paging, which is not
 * ported (and which nothing in this watchface uses). Fail loud rather than silently wrong. */
function graphics_draw_text(ctx, text, font, box, overflowMode, alignment, attrs) {
  if (attrs) { throw new Error('TrekShim: graphics_draw_text text_attributes not supported'); }
  if (!text || !font) { return; }

  /* grect_to_global_coordinates: the box arrives layer-local and is translated by the
   * context's drawing box before ANY layout happens. Line origins are global from then on. */
  var gbox = { origin: { x: box.origin.x + ctx.dbox.x, y: box.origin.y + ctx.dbox.y },
               size: { w: box.size.w, h: box.size.h } };

  /* Early bail when the box is entirely outside the clip box (grect_clip -> h <= 0).
   * NOTE main.c:541 draws the popup clock into a box with origin.y == -3, so this genuinely
   * has to clip rather than reject. */
  var clip = ctx.clip;
  var ty0 = Math.max(gbox.origin.y, clip.y0);
  var ty1 = Math.min(gbox.origin.y + gbox.size.h, clip.y1);
  if (ty1 - ty0 <= 0) { return; }

  pgTextWalk(text, font, gbox, overflowMode, alignment, function (cp, x, y, lineHeight) {
    if (pgCpIsSpecial(cp)) { return; }   /* no special_codepoint_handler_cb is ever installed */
    var g = text_resources_get_glyph(font, cp);
    if (g) { pgRenderGlyph(ctx, g, x, y); }
  }, { y0: clip.y0, y1: clip.y1 });
}

/* PORT OF text_layout.c:graphics_text_layout_get_max_used_size, reached from the app via
 * app_graphics_text_layout_get_content_size.
 *
 * This runs THE SAME WALK as graphics_draw_text with the render callback omitted, which is
 * what guarantees measurement and rendering can never disagree. Width is the sum of the
 * integer advances of the glyphs that fit -- NOT an ink bounding box -- so a box narrower
 * than the string silently truncates the measurement, exactly as on the watch.
 *
 * No drawing-box translation and no clip box: the measure path uses a scratch context, and
 * max_used_size is computed relative to box.origin, so both cancel out. */
function graphics_text_layout_get_content_size(text, font, box, overflowMode, alignment) {
  if (!text || !font) { return { w: 0, h: 0 }; }
  return pgTextWalk(text, font, box, overflowMode, alignment, null, null);
}

/* @noinline */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    pgFontsInit: pgFontsInit,
    pgFontsDecodePFA1: pgFontsDecodePFA1,
    pgB64UrlDecode: pgB64UrlDecode,
    resource_get_handle: resource_get_handle,
    fonts_load_custom_font: fonts_load_custom_font,
    fonts_unload_custom_font: fonts_unload_custom_font,
    fonts_get_font_height: fonts_get_font_height,
    text_resources_get_glyph: text_resources_get_glyph,
    pgGlyphIndex: pgGlyphIndex,
    pgAdvance: pgAdvance,
    pgCps: pgCps,
    pgTextWalk: pgTextWalk,
    pgRenderGlyph: pgRenderGlyph,
    graphics_draw_text: graphics_draw_text,
    graphics_text_layout_get_content_size: graphics_text_layout_get_content_size,
    ELLIPSIS_CODEPOINT: ELLIPSIS_CODEPOINT,
    WILDCARD_CODEPOINT: WILDCARD_CODEPOINT,
    HYPHEN_CODEPOINT: HYPHEN_CODEPOINT
  };
}
/* @endnoinline */
