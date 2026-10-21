#!/usr/bin/env python3
"""Build resources/fonts/LCARS.ttf, the watchface's LCARS-style display font.

Every glyph is drawn here from simple geometry: rectangles, polygons, rounded
boxes and a few Bezier curves, combined with boolean path operations. Nothing
is traced or converted from another font. The letter structure (stroke and bar
positions, corner radii, terminal cuts) follows measurements of the classic
ultra-compressed LCARS lettering, and the advance widths match it exactly so the
existing watch layouts keep fitting.

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
KC = 0.552                           # circular corner
RO, RB, RW = 255, 240, 220           # corner radius: round letters, bowls, the B/R waist
RL = 205                             # corner radius: round lowercase

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


def wedge(p, u, v, r):
    """The corner region between two edges leaving p along unit vectors u and v,
    closed by a quarter curve r units out. Union it into a concave corner to fill
    it, or subtract it from a convex corner to round it."""
    a = (p[0] + u[0] * r, p[1] + u[1] * r)
    b = (p[0] + v[0] * r, p[1] + v[1] * r)
    c1 = (a[0] + (p[0] - a[0]) * KC, a[1] + (p[1] - a[1]) * KC)
    c2 = (b[0] + (p[0] - b[0]) * KC, b[1] + (p[1] - b[1]) * KC)
    return _path(lambda pen: (pen.moveTo(p), pen.lineTo(a), pen.curveTo(c1, c2, b), pen.closePath()))


def counter(x0, y0, x1, y1, r=40):
    """A bowl's counter: square against the stem, slightly rounded on the right."""
    return rrect(x0, y0, x1, y1, tr=(r, r), br=(r, r), k=KC)


def stadium(x0, y0, x1, y1):
    r = (x1 - x0) / 2.0
    return rrect(x0, y0, x1, y1, (r, r), (r, r), (r, r), (r, r), k=KC)


def oring(x0, y0, x1, y1, side, top, bot, ro=RO):
    """A round letter: circular outer corners around a stadium-shaped counter."""
    c = (ro, ro)
    return minus(rrect(x0, y0, x1, y1, c, c, c, c, k=KC), stadium(x0 + side, y0 + bot, x1 - side, y1 - top))


def u_round(x0, x1, y_top, y_bot, side, bot, ro=RO):
    """Two stems joined by a round bottom, around a stadium-ended counter."""
    wi = (x1 - x0) - 2 * side
    ri = (wi / 2.0, wi / 2.0)
    return minus(rrect(x0, y_bot, x1, y_top, br=(ro, ro), bl=(ro, ro), k=KC),
                 rrect(x0 + side, y_bot + bot, x1 - side, y_top + 10, br=ri, bl=ri, k=KC))


def s_spine(x0, x1, y_bot, y_top, side, thick, cut_top, cut_bot, ro=RO, slope=0.72, half_w=0.253):
    """S: a round top and bottom joined by a straight diagonal spine. cut_top is where
    the upper right terminal ends; cut_bot is where the lower left terminal ends."""
    cx, cy = (x0 + x1) / 2.0, (y_bot + y_top) / 2.0
    hw = half_w * (x1 - x0)
    n = (1 + slope * slope) ** 0.5
    up, down = (0.0, 1.0), (slope / n, -1.0 / n)

    def xc(y):
        return cx + (cy - y) * slope

    y_out = cy - (x0 + hw - cx) / slope            # spine's outer edge meets the left side
    y_in = cy - (x0 + side - hw - cx) / slope      # spine's inner edge meets the counter

    def half(cut):
        c = (ro, ro)
        wi = (x1 - x0) - 2 * side
        u = minus(rrect(x0, cy, x1, y_top, tl=c, tr=c, k=KC),
                  rrect(x0 + side, cy - 10, x1 - side, y_top - thick, tl=(wi / 2.0, wi / 2.0), tr=(wi / 2.0, wi / 2.0), k=KC),
                  rect(cx, cy - 10, x1 + 10, cut), rect(x0 - 10, cy - 10, cx, y_out))
        u = union(u, wedge((x0 + side, y_in), up, down, 90))
        return minus(u, wedge((x0, y_out), up, down, 110))

    spine = inter(poly([(xc(y_bot) - hw, y_bot), (xc(y_top) - hw, y_top), (xc(y_top) + hw, y_top), (xc(y_bot) + hw, y_bot)]),
                  rect(x0, y_bot, x1, y_top))
    return union(half(cut_top), rotated180(half(2 * cy - cut_bot), cx, cy), spine)


