'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var Codec = require('../src/pkjs/settings-codec.js');

test('stored settings parsing is safe and ignores unknown fields', function() {
  assert.deepEqual(Codec.safeParseStoredSettings('{not json'), {});
  assert.deepEqual(Codec.safeParseStoredSettings('null'), {});
  assert.deepEqual(Codec.safeParseStoredSettings(JSON.stringify({
    use_gps: false,
    location: 'Paris',
    untrusted: 'discard me'
  })), {
    use_gps: false,
    location: 'Paris'
  });
});

test('empty shared storage is distinguishable from a legacy profile', function() {
  assert.equal(Codec.hasMeaningfulSettings({}), false);
  assert.equal(Codec.hasMeaningfulSettings(null), false);
  assert.equal(Codec.hasMeaningfulSettings({ background: '0' }), true);
  assert.equal(Codec.hasMeaningfulSettings({ customcol0: '#FFFFFF' }), true);
});

test('webview responses parse without Clay storage side effects', function() {
  var wrapped = {
    background: { value: '8.', precision: 0 },
    invert: { value: true },
    unknown: { value: 'discarded during merge' }
  };
  var encoded = encodeURIComponent(JSON.stringify(wrapped));

  assert.deepEqual(Codec.parseWebviewResponse(JSON.stringify(wrapped)), wrapped);
  assert.deepEqual(Codec.parseWebviewResponse(encoded), wrapped);
  // Parsing deliberately preserves wrappers; validation and whitelisting occur
  // when the response is merged into stored settings.
  assert.deepEqual(Codec.mergeSettings({}, Codec.parseWebviewResponse(encoded)), {
    background: '8',
    invert: true,
    customcol0: Codec.FRAME_DEFAULTS[0],
    customcol1: Codec.FRAME_DEFAULTS[1],
    customcol2: Codec.FRAME_DEFAULTS[2],
    customcol3: Codec.FRAME_DEFAULTS[3],
    customcol4: Codec.FRAME_DEFAULTS[4],
    customcol5: Codec.FRAME_DEFAULTS[5],
    customcol6: Codec.FRAME_DEFAULTS[6],
    customcol7: Codec.FRAME_DEFAULTS[7],
    customcol8: Codec.FRAME_DEFAULTS[8],
    customcol9: Codec.FRAME_DEFAULTS[9],
    customcol10: Codec.FRAME_DEFAULTS[10],
    customcol11: Codec.FRAME_DEFAULTS[11],
    customcol12: Codec.FRAME_DEFAULTS[12]
  });
  assert.throws(function() {
    Codec.parseWebviewResponse('%E0%A4%A');
  }, /URI encoding/);
  assert.throws(function() {
    Codec.parseWebviewResponse('[]');
  }, /not an object/);
  assert.throws(function() {
    Codec.parseWebviewResponse('null');
  }, /not an object/);
  assert.throws(function() {
    Codec.parseWebviewResponse('{broken');
  }, /not valid JSON/);
});

test('Clay wrappers are unwrapped without accepting arbitrary keys', function() {
  assert.deepEqual(Codec.unwrapClaySettings({
    background: { value: '8.' },
    invert: { value: true },
    heading_without_message_key: { value: 'ignored' }
  }), {
    background: '8.',
    invert: true
  });
});

test('watch metadata remains unknown unless the platform and firmware are valid', function() {
  assert.equal(Codec.hasSupportedWatchMetadata(null), false);
  assert.equal(Codec.hasSupportedWatchMetadata({
    platform: 'unknown', firmware: { major: 4 }
  }), false);
  assert.equal(Codec.hasSupportedWatchMetadata({
    platform: 'aplite', firmware: null
  }), false);
  [NaN, Infinity, -1, 4.5].forEach(function(major) {
    assert.equal(Codec.hasSupportedWatchMetadata({
      platform: 'basalt', firmware: { major: major }
    }), false);
  });
  assert.equal(Codec.hasSupportedWatchMetadata({
    platform: 'basalt', firmware: { major: 4 }, model: 'pebble_time'
  }), true);
  assert.equal(Codec.hasSupportedWatchMetadata({
    platform: 'gabbro', firmware: { major: 4 }
  }), true);

  assert.deepEqual(Codec.watchMetadataForClay(null), {
    platform: 'aplite',
    model: 'unknown',
    firmware: { major: 3, minor: 0, patch: 0 }
  });
  var basalt = {
    platform: 'basalt', firmware: { major: 4 }, model: 'pebble_time'
  };
  assert.equal(Codec.watchMetadataForClay(basalt), basalt);
});

test('legacy dotted integers are accepted but partial numeric junk is rejected', function() {
  assert.equal(Codec.parseInteger('12.'), 12);
  assert.equal(Codec.parseInteger(' 300000. '), 300000);
  assert.equal(Codec.parseInteger('1.0'), null);
  assert.equal(Codec.parseInteger('1px'), null);
  assert.equal(Codec.parseInteger(1.5), null);
});

