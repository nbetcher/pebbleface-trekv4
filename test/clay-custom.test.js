'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var config = require('../src/pkjs/config.js');
var clayCustom = require('../src/pkjs/clay-custom.js');
var includesCapability = require('@rebble/clay/src/scripts/lib/utils')
  .includesCapability;

function activeItems(items, watchInfo, inheritedCapabilities, result) {
  result = result || [];
  inheritedCapabilities = inheritedCapabilities || [];
  items.forEach(function(definition) {
    var capabilities = inheritedCapabilities.concat(definition.capabilities || []);
    if (!includesCapability(watchInfo, capabilities)) {
      return;
    }
    result.push(definition);
    if (definition.type === 'section' && Array.isArray(definition.items)) {
      activeItems(definition.items, watchInfo, capabilities, result);
    }
  });
  return result;
}

function FakeItem(definition) {
  this.definition = definition;
  this.value = definition.defaultValue;
  this.visible = true;
  this.enabled = true;
  this.handlers = {};
  this.$element = [{
    querySelector: function() {
      return null;
    }
  }];
}

FakeItem.prototype.get = function() {
  return this.value;
};

FakeItem.prototype.set = function(value) {
  this.value = value;
  this.fire('change');
};

FakeItem.prototype.show = function() {
  this.visible = true;
};

FakeItem.prototype.hide = function() {
  this.visible = false;
};

FakeItem.prototype.enable = function() {
  this.enabled = true;
};

FakeItem.prototype.disable = function() {
  this.enabled = false;
};

FakeItem.prototype.on = function(event, handler) {
  this.handlers[event] = this.handlers[event] || [];
  this.handlers[event].push(handler);
};

FakeItem.prototype.fire = function(event) {
  (this.handlers[event] || []).slice().forEach(function(handler) {
    handler();
  });
};

function createDocument() {
  var canvasHandlers = {};
  var canvas = {
    innerHTML: '',
    targets: [],
    addEventListener: function(event, handler) {
      canvasHandlers[event] = handler;
    },
    querySelectorAll: function() {
      return canvas.targets;
    },
    handlers: canvasHandlers
  };
  var form = { id: 'main-form' };
  var elements = { 'main-form': form };

  return {
    head: { appendChild: function() {} },
    body: {
      insertBefore: function(element) {
        elements[element.id] = element;
        if (element.id === 'trek-preview-dock') {
          elements['trek-preview-canvas'] = canvas;
        }
      }
    },
    createElement: function() {
      return {
        appendChild: function() {},
        addEventListener: function() {},
        innerHTML: '',
        id: '',
        style: {}
      };
    },
    createTextNode: function(value) {
      return { textContent: value };
    },
    getElementById: function(id) {
      return elements[id] || null;
    },
    querySelectorAll: function() {
      return [];
    },
    canvas: canvas
  };
}

