

#pragma once


// Forward declarations
void update_time();


// This works around the inability to use the current GRect macro for constants
#define ConstantGRect(x, y, w, h) {{(x), (y)}, {(w), (h)}}


// Per-language text (day strips, month names, week and date formats) lives in the
// raw resource LANG_DATA, built from resources/data/languages.json by
// make_lang_data.py. main.c loads only the selected language (load_language).


// Formats for second line
static const char *alt_formats[] = { "Week %V"
                                   , "%Y.%j"
                                   , "%d/%m/%y"
                                   , "%m/%d/%y"
                                   , "W%V D%j"
								   , "%Y.%m.%d"
								   , "%d.%m.%Y"
								   , "%y.%V.%d"
                                   };


static char week_text[] = "               ";
static char date_text[] = "               ";
static char alt_text[]  = "               ";
