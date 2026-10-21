#!/usr/bin/env python3
"""Build resources/fonts/LCARS.ttf, the watchface's LCARS-style display font.

Every glyph is drawn here from simple geometry: rectangles, polygons and
rounded boxes, combined with boolean path operations. Nothing is traced or
converted from another font. The proportions (cap height, x-height, stroke
weights, advance widths) follow the ultra-compressed grotesque style of the
LCARS displays, sized so the existing watch layouts keep fitting.

Requires fontTools and skia-pathops:
  uv run --with fonttools==4.67.0 --with skia-pathops==0.9.2 python3 make_font.py
  ... make_font.py --check     exit 1 if the committed TTF is out of date
  ... make_font.py --specimen out.png   also render a specimen sheet (needs Pillow)
"""
import io
import os
import sys

import pathops
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib.tables import ttProgram

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "resources", "fonts", "LCARS.ttf")
# The Settings page's vector preview draws the day strip and other LCARS text in the
# browser, from a subset of this font embedded in clay-custom.js as a data: URL.
CLAY_CUSTOM = os.path.join(ROOT, "src", "pkjs", "clay-custom.js")

FAMILY = "Trekv6 LCARS"
VERSION = "1.000"
COPYRIGHT = "Copyright (c) 2026 Nick Betcher"
# zlib license, the same text as resources/fonts/LCARS-LICENSE.txt.
LICENSE = (
    "Copyright (c) 2026 Nick Betcher. This font is provided 'as-is', without any express "
    "or implied warranty. In no event will the author be held liable for any damages "
    "arising from the use of this font. Permission is granted to anyone to use this font "
    "for any purpose, including commercial applications, and to alter it and redistribute "
    "it freely, subject to the following restrictions: 1. The origin of this font must not "
    "be misrepresented; you must not claim that you created the original font. If you use "
    "this font in a product, an acknowledgment in the product documentation would be "
    "appreciated but is not required. 2. Altered versions must be plainly marked as such, "
    "and must not be misrepresented as being the original font. 3. This notice may not be "
    "removed or altered from any source distribution."
)

# ---- vertical metrics (font units) -------------------------------------------
UPM = 2048
ASCENT, DESCENT = 1837, 483          # line box; the watch layouts are tuned to it
CAP, XH, ASC, DSC = 1475, 1190, 1475, -266
OVC, OVL = 30, 14                    # overshoot of round capitals / lowercase

# ---- stroke weights -----------------------------------------------------------
CS, CB, CR = 220, 200, 180           # capitals: stem, bar, round top/bottom
LS, LB, LR, LA = 197, 170, 142, 126  # lowercase: stem, bar, round, arch at the top
K = 0.62                             # corner handle length; > 0.552 is squarer than a circle

# Advance width and ink extents (xmin, xmax) for each character. Digits share
# one advance so the clock never shifts.
WIDTHS = {
    ' ': (336, None), '!': (360, 76, 285), "'": (334, 86, 250),
    '%': (1128, 49, 1079), '(': (524, 133, 502), ')': (524, 25, 391),
    '+': (1706, 254, 1452), ',': (336, 29, 303), '-': (360, 49, 309),
    '.': (336, 70, 268), '/': (569, -92, 618), ':': (336, 70, 268),
    ';': (336, 12, 289), '?': (535, 25, 514), '\u00b0': (674, 43, 633),
    '\u2026': (2048, 244, 1808),   # TextLayer's overflow mark
    '0': (674, 51, 621), '1': (674, 74, 455), '2': (674, 43, 623), '3': (674, 51, 616),
    '4': (674, 0, 672), '5': (674, 61, 633), '6': (674, 57, 627), '7': (674, 18, 621),
    '8': (674, 51, 621), '9': (674, 51, 621),
    'A': (672, 0, 670), 'B': (653, 57, 627), 'C': (639, 47, 616), 'D': (674, 57, 627),
    'E': (559, 57, 543), 'F': (537, 57, 543), 'G': (664, 51, 621), 'H': (678, 57, 621),
    'I': (334, 57, 276), 'J': (647, 23, 592), 'K': (645, 57, 668), 'L': (526, 57, 543),
    'M': (958, 57, 903), 'N': (786, 57, 729), 'O': (674, 51, 621), 'P': (643, 57, 627),
    'Q': (674, 51, 635), 'R': (662, 57, 666), 'S': (625, 31, 598), 'T': (592, -4, 596),
    'U': (674, 51, 621), 'V': (662, 0, 668), 'W': (909, -14, 926), 'X': (633, -25, 655),
    'Y': (594, -33, 635), 'Z': (489, 2, 496),
    'a': (565, 41, 530), 'b': (569, 45, 526), 'c': (569, 41, 528), 'd': (569, 45, 526),
    'e': (569, 41, 528), 'f': (287, -10, 301), 'g': (571, 45, 526), 'h': (569, 45, 526),
    'i': (287, 45, 242), 'j': (287, -47, 242), 'k': (567, 45, 567), 'l': (287, 45, 242),
    'm': (844, 45, 803), 'n': (569, 45, 526), 'o': (569, 41, 528), 'p': (569, 45, 526),
    'q': (569, 45, 526), 'r': (559, 45, 526), 's': (569, 41, 528), 't': (287, -10, 307),
    'u': (569, 45, 526), 'v': (563, 0, 561), 'w': (895, 0, 895), 'x': (524, 4, 520),
    'y': (555, -4, 557), 'z': (477, 16, 459),
}