function buildHarness(platform, model, metadataAvailable) {
  var watchInfo = {
    platform: platform,
    model: model || platform,
    firmware: { major: 4, minor: 17, patch: 0 }
  };
  var definitions = activeItems(config, watchInfo);
  var items = definitions.map(function(definition) {
    return new FakeItem(definition);
  });
  var byMessageKey = {};
  var byId = {};
  var events = {};
  var fakeDocument = createDocument();
  var oldDocument = global.document;
  var oldWindow = global.window;
  var clayConfig;

  items.forEach(function(item) {
    if (item.definition.messageKey) {
      byMessageKey[item.definition.messageKey] = item;
    }
    if (item.definition.id) {
      byId[item.definition.id] = item;
    }
  });

  clayConfig = {
    meta: {
      activeWatchInfo: watchInfo,
      userData: { metadataAvailable: metadataAvailable !== false }
    },
    EVENTS: { AFTER_BUILD: 'after_build' },
    getItemByMessageKey: function(key) {
      return byMessageKey[key] || null;
    },
    getItemById: function(id) {
      return byId[id] || null;
    },
    getItemsByGroup: function(group) {
      return items.filter(function(item) {
        return item.definition.group === group;
      });
    },
    getAllItems: function() {
      return items;
    },
    on: function(event, handler) {
      events[event] = handler;
    }
  };

  global.document = fakeDocument;
  global.window = { setInterval: function() {} };
  try {
    clayCustom.call(clayConfig, false);
    events.after_build();
  } finally {
    global.document = oldDocument;
    global.window = oldWindow;
  }

  return {
    canvas: fakeDocument.canvas,
    items: items,
    get: function(key) {
      return byMessageKey[key] || byId[key] || null;
    },
    set: function(key, value) {
      global.document = fakeDocument;
      global.window = { setInterval: function() {} };
      try {
        byMessageKey[key].set(value);
      } finally {
        global.document = oldDocument;
        global.window = oldWindow;
      }
    },
    tapPreview: function(key) {
      var target = {
        getAttribute: function(attribute) {
          return attribute === 'data-color-key' ? key : null;
        },
        parentNode: fakeDocument.canvas
      };
      global.document = fakeDocument;
      global.window = { setInterval: function() {} };
      try {
        fakeDocument.canvas.handlers.click({
          type: 'click',
          target: target,
          currentTarget: fakeDocument.canvas,
          preventDefault: function() {}
        });
      } finally {
        global.document = oldDocument;
        global.window = oldWindow;
      }
    },
    tapNearPreview: function(key, distance) {
      var background = {
        getAttribute: function(attribute) {
          return attribute === 'data-color-key' ? 'backgroundcol' : null;
        },
        parentNode: fakeDocument.canvas
      };
      var nearby = {
        getAttribute: function(attribute) {
          return attribute === 'data-color-key' ? key : null;
        },
        getBoundingClientRect: function() {
          return { left: 50, right: 54, top: 50, bottom: 54, width: 4, height: 4 };
        }
      };
      fakeDocument.canvas.targets = [nearby];
      global.document = fakeDocument;
      global.window = { setInterval: function() {} };
      try {
        fakeDocument.canvas.handlers.click({
          type: 'click',
          target: background,
          currentTarget: fakeDocument.canvas,
          clientX: 54 + distance,
          clientY: 52,
          preventDefault: function() {}
        });
      } finally {
        fakeDocument.canvas.targets = [];
        global.document = oldDocument;
        global.window = oldWindow;
      }
    }
  };
}

function count(source, pattern) {
  return (source.match(pattern) || []).length;
}

function frameFills(source) {
  var result = [];
  var pattern = /fill="([^"]+)" class="trek-color-target" data-color-key="customcol\d+"/g;
  var match;
  while ((match = pattern.exec(source))) {
    result.push(match[1]);
  }
  return result;
}