# ---- glyphs ----------------------------------------------------------------------

def ink(ch):
    w = WIDTHS[ch]
    return w[1], w[2]


def cap_glyphs():
    g = {}
    top, bot = CAP + OVC, -OVC

    a, b = ink('A')
    outer = poly([(a, 0), (176, CAP), (510, CAP), (b, 0)])
    lower = poly([(217, 0), (264, 398), (401, 398), (446, 0)])
    upper = poly([(283, 588), (335, 1262), (385, 588)])
    g['A'] = minus(outer, lower, upper)

    # Bowls: circular outer corners, near-square counters.
    a, b = ink('B')
    g['B'] = minus(union(rect(a, 0, a + CS, CAP), rect(a, 691, 406, 870),
                         rrect(a, 780, b, CAP, tr=(RB, RB), br=(RW, RW), k=KC),
                         rrect(a, 0, b, 775, tr=(RW, RW), br=(RB, RB), k=KC)),
                   counter(a + CS - 1, 870, 406, 1306), counter(a + CS - 1, 180, 406, 691))

    a, b = ink('C')
    g['C'] = minus(oring(a, bot, b, top, CS, CR, CR + 7), rect((a + b) / 2.0, 573, b + 10, 931))

    a, b = ink('D')
    g['D'] = minus(union(rect(a, 0, a + CS, CAP), rrect(a, 0, b, CAP, tr=(RB, RB), br=(RB, RB), k=KC)),
                   counter(a + CS - 1, 180, 406, 1306))

    a, b = ink('E')
    g['E'] = union(rect(a, 0, a + CS - 1, CAP), rect(a, CAP - CB, b, CAP),
                   rect(a, 710, b - 6, 903), rect(a, 0, b, 203))

    a, b = ink('F')
    g['F'] = union(rect(a, 0, a + CS - 1, CAP), rect(a, CAP - CB, b, CAP), rect(a, 710, b - 6, 903))

    a, b = ink('G')
    o = oring(a, bot, b, top, CS, CR, CR + 7)
    c = (a + b) / 2.0
    corner = minus(rrect(c - 10, bot, 498, 400, br=(200, 200), k=KC), rrect(a + CS, bot + CR + 7, b - CS, top - CR,
                   tl=(64.5, 64.5), tr=(64.5, 64.5), br=(64.5, 64.5), bl=(64.5, 64.5)))
    g['G'] = union(minus(o, rect(c, 748, b + 10, 931), rect(c, bot - 10, b + 10, 160)),
                   corner, rect(307, 566, b, 748), rect(498, 0, b, 566), rect(b - CS, 160, b, 566))

    a, b = ink('H')
    g['H'] = union(rect(a, 0, a + CS - 1, CAP), rect(b - CS + 1, 0, b, CAP), rect(a, 710, b, 913))

    a, b = ink('I')
    g['I'] = rect(a, 0, b, CAP)

    a, b = ink('J')
    g['J'] = minus(u_round(a, b, CAP, bot, CS, CR), rect(a - 10, 573, b - CS - 2, CAP + 10))

    a, b = ink('K')
    def arm(y, edge):
        return (298 if edge == 0 else 505) + (y - 870) * (0.26 if edge == 0 else 0.27)
    def leg(y, edge):
        return (432 - (y - 20) * 0.203) if edge == 0 else (664 - (y - 20) * 0.227)
    strokes = union(poly([(arm(750, 0), 750), (arm(CAP, 0), CAP), (arm(CAP, 1), CAP), (arm(750, 1), 750)]),
                    poly([(leg(0, 0), 0), (leg(810, 0), 810), (leg(810, 1), 810), (leg(0, 1), 0)]))
    g['K'] = union(rect(a, 0, a + CS - 1, CAP), inter(strokes, rect(a, 0, b, CAP)))

    a, b = ink('L')
    g['L'] = union(rect(a, 0, a + CS - 1, CAP), rect(a, 0, b, 203))

    # M, N, V, W: near-vertical strokes, as in the LCARS displays.
    def slant(x_bot, x_top):
        """Band between two lines, each given by its x at y=0 and y=CAP."""
        return poly([(x_bot[0], 0), (x_top[0], CAP), (x_top[1], CAP), (x_bot[1], 0)])
    a, b = ink('M')
    g['M'] = union(poly([(a, 0), (a, CAP), (232, CAP), (236, 1220), (246, 820), (246, 0)]),
                   poly([(702, 0), (718, CAP), (b, CAP), (b, 0)]),
                   inter(union(slant((369, 506), (224, 400)), slant((456, 586), (576, 729))), rect(a, 0, b, CAP)))

    a, b = ink('N')
    g['N'] = union(poly([(a, 0), (a, CAP), (221, CAP), (236, 0)]),
                   poly([(562, 0), (546, CAP), (b, CAP), (b, 0)]),
                   inter(slant((403, 572), (213, 395)), rect(a, 0, b, CAP)))

    a, b = ink('V')
    g['V'] = inter(union(slant((172, 359), (a, 222)), slant((311, 489), (453, b))), rect(a, 0, b, CAP))

    a, b = ink('W')
    g['W'] = inter(union(slant((112, 294), (a, 204)), slant((254, 378), (357, 483)),
                         slant((535, 677), (448, 597)), slant((635, 782), (750, b))), rect(a, 0, b, CAP))

    a, b = ink('O')
    g['O'] = oring(a, bot, b, top, CS, CR, CR + 7)

    a, b = ink('P')
    g['P'] = minus(union(rect(a, 0, a + CS, CAP), rrect(a, 576, b, CAP, tr=(RB, RB), br=(230, 230), k=KC)),
                   counter(a + CS - 1, 750, 406, 1306))

    a, b = ink('Q')
    g['Q'] = union(oring(a, bot, ink('O')[1], top, CS, CR, CR + 7), rrect(400, -180, b, -8, bl=(80, 140), k=KC))

    a, b = ink('R')
    bb = ink('B')[1]
    flare = _path(lambda p: (p.moveTo((406, 240)), p.lineTo((bb, 240)),
                             p.curveTo((bb, 120), (b - 30, 50), (b, 0)), p.lineTo((432, 0)),
                             p.curveTo((416, 60), (406, 120), (406, 240)), p.closePath()))
    g['R'] = minus(union(rect(a, 0, a + CS, CAP), rect(a, 691, 406, 870),
                         rrect(a, 780, bb, CAP, tr=(RB, RB), br=(RW, RW), k=KC),
                         rrect(a + CS - 1, 0, bb, 775, tr=(RW, RW), k=KC), flare),
                   counter(a + CS - 1, 870, 406, 1306), counter(a + CS - 1, -10, 406, 691))

    a, b = ink('S')
    g['S'] = s_spine(a, b, bot, top, CS, 175, 931, 570)

    a, b = ink('T')
    c = (a + b) / 2.0
    g['T'] = union(rect(a, 1285, b, CAP), rect(186, 0, 406, CAP))

    a, b = ink('U')
    g['U'] = u_round(a, b, CAP, bot, CS, CR + 7)

    a, b = ink('X')
    def band_y(x0a, x0b, y0, x1a, x1b, y1):
        return poly([(x0a, y0), (x1a, y1), (x1b, y1), (x0b, y0)])
    g['X'] = inter(union(band_y(159, 342, 770, -10, 244, CAP), band_y(300, 464, 770, 442, 651, CAP),
                         band_y(a, 186, 0, 174, 333, 770), band_y(424, b, 0, 290, 485, 770)), rect(a, 0, b, CAP))

    a, b = ink('Y')
    g['Y'] = union(rect(184, 0, 410, 560),
                   inter(union(poly([(a, CAP), (187, CAP), (370, 552), (184, 552)]),
                               poly([(426, CAP), (b, CAP), (410, 552), (243, 552)])), rect(a, 0, b, CAP)))

    a, b = ink('Z')
    g['Z'] = union(rect(a + 6, 1285, b, CAP), rect(a, 0, b, 190),
                   poly([(6, 190), (260, 1285), (492, 1285), (240, 190)]))
    return g