# Pixel advance of each character at each size the watch compiles this font at
# (FONT_LCARS_*: 12, 14, ... 92 px), as the watch layouts were built around. One
# value per character, base 36. hinting_program() adds a delta instruction to each
# glyph so the SDK's compiler (FreeType, monochrome hinting) lands on these widths.
PIXEL_ADVANCES = {
    12: (' 0123456789:AMP',
         '244444444442464'),
    14: (' 0123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
         '2555555555525445445524447554554455644344444244224264444442446443'),
    18: (' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
         '36666556636658766666566865455555355335375555553558554'),
    19: (' !%\'()+,-./0123456789:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz\u00b0\u00c1\u00c7\u00da\u00e1\u00e4\u00e5\u00e9\u00ed\u00f6\u00f8\u00fa\u00fb\u00fd\u010c\u011f\u015e\u0160\u017e',
         '33a355g3335666666666633566665566366597666666668665555553553353855555535585546666555535555565664'),
    20: (' !%\'()+,-./0123456789:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz\u00b0\u00c1\u00c7\u00da\u00e1\u00e4\u00e5\u00e9\u00ed\u00f6\u00f8\u00fa\u00fb\u00fd\u010c\u011f\u015e\u0160\u017e',
         '34b355h3436777777777733576675567366598767666769665666663663363866665636695557767666636666566665'),
    21: ('ABCDEFGHIJKLMNOPQRSTUVWXYZ',
         '777766773775a8777766779665'),
    26: (' !%\'()+,-./0123456789:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz\u00b0\u00c1\u00c7\u00da\u00e1\u00e4\u00e5\u00e9\u00ed\u00f6\u00f8\u00fa\u00fb\u00fd\u010c\u011f\u015e\u0160\u017e',
         '45e477m45479999999999447988977894887ca98988898c886777774774474b777777477b7769989777747777787886'),
    27: (' !%\'()+,-./0123456789:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz\u00b0\u00c1\u00c7\u00da\u00e1\u00e4\u00e5\u00e9\u00ed\u00f6\u00f8\u00fa\u00fb\u00fd\u010c\u011f\u015e\u0160\u017e',
         '45f477m45489999999999447998977994997da98998899c886788884884474b888878487c7769989777848888788886'),
    29: (' !%\'()+,-./0123456789:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz\u00b0\u00c1\u00c7\u00da\u00e1\u00e4\u00e5\u00e9\u00ed\u00f6\u00f8\u00fa\u00fb\u00fd\u010c\u011f\u015e\u0160\u017e',
         '55g577o5558aaaaaaaaaa558a99a889a5997eba9a998a9d987888884884484c888888488d787aa9a888848888898997'),
    30: ('ABCDEFGHIJKLMNOPQRSTUVWXYZ',
         'aa9a88aa5998eca9aa99aad997'),
    68: (' .0123456789:',
         'bbmmmmmmmmmmb'),
    92: (' .0123456789:',
         'ffuuuuuuuuuuf'),
}

# Accented letters: base letter, accent. Covers every letter the languages use.
ACCENTED = {
    'Á': ('A', 'acute'), 'Ç': ('C', 'cedilla'), 'Ú': ('U', 'acute'),
    'Č': ('C', 'caron'), 'Ě': ('E', 'caron'), 'Ř': ('R', 'caron'),
    'Ş': ('S', 'cedilla'), 'Š': ('S', 'caron'),
    'á': ('a', 'acute'), 'ä': ('a', 'diaeresis'), 'å': ('a', 'ring'),
    'é': ('e', 'acute'), 'í': ('dotlessi', 'acute'), 'ö': ('o', 'diaeresis'),
    'ø': ('o', 'slash'), 'ú': ('u', 'acute'), 'û': ('u', 'circumflex'),
    'ý': ('y', 'acute'), 'ě': ('e', 'caron'), 'ğ': ('g', 'breve'),
    'ř': ('r', 'caron'), 'ž': ('z', 'caron'),
}


# ---- geometry -------------------------------------------------------------------

def _path(draw):
    p = pathops.Path()
    draw(p.getPen())
    return p


def rect(x0, y0, x1, y1):
    return poly([(x0, y0), (x0, y1), (x1, y1), (x1, y0)])


def poly(pts):
    def draw(pen):
        pen.moveTo(pts[0])
        for pt in pts[1:]:
            pen.lineTo(pt)
        pen.closePath()
    return _path(draw)


def rrect(x0, y0, x1, y1, tl=None, tr=None, br=None, bl=None, k=K):
    """Box with optional elliptical corners; each corner is (rx, ry) or None."""
    def r(c):
        return c if c else (0, 0)
    (tlx, tly), (trx, try_), (brx, bry), (blx, bly) = r(tl), r(tr), r(br), r(bl)

    def draw(pen):
        pen.moveTo((x0 + tlx, y1))
        pen.lineTo((x1 - trx, y1))
        if trx:
            pen.curveTo((x1 - trx + k * trx, y1), (x1, y1 - try_ + k * try_), (x1, y1 - try_))
        pen.lineTo((x1, y0 + bry))
        if brx:
            pen.curveTo((x1, y0 + bry - k * bry), (x1 - brx + k * brx, y0), (x1 - brx, y0))
        pen.lineTo((x0 + blx, y0))
        if blx:
            pen.curveTo((x0 + blx - k * blx, y0), (x0, y0 + bly - k * bly), (x0, y0 + bly))
        pen.lineTo((x0, y1 - tly))
        if tlx:
            pen.curveTo((x0, y1 - tly + k * tly), (x0 + tlx - k * tlx, y1), (x0 + tlx, y1))
        pen.closePath()
    return _path(draw)


def union(*ps):
    out = pathops.Path()
    for p in ps:
        out = pathops.op(out, p, pathops.PathOp.UNION)
    return out


def minus(a, *bs):
    for b in bs:
        a = pathops.op(a, b, pathops.PathOp.DIFFERENCE)
    return a


def inter(a, b):
    return pathops.op(a, b, pathops.PathOp.INTERSECTION)


def moved(p, dx=0, dy=0):
    q = pathops.Path()
    p.draw(_Transform(q.getPen(), lambda x, y: (x + dx, y + dy)))
    return q


def rotated180(p, cx, cy):
    q = pathops.Path()
    p.draw(_Transform(q.getPen(), lambda x, y: (2 * cx - x, 2 * cy - y)))
    return q


def mirrored(p, cx):
    q = pathops.Path()
    p.draw(_Transform(q.getPen(), lambda x, y: (2 * cx - x, y)))
    return q