test('RGB picker values convert to Pebble ARGB8', function() {
  assert.equal(Codec.rgbToArgb8('#000000'), 0xC0);
  assert.equal(Codec.rgbToArgb8('#FFFFFF'), 0xFF);
  assert.equal(Codec.rgbToArgb8('#AAAAFF'), 0xEB);
  assert.equal(Codec.rgbToArgb8('#550000'), 0xD0);
  assert.equal(Codec.rgbToArgb8(0xFF0000), 0xF0);
  assert.equal(Codec.rgbToArgb8('not-a-color'), null);
});

test('four legacy frame regions expand to all thirteen frame pieces', function() {
  var migrated = Codec.migrateStoredSettings({
    background: '12.',
    refresh_interval: '600000.',
    use_gps: 'false',
    invert: '1',
    customcol0: 0x000000,
    customcol1: 0x555555,
    customcol2: 0xAAAAAA,
    customcol3: 0xFFFFFF
  });
  var expectedGroups = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3];
  var colors = [0x000000, 0x555555, 0xAAAAAA, 0xFFFFFF];
  var index;

  assert.equal(migrated.background, '12');
  assert.equal(migrated.refresh_interval, '600000');
  assert.equal(migrated.use_gps, false);
  assert.equal(migrated.invert, true);
  for (index = 0; index < 13; index++) {
    assert.equal(migrated['customcol' + index], colors[expectedGroups[index]]);
  }
});

test('legacy health toggles migrate to the new bottom layout choices', function() {
  var enabled = Codec.migrateStoredSettings({
    steps_status: { value: true },
    bpm_mode: { value: '1' }
  });
  var disabled = Codec.migrateStoredSettings({
    steps_status: false,
    bpm_mode: false,
    bottom_right: '0',
    bottom_left: '0'
  });

  assert.equal(enabled.bottom_right, '0');
  assert.equal(enabled.bottom_left, '0');
  assert.equal(enabled.steps_status, undefined);
  assert.equal(enabled.bpm_mode, undefined);
  assert.equal(disabled.bottom_right, '0', 'newer right choice wins');
  assert.equal(disabled.bottom_left, '0', 'newer left choice wins');

  var overDefaults = Codec.mergeSettings(Codec.defaultSettings(), {
    steps_status: true,
    bpm_mode: true
  });
  assert.equal(overDefaults.bottom_right, '0', 'legacy Steps overrides a default');
  assert.equal(overDefaults.bottom_left, '0', 'legacy Heart Rate overrides a default');
});

test('an existing thirteen-piece palette is not overwritten by migration', function() {
  var source = {};
  var migrated;
  var index;
  for (index = 0; index < 13; index++) {
    source['customcol' + index] = index * 0x010101;
  }
  migrated = Codec.migrateStoredSettings(source);
  for (index = 0; index < 13; index++) {
    assert.equal(migrated['customcol' + index], source['customcol' + index]);
  }
});

test('weather options are normalized independently of watch settings', function() {
  assert.deepEqual(Codec.weatherOptions({
    use_gps: 'false',
    hideweather: '1',
    units: 'celsius',
    location: '  Flagstaff  ',
    refresh_interval: '600000.'
  }), {
    use_gps: false,
    hideweather: true,
    units: 'celsius',
    location: 'Flagstaff',
    refresh_interval: 600000,
    configured: true
  });

  assert.equal(Codec.weatherOptions({ refresh_interval: '1' }).refresh_interval,
    Codec.DEFAULT_REFRESH_INTERVAL);
  assert.equal(Codec.weatherOptions({}).configured, false);
  assert.equal(Codec.weatherOptions({}).location, 'London');
  assert.equal(Codec.weatherOptions({
    use_gps: false,
    location: '   '
  }).location, '');
  assert.equal(Codec.weatherOptions({
    use_gps: false,
    location: ''
  }).configured, false);
  assert.equal(Codec.weatherOptions({
    use_gps: true,
    location: ''
  }).configured, true);
});

test('preview simulation preferences survive a Settings save', function() {
  var migrated = Codec.mergeSettings({}, {
    preview_disconnected: { value: true },
    preview_24h: { value: '1' }
  });

  assert.equal(migrated.preview_disconnected, true);
  assert.equal(migrated.preview_24h, true);
});

test('new watch defaults produce a complete deterministic watch dictionary', function() {
  var defaults = Codec.defaultSettings();
  var keys = {
    background: 9,
    battery_background: 15,
    bottom_left: 19,
    bottom_right: 20,
    bluetoothvibe_status: 6,
    bt_popup: 24,
    bt_vibe_pattern: 22,
    bt_vibe_repeat: 23,
    date_bracket: 18,
    format: 2,
    hideweather: 5,
    hourlyvibe: 7,
    invert: 10,
    language: 1,
    secs_ampm: 8,
    startday_status: 12,
    textcol: 11,
    othertextcol: 16,
    backgroundcol: 14,
    battery_colorized: 30,
    draw_palette: 29
  };
  var dictionary = Codec.buildWatchDictionary(defaults, keys);

  Object.keys(keys).forEach(function(key) {
    assert.notEqual(dictionary[keys[key]], undefined, 'missing default: ' + key);
  });
  assert.equal(dictionary[keys.background], 0);
  assert.equal(dictionary[keys.bluetoothvibe_status], 1);
  assert.equal(dictionary[keys.bt_popup], 1);
  assert.equal(dictionary[keys.battery_colorized], 0);
  assert.equal(dictionary[keys.draw_palette].length, 20);
  assert.equal(Codec.weatherOptions(defaults).configured, false);
});

