'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var config = require('../src/pkjs/config.js');
var manifest = require('../package.json');
var fs = require('node:fs');
var path = require('node:path');

function flatten(items, result) {
  result = result || [];
  items.forEach(function(item) {
    result.push(item);
    if (item.type === 'section' && Array.isArray(item.items)) {
      flatten(item.items, result);
    }
  });
  return result;
}

var LOCAL_KEYS = {
  use_gps: true,
  units: true,
  location: true,
  refresh_interval: true,
  battery_full_color: true,
  battery_empty_color: true,
  bluetooth_color: true,
  popup_color: true,
  popup_time_color: true,
  popup_hint_color: true,
  preview_disconnected: true,
  preview_24h: true
};
var index;
for (index = 0; index < 13; index++) {
  LOCAL_KEYS['customcol' + index] = true;
}

test('every Settings value has an explicit watch or phone-side destination', function() {
  var messageKeys = manifest.pebble.messageKeys;
  flatten(config).forEach(function(item) {
    if (item.messageKey) {
      assert.ok(Object.prototype.hasOwnProperty.call(messageKeys, item.messageKey) ||
        LOCAL_KEYS[item.messageKey], 'unmapped Settings key: ' + item.messageKey);
    }
  });
});

test('the vector frame exposes exactly thirteen standard Clay color controls', function() {
  var frameItems = flatten(config).filter(function(item) {
    return item.group === 'frame_palette';
  });
  assert.equal(frameItems.length, 13);
  frameItems.forEach(function(item, itemIndex) {
    assert.equal(item.type, 'color');
    assert.equal(item.messageKey, 'customcol' + itemIndex);
    assert.deepEqual(item.capabilities, ['NOT_PLATFORM_CHALK']);
    assert.equal(item.sunlight, true);
  });
});

test('battery customization is opt-in and the packed protocol keys are stable', function() {
  var items = flatten(config);
  var batteryToggle = items.find(function(item) {
    return item.messageKey === 'battery_colorized';
  });
  var values = Object.values(manifest.pebble.messageKeys);

  assert.equal(batteryToggle.defaultValue, false);
  assert.equal(manifest.pebble.messageKeys.draw_palette, 29);
  assert.equal(manifest.pebble.messageKeys.battery_colorized, 30);
  assert.equal(new Set(values).size, values.length, 'message key IDs must be unique');
});

test('drawn popup clock and hint use standard Clay color controls', function() {
  var items = flatten(config);
  var expected = {
    popup_time_color: '#FFAA00',
    popup_hint_color: '#FFFFFF'
  };

  Object.keys(expected).forEach(function(messageKey) {
    var item = items.find(function(candidate) {
      return candidate.messageKey === messageKey;
    });
    assert.ok(item, messageKey + ' control');
    assert.equal(item.type, 'color');
    assert.equal(item.defaultValue, expected[messageKey]);
    assert.equal(item.sunlight, true);
    assert.equal(item.capabilities, undefined,
      messageKey + ' uses Clay to select the platform-appropriate palette');
  });
});

test('the maintained Clay dependency is pinned reproducibly', function() {
  assert.equal(manifest.dependencies['@rebble/clay'], '1.0.10');
  assert.equal(manifest.dependencies['pebble-clay'], undefined);
});

test('the uncleared asset bundle cannot be published accidentally through npm', function() {
  assert.equal(manifest.private, true);
});

test('the manifest preserves the complete current hardware and resource matrix', function() {
  var media = manifest.pebble.resources.media;
  function platforms(name) {
    return media.find(function(resource) {
      return resource.name === name;
    }).targetPlatforms;
  }

  assert.deepEqual(manifest.pebble.targetPlatforms,
    ['aplite', 'basalt', 'chalk', 'diorite', 'emery', 'flint', 'gabbro']);
  assert.deepEqual(platforms('IMAGE_FOOTPRINT'),
    ['basalt', 'chalk', 'diorite', 'emery', 'flint']);
  assert.deepEqual(platforms('IMAGE_HEART'), ['emery', 'diorite']);
  assert.deepEqual(platforms('IMAGE_CHARGING'),
    ['aplite', 'basalt', 'diorite', 'emery', 'flint']);
  assert.deepEqual(platforms('IMAGE_BACKGROUND1'), ['chalk']);
  assert.deepEqual(platforms('FONT_LCARS_92'), ['emery', 'gabbro']);
  assert.deepEqual(platforms('FONT_LCARS_68'),
    ['aplite', 'basalt', 'diorite', 'flint']);
  assert.deepEqual(platforms('CLEAR_DAY'),
    ['aplite', 'basalt', 'diorite', 'emery', 'flint']);
});

test('weather location access is explicit opt-in on first run', function() {
  var items = flatten(config);
  var gps = items.find(function(item) { return item.messageKey === 'use_gps'; });
  var location = items.find(function(item) { return item.messageKey === 'location'; });

  assert.equal(gps.defaultValue, false);
  assert.equal(location.defaultValue, '');
  assert.match(gps.description, /Off by default/);
});

test('production builds retain the midnight step-count refresh', function() {
  var source = fs.readFileSync(path.join(__dirname, '..', 'src', 'c', 'main.c'), 'utf8');
  var languageStart = source.indexOf('#ifdef LANGUAGE_TESTING',
    source.indexOf('void handle_tick'));
  var languageEnd = source.indexOf('#endif', languageStart);
  var rollover = source.indexOf('static int last_yday', languageStart);

  assert.ok(languageStart >= 0 && languageEnd >= 0 && rollover > languageEnd,
    'midnight refresh must not be compiled only under LANGUAGE_TESTING');
  assert.match(source.slice(rollover, rollover + 240), /refresh_steps\(\)/);
});