def lower_glyphs():
    g = {}
    top, bot = XH + 10, -17
    TL, TR = (180, 120), (120, 160)      # arch corners: notched at the stem, round outside

    def arch(x0, x1, cx0, cx1, y_top=XH, c_top=1031):
        """Lowercase arch springing from a stem at x0, over a stadium-topped counter."""
        r = ((cx1 - cx0) / 2.0,) * 2
        return minus(rrect(x0, 0, x1, y_top, tl=TL, tr=TR, k=KC), rrect(cx0, -10, cx1, c_top, tl=r, tr=r, k=KC))

    def bowl(x0, x1, cx0, cx1, y_bot=-10, c_bot=152):
        """Bowl of b and p: notched against the stem at both ends."""
        r = ((cx1 - cx0) / 2.0,) * 2
        return minus(rrect(x0, y_bot, x1, XH, tl=TL, tr=TR, br=TR, bl=TL, k=KC),
                     rrect(cx0, c_bot, cx1, 1031, tl=r, tr=r, br=r, bl=r, k=KC))

    a, b = ink('o')
    g['o'] = oring(a, bot, b, top, 199, 142, 140, ro=RL)

    a, b = ink('n')
    g['n'] = union(rect(a, 0, 242, 1180), arch(242, b, 242, 332))
    g['h'] = union(rect(a, 0, 242, ASC), arch(242, b, 242, 332))
    g['u'] = rotated180(g['n'], (a + b) / 2.0, XH / 2.0)
    g['r'] = union(rect(a, 0, 242, 1180), minus(arch(242, b, 242, 332), rect(242, -10, b + 10, 575)))

    a, b = ink('m')
    g['m'] = union(rect(a, 0, 238, 1180), arch(238, 520, 238, 328), arch(520, b, 520, 610))

    a, b = ink('b')
    g['b'] = union(rect(a, 0, 242, ASC), bowl(242, b, 242, 332))
    g['d'] = mirrored(g['b'], (a + b) / 2.0)
    g['p'] = union(rect(a, DSC, 242, 1180), bowl(242, b, 242, 332))
    g['q'] = mirrored(g['p'], (a + b) / 2.0)

    a, b = ink('c')
    g['c'] = minus(oring(a, bot, b, top, 199, 142, 140, ro=RL), rect((a + b) / 2.0, 455, b + 10, 755))

    a, b = ink('e')
    g['e'] = union(minus(oring(a, bot, b, top, 199, 142, 140, ro=RL), rect((a + b) / 2.0, 467, b + 10, 562)),
                   rect(a, 562, b, 702))

    a, b = ink('a')
    bs = 522                                       # bowl and stem edge; the foot flares to b
    shoulder = _path(lambda p: (p.moveTo((326, 870)), p.curveTo((305, 805), (200, 725), (110, 660)),
                                p.curveTo((60, 620), (a, 560), (a, 470)),
                                p.lineTo((a, 160)), p.curveTo((a, 66), (117, -10), (211, -10)),
                                p.lineTo((220, -10)), p.curveTo((275, -10), (322, 40), (322, 115)),
                                p.closePath()))
    hole = inter(rrect(237, 152, 326, 620, br=(44, 44), bl=(44, 44), k=KC),
                 poly([(230, 100), (230, 480), (326, 600), (340, 600), (340, 100)]))
    g['a'] = union(inter(oring(a, 300, bs, top, 196, 142, 140, ro=RL), rect(a - 10, 755, bs + 10, top + 10)),
                   rect(326, 0, bs, 1060), poly([(332, 0), (b, 0), (bs, 150), (326, 150)]), minus(shoulder, hole))

    a, b = ink('f')
    g['f'] = union(rect(45, 0, 242, 1320), rrect(45, 1320, b, ASC, tl=(110, 120), k=KC), rect(a, 1025, b, 1180))

    a, b = ink('g')
    gb = minus(rrect(45, 130, 332, XH, tl=TR, tr=TL, br=TL, bl=TR, k=KC), stadium(242, 311, 332, 1031))
    desc = minus(rrect(45, DSC, b, 85, bl=(230, 200), br=(230, 200), k=KC),
                 rrect(242, -111, 332, 200, bl=(45, 45), br=(45, 45), k=KC))
    g['g'] = union(gb, rect(332, -50, b, 1180), desc)

    a, b = ink('i')
    g['i'] = union(rect(a, 0, b, 1180), rect(a, 1267, b, ASC))
    g['dotlessi'] = rect(a, 0, b, 1180)
    g['l'] = rect(a, 0, b, ASC)

    a, b = ink('j')
    g['j'] = union(rect(45, -100, b, 1180), rect(45, 1267, b, ASC),
                   rrect(a, DSC, b, -40, tl=(90, 110), br=(110, 130), k=KC))

    a, b = ink('k')
    arm = poly([(254 + (625 - 650) * 0.184, 625), (254 + (XH - 650) * 0.184, XH),
                (432 + (XH - 650) * 0.228, XH), (432 + (625 - 650) * 0.228, 625)])
    leg = poly([(252 + 620 * 0.1825, 0), (252 - 25 * 0.1825, 645), (439 - 25 * 0.207, 645), (439 + 620 * 0.207, 0)])
    g['k'] = union(rect(a, 0, 242, ASC), rect(242, 625, 262, 645), inter(union(arm, leg), rect(a, 0, b, XH)))

    a, b = ink('s')
    g['s'] = s_spine(a, b, bot, top, 199, 142, 755, 455, ro=RL, slope=0.8, half_w=0.282)

    a, b = ink('t')
    g['t'] = union(rect(45, 150, 242, 1410), rrect(45, -5, b, 160, bl=(150, 130), k=KC), rect(a, 1025, b, 1185))

    a, b = ink('v')
    g['v'] = inter(union(poly([(154.5, 0), (a, XH), (186, XH), (305, 0)]),
                         poly([(267, 0), (377, XH), (b + 1, XH), (407.5, 0)])), rect(a, 0, b, XH))

    a, b = ink('w')
    g['w'] = inter(union(poly([(139, 0), (a, XH), (207, XH), (279, 0)]), poly([(262, 0), (342, XH), (471, XH), (376, 0)]),
                         poly([(525, 0), (426, XH), (561, XH), (639, 0)]), poly([(621, 0), (702, XH), (b, XH), (752, 0)])),
                   rect(a, 0, b, XH))

    a, b = ink('x')
    g['x'] = inter(union(poly([(114, 650), (10, XH), (210, XH), (284, 650)]), poly([(248, 650), (312, XH), (b, XH), (406, 650)]),
                         poly([(a, 0), (133, 700), (280, 700), (189, 0)]), poly([(321, 0), (225, 700), (389, 700), (b, 0)])),
                   rect(a, 0, b, XH))

    a, b = ink('y')
    left = poly([(161, 0), (a, XH), (198, XH), (296, 0)])
    right = poly([(269, -110), (370, XH), (b, XH), (382, -110)])
    g['y'] = union(inter(left, rect(a, 0, b, XH)), inter(right, rect(a, -110, b, XH)), rect(163, -110, 300, 1),
                   rrect(37, DSC, 385, -105, br=(160, 150), k=KC))

    a, b = ink('z')
    g['z'] = union(rect(a, 1015, 444, XH), rect(a, 0, b, 170), poly([(18, 170), (235, 1015), (444, 1015), (228, 170)]))
    return g


