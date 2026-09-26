'use strict';

// Pure settings conversion shared by PebbleKit JS and the Node regression tests.
// Clay stores picker colours as 0xRRGGBB; Pebble's GColor8 wire format is
// 0b11RRGGBB, with two bits per colour channel.

var FRAME_DEFAULTS = [
  0xAAAAFF, 0xAAAAFF, 0xAAAAFF, 0xAAAAFF,
  0xAA55FF, 0xAA55FF, 0xAA55FF, 0xAA55FF,
  0xFF5555, 0xFF5555, 0xFF5555,
  0xFFAA00, 0xFFAA00
];

var PALETTE_VERSION = 2;
var DEFAULT_REFRESH_INTERVAL = 1800000;
var REFRESH_INTERVALS = [300000, 600000, 1200000, 1800000, 3600000];
var WEATHER_RETRY_DELAYS = [30000, 120000, 300000];
var SUPPORTED_PLATFORMS = [
  'aplite', 'basalt', 'chalk', 'diorite', 'emery', 'flint', 'gabbro'
];

var INTEGER_FIELDS = {
  background: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  battery_background: [0, 1, 2],
  bottom_left: [0, 1],
  bottom_right: [0, 1],
  bt_vibe_pattern: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  bt_vibe_repeat: [0, 10000, 30000, 60000, 120000, 300000],
  format: [0, 1, 2, 3, 4, 5, 6, 7],
  language: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  secs_ampm: [0, 1],
  startday_status: [0, 1]
};

var BOOLEAN_FIELDS = [
  'bluetoothvibe_status',
  'bt_popup',
  'date_bracket',
  'hideweather',
  'hourlyvibe',
  'invert',
  'battery_colorized'
];

var WATCH_COLOR_FIELDS = [
  'backgroundcol',
  'othertextcol',
  'textcol'
];

var LOCAL_FIELDS = [
  'use_gps', 'units', 'location', 'refresh_interval',
  'battery_full_color', 'battery_empty_color',
  'bluetooth_color', 'popup_color', 'popup_time_color', 'popup_hint_color',
  'preview_disconnected', 'preview_24h'
];

// Read-only migration inputs from the pre-5.2 Clay page. They are admitted
// while decoding legacy localStorage, translated to the new layout selects,
// and then removed so they can never re-enter the current watch dictionary.
var LEGACY_BOOLEAN_FIELDS = ['steps_status', 'bpm_mode'];

var ALL_COLOR_FIELDS = WATCH_COLOR_FIELDS.concat([
  'battery_full_color', 'battery_empty_color',
  'bluetooth_color', 'popup_color', 'popup_time_color', 'popup_hint_color'
]);

var STORAGE_FIELDS = {};
var key;
var i;

for (key in INTEGER_FIELDS) {
  if (Object.prototype.hasOwnProperty.call(INTEGER_FIELDS, key)) {
    STORAGE_FIELDS[key] = true;
  }
}
for (i = 0; i < BOOLEAN_FIELDS.length; i++) {
  STORAGE_FIELDS[BOOLEAN_FIELDS[i]] = true;
}
for (i = 0; i < WATCH_COLOR_FIELDS.length; i++) {
  STORAGE_FIELDS[WATCH_COLOR_FIELDS[i]] = true;
}
for (i = 0; i < LOCAL_FIELDS.length; i++) {
  STORAGE_FIELDS[LOCAL_FIELDS[i]] = true;
}
for (i = 0; i < LEGACY_BOOLEAN_FIELDS.length; i++) {
  STORAGE_FIELDS[LEGACY_BOOLEAN_FIELDS[i]] = true;
}
for (i = 0; i < 13; i++) {
  STORAGE_FIELDS['customcol' + i] = true;
}

var SETTINGS_DEFAULTS = {
  background: '0',
  battery_background: '0',
  bottom_left: '1',
  bottom_right: '1',
  bt_vibe_pattern: '1',
  bt_vibe_repeat: '0',
  format: '0',
  language: '0',
  secs_ampm: '1',
  startday_status: '1',
  bluetoothvibe_status: true,
  bt_popup: true,
  date_bracket: false,
  hideweather: false,
  hourlyvibe: false,
  invert: false,
  battery_colorized: false,
  backgroundcol: 0x000000,
  othertextcol: 0xFFFFFF,
  textcol: 0xFFFFFF,
  use_gps: false,
  units: 'fahrenheit',
  location: '',
  refresh_interval: String(DEFAULT_REFRESH_INTERVAL),
  battery_full_color: 0xFFAA00,
  battery_empty_color: 0x550000,
  bluetooth_color: 0xFFFFFF,
  popup_color: 0xFF0000,
  popup_time_color: 0xFFAA00,
  popup_hint_color: 0xFFFFFF,
  preview_disconnected: false,
  preview_24h: false
};

