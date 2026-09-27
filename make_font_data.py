#!/usr/bin/env python3
"""Rebuild the Settings preview's font data from a finished `pebble build`.

The preview draws text exactly as the watch does, so it carries font data lifted
from the compiled fonts rather than from the TTFs:

1. The PFA1 glyph atlas in the baked pack (`pack.emery.glyphs`, in both
   src/pkjs/preview-data.js and the TREK_GFX_PACK copy in src/pkjs/clay-custom.js)
   used by the pixel-exact Time 2 preview. There is one entry per font in
   `pack.emery.layout.FONTS`, read from build/emery/app_resources.pbpack.
2. DAY_GLYPH_METRICS in src/pkjs/clay-custom.js: [advance, ink left, ink width,
   ink top] of every day-string character in font_days, for the vector preview's
   day strip. The 144px size is read from build/basalt, the Time 2 size from
   build/emery.

Each atlas entry keeps the codepoints it already has. The day-strip font (and any
font new to the pack) also gets every character of the day strings in
src/c/languages.h. A newly added font starts from the largest existing text subset.
Codepoints the font does not contain are dropped; the watch and the preview then
both draw the wildcard glyph.

Run after `pebble build`, then `python3 make_shim.py`. With --check, nothing is
written and the exit status is 1 if either piece is stale.

The atlas format is documented in src/pkjs/shim/20-pack.js (prvParsePFA1). The
compiled-font format is the SDK's fontgen.py "Font v3" (uncompressed only).
"""
import base64
import json
import os
import re
import struct
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(ROOT, "build")
PKJS = os.path.join(ROOT, "src", "pkjs")
PREVIEW_DATA = os.path.join(PKJS, "preview-data.js")
CLAY_CUSTOM = os.path.join(PKJS, "clay-custom.js")
MAIN_C = os.path.join(ROOT, "src", "c", "main.c")
LANGUAGES_H = os.path.join(ROOT, "src", "c", "languages.h")

APP_PACK_TABLE_SIZE = 256            # pbpack.py: non-system packs
PACK_MARKER = "var TREK_GFX_PACK = "


# ---- built resources --------------------------------------------------------

def built_resources(platform):
    """{resource name: bytes} from build/<platform>/app_resources.pbpack."""
    ids_path = os.path.join(BUILD, platform, "src", "resource_ids.auto.h")
    pack_path = os.path.join(BUILD, platform, "app_resources.pbpack")
    if not (os.path.exists(ids_path) and os.path.exists(pack_path)):
        sys.exit("make_font_data.py: no %s build output - run `pebble build` first" % platform)
    with open(ids_path) as f:
        ids = {int(num): name for name, num in
               re.findall(r"#define\s+RESOURCE_ID_(\w+)\s+(\d+)", f.read())}
    with open(pack_path, "rb") as f:
        pack = f.read()
    count = struct.unpack_from("<I", pack, 0)[0]
    content = 12 + APP_PACK_TABLE_SIZE * 16
    out = {}
    for i in range(count):
        file_id, offset, length, _crc = struct.unpack_from("<IIII", pack, 12 + i * 16)
        if file_id in ids:
            out[ids[file_id]] = pack[content + offset: content + offset + length]
    return out