def digit_glyphs():
    g = {}
    top, bot = CAP + OVC, -OVC

    a, b = ink('0')
    g['0'] = oring(a, bot, b, top, CS + 1, CR - 5, CR + 2)

    a, b = ink('1')
    flag = _path(lambda p: (p.moveTo((a, 1145)), p.lineTo((a, 1290)),
                            p.curveTo((a + 150, 1290), (274, CAP - 135), (274, CAP)),
                            p.lineTo((b, CAP)), p.lineTo((b, 1145)), p.closePath()))
    g['1'] = union(rect(233, 0, b, 1146), flag)

    a, b = ink('2')
    neck = _path(lambda p: (p.moveTo((b, 1110)), p.curveTo((b, 740), (296, 520), (296, 195)),
                            p.lineTo((53, 195)), p.curveTo((53, 560), (401, 800), (401, 1070)), p.closePath()))
    g['2'] = union(inter(oring(53, 500, b, top, CS + 1, 181, 175), rect(a - 10, 1080, b + 10, top + 10)),
                   rect(53, 964, 274, 1100), neck, rect(a, 0, b - 7, 195))

    a, b = ink('3')
    up = minus(rrect(a, 700, b, top, tl=(RO, RO), tr=(RO, RO), br=(RW, RW), k=KC), stadium(272, 823, 397, top - 175))
    lo = minus(rrect(a, bot, b, 760, tr=(RW, RW), br=(RO, RO), bl=(RO, RO), k=KC), stadium(272, bot + 182, 397, 643))
    g['3'] = minus(union(up, lo, rect(272, 643, 397, 823)), rect(a - 10, 540, 272, 939))

    a, b = ink('4')
    def d4(y, edge):
        return (277 - (1470 - y) * 0.2956) if edge == 0 else (374 - (1270 - y) * 0.254)
    stem = poly([(360, 0), (360, 368), (370, 547), (377, 900), (383, 1100), (392, 1220), (396, 1262), (370, 1300), (370, CAP), (580, CAP), (580, 0)])
    diag = poly([(d4(547, 0), 547), (d4(CAP, 0), CAP), (d4(CAP, 1), CAP), (d4(547, 1), 547)])
    g['4'] = union(stem, rect(a, 368, b, 547), inter(diag, rect(a, 368, 580, CAP)))

    a, b = ink('5')
    bowl5 = minus(rrect(61, bot, 625, 930, tr=(234, 200), br=(RO, RO), bl=(RO, RO), k=KC),
                  rrect(276, bot + 182, 406, 732, tr=(80, 80), br=(65, 65), bl=(65, 65), k=KC),
                  rect(50, 540, 276, 732), wedge((291, 930), (1.0, 0.0), (0.0, -1.0), 60))
    g['5'] = union(bowl5, rect(70, 690, 291, CAP), rect(70, 1295, b, CAP))

    a, b = ink('6')
    c = (a + b) / 2.0
    bowl6 = minus(rrect(275, bot, b, 895, tl=(150, 150), tr=(180, 180), br=(RO, RO), k=KC), stadium(276, bot + 182, 406, 703))
    g['6'] = union(minus(oring(a, bot, b, top, CS - 1, 175, 182), rect(c, 703, b + 10, 941)), bowl6)

    a, b = ink('9')
    c = (a + b) / 2.0
    bowl9 = minus(rrect(a, 505, 402, 1000, bl=(150, 210), br=(150, 150), k=KC), stadium(272, 698, 401, top - 185))
    g['9'] = union(minus(oring(a, bot, b, top, CS + 1, 185, 182), rect(a - 10, 449, c, 698)), bowl9)

    a, b = ink('7')
    g['7'] = union(rect(a, 1290, b, CAP),
                   inter(poly([(70, 0), (400, 1290), (b, 1290), (307, 0)]), rect(a, 0, b, CAP)))

    a, b = ink('8')
    g['8'] = union(oring(a, 750, b, top, CS + 1, 175, 118), oring(a, bot, b, 790, CS + 1, 123, 182))
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
    a, b = ink('…')
    d = 233
    step = (b - a - d) / 2.0
    g['…'] = union(*[rect(a + i * step, 0, a + i * step + d, d) for i in range(3)])
    a, b = ink('-')
    g['-'] = rect(a, 470, b, 470 + CB)
    a, b = ink('+')
    g['+'] = union(rect(a, 529, b, 694), rect(768, 1, 938, 1221))
    a, b = ink('/')
    t = CS * 0.95
    g['/'] = inter(band((a, -60), (a + t, -60), (b, CAP + 60), (b - t, CAP + 60)), rect(a, -60, b, CAP + 60))
    a, b = ink('!')
    g['!'] = union(rect(a, 330, b, CAP), rect(a, 0, b, 240))
    a, b = ink("'")
    g["'"] = rect(a + 20, CAP - 420, b - 20, CAP)

    a, b = ink('?')
    neck = _path(lambda p: (p.moveTo((b, 1060)), p.curveTo((b, 860), (360, 800), (360, 640)),
                            p.lineTo((162, 640)), p.curveTo((162, 800), (315, 950), (315, 1060)), p.closePath()))
    g['?'] = union(inter(oring(a, 500, b, CAP + OVC, 200, 140, 140), rect(a - 10, 1050, b + 10, CAP + OVC + 10)),
                   rect(a, 945, 225, 1100), neck, rect(162, 330, 360, 641), rect(162, 0, 360, 240))

    # Parentheses: an even-width arc, square-cut at both ends.
    a, b = ink('(')
    w, mid = 184, 660
    def arc_edge(p, dx, down):
        pts = [(318 + dx, 1490), (200 + dx, 1290), (133 + dx, 950), (133 + dx, mid),
               (133 + dx, 370), (200 + dx, 30), (318 + dx, -170)]
        if not down:
            pts.reverse()
        p.curveTo(*pts[1:4])
        p.curveTo(*pts[4:7])
    def paren(p):
        p.moveTo((318, 1490))
        arc_edge(p, 0, True)
        p.lineTo((318 + w, -170))
        arc_edge(p, w, False)
        p.closePath()
    g['('] = _path(paren)
    g[')'] = moved(mirrored(g['('], 0), ink(')')[1] + ink('(')[0])

    a, b = ink('°')
    g['°'] = minus(rrect(a, 869, b, 1465, *[((b - a) / 2.0, 298)] * 4, k=KC),
                        rrect(a + 110, 979, b - 110, 1355, *[((b - a) / 2.0 - 110, 188)] * 4, k=KC))

    a, b = ink('%')
    slash = poly([(262, -32), (755, 1505), (862, 1505), (369, -32)])
    g['%'] = union(oring(a, 689, 483, CAP + OVC, 168, 132, 132, ro=200),
                   oring(647, -OVC, b, 784, 162, 132, 132, ro=200), inter(slash, rect(a, -OVC, b, CAP + OVC)))
    return g