class _Transform:
    def __init__(self, pen, f):
        self.pen, self.f = pen, f

    def moveTo(self, p):
        self.pen.moveTo(self.f(*p))

    def lineTo(self, p):
        self.pen.lineTo(self.f(*p))

    def curveTo(self, *ps):
        self.pen.curveTo(*[self.f(*p) for p in ps])

    def qCurveTo(self, *ps):
        self.pen.qCurveTo(*[self.f(*p) if p else p for p in ps])

    def closePath(self):
        self.pen.closePath()

    def endPath(self):
        self.pen.endPath()


def band(p0, p1, q1, q0):
    """Quadrilateral stroke: p0-p1 on one edge, q0-q1 on the other."""
    return poly([p0, p1, q1, q0])


def round_box(x0, y0, x1, y1, ry):
    """Fully rounded box: half-width horizontal radius, ry vertical."""
    rx = (x1 - x0) / 2.0
    c = (rx, ry)
    return rrect(x0, y0, x1, y1, c, c, c, c)


def ring(x0, y0, x1, y1, side, top, bot, ry=None):
    """A round letter: outer rounded box minus its counter."""
    w = x1 - x0
    ry = ry if ry is not None else 0.58 * w
    outer = round_box(x0, y0, x1, y1, ry)
    wi = w - 2 * side
    ryi = max(ry - max(top, bot), 0.5 * wi)
    inner = round_box(x0 + side, y0 + bot, x1 - side, y1 - top, ryi)
    return minus(outer, inner)


def bowl(x0, y0, x1, y1, side, top, bot, ry=None):
    """Right-rounded bowl (B, D, P, R): square on the left, round on the right."""
    w = x1 - x0
    ry = ry if ry is not None else min(0.5 * (y1 - y0), 0.62 * w)
    rx = min(0.85 * w, w)
    outer = rrect(x0, y0, x1, y1, tr=(rx, ry), br=(rx, ry))
    ryi = max(ry - max(top, bot), 40)
    rxi = max(rx - side, 40)
    inner = rrect(x0 + side, y0 + bot, x1 - side, y1 - top, tr=(rxi, ryi), br=(rxi, ryi))
    return minus(outer, inner)


def u_shape(x0, x1, y_top, y_bot, side, bot, ry=None):
    """Two stems joined by a round bottom (U, u, the lower part of J)."""
    w = x1 - x0
    ry = ry if ry is not None else 0.58 * w
    outer = rrect(x0, y_bot, x1, y_top, br=(w / 2.0, ry), bl=(w / 2.0, ry))
    wi = w - 2 * side
    ryi = max(ry - bot, 0.5 * wi)
    inner = rrect(x0 + side, y_bot + bot, x1 - side, y_top + 1, br=(wi / 2.0, ryi), bl=(wi / 2.0, ryi))
    return minus(outer, inner)


def arch(x0, x1, y_top, y_bot, side, top, ry=None):
    """Two stems joined by a round top (n, h, m)."""
    w = x1 - x0
    ry = ry if ry is not None else 0.58 * w
    outer = rrect(x0, y_bot, x1, y_top, tl=(w / 2.0, ry), tr=(w / 2.0, ry))
    wi = w - 2 * side
    ryi = max(ry - top, 0.5 * wi)
    inner = rrect(x0 + side, y_bot - 1, x1 - side, y_top - top, tl=(wi / 2.0, ryi), tr=(wi / 2.0, ryi))
    return minus(outer, inner)


def vee(x0, x1, y_top, y_bot, t, foot=1.15):
    """Two diagonal strokes meeting in a flat foot."""
    c = (x0 + x1) / 2.0
    f = foot * t / 2.0
    left = band((x0, y_top), (x0 + t, y_top), (c + f, y_bot), (c - f, y_bot))
    right = band((x1 - t, y_top), (x1, y_top), (c + f, y_bot), (c - f, y_bot))
    return inter(union(left, right), rect(x0, y_bot, x1, y_top))


def s_shape(x0, x1, y_bot, y_top, side, bar, rnd, ry=None):
    """S: an upper ring open at the lower right over a lower ring open at the upper left."""
    mid = (y_bot + y_top) / 2.0
    w = x1 - x0
    c = x0 + w / 2.0
    up = ring(x0 + 0.02 * w, mid - bar / 2.0, x1 - 0.03 * w, y_top, side, rnd, bar, ry)
    lo = ring(x0, y_bot, x1, mid + bar / 2.0, side, bar, rnd, ry)
    h = y_top - y_bot
    up = minus(up, rect(c, mid - bar, x1 + 10, y_top - 0.30 * h))
    lo = minus(lo, rect(x0 - 10, y_bot + 0.30 * h, c, mid + bar))
    return union(up, lo)


# ---- glyphs ----------------------------------------------------------------------

def ink(ch):
    w = WIDTHS[ch]
    return w[1], w[2]