test('Clay exposes only settings supported by every declared Pebble class', function() {
  var cases = [
    { platform: 'aplite', model: 'pebble', geometry: '144 168', frame: 13,
      steps: false, heart: false, label: 'Pebble / Pebble Steel' },
    { platform: 'basalt', model: 'pebble_time', geometry: '144 168', frame: 13,
      steps: true, heart: false, label: 'Pebble Time / Time Steel' },
    { platform: 'chalk', model: 'pebble_time_round_black_14', geometry: '180 180', frame: 0,
      steps: true, heart: false, label: 'Pebble Time Round' },
    { platform: 'diorite', model: 'pebble_2_se', geometry: '144 168', frame: 13,
      steps: true, heart: false, label: 'Pebble 2' },
    { platform: 'diorite', model: 'pebble_2_hr', geometry: '144 168', frame: 13,
      steps: true, heart: true, label: 'Pebble 2' },
    { platform: 'emery', model: 'pebble_time_2', geometry: '200 228', frame: 13,
      steps: true, heart: true, label: 'Pebble Time 2' },
    { platform: 'flint', model: 'pebble_2_duo', geometry: '144 168', frame: 13,
      steps: true, heart: false, label: 'Pebble 2 Duo' },
    { platform: 'gabbro', model: 'pebble_round_2_black', geometry: '260 260', frame: 13,
      steps: true, heart: false, label: 'Pebble Round 2' }
  ];

  cases.forEach(function(device) {
    var harness = buildHarness(device.platform, device.model);
    var heart = harness.get('bottom_left');
    assert.match(harness.canvas.innerHTML,
      new RegExp('viewBox="0 0 ' + device.geometry + '"'), device.platform + ' geometry');
    assert.equal(harness.items.filter(function(item) {
      return item.definition.group === 'frame_palette';
    }).length, device.frame, device.platform + ' frame controls');
    assert.equal(Boolean(harness.get('bottom_right')), device.steps,
      device.platform + ' health controls');
    assert.equal(Boolean(heart && heart.visible), device.heart,
      device.platform + ' heart-rate controls');
    assert.match(harness.get('device_summary').get(), new RegExp(device.label),
      device.platform + ' summary');
  });
});

test('the generated preview matches Pebble palette, battery, inversion, and round assets', function() {
  var basalt = buildHarness('basalt', 'pebble_time');
  var chalk = buildHarness('chalk', 'pebble_time_round_black_14');

  assert.equal(count(basalt.canvas.innerHTML, /data-battery-state="full"/g), 8);
  assert.equal(count(basalt.canvas.innerHTML, /data-battery-state="empty"/g), 2);
  assert.match(basalt.canvas.innerHTML, /data-battery-state="empty"/);
  assert.match(basalt.canvas.innerHTML, /fill="#4f6790"/,
    'preset blue uses Pebble sunlight correction');
  assert.doesNotMatch(basalt.canvas.innerHTML, /filter:invert/);

  basalt.set('invert', true);
  assert.match(basalt.canvas.innerHTML,
    /fill="#ffffff" class="trek-color-target" data-color-key="backgroundcol"/);
  assert.match(basalt.canvas.innerHTML, /fill="#aea382"/,
    'the inverted preset uses Pebble sunlight correction');

  chalk.set('preview_disconnected', true);
  assert.match(chalk.canvas.innerHTML, /Bluetooth disconnected alert preview/);
  assert.match(chalk.canvas.innerHTML, /data-color-key="popup_color"/);
  assert.match(chalk.canvas.innerHTML, /data-preview-role="bluetooth-symbol"/);
  assert.doesNotMatch(chalk.canvas.innerHTML, /data-preview-role="weather-icon"/,
    'Chalk has no native weather bitmap geometry');
});

test('battery preview uses the native geometry for every display family', function() {
  var rect = buildHarness('basalt', 'pebble_time').canvas.innerHTML;
  var chalk = buildHarness('chalk', 'pebble_time_round_black_14').canvas.innerHTML;
  var emery = buildHarness('emery', 'pebble_time_2').canvas.innerHTML;

  assert.match(rect, /x="91" y="82" width="3" height="14"/);
  assert.match(rect, /x="126" y="82" width="3" height="14"/);
  assert.match(chalk, /x="85" y="83" width="4" height="11"/);
  assert.match(chalk, /x="127" y="83" width="4" height="11"/);
  assert.match(emery, /x="120" y="110" width="4" height="21"/);
  assert.match(emery, /x="176" y="110" width="4" height="21"/);
});