function hasOwn(object, property) {
  return !!object && Object.prototype.hasOwnProperty.call(object, property);
}

function truncateText(value, maximumLength) {
  var text = typeof value === 'string' ? value : '';
  var end = Math.min(text.length, maximumLength);
  // Do not leave an unmatched leading surrogate at the truncation boundary;
  // encodeURIComponent rejects lone surrogates.
  if (end > 0 && end < text.length) {
    var code = text.charCodeAt(end - 1);
    if (code >= 0xD800 && code <= 0xDBFF) {
      end--;
    }
  }
  return text.slice(0, end);
}

function hasSupportedWatchMetadata(watchInfo) {
  return !!(watchInfo && typeof watchInfo.platform === 'string' &&
    SUPPORTED_PLATFORMS.indexOf(watchInfo.platform) !== -1 &&
    watchInfo.firmware && typeof watchInfo.firmware.major === 'number' &&
    isFinite(watchInfo.firmware.major) &&
    Math.floor(watchInfo.firmware.major) === watchInfo.firmware.major &&
    watchInfo.firmware.major >= 0);
}

function watchMetadataForClay(watchInfo) {
  if (hasSupportedWatchMetadata(watchInfo)) {
    return watchInfo;
  }
  // Clay's capability predicates dereference activeWatchInfo directly. Give
  // the framework a safe, least-capable shape, while app.js separately exposes
  // metadataAvailable=false so the UI never claims this is really an Aplite.
  return {
    platform: 'aplite',
    model: 'unknown',
    firmware: { major: 3, minor: 0, patch: 0 }
  };
}

function unwrapValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) &&
      hasOwn(value, 'value')) {
    return value.value;
  }
  return value;
}

function unwrapClaySettings(settings) {
  var result = {};
  var property;

  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return result;
  }

  for (property in settings) {
    if (hasOwn(settings, property) && STORAGE_FIELDS[property]) {
      result[property] = unwrapValue(settings[property]);
    }
  }
  return result;
}

function safeParseStoredSettings(serialized) {
  var parsed;
  if (typeof serialized !== 'string' || !serialized) {
    return {};
  }
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    return {};
  }
  return unwrapClaySettings(parsed);
}

function hasMeaningfulSettings(settings) {
  var source = unwrapClaySettings(settings);
  var property;
  for (property in source) {
    if (hasOwn(source, property)) {
      return true;
    }
  }
  return false;
}

function defaultSettings() {
  var result = {};
  var property;
  var index;
  for (property in SETTINGS_DEFAULTS) {
    if (hasOwn(SETTINGS_DEFAULTS, property)) {
      result[property] = SETTINGS_DEFAULTS[property];
    }
  }
  for (index = 0; index < FRAME_DEFAULTS.length; index++) {
    result['customcol' + index] = FRAME_DEFAULTS[index];
  }
  return result;
}

// Parse Clay's webview payload without calling Clay.getSettings(). Clay's
// implementation writes to localStorage before returning, so a storage quota
// or privacy-mode exception can otherwise prevent an entirely valid Save from
// reaching the watch. Keep wrappers intact here; mergeSettings() performs the
// field whitelist, unwrapping and type validation.
function parseWebviewResponse(response) {
  var text;
  var parsed;

  if (typeof response !== 'string') {
    throw new TypeError('The settings response must be a string');
  }
  text = response.replace(/^\s+|\s+$/g, '');
  if (!text) {
    throw new Error('The settings response was empty');
  }
  if (text.charAt(0) !== '{') {
    try {
      text = decodeURIComponent(text);
    } catch (error) {
      throw new Error('The settings response was not valid URI encoding');
    }
  }
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error('The settings response was not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The settings response was not an object');
  }
  return parsed;
}