def cap_glyphs():
    g = {}
    mid = CAP * 0.5

    a, b = ink('A')
    c = (a + b) / 2.0
    t = CS * 0.86
    aw = CS * 0.40
    outer = poly([(a, 0), (c - aw, CAP), (c + aw, CAP), (b, 0)])
    # The counter's edges run parallel to the outer edges, one stroke inside.
    lx, rx = a + t, b - t
    sl = (c - aw - a) / CAP
    apex_y = (rx - lx) / (2 * sl) if sl else CAP
    inner = poly([(lx, 0), (c, min(apex_y, CAP - CB)), (rx, 0)])
    g['A'] = union(minus(outer, inner), inter(rect(a, 260, b, 260 + CB * 0.9), outer))

    a, b = ink('B')
    yb = CAP * 0.53
    g['B'] = union(rect(a, 0, a + CS, CAP),
                   bowl(a, yb - CB / 2.0, b - 40, CAP, CS, CB, CB),
                   bowl(a, 0, b, yb + CB / 2.0, CS, CB, CB))

    a, b = ink('C')
    o = ring(a, -OVC, b, CAP + OVC, CS, CR, CR)
    g['C'] = minus(o, rect((a + b) / 2.0, CAP * 0.34, b + 10, CAP * 0.66))

    a, b = ink('D')
    g['D'] = union(rect(a, 0, a + CS, CAP), bowl(a, 0, b, CAP, CS, CB, CB, ry=0.62 * (b - a)))

    a, b = ink('E')
    g['E'] = union(rect(a, 0, a + CS, CAP), rect(a, CAP - CB, b, CAP),
                   rect(a, mid - CB / 2.0, b - 40, mid + CB / 2.0), rect(a, 0, b, CB))

    a, b = ink('F')
    g['F'] = union(rect(a, 0, a + CS, CAP), rect(a, CAP - CB, b, CAP),
                   rect(a, mid - CB / 2.0 - 20, b - 40, mid + CB / 2.0 - 20))

    a, b = ink('G')
    o = ring(a, -OVC, b, CAP + OVC, CS, CR, CR)
    bar_y = CAP * 0.40
    g['G'] = union(minus(o, rect((a + b) / 2.0, bar_y + CB, b + 10, CAP * 0.67)),
                   rect(a + (b - a) * 0.45, bar_y, b, bar_y + CB),
                   rect(b - CS, 0, b, bar_y + CB))

    a, b = ink('H')
    g['H'] = union(rect(a, 0, a + CS, CAP), rect(b - CS, 0, b, CAP),
                   rect(a, mid - CB / 2.0, b, mid + CB / 2.0))

    a, b = ink('I')
    g['I'] = rect(a, 0, b, CAP)

    a, b = ink('J')
    g['J'] = minus(u_shape(a, b, CAP, -OVC, CS, CR), rect(a - 10, CAP * 0.36, b - CS, CAP + 10))

    a, b = ink('K')
    t = CS * 1.15
    yj = CAP * 0.30
    arm = band((a + CS - 5, yj), (b, CAP), (b - t, CAP), (a + CS - 5, yj + CB * 1.9))
    leg = band((a + CS - 5, CAP * 0.56), (b - t, 0), (b, 0), (a + CS - 5 + t, CAP * 0.56))
    g['K'] = union(rect(a, 0, a + CS, CAP), inter(union(arm, leg), rect(a, 0, b, CAP)))

    a, b = ink('L')
    g['L'] = union(rect(a, 0, a + CS, CAP), rect(a, 0, b, CB))

    a, b = ink('M')
    c = (a + b) / 2.0
    t = CS * 0.80
    v = vee(a + CS - t, b - CS + t, CAP, 0, t, foot=1.0)
    g['M'] = union(rect(a, 0, a + CS, CAP), rect(b - CS, 0, b, CAP), v)

    a, b = ink('N')
    t = CS * 0.95
    g['N'] = union(rect(a, 0, a + CS, CAP), rect(b - CS, 0, b, CAP),
                   inter(band((a, CAP), (a + t, CAP), (b, 0), (b - t, 0)), rect(a, 0, b, CAP)))

    a, b = ink('O')
    g['O'] = ring(a, -OVC, b, CAP + OVC, CS, CR, CR)

    a, b = ink('P')
    yb = CAP * 0.42
    g['P'] = union(rect(a, 0, a + CS, CAP), bowl(a, yb, b, CAP, CS, CB, CB))

    a, b = ink('Q')
    o = ring(a, -OVC, ink('O')[1], CAP + OVC, CS, CR, CR)
    t = CS * 0.95
    tail = band((b - CS - 160, CAP * 0.22), (b - CS - 160 + t, CAP * 0.22), (b, -OVC - 40), (b - t, -OVC - 40))
    g['Q'] = union(o, inter(tail, rect(a, -OVC - 40, b, CAP)))

    a, b = ink('R')
    yb = CAP * 0.44
    bb = b - 40
    leg = band((bb - CS - 30, yb + CB * 0.5), (bb - 30, yb + CB * 0.5), (b, 0), (b - CS, 0))
    g['R'] = union(rect(a, 0, a + CS, CAP), bowl(a, yb, bb, CAP, CS, CB, CB),
                   inter(leg, rect(a, 0, b, yb + CB)))

    a, b = ink('S')
    g['S'] = s_shape(a, b, -OVC, CAP + OVC, CS, CB, CR)

    a, b = ink('T')
    c = (a + b) / 2.0
    g['T'] = union(rect(a, CAP - CB, b, CAP), rect(c - CS / 2.0, 0, c + CS / 2.0, CAP))

    a, b = ink('U')
    g['U'] = u_shape(a, b, CAP, -OVC, CS, CR)

    a, b = ink('V')
    g['V'] = vee(a, b, CAP, 0, CS * 0.95, foot=1.0)

    a, b = ink('W')
    t = CS * 0.80
    c = (a + b) / 2.0
    g['W'] = union(vee(a, c + t * 0.5, CAP, 0, t, foot=1.0), vee(c - t * 0.5, b, CAP, 0, t, foot=1.0))

    a, b = ink('X')
    t = CS * 1.0
    box = rect(a, 0, b, CAP)
    g['X'] = inter(union(band((a, CAP), (a + t, CAP), (b, 0), (b - t, 0)),
                         band((b - t, CAP), (b, CAP), (a + t, 0), (a, 0))), box)

    a, b = ink('Y')
    c = (a + b) / 2.0
    t = CS * 0.95
    yv = CAP * 0.46
    g['Y'] = union(vee(a, b, CAP, yv, t, foot=1.3), rect(c - CS / 2.0, 0, c + CS / 2.0, yv + 10))

    a, b = ink('Z')
    t = CS * 1.05
    g['Z'] = union(rect(a + 20, CAP - CB, b, CAP), rect(a, 0, b, CB),
                   inter(band((b - t, CAP - CB), (b, CAP - CB), (a + t, CB), (a, CB)), rect(a, 0, b, CAP)))
    return g