test('Chalk classic empty battery checker spans native x+0 through x+4 pixels', function() {
  var chalk = buildHarness('chalk', 'pebble_time_round_black_14').canvas.innerHTML;
  var gabbro = buildHarness('gabbro', 'pebble_round_2_black').canvas.innerHTML;

  assert.match(chalk,
    /data-battery-state="empty"[\s\S]*?<rect x="72" y="83" width="5" height="11"[^>]*trek-empty-pattern/);
  assert.match(chalk,
    /data-battery-state="empty"[\s\S]*?<rect x="78" y="83" width="5" height="11"[^>]*trek-empty-pattern/);
  assert.doesNotMatch(chalk,
    /<rect x="73" y="83" width="4" height="11"[^>]*trek-empty-pattern/);
  assert.match(gabbro,
    /data-battery-state="empty"[\s\S]*?<rect x="102" y="120" width="7" height="16"[^>]*trek-empty-pattern/,
    'Gabbro checker remains inset by one pixel at its native seven-pixel width');
});

test('Gabbro uses a dedicated interactive 260px parametric preview', function() {
  var gabbro = buildHarness('gabbro', 'pebble_round_2_black');
  var html = gabbro.canvas.innerHTML;

  assert.match(html, /viewBox="0 0 260 260"/);
  assert.equal(count(html, /data-color-key="customcol\d+"/g), 13);
  assert.match(html, /data-color-key="bluetooth_color"/);
  assert.match(html, /x="120" y="120" width="7" height="16"/);
  assert.match(html, /x="183" y="120" width="7" height="16"/);
  gabbro.set('preview_disconnected', true);
  assert.equal(count(gabbro.canvas.innerHTML, /data-preview-role="popup-rail"/g), 6);
  assert.match(gabbro.canvas.innerHTML, /SHAKE TO DISMISS/);
});

test('opening a preset frame color does not change the theme until a color is chosen', function() {
  var themes = {
    8: ['#AAAAFF','#AAAAFF','#AAAAFF','#AAAAFF','#AA55FF','#AA55FF','#AA55FF',
      '#AA55FF','#FF5500','#FF5500','#FF5500','#FFAA00','#FFAA00'],
    11: ['#AAFF55','#AAFF55','#AAFF55','#00FF00','#00AA00','#00AA00','#00AA00',
      '#00AA00','#FF0000','#FF0000','#FF0000','#FF5500','#FFAA00']
  };
  // The frame is themed as three regions (top bar + rail / middle / whole bottom bar
  // incl. both stubs), so a staged preset collapses onto each region's leader - a
  // preset that tints the stubs separately (theme 8's orange 11/12) is expected to
  // take the bottom bar's colour here.
  var GROUP = [0, 0, 0, 0, 4, 4, 4, 4, 8, 8, 8, 8, 8];

  [
    { platform: 'basalt', model: 'pebble_time', theme: 8 },
    { platform: 'gabbro', model: 'pebble_round_2_black', theme: 11 }
  ].forEach(function(device) {
    var harness = buildHarness(device.platform, device.model);
    var before;
    var index;
    harness.set('background', String(device.theme));
    before = frameFills(harness.canvas.innerHTML);
    harness.tapPreview('customcol4');

    assert.equal(harness.get('background').get(), String(device.theme),
      device.platform + ' does not change a preference merely by opening the picker');
    for (index = 0; index < 13; index++) {
      assert.equal(harness.get('customcol' + index).get(),
        themes[device.theme][GROUP[index]],
        device.platform + ' staged preset piece ' + index + ' follows its region');
    }
    assert.deepEqual(frameFills(harness.canvas.innerHTML), before,
      device.platform + ' displayed preset does not jump');

    harness.set('customcol4', '#FFFFFF');
    assert.equal(harness.get('background').get(), '12',
      device.platform + ' selects Custom after a color actually changes');
  });
});

test('nearby taps resolve to tiny preview elements without immediately changing a setting', function() {
  var harness = buildHarness('basalt', 'pebble_time');

  harness.set('background', '8');
  harness.tapNearPreview('customcol9', 20);
  assert.equal(harness.get('background').get(), '8', 'opening the picker leaves the preset active');
  assert.equal(harness.get('customcol9').get(), '#FF5500',
    'the nearby frame target, rather than the full-screen background, receives the tap');
});

