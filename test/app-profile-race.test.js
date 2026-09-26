'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var Codec = require('../src/pkjs/settings-codec.js');
var messageKeys = require('../package.json').pebble.messageKeys;

var PROFILE_PREFIX = 'trekv4-settings:';

function watch(platform, model) {
  return {
    platform: platform,
    model: model,
    firmware: { major: 4, minor: 7, patch: 0 }
  };
}

function profile(settings) {
  return JSON.stringify(Codec.mergeSettings(Codec.defaultSettings(), settings));
}

function loadApp(initialStorage, initialWatch) {
  var source = fs.readFileSync(path.join(__dirname, '../src/pkjs/app.js'), 'utf8');
  var storage = Object.assign({}, initialStorage);
  var events = {};
  var enqueued = [];
  var currentWatch = initialWatch;
  var clayInstance;

  function ClayMock() {
    clayInstance = this;
    this.meta = null;
    this.generateUrl = function() { return 'https://settings.invalid/'; };
  }

  function createQueueMock() {
    return {
      enqueue: function(dictionary, delivery) {
        enqueued.push({ dictionary: dictionary, delivery: delivery });
        return true;
      },
      discard: function() {},
      resume: function() {}
    };
  }

  var sandbox = {
    console: { log: function() {}, warn: function() {} },
    localStorage: {
      getItem: function(key) {
        return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
      },
      setItem: function(key, value) { storage[key] = String(value); }
    },
    Pebble: {
      addEventListener: function(name, handler) { events[name] = handler; },
      getActiveWatchInfo: function() { return currentWatch.info; },
      getWatchToken: function() { return currentWatch.token; },
      getAccountToken: function() { return 'account'; },
      openURL: function() {},
      sendAppMessage: function() {}
    },
    navigator: {},
    setTimeout: function() { return 1; },
    clearTimeout: function() {},
    require: function(request) {
      if (request === './settings-codec.js') { return Codec; }
      if (request === '@rebble/clay') { return ClayMock; }
      // app.js ships the generated, comment-stripped copy; the readable source is
      // accepted too so this harness keeps working either way.
      if (request === './config.js' || request === './clay-custom.js' ||
          request === './clay-custom.gen.js') { return {}; }
      if (request === './message-queue.js') { return createQueueMock; }
      if (request === 'message_keys') { return messageKeys; }
      throw new Error('Unexpected app.js dependency: ' + request);
    }
  };

  vm.runInNewContext(source, sandbox, { filename: 'src/pkjs/app.js' });
  return {
    events: events,
    enqueued: enqueued,
    storage: storage,
    clay: function() { return clayInstance; },
    setWatch: function(nextWatch) { currentWatch = nextWatch; }
  };
}

test('Settings response stays with its origin profile when the active watch changes', function() {
  var basalt = { token: 'watch-a', info: watch('basalt', 'pebble_time') };
  var aplite = { token: 'watch-b', info: watch('aplite', 'pebble_original') };
  var basaltKey = PROFILE_PREFIX + encodeURIComponent(basalt.token);
  var apliteKey = PROFILE_PREFIX + encodeURIComponent(aplite.token);
  var harness = loadApp({
    'trekv4-settings-profile-version': '1',
    [basaltKey]: profile({ background: '1', othertextcol: 0xAA55FF }),
    [apliteKey]: profile({ background: '2', othertextcol: 0xFFFFFF })
  }, basalt);

  harness.events.ready();
  harness.events.showConfiguration();
  harness.setWatch(aplite);
  // A reconnect can replace the globals while the old watch's page is open.
  harness.events.ready();
  harness.events.webviewclosed({
    response: JSON.stringify({ background: '8', othertextcol: 0xFF0000 })
  });

  assert.equal(JSON.parse(harness.storage[basaltKey]).background, '8');
  assert.equal(JSON.parse(harness.storage[basaltKey]).othertextcol, 0xFF0000);
  assert.equal(JSON.parse(harness.storage[apliteKey]).background, '2');
  assert.equal(JSON.parse(harness.storage[apliteKey]).othertextcol, 0xFFFFFF);
  assert.equal(JSON.parse(harness.storage['clay-settings']).background, '2');
  assert.equal(harness.enqueued.at(-1).dictionary[messageKeys.background], 2);
  assert.equal(harness.enqueued.at(-1).dictionary[messageKeys.othertextcol], 0xFFFFFF);
  assert.equal(harness.clay().meta.watchToken, aplite.token);
});

test('Settings response still updates and reconciles the originating active watch', function() {
  var basalt = { token: 'watch-a', info: watch('basalt', 'pebble_time') };
  var basaltKey = PROFILE_PREFIX + encodeURIComponent(basalt.token);
  var harness = loadApp({
    'trekv4-settings-profile-version': '1',
    [basaltKey]: profile({ background: '1' })
  }, basalt);

  harness.events.ready();
  harness.events.showConfiguration();
  harness.events.webviewclosed({ response: JSON.stringify({ background: '8' }) });

  assert.equal(JSON.parse(harness.storage[basaltKey]).background, '8');
  assert.equal(JSON.parse(harness.storage['clay-settings']).background, '8');
  assert.equal(harness.enqueued.at(-1).dictionary[messageKeys.background], 8);
});

test('closing without saving still reconciles a watch changed during Settings', function() {
  var basalt = { token: 'watch-a', info: watch('basalt', 'pebble_time') };
  var aplite = { token: 'watch-b', info: watch('aplite', 'pebble_original') };
  var basaltKey = PROFILE_PREFIX + encodeURIComponent(basalt.token);
  var apliteKey = PROFILE_PREFIX + encodeURIComponent(aplite.token);
  var harness = loadApp({
    'trekv4-settings-profile-version': '1',
    [basaltKey]: profile({ background: '1' }),
    [apliteKey]: profile({ background: '2' })
  }, basalt);

  harness.events.ready();
  harness.events.showConfiguration();
  harness.setWatch(aplite);
  harness.events.webviewclosed({ response: '' });

  assert.equal(JSON.parse(harness.storage[basaltKey]).background, '1');
  assert.equal(JSON.parse(harness.storage[apliteKey]).background, '2');
  assert.equal(JSON.parse(harness.storage['clay-settings']).background, '2');
  assert.equal(harness.enqueued.at(-1).dictionary[messageKeys.background], 2);
  assert.equal(harness.clay().meta.watchToken, aplite.token);
});