def lower_glyphs():
    g = {}
    a, b = ink('o')
    g['o'] = ring(a, -OVL, b, XH + OVL, LS, LR, LR)

    a, b = ink('n')
    g['n'] = union(rect(a, 0, a + LS, XH), arch(a, b, XH + OVL, 0, LS, LA))
    g['h'] = union(rect(a, 0, a + LS, ASC), arch(a, b, XH + OVL, 0, LS, LA))
    g['u'] = rotated180(g['n'], (a + b) / 2.0, XH / 2.0)

    a, b = ink('m')
    m1 = a + (b - a) * 0.5 + LS * 0.5
    g['m'] = union(rect(a, 0, a + LS, XH), arch(a, m1, XH + OVL, 0, LS, LA),
                   arch(m1 - LS, b, XH + OVL, 0, LS, LA))

    a, b = ink('b')
    g['b'] = union(rect(a, 0, a + LS, ASC), ring(a, -OVL, b, XH + OVL, LS, LR, LR))
    g['d'] = mirrored(g['b'], (a + b) / 2.0)
    g['p'] = union(rect(a, DSC, a + LS, XH), ring(a, -OVL, b, XH + OVL, LS, LR, LR))
    g['q'] = mirrored(g['p'], (a + b) / 2.0)

    a, b = ink('c')
    g['c'] = minus(ring(a, -OVL, b, XH + OVL, LS, LR, LR),
                   rect((a + b) / 2.0, XH * 0.33, b + 10, XH * 0.66))

    a, b = ink('e')
    bar_y = XH * 0.46
    g['e'] = union(minus(ring(a, -OVL, b, XH + OVL, LS, LR, LR),
                         rect((a + b) / 2.0, XH * 0.30, b + 10, bar_y)),
                   rect(a, bar_y, b, bar_y + LB))

    a, b = ink('a')
    c = (a + b) / 2.0
    top = minus(ring(a + 15, XH * 0.38, b, XH + OVL, LS, LR, LB),
                rect(a - 10, XH * 0.38 - 10, c, XH * 0.70))
    g['a'] = union(top, rect(b - LS, 0, b, XH * 0.70),
                   ring(a, -OVL, b - 20, XH * 0.60, LS, LB, LR))

    a, b = ink('f')
    xs = a + 70
    hook = minus(rrect(xs, ASC - 380, b, ASC, tl=(200, 230)), rect(xs + LS, ASC - 381, b + 10, ASC - LB))
    g['f'] = union(rect(xs, 0, xs + LS, ASC - 100), hook, rect(a, XH - LB, b - 40, XH))

    a, b = ink('g')
    bowl_g = ring(a, 60, b, XH + OVL, LS, LR, LR)
    desc = minus(u_shape(a, b, 1, DSC, LS, LR), rect(a - 10, DSC + LR + 60, a + LS + 10, 10))
    g['g'] = union(bowl_g, rect(b - LS, DSC + 100, b, XH), desc)

    a, b = ink('i')
    dot = rect(a, ASC - 185, b, ASC)
    g['i'] = union(rect(a, 0, b, XH), dot)
    g['dotlessi'] = rect(a, 0, b, XH)
    g['l'] = rect(a, 0, b, ASC)

    a, b = ink('j')
    hook = minus(rrect(a, DSC, b, DSC + LR + 120, br=(LS, 200)),
                 rect(a - 10, DSC + LR, b - LS, DSC + LR + 130))
    g['j'] = union(rect(b - LS, DSC + 150, b, XH), hook, rect(b - LS, ASC - 185, b, ASC))

    a, b = ink('k')
    t = LS * 1.15
    yj = XH * 0.28
    arm = band((a + LS - 5, yj), (b, XH), (b - t, XH), (a + LS - 5, yj + LB * 2.0))
    leg = band((a + LS - 5, XH * 0.55), (b - t, 0), (b, 0), (a + LS - 5 + t, XH * 0.55))
    g['k'] = union(rect(a, 0, a + LS, ASC), inter(union(arm, leg), rect(a, 0, b, XH)))

    a, b = ink('r')
    # Full-width shoulder ending in a short drop terminal.
    shoulder = minus(arch(a, b, XH + OVL, 0, LS, LA), rect(a + LS, -10, b + 10, XH * 0.64))
    g['r'] = union(rect(a, 0, a + LS, XH), shoulder)

    a, b = ink('s')
    g['s'] = s_shape(a, b, -OVL, XH + OVL, LS, LB, LR)

    a, b = ink('t')
    xs = a + 70
    foot = minus(rrect(xs, -OVL, b, 420, bl=(170, 200)), rect(xs + LS, LR - OVL, b + 10, 421))
    g['t'] = union(rect(xs, 300, xs + LS, ASC - 120), foot, rect(a, XH - LB, b - 20, XH))

    a, b = ink('v')
    g['v'] = vee(a, b, XH, 0, LS * 0.95, foot=1.0)

    a, b = ink('w')
    t = LS * 0.82
    c = (a + b) / 2.0
    g['w'] = union(vee(a, c + t * 0.5, XH, 0, t, foot=1.0), vee(c - t * 0.5, b, XH, 0, t, foot=1.0))

    a, b = ink('x')
    t = LS * 1.0
    g['x'] = inter(union(band((a, XH), (a + t, XH), (b, 0), (b - t, 0)),
                         band((b - t, XH), (b, XH), (a + t, 0), (a, 0))), rect(a, 0, b, XH))

    a, b = ink('y')
    t = LS * 0.95
    c = (a + b) / 2.0
    left = band((a, XH), (a + t, XH), (c + t * 0.5, 0), (c - t * 0.5, 0))
    slope = (b - c) / XH
    right = band((b - t, XH), (b, XH), (c + t * 0.5 + DSC * slope, DSC), (c - t * 0.5 + DSC * slope, DSC))
    g['y'] = union(inter(left, rect(a, 0, b, XH)), inter(right, rect(a, DSC, b, XH)))

    a, b = ink('z')
    t = LS * 1.08
    g['z'] = union(rect(a + 15, XH - LB, b, XH), rect(a, 0, b, LB),
                   inter(band((b - t, XH - LB), (b, XH - LB), (a + t, LB), (a, LB)), rect(a, 0, b, XH)))
    return g


