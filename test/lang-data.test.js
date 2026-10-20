'use strict';

// The watch reads one language record out of resources/data/languages.bin
// (src/c/main.c load_language). Decode the file the way the C does and check it
// against languages.json, so a stale or malformed build artifact fails here.

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var bin = fs.readFileSync(path.join(ROOT, 'resources', 'data', 'languages.bin'));
var languages = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'resources', 'data', 'languages.json'), 'utf8')).languages;
var mainC = fs.readFileSync(path.join(ROOT, 'src', 'c', 'main.c'), 'utf8');

function define(name) {
  var m = new RegExp('#define\\s+' + name + '\\s+(\\d+)').exec(mainC);
  assert.ok(m, name + ' is defined in main.c');
  return Number(m[1]);
}

function record(index) {
  var start = bin.readUInt16LE(5 + 2 * index);
  var end = bin.readUInt16LE(5 + 2 * (index + 1));
  return bin.subarray(start, end);
}

test('languages.bin has the header load_language expects', function() {
  assert.equal(bin.toString('latin1', 0, 2), 'TL');
  assert.equal(bin[2], 1, 'version');
  assert.equal(bin[3], languages.length, 'one record per language');
  assert.equal(bin[4], define('LANG_NSTR'), 'strings per record');
});

test('every record fits the watch buffer and ends in NUL', function() {
  var max = define('LANG_RECORD_MAX');
  languages.forEach(function(language, i) {
    var rec = record(i);
    assert.ok(rec.length > 0 && rec.length <= max,
      language.name + ': ' + rec.length + ' bytes vs LANG_RECORD_MAX ' + max);
    assert.equal(rec[rec.length - 1], 0, language.name + ' ends in NUL');
  });
});

test('languages.bin matches languages.json string for string', function() {
  languages.forEach(function(language, i) {
    var strings = record(i).toString('utf8').split('\0').slice(0, -1);
    assert.deepEqual(strings, [language.days_monday_first, language.days_sunday_first]
      .concat(language.months, [language.week_format, language.date_format]),
      language.name + ' (index ' + i + ') is stale: run python3 make_lang_data.py');
  });
});

test('the C string indices match the record layout', function() {
  var m = /enum \{ LSTR_DAYS_MON = (\d+), LSTR_DAYS_SUN = (\d+), LSTR_MONTH0 = (\d+), LSTR_WEEK_FMT = (\d+), LSTR_DATE_FMT = (\d+) \}/
    .exec(mainC);
  assert.ok(m, 'LSTR_* indices are declared in main.c');
  assert.deepEqual(m.slice(1).map(Number), [0, 1, 2, 14, 15]);
});

test('the language list lines up with the Settings options', function() {
  var config = require('../src/pkjs/config.js');
  function find(items) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].messageKey === 'language') { return items[i]; }
      if (items[i].items) { var hit = find(items[i].items); if (hit) { return hit; } }
    }
    return null;
  }
  var select = find(config);
  assert.ok(select, 'Settings has a language select');
  select.options.forEach(function(option) {
    assert.equal(languages[Number(option.value)].name, option.label,
      'Settings value ' + option.value);
  });
  assert.equal(select.options.length, languages.length);
});