function parseInteger(value) {
  var text;
  if (typeof value === 'number') {
    return isFinite(value) && Math.floor(value) === value ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  text = value.replace(/^\s+|\s+$/g, '');
  // Older versions of the page emitted select values such as "1.".
  if (!/^-?\d+\.?$/.test(text)) {
    return null;
  }
  value = parseInt(text, 10);
  return isFinite(value) ? value : null;
}

function parseBoolean(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') {
    return true;
  }
  if (value === false || value === 0 || value === '0' || value === 'false') {
    return false;
  }
  return null;
}

function parseRgb(value) {
  var text;
  var number;

  value = unwrapValue(value);
  if (typeof value === 'number') {
    return isFinite(value) && Math.floor(value) === value &&
      value >= 0 && value <= 0xFFFFFF ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }

  text = value.replace(/^\s+|\s+$/g, '');
  if (/^#[0-9a-f]{6}$/i.test(text)) {
    number = parseInt(text.slice(1), 16);
  } else if (/^0x[0-9a-f]{6}$/i.test(text)) {
    number = parseInt(text.slice(2), 16);
  } else if (/^\d+$/.test(text)) {
    number = parseInt(text, 10);
  } else {
    return null;
  }
  return number >= 0 && number <= 0xFFFFFF ? number : null;
}

function rgbToArgb8(value) {
  var rgb = parseRgb(value);
  var red;
  var green;
  var blue;
  if (rgb === null) {
    return null;
  }
  red = (rgb >> 16) & 0xFF;
  green = (rgb >> 8) & 0xFF;
  blue = rgb & 0xFF;
  return 0xC0 | ((red >> 6) << 4) | ((green >> 6) << 2) | (blue >> 6);
}

function migrateStoredSettings(settings) {
  var source = unwrapClaySettings(settings);
  var result = {};
  var property;
  var parsed;
  var parsedBoolean;
  var oldColors = [];
  var hasExpandedPalette = false;
  var groupForSegment = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3];
  var index;

  for (property in source) {
    if (hasOwn(source, property)) {
      result[property] = source[property];
    }
  }

  // The former page used independent show/hide toggles. Preserve those choices
  // when upgrading to the mutually exclusive bottom-area selects, unless a
  // newer setting is already present. Native persistence performs the same
  // migration, but phone storage is authoritative as soon as PebbleKit JS
  // reconciles a complete profile at startup.
  if (!hasOwn(result, 'bottom_right') && hasOwn(result, 'steps_status')) {
    parsedBoolean = parseBoolean(result.steps_status);
    if (parsedBoolean !== null) {
      result.bottom_right = parsedBoolean ? '0' : '1';
    }
  }
  if (!hasOwn(result, 'bottom_left') && hasOwn(result, 'bpm_mode')) {
    parsedBoolean = parseBoolean(result.bpm_mode);
    if (parsedBoolean !== null) {
      result.bottom_left = parsedBoolean ? '0' : '1';
    }
  }
  delete result.steps_status;
  delete result.bpm_mode;

  for (property in INTEGER_FIELDS) {
    if (hasOwn(INTEGER_FIELDS, property) && hasOwn(result, property)) {
      parsed = parseInteger(result[property]);
      if (parsed !== null && INTEGER_FIELDS[property].indexOf(parsed) !== -1) {
        // Select and radio components expect their persisted values as strings.
        result[property] = String(parsed);
      } else {
        delete result[property];
      }
    }
  }

  for (index = 0; index < BOOLEAN_FIELDS.length; index++) {
    property = BOOLEAN_FIELDS[index];
    if (hasOwn(result, property)) {
      parsedBoolean = parseBoolean(result[property]);
      if (parsedBoolean === null) {
        delete result[property];
      } else {
        result[property] = parsedBoolean;
      }
    }
  }

  if (hasOwn(result, 'use_gps')) {
    parsedBoolean = parseBoolean(result.use_gps);
    if (parsedBoolean === null) {
      delete result.use_gps;
    } else {
      result.use_gps = parsedBoolean;
    }
  }
  for (index = 0; index < 2; index++) {
    property = index === 0 ? 'preview_disconnected' : 'preview_24h';
    if (hasOwn(result, property)) {
      parsedBoolean = parseBoolean(result[property]);
      if (parsedBoolean === null) {
        delete result[property];
      } else {
        result[property] = parsedBoolean;
      }
    }
  }
  if (hasOwn(result, 'refresh_interval')) {
    parsed = parseInteger(result.refresh_interval);
    if (REFRESH_INTERVALS.indexOf(parsed) === -1) {
      delete result.refresh_interval;
    } else {
      result.refresh_interval = String(parsed);
    }
  }

  if (hasOwn(result, 'units') && result.units !== 'celsius' &&
      result.units !== 'fahrenheit') {
    delete result.units;
  }
  if (hasOwn(result, 'location')) {
    if (typeof result.location !== 'string') {
      delete result.location;
    } else {
      result.location = truncateText(
        result.location.replace(/^\s+|\s+$/g, ''), 100);
    }
  }

  for (index = 0; index < ALL_COLOR_FIELDS.length; index++) {
    property = ALL_COLOR_FIELDS[index];
    if (hasOwn(result, property)) {
      parsed = parseRgb(result[property]);
      if (parsed === null) {
        delete result[property];
      } else {
        result[property] = parsed;
      }
    }
  }
  for (index = 0; index < 13; index++) {
    property = 'customcol' + index;
    if (hasOwn(result, property)) {
      parsed = parseRgb(result[property]);
      if (parsed === null) {
        delete result[property];
      } else {
        result[property] = parsed;
      }
    }
  }

  for (index = 4; index < 13; index++) {
    if (hasOwn(result, 'customcol' + index)) {
      hasExpandedPalette = true;
      break;
    }
  }
  if (!hasExpandedPalette) {
    for (index = 0; index < 4; index++) {
      oldColors[index] = parseRgb(result['customcol' + index]);
    }
    for (index = 0; index < 13; index++) {
      parsed = oldColors[groupForSegment[index]];
      result['customcol' + index] = parsed === null ? FRAME_DEFAULTS[index] : parsed;
    }
  }

  return result;
}