def parse_font(data):
    """Compiled font v3 -> (max_height, wildcard_cp, {cp: (w, h, left, top, adv, bits)})."""
    version, max_height, _count, wildcard, table_size, cp_bytes = \
        struct.unpack_from("<BBHHBB", data, 0)
    info_size, features = struct.unpack_from("<BB", data, 8)
    if version != 3 or features & 2:
        raise ValueError("unsupported font (version %d, features 0x%x)" % (version, features))
    offset_bytes = 2 if features & 1 else 4
    entry_size = cp_bytes + offset_bytes
    hash_table = info_size
    offset_tables = hash_table + table_size * 4
    total = sum(struct.unpack_from("<BBH", data, hash_table + i * 4)[1]
                for i in range(table_size))
    glyph_table = offset_tables + total * entry_size
    glyphs = {}
    for i in range(table_size):
        _hash, bucket, bucket_offset = struct.unpack_from("<BBH", data, hash_table + i * 4)
        for k in range(bucket):
            p = offset_tables + bucket_offset + k * entry_size
            cp = struct.unpack_from("<H" if cp_bytes == 2 else "<L", data, p)[0]
            g = glyph_table + struct.unpack_from(
                "<H" if offset_bytes == 2 else "<L", data, p + cp_bytes)[0]
            w, h, left, top, adv = struct.unpack_from("<BBbbb", data, g)
            raw = data[g + 5: g + 5 + (w * h + 31) // 32 * 4]
            bits = [(raw[n // 8] >> (n % 8)) & 1 for n in range(w * h)]
            glyphs[cp] = (w, h, left, top, adv, bits)
    return max_height, wildcard, glyphs


# ---- PFA1 atlas --------------------------------------------------------------

def b64u_decode(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def b64u_encode(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def split_atlas(blob):
    """PFA1 bytes -> [(key, entry bytes, [codepoints])]."""
    if blob[:4] != b"PFA1":
        raise ValueError("glyph atlas is not PFA1")
    fonts, p = [], 5
    for _ in range(blob[4]):
        key_len = blob[p]
        key = blob[p + 1: p + 1 + key_len].decode()
        q = p + 1 + key_len
        _max_height, _wildcard, count = struct.unpack_from("<BHH", blob, q)
        q += 5
        cps = [struct.unpack_from("<H", blob, q + i * 9)[0] for i in range(count)]
        q += count * 9
        q += 4 + struct.unpack_from("<I", blob, q)[0]
        fonts.append((key, blob[p:q], cps))
        p = q
    if p != len(blob):
        raise ValueError("trailing bytes in glyph atlas")
    return fonts


def atlas_entry(key, max_height, wildcard, glyphs, cps):
    index, bitmap = b"", bytearray()
    for cp in cps:
        w, h, left, top, adv, bits = glyphs[cp]
        index += struct.pack("<HBBbbbH", cp, w, h, left, top, adv, len(bitmap))
        packed = bytearray((len(bits) + 7) // 8)
        for n, bit in enumerate(bits):
            if bit:
                packed[n // 8] |= 1 << (n % 8)
        bitmap += packed
    return (struct.pack("<B", len(key)) + key.encode() +
            struct.pack("<BHH", max_height, wildcard, len(cps)) +
            index + struct.pack("<I", len(bitmap)) + bytes(bitmap))


# ---- sources -----------------------------------------------------------------

def day_chars():
    with open(LANGUAGES_H, encoding="utf-8") as f:
        src = f.read()
    body = src[src.index("day_lines[]"):src.index("};", src.index("day_lines2[]"))]
    return set("".join(re.findall(r'"([^"]*)"', body)))


def day_fonts():
    """(Time 2 font_days resource, 144px font_days resource) from main.c."""
    with open(MAIN_C) as f:
        src = f.read()
    names = re.findall(r"font_days\s*=\s*fonts_load_custom_font\(\s*resource_get_handle\("
                       r"\s*RESOURCE_ID_(\w+)", src)
    if len(names) != 2:
        raise ValueError("expected two font_days loads (emery, then the rest) in main.c")
    return names[0], names[1]


def font_size(resource):
    return int(re.search(r"_(\d+)$", resource).group(1))


def read_pack_json(text, start):
    """Decode the JSON object that starts at text[start]; return (value, end)."""
    return json.JSONDecoder().raw_decode(text, start)


def dump_pack(pack):
    # Byte-compatible with the JSON.stringify output already in the files.
    return json.dumps(pack, ensure_ascii=False, separators=(",", ":"))


# ---- rebuild -----------------------------------------------------------------

def rebuild_atlas(pack, emery, days_font_key):
    fonts = split_atlas(b64u_decode(pack["emery"]["glyphs"]))
    by_key = {key: (entry, cps) for key, entry, cps in fonts}
    order = [key for key, _e, _c in fonts]
    wanted = pack["emery"]["layout"]["FONTS"]            # resource name -> atlas key
    largest = max((cps for _k, _e, cps in fonts), key=len, default=[])
    days = {ord(c) for c in day_chars()}
    entries = []
    for key in order + [k for k in wanted.values() if k not in order]:
        resource = next((r for r, k in wanted.items() if k == key), None)
        if resource is None:
            continue                                     # font no longer used
        max_height, wildcard, glyphs = parse_font(emery[resource])
        cps = set(by_key[key][1]) if key in by_key else set(largest) | {wildcard}
        if key == days_font_key or key not in by_key:
            cps |= days
        entries.append(atlas_entry(key, max_height, wildcard, glyphs,
                                   sorted(cp for cp in cps if cp in glyphs)))
    blob = b"PFA1" + bytes([len(entries)]) + b"".join(entries)
    split_atlas(blob)
    return b64u_encode(blob)


def day_metrics(resource_data):
    _max_height, wildcard, glyphs = parse_font(resource_data)
    table = {}
    for ch in sorted(day_chars()):
        w, h, left, top, adv, bits = glyphs.get(ord(ch), glyphs[wildcard])
        rows = [r for r in range(h) if any(bits[r * w:(r + 1) * w])] if w and h else []
        table[ch] = (adv, left, w, top + rows[0] if rows else 0)
    return table


def metrics_js(tables):
    def body(table):
        items = ["%s: [%d, %d, %d, %d]" % ((json.dumps(ch, ensure_ascii=False),) + v)
                 for ch, v in sorted(table.items())]
        lines, line = [], "      "
        for i, item in enumerate(items):
            item += "," if i < len(items) - 1 else ""
            if len(line) + len(item) + 1 > 92:
                lines.append(line.rstrip())
                line = "      "
            line += item + " "
        lines.append(line.rstrip())
        return "\n".join(lines)
    parts = ["    %d: {\n%s\n    }" % (size, body(t)) for size, t in sorted(tables.items())]
    return "  var DAY_GLYPH_METRICS = {\n" + ",\n".join(parts) + "\n  };"


def main():
    check = "--check" in sys.argv[1:]
    emery_font, rect_font = day_fonts()
    emery = built_resources("emery")
    basalt = built_resources("basalt")

    with open(PREVIEW_DATA, encoding="utf-8") as f:
        preview = f.read()
    with open(CLAY_CUSTOM, encoding="utf-8") as f:
        clay = f.read()

    p_start = preview.index("module.exports = ") + len("module.exports = ")
    pack, p_end = read_pack_json(preview, p_start)
    c_start = clay.index(PACK_MARKER) + len(PACK_MARKER)
    clay_pack, c_end = read_pack_json(clay, c_start)
    def without_glyphs(value):
        copy = json.loads(json.dumps(value))
        copy["emery"].pop("glyphs", None)
        return copy
    # The glyph atlas is rebuilt below; anything else that differs is not ours to pick.
    if without_glyphs(clay_pack) != without_glyphs(pack):
        sys.exit("make_font_data.py: the two TREK_GFX_PACK copies differ - fix that first")

    days_key = pack["emery"]["layout"]["FONTS"].get(emery_font)
    if days_key is None:
        sys.exit("make_font_data.py: %s is not in pack.emery.layout.FONTS" % emery_font)
    pack["emery"]["glyphs"] = rebuild_atlas(pack, emery, days_key)
    new_pack = dump_pack(pack)
    new_preview = preview[:p_start] + new_pack + preview[p_end:]
    new_clay = clay[:c_start] + new_pack + clay[c_end:]

    tables = {font_size(emery_font): day_metrics(emery[emery_font]),
              font_size(rect_font): day_metrics(basalt[rect_font])}
    metrics = re.compile(r"  var DAY_GLYPH_METRICS = \{\n.*?\n  \};", re.S)
    if not metrics.search(new_clay):
        sys.exit("make_font_data.py: DAY_GLYPH_METRICS not found in clay-custom.js")
    new_clay = metrics.sub(lambda _m: metrics_js(tables), new_clay, count=1)

    stale = [p for p, old, new in ((PREVIEW_DATA, preview, new_preview),
                                   (CLAY_CUSTOM, clay, new_clay)) if old != new]
    if check:
        for p in stale:
            print("stale: " + os.path.relpath(p, ROOT))
        return 1 if stale else 0
    for path, text in ((PREVIEW_DATA, new_preview), (CLAY_CUSTOM, new_clay)):
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    for p in stale:
        print("updated: " + os.path.relpath(p, ROOT))
    if CLAY_CUSTOM in stale:
        print("now run: python3 make_shim.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