def digit_glyphs():
    g = {}
    H = CAP
    mid = H / 2.0

    a, b = ink('0')
    g['0'] = ring(a, -OVC, b, H + OVC, CS, CR, CR)

    a, b = ink('1')
    flag = poly([(b - CS + 1, H), (a, H - 330), (a, H - 330 - CB * 1.1), (b - CS + 1, H - CB * 1.1)])
    g['1'] = union(rect(b - CS, 0, b, H), flag)

    a, b = ink('2')
    top = minus(ring(a + 8, H * 0.40, b - 6, H + OVC, CS, CR, CB),
                rect(a - 10, H * 0.40 - 10, (a + b) / 2.0, H * 0.72))
    t = CS * 1.12
    diag = band((b - 6 - t, H * 0.52), (b - 6, H * 0.52), (a + t, CB - 10), (a, CB - 10))
    g['2'] = union(top, inter(diag, rect(a, 0, b, H)), rect(a, 0, b, CB))

    a, b = ink('3')
    w = b - a
    up = minus(ring(a + 20, mid - CB / 2.0, b - 12, H + OVC, CS, CR, CB),
               rect(a + 10, mid + CB / 2.0 - 1, a + w * 0.5, H * 0.73))
    lo = minus(ring(a, -OVC, b, mid + CB / 2.0, CS, CB, CR),
               rect(a - 10, H * 0.27, a + w * 0.5, mid - CB / 2.0 + 1))
    g['3'] = minus(union(up, lo), rect(a - 10, mid - CB / 2.0 - 2, a + w * 0.28, mid + CB / 2.0 + 2))

    a, b = ink('4')
    xs = b - CS - 60
    yb = H * 0.22
    t = CS * 1.12
    diag = band((xs, H), (xs + t * 0.9, H), (a + t, yb + CB), (a, yb + CB))
    g['4'] = union(rect(xs, 0, xs + CS, H), rect(a, yb, b, yb + CB), inter(diag, rect(a, yb, b, H)))

    a, b = ink('5')
    top_bowl = H * 0.60
    w = b - a
    rx, ry = w / 2.0, 0.58 * w
    outer = rrect(a, -OVC, b, top_bowl, tr=(rx, ry), br=(rx, ry), bl=(rx, ry))
    wi = w - 2 * CS
    ryi = max(ry - CR, 0.5 * wi)
    inner = rrect(a + CS, -OVC + CR, b - CS, top_bowl - CB, tr=(wi / 2.0, ryi), br=(wi / 2.0, ryi), bl=(wi / 2.0, ryi))
    bowl5 = minus(outer, inner, rect(a - 10, H * 0.26, a + CS + 10, top_bowl - CB))
    g['5'] = union(bowl5, rect(a, top_bowl - CB, a + CS, H), rect(a, H - CB, b - 10, H))

    a, b = ink('6')
    lo = ring(a, -OVC, b, H * 0.62, CS, CB, CR)
    top = minus(ring(a, H * 0.40, b, H + OVC, CS, CR, CB),
                rect((a + b) / 2.0, H * 0.40 - 10, b + 10, H * 0.74))
    g['6'] = union(lo, top, rect(a, H * 0.30, a + CS, H * 0.75))
    g['9'] = rotated180(g['6'], (a + b) / 2.0, H / 2.0)

    a, b = ink('7')
    t = CS * 1.10
    g['7'] = union(rect(a, H - CB, b, H),
                   inter(band((b - t, H - CB), (b, H - CB), (a + 170 + t, 0), (a + 170, 0)), rect(a, 0, b, H)))

    a, b = ink('8')
    g['8'] = union(ring(a + 22, mid - CB / 2.0, b - 22, H + OVC, CS, CR, CB),
                   ring(a, -OVC, b, mid + CB / 2.0, CS, CB, CR))
    return g


def punct_glyphs():
    g = {}
    a, b = ink('.')
    dot = rect(a, 0, b, 233)
    g['.'] = dot
    g[':'] = union(dot, rect(a, 936, b, 1169))
    a, b = ink(',')
    g[','] = union(rect(a + 30, 0, b, 233), poly([(a + 30, 0), (b, 0), (a + 90, -230), (a, -230)]))
    a, b = ink(';')
    g[';'] = union(moved(g[','], a - ink(',')[0]), rect(a + 30, 936, b, 1169))
    a, b = ink('\u2026')
    d = 233
    step = (b - a - d) / 2.0
    g['\u2026'] = union(*[rect(a + i * step, 0, a + i * step + d, d) for i in range(3)])
    a, b = ink('-')
    g['-'] = rect(a, 470, b, 470 + CB)
    a, b = ink('+')
    c, t = (a + b) / 2.0, 110
    g['+'] = union(rect(a, 640 - t / 2.0, b, 640 + t / 2.0), rect(c - t / 2.0, 640 - (b - a) / 2.0, c + t / 2.0, 640 + (b - a) / 2.0))
    a, b = ink('/')
    t = CS * 0.95
    g['/'] = inter(band((a, -60), (a + t, -60), (b, CAP + 60), (b - t, CAP + 60)), rect(a, -60, b, CAP + 60))
    a, b = ink('!')
    g['!'] = union(rect(a, 400, b, CAP), rect(a, 0, b, 233))
    a, b = ink("'")
    g["'"] = rect(a + 20, CAP - 420, b - 20, CAP)
    a, b = ink('?')
    top = minus(ring(a, CAP * 0.45, b, CAP + OVC, CS, CR, CB),
                rect(a - 10, CAP * 0.45 - 10, (a + b) / 2.0, CAP * 0.72),
                rect((a + b) / 2.0 - CS / 2.0, CAP * 0.45 - 10, b + 10, CAP * 0.55))
    g['?'] = union(top, rect((a + b) / 2.0 - CS / 2.0, 400, (a + b) / 2.0 + CS / 2.0, CAP * 0.62), rect((a + b) / 2.0 - CS / 2.0, 0, (a + b) / 2.0 + CS / 2.0, 233))
    a, b = ink('(')
    g['('] = minus(rrect(a, -300, b + 300, CAP + 120, tl=(b - a, 600), bl=(b - a, 600)),
                   rrect(a + CS, -300 + 1, b + 301, CAP + 120 - 1, tl=(b - a - CS, 560), bl=(b - a - CS, 560)),
                   rect(b, -400, b + 400, CAP + 400))
    a, b = ink(')')
    g[')'] = mirrored(moved(g['('], -ink('(')[0] + (2 * a + b) - b - a), 0) if False else \
        mirrored(g['('], (ink('(')[0] + ink('(')[1] + a + b) / 4.0 * 2 / 2.0 + 0)
    a, b = ink('°')
    g['°'] = ring(a + 80, CAP - 520, b - 80, CAP + OVC, 120, 110, 110)
    a, b = ink('%')
    w = b - a
    sm = ring(a, CAP * 0.55, a + w * 0.36, CAP + OVC, 110, 100, 100)
    sm2 = ring(b - w * 0.36, -OVC, b, CAP * 0.45, 110, 100, 100)
    sl = inter(band((a + w * 0.30, -OVC), (a + w * 0.30 + 150, -OVC), (b - w * 0.30, CAP + OVC), (b - w * 0.30 - 150, CAP + OVC)), rect(a, -OVC, b, CAP + OVC))
    g['%'] = union(sm, sm2, sl)
    return g


