'use strict';

// Every language's text must be drawable. The SDK's font compiler keeps at most
// 256 glyphs per font, in codepoint order, so a large font such as Antonio (433
// glyphs) silently loses everything past about U+0140 (Ř ř Ş Š ž) unless its
// manifest entry narrows it with a characterRegex.

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var manifest = require('../package.json');
var GFX = require('../src/pkjs/preview-data.js');
var T = require('../src/pkjs/shim/60-text.js');
var languages = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'resources', 'data', 'languages.json'), 'utf8')).languages;

function chars(strings) {
  var set = {};
  strings.join('').replace(/%[A-Za-z]/g, '').split('').forEach(function (c) { set[c] = true; });
  return Object.keys(set);
}

var DATE_CHARS = chars(languages.map(function (l) {
  return l.months.join('') + l.week_format + l.date_format;
}).concat(['0123456789']));
var DAY_CHARS = chars(languages.map(function (l) {
  return l.days_monday_first + l.days_sunday_first;
}));

function resource(name) {
  return manifest.pebble.resources.media.find(function (r) { return r.name === name; });
}

test('both Antonio sizes keep every character the date and week text can use', function () {
  ['FONT_ANTONIO_24', 'FONT_ANTONIO_17'].forEach(function (name) {
    var regex = resource(name).characterRegex;
    assert.ok(regex, name + ' needs a characterRegex, or the compiler cuts it at 256 glyphs');
    var re = new RegExp('^' + regex + '$');
    DATE_CHARS.forEach(function (c) {
      assert.ok(re.test(c), name + ' drops ' + JSON.stringify(c));
    });
    for (var cp = 0x20; cp <= 0x7E; cp++) {
      assert.ok(re.test(String.fromCharCode(cp)), name + ' keeps printable ASCII');
    }
  });
});

test('package.json is ASCII, so the SDK reads the regexes the same in any locale', function () {
  // pebble-tool and the SDK's waf open package.json in the locale's default encoding;
  // under a Latin-1 locale a raw Ř in a characterRegex becomes two wrong characters
  // and the font silently loses every accented letter. Write them as \u escapes.
  var text = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  var bad = text.match(/[^\x00-\x7F]/);
  assert.equal(bad, null, 'escape ' + JSON.stringify(bad && bad[0]) + ' in package.json as \\uXXXX');
});

test('the Time 2 preview date font has every date character', function () {
  var font = T.pgFontsInit(GFX.emery.glyphs).ANTONIO_24;
  DATE_CHARS.forEach(function (c) {
    assert.notStrictEqual(T.pgGlyphIndex(font, c.charCodeAt(0)), -1,
      JSON.stringify(c) + ' is missing from ANTONIO_24: rebuild, then run make_font_data.py');
  });
});

test('the Time 2 preview day-strip font has every day character', function () {
  var font = T.pgFontsInit(GFX.emery.glyphs).LCARS_27;
  DAY_CHARS.forEach(function (c) {
    assert.notStrictEqual(T.pgGlyphIndex(font, c.charCodeAt(0)), -1,
      JSON.stringify(c) + ' is missing from LCARS_27');
  });
});

test('LCARS gaps in the bracket-date font are exactly the ones LCARS.ttf lacks', function () {
  // small_batt (LCARSB_26) draws the date in the heart-rate bracket layout. The
  // LCARS typeface has no ě, Ř or ř, so Czech dates there fall back to the
  // wildcard box on the watch and in the preview alike. Anything else missing
  // would be a new regression.
  var font = T.pgFontsInit(GFX.emery.glyphs).LCARSB_26;
  var missing = DATE_CHARS.filter(function (c) {
    return T.pgGlyphIndex(font, c.charCodeAt(0)) === -1;
  }).sort();
  assert.deepEqual(missing, ['Ř', 'ě', 'ř'].sort());
});