def accent(kind, cx, base_top, caps):
    """An accent centered on cx, sitting above base_top (or below the baseline)."""
    y0, h = (base_top + 90, 215) if caps else (base_top + 55, 235)
    if kind == 'acute':
        c = cx - 18
        return poly([(c - 58, y0), (c - 58 + 0.32 * h, y0 + h), (c + 58 + 0.62 * h, y0 + h), (c + 58, y0)])
    if kind in ('caron', 'circumflex'):
        flat, leg, s = 154, 121, 0.5
        x0, x1 = cx - flat / 2.0 - s * h, cx + flat / 2.0 + s * h
        apex = y0 + (flat / 2.0 + s * h - leg) / s      # the inner edges run parallel to the outer
        hat = minus(poly([(x0, y0), (cx - flat / 2.0, y0 + h), (cx + flat / 2.0, y0 + h), (x1, y0)]),
                    poly([(x0 + leg, y0 - 1), (cx, apex), (x1 - leg, y0 - 1)]))
        return hat if kind == 'circumflex' else rotated180(hat, cx, y0 + h / 2.0)
    if kind == 'diaeresis':
        return union(rect(cx - 180, y0 + 25, cx - 45, y0 + 210), rect(cx + 45, y0 + 25, cx + 180, y0 + 210))
    if kind == 'ring':
        return minus(rrect(cx - 158, y0, cx + 158, y0 + 330, *[(158, 165)] * 4, k=KC),
                     rrect(cx - 60, y0 + 90, cx + 60, y0 + 240, *[(60, 75)] * 4, k=KC))
    if kind == 'breve':
        return minus(rrect(cx - 159, y0, cx + 159, y0 + h, br=(159, 150), bl=(159, 150), k=KC),
                     rrect(cx - 59, y0 + 95, cx + 59, y0 + h + 10, br=(59, 60), bl=(59, 60), k=KC))
    if kind == 'cedilla':
        return poly([(cx - 33, 10), (cx + 72, 10), (cx - 19, -260), (cx - 195, -260)])
    raise ValueError(kind)


# Optical centering of an accent over its letter, in font units.
ACCENT_DX = {('dotlessi', 'acute'): -12, ('a', 'diaeresis'): 12, ('a', 'ring'): -6}


def accented_glyphs(base):
    g = {}
    for ch, (bch, kind) in ACCENTED.items():
        bw = WIDTHS['i' if bch == 'dotlessi' else bch]
        a, b = bw[1], bw[2]
        caps = bch.isupper()
        top = CAP if caps else XH
        cx = (a + b) / 2.0 + ACCENT_DX.get((bch, kind), 0)
        shape = base[bch]
        if kind == 'slash':
            x = lambda y: 6 + (y + 100) * 0.3236
            shape = union(shape, poly([(x(-130), -130), (x(1330), 1330), (x(1330) + 88, 1330), (x(-130) + 88, -130)]))
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