def accent(kind, cx, base_top, caps):
    """An accent centered on cx, sitting above base_top (or below the baseline)."""
    gap = 70 if caps else 90
    y0 = base_top + gap
    h = (ASCENT - y0) if caps else 260
    h = min(h, 290)
    if kind == 'acute':
        w = 200
        return poly([(cx - w * 0.75, y0), (cx - w * 0.75 + 150, y0), (cx + w * 0.75, y0 + h), (cx + w * 0.75 - 170, y0 + h)])
    if kind in ('caron', 'circumflex'):
        t, w = 120, 330
        v = vee(cx - w / 2.0, cx + w / 2.0, y0 + h, y0, t, foot=1.2)
        return v if kind == 'caron' else rotated180(v, cx, y0 + h / 2.0)
    if kind == 'diaeresis':
        s = 150
        return union(rect(cx - 40 - s, y0, cx - 40, y0 + s), rect(cx + 40, y0, cx + 40 + s, y0 + s))
    if kind == 'ring':
        return ring(cx - 120, y0, cx + 120, y0 + 240, 85, 70, 70)
    if kind == 'breve':
        return u_shape(cx - 160, cx + 160, y0 + 200, y0, 90, 80, ry=140)
    if kind == 'cedilla':
        return union(rect(cx - 45, -150, cx + 45, 0), poly([(cx - 45, -150), (cx + 45, -150), (cx - 20, -330), (cx - 140, -330)]))
    raise ValueError(kind)


def accented_glyphs(base):
    g = {}
    for ch, (bch, kind) in ACCENTED.items():
        bw = WIDTHS['i' if bch == 'dotlessi' else bch]
        a, b = bw[1], bw[2]
        caps = bch.isupper()
        top = CAP if caps else XH
        cx = (a + b) / 2.0
        shape = base[bch]
        if kind == 'slash':
            t = LS * 0.85
            shape = union(shape, inter(band((a - 30, -OVL - 60), (a - 30 + t, -OVL - 60), (b + 30, XH + OVL + 60), (b + 30 - t, XH + OVL + 60)),
                                       rect(a - 30, -OVL - 60, b + 30, XH + OVL + 60)))
        elif kind == 'cedilla':
            shape = union(shape, accent(kind, cx, top, caps))
        else:
            shape = union(shape, accent(kind, cx, top, caps))
        g[ch] = shape
    return g


def all_glyphs():
    g = {}
    g.update(cap_glyphs())
    g.update(lower_glyphs())
    g.update(digit_glyphs())
    g.update(punct_glyphs())
    g.update(accented_glyphs(g))
    return g


# ---- hinting: exact pixel advances ----------------------------------------------------