test('partial legacy profiles inherit every current default without losing choices', function() {
  var merged = Codec.mergeSettings(Codec.defaultSettings(), {
    background: '8',
    invert: true,
    location: 'Paris'
  });

  assert.equal(merged.background, '8');
  assert.equal(merged.invert, true);
  assert.equal(merged.location, 'Paris');
  assert.equal(merged.bt_popup, true);
  assert.equal(merged.battery_colorized, false);
  assert.equal(merged.bottom_left, '1');
  assert.equal(merged.customcol12, Codec.FRAME_DEFAULTS[12]);
});

test('transient weather retry delays are bounded', function() {
  assert.equal(Codec.weatherRetryDelay(0), 30000);
  assert.equal(Codec.weatherRetryDelay(1), 120000);
  assert.equal(Codec.weatherRetryDelay(2), 300000);
  assert.equal(Codec.weatherRetryDelay(3), null);
  assert.equal(Codec.weatherRetryDelay(-1), null);
});

test('location truncation preserves Unicode encoding boundaries', function() {
  var source = new Array(100).join('a') + '\uD83D\uDE80' + 'tail';
  var location = Codec.weatherOptions({
    use_gps: false,
    location: source
  }).location;

  assert.doesNotThrow(function() { encodeURIComponent(location); });
  assert.equal(location.length, 99);
});

test('packed draw palette is versioned and has the required byte layout', function() {
  var settings = {};
  var palette;
  var index;
  for (index = 0; index < 13; index++) {
    settings['customcol' + index] = index % 2 ? '#FFFFFF' : '#000000';
  }
  settings.battery_full_color = '#FFAA00';
  settings.battery_empty_color = '#550000';
  settings.bluetooth_color = '#FFFFFF';
  settings.popup_color = '#FF0000';
  settings.popup_time_color = '#FFAA00';
  settings.popup_hint_color = '#FFFFFF';

  palette = Codec.buildPalette(settings);
  assert.equal(palette.length, 20);
  assert.equal(palette[0], 2);
  assert.deepEqual(palette.slice(1, 14), [
    0xC0, 0xFF, 0xC0, 0xFF, 0xC0, 0xFF, 0xC0,
    0xFF, 0xC0, 0xFF, 0xC0, 0xFF, 0xC0
  ]);
  assert.deepEqual(palette.slice(14), [0xF8, 0xD0, 0xFF, 0xF0, 0xF8, 0xFF]);
});

test('watch dictionary uses explicit types and omits malformed values', function() {
  var keys = {
    background: 9,
    textcol: 11,
    invert: 10,
    bt_vibe_repeat: 23,
    battery_colorized: 30,
    draw_palette: 29
  };
  var dictionary = Codec.buildWatchDictionary({
    background: { value: '8.' },
    textcol: { value: '#AAAAFF' },
    invert: { value: true },
    bt_vibe_repeat: { value: 'later' },
    battery_colorized: { value: false },
    customcol0: { value: '#FFFFFF' }
  }, keys);

  assert.equal(dictionary[9], 8);
  assert.equal(dictionary[11], 0xAAAAFF);
  assert.equal(dictionary[10], 1);
  assert.equal(dictionary[23], undefined);
  assert.equal(dictionary[30], 0);
  assert.equal(dictionary[29].length, 20);
  assert.equal(dictionary[29][1], 0xFF);
});

test('legacy RGB keys stay RGB24 and long repeat intervals are not truncated', function() {
  var keys = {
    textcol: 11,
    othertextcol: 16,
    backgroundcol: 14,
    bt_vibe_repeat: 23
  };
  var dictionary = Codec.buildWatchDictionary({
    textcol: '#AAAAFF',
    othertextcol: '#550000',
    backgroundcol: '#000000',
    bt_vibe_repeat: '300000'
  }, keys);

  assert.equal(dictionary[11], 0xAAAAFF);
  assert.equal(dictionary[16], 0x550000);
  assert.equal(dictionary[14], 0x000000);
  assert.equal(dictionary[23], 300000);
});

test('migration removes malformed stored colors before Clay builds the page', function() {
  var migrated = Codec.migrateStoredSettings({
    textcol: 'red<script>',
    battery_full_color: '#FFFFFF',
    customcol8: 'not-a-color'
  });

  assert.equal(migrated.textcol, undefined);
  assert.equal(migrated.battery_full_color, 0xFFFFFF);
  assert.equal(migrated.customcol8, Codec.FRAME_DEFAULTS[8]);
});