test('monochrome preset seeding uses the exact white frame shown by the B/W picker', function() {
  var harness = buildHarness('aplite', 'pebble');
  var before = frameFills(harness.canvas.innerHTML);
  var index;

  harness.tapPreview('customcol3');
  assert.equal(harness.get('background').get(), '0');
  for (index = 0; index < 13; index++) {
    assert.equal(harness.get('customcol' + index).get(), '#FFFFFF');
  }
  assert.deepEqual(frameFills(harness.canvas.innerHTML), before);
  harness.set('customcol3', '#000000');
  assert.equal(harness.get('background').get(), '12');
});

test('choosing Custom in the theme dropdown preserves the existing custom palette', function() {
  var harness = buildHarness('basalt', 'pebble_time');
  var custom = ['#000000','#000055','#0000AA','#0000FF','#005500','#005555','#0055AA',
    '#0055FF','#00AA00','#00AA55','#00AAAA','#00AAFF','#00FF00'];
  var index;

  harness.set('background', '12');
  for (index = 0; index < custom.length; index++) {
    harness.set('customcol' + index, custom[index]);
  }
  harness.set('background', '4');
  harness.set('background', '12');

  for (index = 0; index < custom.length; index++) {
    assert.equal(harness.get('customcol' + index).get(), custom[index]);
  }
});

test('drawn popup text colors are independent targets on vector and raster watches', function() {
  var basalt = buildHarness('basalt', 'pebble_time');
  var chalk = buildHarness('chalk', 'pebble_time_round_black_14');
  var basaltPanel;
  var chalkPanel;

  basalt.set('preview_disconnected', true);
  chalk.set('preview_disconnected', true);
  assert.match(basalt.canvas.innerHTML,
    /data-color-key="popup_time_color"[^>]*>[^<]*<title>Change disconnect alert clock color<\/title>/);
  assert.match(basalt.canvas.innerHTML,
    /data-color-key="popup_hint_color"[^>]*>SHAKE TO DISMISS<title>Change disconnect alert hint color<\/title>/);
  assert.match(chalk.canvas.innerHTML, /data-color-key="popup_time_color"/);
  assert.match(chalk.canvas.innerHTML, /data-color-key="popup_hint_color"/);

  basalt.set('backgroundcol', '#555555');
  chalk.set('backgroundcol', '#555555');
  basaltPanel = basalt.canvas.innerHTML.match(
    /Bluetooth disconnected alert preview"><rect ([^>]+)\/>/);
  chalkPanel = chalk.canvas.innerHTML.match(
    /Bluetooth disconnected alert preview"><rect ([^>]+)\/>/);
  assert.ok(basaltPanel);
  assert.ok(chalkPanel);
  assert.match(basaltPanel[1], /fill="#545454"/);
  assert.match(basaltPanel[1], /data-color-key="backgroundcol"/);
  assert.match(chalkPanel[1], /fill="#545454"/,
    'Chalk paints its popup interior with the selected screen background');
  assert.match(chalkPanel[1], /data-color-key="backgroundcol"/);
  assert.equal(count(basalt.canvas.innerHTML, /data-color-key="backgroundcol"/g), 3,
    'screen, vector popup panel, and vector time notch are targets');
  assert.equal(count(chalk.canvas.innerHTML, /data-color-key="backgroundcol"/g), 3,
    'Chalk screen, popup interior, and time notch are background targets');
  assert.doesNotMatch(chalk.canvas.innerHTML,
    /data-preview-role="popup-rail"[^>]*data-color-key=/,
    'Chalk raster rails are not advertised as recolorable');
});

test('every visible color control has a matching tappable preview target', function() {
  [
    ['aplite', 'pebble'], ['basalt', 'pebble_time'],
    ['chalk', 'pebble_time_round_black_14'], ['diorite', 'pebble_2_se'],
    ['emery', 'pebble_time_2'], ['flint', 'pebble_2_duo'],
    ['gabbro', 'pebble_round_2_black']
  ].forEach(function(device) {
    var harness = buildHarness(device[0], device[1]);
    var targets = {};
    var pattern;
    var match;

    harness.set('preview_disconnected', true);
    pattern = /data-color-key="([^"]+)"/g;
    while ((match = pattern.exec(harness.canvas.innerHTML))) {
      targets[match[1]] = true;
    }
    harness.items.filter(function(candidate) {
      return candidate.definition.type === 'color' && candidate.visible;
    }).forEach(function(colorItem) {
      assert.equal(targets[colorItem.definition.messageKey], true,
        device[0] + ' preview target for ' + colorItem.definition.messageKey);
    });
  });
});