function mergeSettings(base, overrides) {
  var result = unwrapClaySettings(base);
  var update = unwrapClaySettings(overrides);
  var property;
  var legacyValue;

  // Translate legacy layout toggles before overlaying them on a complete modern
  // default/profile. Waiting until after the merge would make the default
  // bottom_left/right keys look like explicit newer choices and silently drop
  // the user's old Steps/Heart Rate preference.
  if (!hasOwn(update, 'bottom_right') && hasOwn(update, 'steps_status')) {
    legacyValue = parseBoolean(update.steps_status);
    if (legacyValue !== null) {
      update.bottom_right = legacyValue ? '0' : '1';
    }
  }
  if (!hasOwn(update, 'bottom_left') && hasOwn(update, 'bpm_mode')) {
    legacyValue = parseBoolean(update.bpm_mode);
    if (legacyValue !== null) {
      update.bottom_left = legacyValue ? '0' : '1';
    }
  }
  delete update.steps_status;
  delete update.bpm_mode;
  for (property in update) {
    if (hasOwn(update, property)) {
      result[property] = update[property];
    }
  }
  return migrateStoredSettings(result);
}

function weatherOptions(settings) {
  var source = unwrapClaySettings(settings);
  var gps = parseBoolean(source.use_gps);
  var hidden = parseBoolean(source.hideweather);
  var refresh = parseInteger(source.refresh_interval);
  var locationWasSet = hasOwn(source, 'location');
  var location = typeof source.location === 'string' ?
    truncateText(source.location.replace(/^\s+|\s+$/g, ''), 100) : '';

  if (REFRESH_INTERVALS.indexOf(refresh) === -1) {
    refresh = DEFAULT_REFRESH_INTERVAL;
  }

  return {
    use_gps: gps === null ? true : gps,
    units: source.units === 'celsius' ? 'celsius' : 'fahrenheit',
    hideweather: hidden === null ? false : hidden,
    // Preserve the legacy London default only when no location has ever been
    // stored. An explicitly cleared manual location must stay empty.
    location: locationWasSet ? location : 'London',
    refresh_interval: refresh,
    // A fresh install should not request phone location permission merely
    // because the configuration page defaults to GPS. Once the user has saved
    // weather settings (or a legacy install has persisted them), updates resume.
    configured: gps === true || location.length > 0
  };
}

function weatherRetryDelay(attempt) {
  var parsed = parseInteger(attempt);
  return parsed !== null && parsed >= 0 && parsed < WEATHER_RETRY_DELAYS.length ?
    WEATHER_RETRY_DELAYS[parsed] : null;
}

