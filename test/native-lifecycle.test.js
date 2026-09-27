'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');

var source = fs.readFileSync(path.join(__dirname, '..', 'src', 'c', 'main.c'), 'utf8');

test('native messaging initializes after UI construction and tears down conditionally', function() {
  var initCall = source.lastIndexOf('initialize_messaging();');
  var popupConstruction = source.indexOf('popup_layer = layer_create');
  var serviceSubscription = source.indexOf('tick_timer_service_subscribe(', popupConstruction);

  assert.ok(initCall > popupConstruction, 'AppSync must start after all UI layers are constructed');
  assert.ok(initCall < serviceSubscription, 'AppSync must start before normal runtime subscriptions');
  assert.match(source, /if \(app_sync_initialized\) \{\s*app_sync_deinit\(&app\);/);
  assert.match(source, /if \(messaging_retry_timer\) \{\s*app_timer_cancel\(messaging_retry_timer\);/);
  assert.doesNotMatch(source, /\n\s*app_sync_deinit\(\s*&app\s*\);\s*\n\s*\/\/ Destroy window/);
});

test('native AppSync setup is preflighted, validated, and bounded-retry', function() {
  assert.match(source, /dict_calc_buffer_size_from_tuplets/);
  assert.match(source, /required > sizeof\(sync_buffer\)/);
  assert.match(source, /app_message_open\(512, 256\)/);
  assert.match(source, /if \(open_result != APP_MSG_OK\)/);
  assert.match(source, /if \(!app_sync_get\(&app, SETTING_LANGUAGE_KEY\)\)/);
  assert.match(source, /messaging_retry_count >= MESSAGING_RETRY_MAX/);
});

test('failed health subscriptions use bounded retries and reset for a later choice', function() {
  assert.match(source, /#define HEALTH_RETRY_MAX 3/);
  assert.match(source,
    /health_retry_count < HEALTH_RETRY_MAX[\s\S]*health_retry_timer = app_timer_register\(5000, health_retry_cb, NULL\);/);
  assert.match(source, /if \(health_retry_timer\) \{ health_retry_count\+\+; \}/);
  assert.match(source, /if \(!want_health\) \{ health_retry_count = 0; \}/);
});

test('temperature text has owned bounded storage rather than an AppSync buffer pointer', function() {
  assert.match(source, /static char temperature_text\[16\]/);
  assert.match(source, /snprintf\(temperature_text, sizeof\(temperature_text\), "%\.\*s"/);
  assert.match(source, /text_layer_set_text\(temp_layer, temperature_text\)/);
  assert.doesNotMatch(source, /text_layer_set_text\(temp_layer, tuple_new->value->cstring\)/);
});

test('native palette v2 preserves v1 colors and independently themes popup text', function() {
  assert.match(source, /#define DRAW_PALETTE_VERSION 2/);
  assert.match(source, /#define DRAW_PALETTE_LEN 20/);
  assert.match(source, /#define DRAW_PALETTE_POPUP_TIME 18/);
  assert.match(source, /#define DRAW_PALETTE_POPUP_HINT 19/);
  assert.match(source, /palette_size == DRAW_PALETTE_V1_LEN/);
  assert.match(source, /memcpy\(&draw_palette\[1\], &old_palette\[1\], DRAW_PALETTE_V1_LEN - 1\)/);
  assert.match(source, /draw_palette\[DRAW_PALETTE_POPUP_TIME\]/);
  assert.match(source, /draw_palette\[DRAW_PALETTE_POPUP_HINT\]/);
});

test('live step-layout changes tolerate an unavailable optional step label', function() {
  assert.match(source,
    /if \(steps_label\) \{ layer_set_hidden\(text_layer_get_layer\(steps_label\), !steps_status\); \}/);
  assert.doesNotMatch(source,
    /\n\s*layer_set_hidden\(text_layer_get_layer\(steps_label\),\s*!steps_status\);/);
});
