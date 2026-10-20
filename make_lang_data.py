#!/usr/bin/env python3
"""Build resources/data/languages.bin from resources/data/languages.json.

The watch keeps only the selected language's text in RAM: it reads that one
record out of this raw resource (src/c/main.c, load_language) instead of
compiling every language's strings into the app.

Layout (little-endian):
  0  "TL"            magic
  2  u8  version     (1)
  3  u8  count       number of languages
  4  u8  nstr        strings per record (16)
  5  u16 offsets[count + 1]   record offsets from the start of the file
  .. records         each one is nstr NUL-terminated UTF-8 strings, in order:
                     Monday-first day strip, Sunday-first day strip,
                     12 month abbreviations, week format, date format

Usage:
  python3 make_lang_data.py           rewrite languages.bin
  python3 make_lang_data.py --check   exit 1 if languages.bin is out of date
"""
import json
import os
import struct
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "resources", "data", "languages.json")
OUT = os.path.join(ROOT, "resources", "data", "languages.bin")
MAIN_C = os.path.join(ROOT, "src", "c", "main.c")

VERSION = 1
NSTR = 16


def record_max():
    """LANG_RECORD_MAX from main.c: the watch's buffer for one record."""
    with open(MAIN_C, encoding="utf-8") as f:
        for line in f:
            parts = line.split()
            if len(parts) >= 3 and parts[0] == "#define" and parts[1] == "LANG_RECORD_MAX":
                return int(parts[2])
    raise ValueError("LANG_RECORD_MAX not found in src/c/main.c")


def build():
    with open(SRC, encoding="utf-8") as f:
        languages = json.load(f)["languages"]
    limit = record_max()
    records = []
    for i, lang in enumerate(languages):
        strings = ([lang["days_monday_first"], lang["days_sunday_first"]] +
                   list(lang["months"]) + [lang["week_format"], lang["date_format"]])
        if len(lang["months"]) != 12:
            raise ValueError("%s: expected 12 months" % lang["name"])
        for s in strings:
            if "\0" in s:
                raise ValueError("%s: NUL inside a string" % lang["name"])
        rec = b"".join(s.encode("utf-8") + b"\0" for s in strings)
        if len(rec) > limit:
            raise ValueError("%s (language %d): record is %d bytes, LANG_RECORD_MAX is %d"
                             % (lang["name"], i, len(rec), limit))
        records.append(rec)
    header_len = 5 + 2 * (len(records) + 1)
    offsets, pos = [], header_len
    for rec in records:
        offsets.append(pos)
        pos += len(rec)
    offsets.append(pos)
    return (b"TL" + struct.pack("<BBB", VERSION, len(records), NSTR) +
            struct.pack("<%dH" % len(offsets), *offsets) + b"".join(records))


def main():
    data = build()
    if "--check" in sys.argv[1:]:
        try:
            with open(OUT, "rb") as f:
                current = f.read()
        except FileNotFoundError:
            current = None
        if current != data:
            print("resources/data/languages.bin is stale: run python3 make_lang_data.py")
            return 1
        return 0
    with open(OUT, "wb") as f:
        f.write(data)
    print("wrote resources/data/languages.bin (%d bytes)" % len(data))
    return 0


if __name__ == "__main__":
    sys.exit(main())