test('preview dates are current, localized, and use native punctuation', function() {
  var harness = buildHarness('basalt', 'pebble_time');
  var now = new Date();
  var day = String(now.getDate()).padStart(2, '0');
  var month = String(now.getMonth() + 1).padStart(2, '0');
  var year = String(now.getFullYear());

  harness.set('format', '6');
  assert.match(harness.canvas.innerHTML,
    new RegExp(day + '\\.' + month + '\\.' + year));
  harness.set('language', '2');
  assert.match(harness.canvas.innerHTML, /data-preview-role="today-highlight"/);
  assert.match(harness.canvas.innerHTML,
    /data-preview-role="today-highlight">[\s\S]*fill="#ffffff"[\s\S]*fill="#000000"/,
    'today highlight inverts both the dark face and white weekday glyph');
  assert.doesNotMatch(harness.canvas.innerHTML, /AUG 9|STARDATE/);
});

test('preview-only 24-hour mode updates the face and popup time', function() {
  var harness = buildHarness('basalt', 'pebble_time');
  var expected = String(new Date().getHours()).padStart(2, '0') + ':';

  harness.set('preview_24h', true);
  assert.match(harness.canvas.innerHTML, new RegExp('>' + expected));
  harness.set('preview_disconnected', true);
  assert.match(harness.canvas.innerHTML, new RegExp('>' + expected));
  assert.doesNotMatch(harness.canvas.innerHTML, />AM<|>PM</);
});