function allowedInteger(field, value) {
  var parsed = parseInteger(value);
  return parsed !== null && INTEGER_FIELDS[field].indexOf(parsed) !== -1 ? parsed : null;
}

function buildPalette(settings) {
  var source = unwrapClaySettings(settings);
  var result = [PALETTE_VERSION];
  var rgb;
  var argb;
  var index;

  for (index = 0; index < 13; index++) {
    rgb = parseRgb(source['customcol' + index]);
    argb = rgbToArgb8(rgb === null ? FRAME_DEFAULTS[index] : rgb);
    result.push(argb);
  }
  result.push(rgbToArgb8(parseRgb(source.battery_full_color) === null ?
    0xFFAA00 : source.battery_full_color));
  result.push(rgbToArgb8(parseRgb(source.battery_empty_color) === null ?
    0x550000 : source.battery_empty_color));
  result.push(rgbToArgb8(parseRgb(source.bluetooth_color) === null ?
    0xFFFFFF : source.bluetooth_color));
  result.push(rgbToArgb8(parseRgb(source.popup_color) === null ?
    0xFF0000 : source.popup_color));
  result.push(rgbToArgb8(parseRgb(source.popup_time_color) === null ?
    0xFFAA00 : source.popup_time_color));
  result.push(rgbToArgb8(parseRgb(source.popup_hint_color) === null ?
    0xFFFFFF : source.popup_hint_color));
  return result;
}

function buildWatchDictionary(settings, messageKeys) {
  var source = unwrapClaySettings(settings);
  var result = {};
  var value;
  var property;
  var index;

  messageKeys = messageKeys || {};

  for (property in INTEGER_FIELDS) {
    if (!hasOwn(INTEGER_FIELDS, property) || !hasOwn(messageKeys, property) ||
        !hasOwn(source, property)) {
      continue;
    }
    value = allowedInteger(property, source[property]);
    if (value !== null) {
      result[messageKeys[property]] = value;
    }
  }

  for (index = 0; index < BOOLEAN_FIELDS.length; index++) {
    property = BOOLEAN_FIELDS[index];
    if (!hasOwn(messageKeys, property) || !hasOwn(source, property)) {
      continue;
    }
    value = parseBoolean(source[property]);
    if (value !== null) {
      result[messageKeys[property]] = value ? 1 : 0;
    }
  }

  for (index = 0; index < WATCH_COLOR_FIELDS.length; index++) {
    property = WATCH_COLOR_FIELDS[index];
    if (!hasOwn(messageKeys, property) || !hasOwn(source, property)) {
      continue;
    }
    // These three legacy AppMessage keys have always carried 0xRRGGBB and the
    // watch feeds them to GColorFromHEX(). Keep that protocol stable; only the
    // new packed draw_palette uses native ARGB8 bytes.
    value = parseRgb(source[property]);
    if (value !== null) {
      result[messageKeys[property]] = value;
    }
  }

  if (hasOwn(messageKeys, 'draw_palette')) {
    result[messageKeys.draw_palette] = buildPalette(source);
  }
  return result;
}

module.exports = {
  FRAME_DEFAULTS: FRAME_DEFAULTS,
  PALETTE_VERSION: PALETTE_VERSION,
  DEFAULT_REFRESH_INTERVAL: DEFAULT_REFRESH_INTERVAL,
  WEATHER_RETRY_DELAYS: WEATHER_RETRY_DELAYS,
  SUPPORTED_PLATFORMS: SUPPORTED_PLATFORMS,
  SETTINGS_DEFAULTS: SETTINGS_DEFAULTS,
  defaultSettings: defaultSettings,
  hasSupportedWatchMetadata: hasSupportedWatchMetadata,
  watchMetadataForClay: watchMetadataForClay,
  safeParseStoredSettings: safeParseStoredSettings,
  hasMeaningfulSettings: hasMeaningfulSettings,
  parseWebviewResponse: parseWebviewResponse,
  unwrapClaySettings: unwrapClaySettings,
  parseInteger: parseInteger,
  parseBoolean: parseBoolean,
  truncateText: truncateText,
  parseRgb: parseRgb,
  rgbToArgb8: rgbToArgb8,
  migrateStoredSettings: migrateStoredSettings,
  mergeSettings: mergeSettings,
  weatherOptions: weatherOptions,
  weatherRetryDelay: weatherRetryDelay,
  buildPalette: buildPalette,
  buildWatchDictionary: buildWatchDictionary
};
