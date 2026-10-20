#!/usr/bin/env python3
"""Build resources/data/languages.bin from resources/data/languages.json.

The watch keeps only the selected language's text in RAM: it reads that one
record out of this raw resource (src/c/main.c, load_language) instead of
compiling every language's strings into the app.

Layout (little-endian):
  0  "TL"            magic
  2  u8  version     (LANG_DATA_VERSION in main.c)
  3  u8  count       number of languages
  4  u8  nstr        strings per record (LANG_NSTR in main.c)
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
import re
import struct
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "resources", "data", "languages.json")
OUT = os.path.join(ROOT, "resources", "data", "languages.bin")
MAIN_C = os.path.join(ROOT, "src", "c", "main.c")
LANGUAGES_H = os.path.join(ROOT, "src", "c", "languages.h")

# The widest text each strftime directive the formats use can produce on the watch
# (%b is the C locale's English abbreviation). Any other directive is rejected, so
# a new one has to be sized here before it can reach a fixed watch buffer.
WIDEST = {"%V": "53", "%e": "31", "%b": "Sep", "%%": "%"}
ENGLISH_SUFFIXES = ["st", "nd", "rd", "th"]      # main.c ordinal_suffix(), language 0


def c_define(name):
    """An integer #define from main.c, e.g. LANG_RECORD_MAX (the watch's buffer)."""
    with open(MAIN_C, encoding="utf-8") as f:
        for line in f:
            parts = line.split()
            if len(parts) >= 3 and parts[0] == "#define" and parts[1] == name:
                return int(parts[2])
    raise ValueError("%s not found in src/c/main.c" % name)


def text_buffer(name):
    """Usable bytes (initialiser length, without the NUL) of a buffer in languages.h."""
    with open(LANGUAGES_H, encoding="utf-8") as f:
        m = re.search(r'static char %s\[\] = "([^"]*)";' % name, f.read())
    if not m:
        raise ValueError("%s not found in src/c/languages.h" % name)
    return len(m.group(1))


def widest(fmt, where):
    """fmt with every strftime directive replaced by its widest output, as bytes."""
    for directive in re.findall(r"%.", fmt):
        if directive not in WIDEST:
            raise ValueError("%s: unsupported strftime directive %s" % (where, directive))
    return re.sub(r"%.", lambda m: WIDEST[m.group(0)], fmt).encode("utf-8")


def build():
    with open(SRC, encoding="utf-8") as f:
        languages = json.load(f)["languages"]
    limit = c_define("LANG_RECORD_MAX")
    nstr = c_define("LANG_NSTR")
    week_max = text_buffer("week_text")
    date_max = text_buffer("date_text")
    records = []
    for i, lang in enumerate(languages):
        name = "%s (language %d)" % (lang["name"], i)
        if len(lang["months"]) != 12:
            raise ValueError("%s: expected 12 months" % name)
        strings = ([lang["days_monday_first"], lang["days_sunday_first"]] +
                   list(lang["months"]) + [lang["week_format"], lang["date_format"]])
        if len(strings) != nstr:
            raise ValueError("%s: %d strings per record, LANG_NSTR is %d"
                             % (name, len(strings), nstr))
        for s in strings:
            if "\0" in s:
                raise ValueError("%s: NUL inside a string" % name)
        # handle_tick strftime()s these into fixed buffers; output that does not fit
        # leaves the buffer contents undefined (and the date append can split UTF-8).
        week = widest(lang["week_format"], name)
        if len(week) > week_max:
            raise ValueError("%s: week text can be %d bytes, week_text holds %d"
                             % (name, len(week), week_max))
        suffixes = ENGLISH_SUFFIXES if i == 0 else lang["months"]
        date = widest(lang["date_format"], name) + max(
            (s.encode("utf-8") for s in suffixes), key=len)
        if len(date) > date_max:
            raise ValueError("%s: date text can be %d bytes, date_text holds %d"
                             % (name, len(date), date_max))
        rec = b"".join(s.encode("utf-8") + b"\0" for s in strings)
        if len(rec) > limit:
            raise ValueError("%s: record is %d bytes, LANG_RECORD_MAX is %d"
                             % (name, len(rec), limit))
        records.append(rec)
    header_len = 5 + 2 * (len(records) + 1)
    offsets, pos = [], header_len
    for rec in records:
        offsets.append(pos)
        pos += len(rec)
    offsets.append(pos)
    return (b"TL" + struct.pack("<BBB", c_define("LANG_DATA_VERSION"), len(records), nstr) +
            struct.pack("<%dH" % len(offsets), *offsets) + b"".join(records))


def write_if_changed():
    """Rewrite languages.bin only if its contents changed; True if it was written.

    wscript calls this at the start of every `pebble build`."""
    data = build()
    try:
        with open(OUT, "rb") as f:
            if f.read() == data:
                return False
    except FileNotFoundError:
        pass
    with open(OUT, "wb") as f:
        f.write(data)
    return True


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