def _ft_hinted_advance(adv, ppem):
    """FreeType's native-hinter advance in whole pixels: scale with its 16.16 fixed
    point maths, then round the advance phantom point to the pixel grid."""
    x_scale = ((ppem * 64) * 65536 + UPM // 2) // UPM
    scaled = (adv * x_scale + 0x8000) >> 16
    return ((scaled + 32) & ~63) // 64


def _target_px(ch, ppem):
    chars, vals = PIXEL_ADVANCES.get(ppem, ('', ''))
    i = chars.find(ch)
    if i >= 0:
        return int(vals[i], 36)
    if ch in ACCENTED:                      # e.g. \u011b uses e's widths
        base = ACCENTED[ch][0]
        return _target_px('i' if base == 'dotlessi' else base, ppem)
    return None


def hinting_program(ch, adv, npoints):
    """x-direction DELTAP1s on the advance phantom point, one per size that needs it."""
    asm = ['SVTCA[1]', 'PUSHB[ ] 2', 'SDS[ ]']     # deltas in quarter-pixel steps
    for ppem in sorted(PIXEL_ADVANCES):
        want = _target_px(ch, ppem)
        if want is None:
            continue
        delta = want - _ft_hinted_advance(adv, ppem)
        if not delta:
            continue
        if abs(delta) > 2:
            raise ValueError("%r at %d px: advance off by %d px; adjust WIDTHS" % (ch, ppem, delta))
        steps = delta * 4
        code = steps + 8 if steps < 0 else steps + 7
        asm += ['PUSHB[ ] %d' % ppem, 'SDB[ ]', 'PUSHB[ ] %d %d 1' % (code, npoints + 1), 'DELTAP1[ ]']
    prog = ttProgram.Program()
    prog.fromAssembly(asm)
    return prog


# ---- font assembly ----------------------------------------------------------------

def glyph_name(ch):
    if ch == 'dotlessi':
        return 'dotlessi'
    return 'uni%04X' % ord(ch)


def build_font():
    shapes = all_glyphs()
    order = ['.notdef', 'space']
    cmap = {0x20: 'space'}
    glyphs, metrics = {}, {}

    def to_tt(path):
        path = pathops.simplify(path, fix_winding=True, clockwise=True)
        pen = TTGlyphPen(None)
        path.draw(Cu2QuPen(pen, max_err=1.0, reverse_direction=False))
        return pen.glyph()

    # .notdef doubles as the watch's wildcard box for missing characters; its width
    # matches what the layouts expect.
    nd = minus(rect(100, 0, 1129, CAP), rect(260, 160, 969, CAP - 160))
    glyphs['.notdef'] = to_tt(nd)
    metrics['.notdef'] = (1229, 100)
    glyphs['space'] = TTGlyphPen(None).glyph()
    metrics['space'] = (WIDTHS[' '][0], 0)

    chars = [c for c in WIDTHS if c != ' '] + list(ACCENTED)
    for ch in chars:
        name = glyph_name(ch)
        order.append(name)
        cmap[ord(ch)] = name
        glyphs[name] = to_tt(shapes[ch])
        if ch in WIDTHS:
            adv = WIDTHS[ch][0]
        else:
            bch = ACCENTED[ch][0]
            adv = WIDTHS['i' if bch == 'dotlessi' else bch][0]
        glyphs[name].recalcBounds(None)
        metrics[name] = (adv, getattr(glyphs[name], 'xMin', 0))
        npoints = len(glyphs[name].coordinates) if glyphs[name].numberOfContours > 0 else 0
        if npoints:
            glyphs[name].program = hinting_program(ch, adv, npoints)

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ASCENT, descent=-DESCENT)
    fb.setupNameTable({
        "familyName": FAMILY, "styleName": "Regular",
        "uniqueFontIdentifier": FAMILY + " " + VERSION,
        "fullName": FAMILY, "psName": "Trekv6LCARS-Regular",
        "version": "Version " + VERSION, "copyright": COPYRIGHT,
        "manufacturer": "Nick Betcher", "designer": "Nick Betcher",
        "licenseDescription": LICENSE,
        "licenseInfoURL": "https://zlib.net/zlib_license.html",
    })
    fb.setupOS2(sTypoAscender=ASCENT, sTypoDescender=-DESCENT, sTypoLineGap=0,
                usWinAscent=ASCENT, usWinDescent=DESCENT, sxHeight=XH, sCapHeight=CAP,
                fsType=0, achVendID="NONE")
    fb.setupPost()
    fb.setupHead(unitsPerEm=UPM, created=0, modified=0)
    # Integer ppem, and instructions may alter advance widths (they do: see above).
    fb.font['head'].flags |= (1 << 3) | (1 << 4)
    maxp = fb.font['maxp']
    maxp.maxStackElements = max(maxp.maxStackElements, 8)
    maxp.maxSizeOfInstructions = max(len(g.program.getBytecode()) for g in glyphs.values()
                                     if hasattr(g, 'program'))
    fb.font['head'].created = fb.font['head'].modified = 3786825600   # fixed, for reproducible output
    fb.font.recalcTimestamp = False
    buf = io.BytesIO()
    fb.font.save(buf)
    return buf.getvalue()


def web_subset(data):
    """The browser preview's subset: every character this font draws on the watch."""
    from fontTools import subset
    font = __import__('fontTools.ttLib', fromlist=['TTFont']).TTFont(io.BytesIO(data), recalcTimestamp=False)
    opts = subset.Options()
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=sorted(font.getBestCmap()))
    sub.subset(font)
    font['head'].created = font['head'].modified = 3786825600
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue()


def clay_custom_with(data):
    """clay-custom.js with its embedded TrekLCARS face replaced by this font."""
    import base64
    import re
    with open(CLAY_CUSTOM, encoding="utf-8") as f:
        src = f.read()
    pat = re.compile(r"(@font-face\{font-family:'TrekLCARS';src:url\(data:font/ttf;base64,)"
                     r"[A-Za-z0-9+/=]+(\))")
    if len(pat.findall(src)) != 1:
        raise ValueError("expected one embedded TrekLCARS face in src/pkjs/clay-custom.js")
    b64 = base64.b64encode(web_subset(data)).decode("ascii")
    return pat.sub(lambda m: m.group(1) + b64 + m.group(2), src)


def specimen(data, out):
    from PIL import Image, ImageDraw, ImageFont
    f = ImageFont.truetype(io.BytesIO(data), 140)
    lines = ["ABCDEFGHIJKLM", "NOPQRSTUVWXYZ", "abcdefghijklm", "nopqrstuvwxyz",
             "0123456789:.+-°%", "ÁÇČÚŘĚŠŞ áäåéíöøúûýěğřž"]
    im = Image.new('L', (1700, 6 * 165 + 20), 255)
    d = ImageDraw.Draw(im)
    for i, l in enumerate(lines):
        d.text((10, 5 + i * 165), l, font=f, fill=0)
    im.save(out)


def main():
    data = build_font()
    args = sys.argv[1:]
    if '--specimen' in args:
        specimen(data, args[args.index('--specimen') + 1])
    clay = clay_custom_with(data)
    if '--check' in args:
        try:
            with open(OUT, 'rb') as f:
                current = f.read()
        except FileNotFoundError:
            current = None
        with open(CLAY_CUSTOM, encoding='utf-8') as f:
            clay_current = f.read()
        stale = []
        if current != data:
            stale.append("resources/fonts/LCARS.ttf")
        if clay_current != clay:
            stale.append("src/pkjs/clay-custom.js (embedded preview font)")
        for name in stale:
            print("%s is stale: run python3 make_font.py, then python3 make_shim.py" % name)
        return 1 if stale else 0
    if '--specimen' not in args or '--write' in args:
        with open(OUT, 'wb') as f:
            f.write(data)
        with open(CLAY_CUSTOM, 'w', encoding='utf-8') as f:
            f.write(clay)
        print("wrote resources/fonts/LCARS.ttf (%d bytes) and the preview's embedded copy;"
              " now run: python3 make_shim.py" % len(data))
    return 0


if __name__ == '__main__':
    sys.exit(main())