test('interactive SVG and Pebble palette accessibility avoid hidden keyboard traps', function() {
  var source = clayCustom.toString();
  var basalt = buildHarness('basalt', 'pebble_time');

  assert.doesNotMatch(basalt.canvas.innerHTML, /role="img"/);
  assert.match(source, /setAttribute\("aria-hidden", open \? "false" : "true"\)/);
  assert.match(source, /setAttribute\("tabindex", open \? "0" : "-1"\)/);
  assert.match(source, /event\.keyCode === 9/);
  assert.match(source, /event\.shiftKey/);
  assert.match(source, /label\.setAttribute\("tabindex", disabled \? "-1" : "0"\)/);
  assert.match(source, /setAttribute\("aria-expanded", open \? "true" : "false"\)/);
  assert.match(source, /setAttribute\("aria-pressed"/);
  assert.match(source, /title\.textContent = "Choose color: "/);
  assert.match(source, /bestDistance <= 20/);
  assert.match(source, /restorePickerOrigin\(\)/);
  assert.match(source, /focusKey = active\.getAttribute\("data-color-key"\)/);
  assert.match(source, /\.picker-wrap\{top:190px!important/);

  assert.equal(count(basalt.canvas.innerHTML,
    /data-color-key="othertextcol"[^>]*tabindex="0"/g), 1,
  'repeated secondary text uses one keyboard stop');
  assert.equal(count(basalt.canvas.innerHTML,
    /data-color-key="battery_full_color"[^>]*tabindex="0"/g), 1,
  'repeated filled bars use one keyboard stop');
  assert.match(basalt.canvas.innerHTML,
    /data-color-key="battery_full_color"[^>]*tabindex="-1" aria-hidden="true"/,
  'remaining bars stay tappable without duplicating screen-reader controls');
});

test('fallback watch metadata stays conservative without claiming an Aplite model', function() {
  var harness = buildHarness('aplite', 'pebble', false);

  assert.match(harness.get('device_summary').get(), /Watch metadata is unavailable/);
  assert.match(harness.canvas.innerHTML, /viewBox="0 0 144 168"/);
  assert.equal(harness.get('bottom_right'), null);
});

test('every platform preview has complete finite battery geometry', function() {
  [
    ['aplite', 'pebble'], ['basalt', 'pebble_time'],
    ['chalk', 'pebble_time_round_black_14'], ['diorite', 'pebble_2_se'],
    ['emery', 'pebble_time_2'], ['flint', 'pebble_2_duo'],
    ['gabbro', 'pebble_round_2_black']
  ].forEach(function(device) {
    var html = buildHarness(device[0], device[1]).canvas.innerHTML;
    assert.doesNotMatch(html, /NaN|undefined/, device[0] + ' SVG geometry');
    assert.equal(count(html, /data-battery-state="(?:full|empty)"/g), 10);
  });
});

test('raster icons are not advertised as recolorable while Gabbro vectors are', function() {
  var basaltHarness = buildHarness('basalt', 'pebble_time');
  var basalt;
  var emery = buildHarness('emery', 'pebble_time_2');
  var gabbro = buildHarness('gabbro', 'pebble_round_2_black');
  var weather;

  assert.doesNotMatch(basaltHarness.canvas.innerHTML, /data-preview-role="weather-icon"/,
    'untouched raster weather is blank like the native bitmap layer');
  assert.doesNotMatch(emery.canvas.innerHTML, /data-preview-role="weather-icon"/,
    'untouched Time 2 weather is blank like the native bitmap layer');
  basaltHarness.set('location', 'Phoenix');
  basalt = basaltHarness.canvas.innerHTML;
  assert.match(basalt, /data-preview-role="weather-icon"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(basalt,
    /data-preview-role="weather-icon"[^>]*data-color-key=/);
  emery.set('bottom_left', '0');
  assert.match(emery.canvas.innerHTML, /data-preview-role="heart-icon"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(emery.canvas.innerHTML,
    /data-preview-role="heart-icon"[^>]*data-color-key=/);
  weather = gabbro.canvas.innerHTML.match(/<g data-preview-role="weather-icon"[^>]+>/);
  assert.ok(weather);
  assert.match(weather[0], /data-color-key="othertextcol"/);
});

test('step-count preview follows each native label and footprint rectangle', function() {
  var chalk = buildHarness('chalk', 'pebble_time_round_black_14');
  var basalt = buildHarness('basalt', 'pebble_time');
  var emery = buildHarness('emery', 'pebble_time_2');
  var gabbro = buildHarness('gabbro', 'pebble_round_2_black');

  [chalk, basalt, emery, gabbro].forEach(function(harness) {
    harness.set('bottom_right', '0');
  });
  assert.match(chalk.canvas.innerHTML, /translate\(57 159\)[\s\S]*>8,421</);
  assert.match(basalt.canvas.innerHTML,
    /translate\(122 136\) scale\(1 1\.05\)[\s\S]*x="123"[^>]*>8,421</);
  assert.match(emery.canvas.innerHTML,
    /translate\(171 188\) scale\(1\.15 1\.2\)[\s\S]*x="168"[^>]*>8,421</);
  assert.match(gabbro.canvas.innerHTML,
    /cx="193" cy="219"[\s\S]*x="177" y="225"[^>]*>8,421</);
});

test('refined preview geometry matches native weather, Bluetooth, battery, and popup drawing', function() {
  var basalt = buildHarness('basalt', 'pebble_time');
  var chalk = buildHarness('chalk', 'pebble_time_round_black_14');
  var emery = buildHarness('emery', 'pebble_time_2');
  var gabbro = buildHarness('gabbro', 'pebble_round_2_black');

  basalt.set('battery_colorized', true);
  assert.match(basalt.canvas.innerHTML,
    /data-battery-state="full"[\s\S]*?x="91" y="80" width="3" height="16"/,
    '144px custom bars are clipped to the native 16px layer');
  // The rune is the original IMAGE_BLUETOOTH bitmask drawn as 1px runs: top of the
  // dotted staff, both crossing-tail ends at x=0 of the ink box, and the staff foot.
  assert.match(basalt.canvas.innerHTML,
    /d="M135 80h1v1h-1z[^"]*M132 83h1v1h-1z[^"]*M132 91h1v1h-1z[^"]*M135 94h1v1h-1z"/,
    '144px Bluetooth rune matches the original 8x15 art in its native layer');
  // Time 2 draws its own 11x19 5.x art (2px strokes): staff top, both 2px crossing
  // tails at x=0 of the ink box, and the staff foot.
  assert.match(emery.canvas.innerHTML,
    /d="M189 110h1v1h-1z[^"]*M184 114h2v1h-2z[^"]*M184 124h2v1h-2z[^"]*M189 128h1v1h-1z"/,
    'Time 2 Bluetooth rune is centered in its native layer');
  assert.match(gabbro.canvas.innerHTML,
    /d="M207 122h1v1h-1z[^"]*M202 126h2v1h-2z[^"]*M202 136h2v1h-2z[^"]*M207 140h1v1h-1z"/,
    'Round 2 shares the Time 2 Bluetooth art, centered in its 32x24 notch');

  chalk.set('preview_disconnected', true);
  assert.equal(count(chalk.canvas.innerHTML, /data-preview-role="popup-rail"/g), 6);
  assert.match(chalk.canvas.innerHTML, /x="34" y="45" width="7" height="9"/);
  assert.match(chalk.canvas.innerHTML, /x="43" y="45" width="95" height="9"/,
    'Round popup keeps the raster artwork gap between rail pieces');

  assert.match(gabbro.canvas.innerHTML,
    /data-preview-role="weather-icon"[\s\S]*?<circle cx="53" cy="60" r="14"[\s\S]*?M43 50L63 70/,
    'unconfigured Round 2 weather uses the native unavailable symbol');
  assert.doesNotMatch(gabbro.canvas.innerHTML, />--°</,
    'unconfigured native temperature storage is blank');
  gabbro.set('location', 'Phoenix');
  assert.match(gabbro.canvas.innerHTML,
    /data-preview-role="weather-icon"[\s\S]*?<circle cx="53" cy="60" r="7"[\s\S]*?M53 50V53/,
    'configured Round 2 weather includes the native eight-ray clear icon');
  assert.match(gabbro.canvas.innerHTML,
    /<text x="202" y="119"[^>]*text-anchor="start"[^>]*>72°/,
    'temperature text starts at the native left-aligned Gabbro rectangle');
  assert.match(gabbro.canvas.innerHTML,
    /<text x="55" y="170" font-size="16"[^>]*>[^<]+<title>Change secondary text color/,
    'Round 2 weekday baseline follows the native Antonio 21 metrics');
});

test('heart-rate bracket preview masks the frame before redrawing the day strip', function() {
  var emery = buildHarness('emery', 'pebble_time_2');
  var html;
  var mask;
  var days;
  var highlight;

  emery.set('bottom_left', '0');
  emery.set('date_bracket', true);
  html = emery.canvas.innerHTML;
  mask = html.indexOf('data-preview-role="bracket-date-mask"');
  days = html.indexOf('>Su Mo Tu We Th Fr Sa<');
  highlight = html.indexOf('data-preview-role="today-highlight"');
  assert.ok(mask >= 0 && days > mask && highlight > days,
    'date background cannot erase the day text or today highlight');
});
