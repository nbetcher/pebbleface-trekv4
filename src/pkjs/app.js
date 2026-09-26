'use strict';

var Codec = require('./settings-codec.js');
var Clay = require('@rebble/clay');
var clayConfig = require('./config.js');
// The GENERATED, comment-stripped copy - Clay serialises this function into a data:
// URL, where every comment byte is paid for twice once percent-encoded. Edit
// clay-custom.js and re-run make_shim.py; test/gen-freshness.test.js enforces the two
// staying in sync.
var clayCustom = require('./clay-custom.gen.js');
var createMessageQueue = require('./message-queue.js');
var messageKeys = require('message_keys');

var SETTINGS_STORAGE_KEY = 'clay-settings';
var PROFILE_STORAGE_PREFIX = 'trekv4-settings:';
var PROFILE_MIGRATION_KEY = 'trekv4-settings-profile-version';
var REQUEST_TIMEOUT = 20000;

var CLEAR_DAY = 0;
var CLEAR_NIGHT = 1;
var PARTLY_CLOUDY_DAY = 4;
var PARTLY_CLOUDY_NIGHT = 5;
var RAIN = 8;
var SNOW = 9;
var HAIL = 10;
var CLOUDY = 11;
var STORM = 12;
var FOG = 13;
var NA = 14;

function readStoredSettings(storageKey) {
  var serialized = null;
  try {
    serialized = localStorage.getItem(storageKey || SETTINGS_STORAGE_KEY);
  } catch (error) {
    console.warn('Unable to read settings: ' + error.message);
  }
  return Codec.migrateStoredSettings(Codec.safeParseStoredSettings(serialized));
}

function storageHasSettings(storageKey) {
  var serialized = null;
  try {
    serialized = localStorage.getItem(storageKey || SETTINGS_STORAGE_KEY);
  } catch (error) {
    return false;
  }
  return Codec.hasMeaningfulSettings(Codec.safeParseStoredSettings(serialized));
}

function writeStoredSettings(settings, storageKey) {
  try {
    localStorage.setItem(storageKey || SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Unable to save settings: ' + error.message);
  }
}

// Run the one-time four-region to thirteen-piece palette migration before Clay
// generates its page, so the new controls start with the user's existing colours.
var sharedSettingsAvailable = storageHasSettings(SETTINGS_STORAGE_KEY);
var storedSettings = readStoredSettings(SETTINGS_STORAGE_KEY);
writeStoredSettings(storedSettings);
var options = Codec.weatherOptions(storedSettings);
var clay = new Clay(clayConfig, clayCustom, { autoHandleEvents: false });
var activeProfileKey = null;
var configurationProfileKey = null;
var configurationSettings = null;

function safePebbleValue(method, fallback) {
  try {
    return typeof Pebble[method] === 'function' ? Pebble[method]() : fallback;
  } catch (error) {
    console.warn('Unable to read Pebble ' + method + ': ' + error.message);
    return fallback;
  }
}

function readWatchContext() {
  var watchInfo = safePebbleValue('getActiveWatchInfo', null);
  var watchToken = safePebbleValue('getWatchToken', '');
  var accountToken = safePebbleValue('getAccountToken', '');
  var metadataAvailable = Codec.hasSupportedWatchMetadata(watchInfo);
  var identity;

  identity = watchToken || ((accountToken || 'anonymous-account') + ':' +
    (metadataAvailable ?
      watchInfo.platform + ':' + (watchInfo.model || 'unknown-model') :
      'unknown-watch'));
  return {
    watchInfo: watchInfo,
    watchToken: watchToken,
    accountToken: accountToken,
    metadataAvailable: metadataAvailable,
    profileKey: PROFILE_STORAGE_PREFIX + encodeURIComponent(identity)
  };
}

function activateWatchProfile(context) {
  context = context || readWatchContext();
  var serialized = null;
  var migrationVersion = null;

  // Clay's capability checks require a valid watch object, so its internal
  // value uses the codec's least-capable fallback. metadataAvailable remains
  // false so the custom page flags the unknown watch instead of claiming that
  // it is really an Aplite.
  clay.meta = {
    activeWatchInfo: Codec.watchMetadataForClay(context.watchInfo),
    accountToken: context.accountToken || '',
    watchToken: context.watchToken || '',
    userData: { metadataAvailable: context.metadataAvailable }
  };

  activeProfileKey = context.profileKey;
  try {
    serialized = localStorage.getItem(activeProfileKey);
    migrationVersion = localStorage.getItem(PROFILE_MIGRATION_KEY);
  } catch (error) {
    console.warn('Unable to select the watch settings profile: ' + error.message);
  }

  if (typeof serialized === 'string' && serialized) {
    storedSettings = Codec.mergeSettings(Codec.defaultSettings(),
      Codec.safeParseStoredSettings(serialized));
  } else if (migrationVersion === '1') {
    // A new watch gets clean, capability-appropriate defaults. This prevents a
    // B/W picker from rounding and overwriting a color watch's saved palette.
    storedSettings = Codec.defaultSettings();
  } else {
    // First upgrade only: claim the old shared Clay settings for the currently
    // connected watch so existing users keep their choices.
    storedSettings = sharedSettingsAvailable ?
      Codec.mergeSettings(Codec.defaultSettings(), storedSettings) :
      Codec.defaultSettings();
    try {
      localStorage.setItem(PROFILE_MIGRATION_KEY, '1');
    } catch (error) {
      console.warn('Unable to mark settings profile migration: ' + error.message);
    }
  }

  writeStoredSettings(storedSettings, activeProfileKey);
  writeStoredSettings(storedSettings, SETTINGS_STORAGE_KEY);
  options = Codec.weatherOptions(storedSettings);
  return context;
}

var outboundQueue = createMessageQueue(function(dictionary, acknowledge, reject) {
  Pebble.sendAppMessage(dictionary, acknowledge, reject);
}, {
  maxRetries: 3,
  baseDelay: 500,
  maxDelay: 2000,
  attemptTimeout: 10000,
  onFailure: function(event, state) {
    var description = event && event.error && event.error.message ?
      event.error.message : (event && event.message ? event.message : 'unknown error');
    console.warn('AppMessage failed on attempt ' + state.attempt + ': ' + description +
      (state.willRetry ? '; retrying' : '; giving up'));
  }
});

function queueAppMessage(dictionary, delivery) {
  if (!dictionary || Object.keys(dictionary).length === 0) {
    return false;
  }
  return outboundQueue.enqueue(dictionary, delivery);
}

function wmoToIcon(code, isDay) {
  code = Codec.parseInteger(code);
  if (code === null || code < 0 || code > 99) {
    return NA;
  }
  if (code === 0 || code === 1) {
    return isDay ? CLEAR_DAY : CLEAR_NIGHT;
  }
  if (code === 2) {
    return isDay ? PARTLY_CLOUDY_DAY : PARTLY_CLOUDY_NIGHT;
  }
  if (code === 3) {
    return CLOUDY;
  }
  if (code === 45 || code === 48) {
    return FOG;
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return RAIN;
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return SNOW;
  }
  if (code === 96 || code === 99) {
    return HAIL;
  }
  if (code === 95) {
    return STORM;
  }
  return NA;
}

var activeRequest = null;
var weatherGeneration = 0;
var weatherTimer = null;
var weatherRetryTimer = null;
var weatherRetryAttempt = 0;

function clearWeatherRetry(resetAttempts) {
  if (weatherRetryTimer !== null) {
    clearTimeout(weatherRetryTimer);
    weatherRetryTimer = null;
  }
  if (resetAttempts) {
    weatherRetryAttempt = 0;
  }
}

function weatherFailed(generation, reason, retryable) {
  var delay;
  if (generation !== weatherGeneration) {
    return;
  }
  console.warn('Weather update failed: ' + reason);
  if (!retryable || options.hideweather || !options.configured ||
      weatherRetryTimer !== null) {
    return;
  }
  delay = Codec.weatherRetryDelay(weatherRetryAttempt);
  if (delay === null) {
    return;
  }
  weatherRetryAttempt++;
  weatherRetryTimer = setTimeout(function() {
    weatherRetryTimer = null;
    if (generation === weatherGeneration && !options.hideweather &&
        options.configured) {
      updateWeather(true);
    }
  }, delay);
}

function cancelActiveRequest() {
  var request = activeRequest;
  activeRequest = null;
  if (request) {
    try {
      request.abort();
    } catch (error) {
      console.warn('Unable to cancel stale weather request: ' + error.message);
    }
  }
}

function requestJson(url, generation, onSuccess) {
  var request;
  var finished = false;

  if (generation !== weatherGeneration) {
    return;
  }
  cancelActiveRequest();
  try {
    request = new XMLHttpRequest();
  } catch (error) {
    weatherFailed(generation, 'unable to create network request', true);
    return;
  }
  activeRequest = request;

  function finishWithError(reason, retryable) {
    if (finished) {
      return;
    }
    finished = true;
    if (activeRequest === request) {
      activeRequest = null;
    }
    if (generation === weatherGeneration) {
      weatherFailed(generation, reason, retryable);
    }
  }

  try {
    request.open('GET', url, true);
  } catch (error) {
    finishWithError('request setup failed', true);
    return;
  }
  request.timeout = REQUEST_TIMEOUT;
  request.onload = function() {
    var response;
    if (finished || generation !== weatherGeneration || activeRequest !== request) {
      return;
    }
    if (request.status !== 200) {
      finishWithError('HTTP ' + request.status,
        request.status === 0 || request.status === 408 || request.status === 429 ||
        request.status >= 500);
      return;
    }
    try {
      response = JSON.parse(request.responseText);
    } catch (error) {
      finishWithError('invalid JSON', true);
      return;
    }
    finished = true;
    activeRequest = null;
    onSuccess(response);
  };
  request.onerror = function() {
    finishWithError('network error', true);
  };
  request.ontimeout = function() {
    finishWithError('timeout', true);
  };
  request.onabort = function() {
    finished = true;
  };
  try {
    request.send(null);
  } catch (error) {
    finishWithError('request could not be sent', true);
  }
}

function validCoordinate(value, minimum, maximum) {
  return typeof value === 'number' && isFinite(value) &&
    value >= minimum && value <= maximum;
}

function sendWeather(current, generation) {
  var temperature;
  var code;
  var isDay;
  var dictionary = {};

  if (generation !== weatherGeneration || !current || typeof current !== 'object') {
    if (generation === weatherGeneration) {
      weatherFailed(generation, 'weather service omitted current conditions', true);
    }
    return false;
  }
  temperature = current.temperature_2m;
  code = Codec.parseInteger(current.weather_code);
  isDay = current.is_day === 1 || current.is_day === true;
  if (typeof temperature !== 'number' || !isFinite(temperature) ||
      temperature < -150 || temperature > 150 || code === null ||
      (current.is_day !== 0 && current.is_day !== 1 &&
       current.is_day !== false && current.is_day !== true)) {
    weatherFailed(generation,
      'weather service returned an incomplete current observation', true);
    return false;
  }
  if (typeof messageKeys.icon === 'undefined' ||
      typeof messageKeys.temperature === 'undefined') {
    console.warn('Weather message keys are unavailable');
    return false;
  }
  dictionary[messageKeys.icon] = wmoToIcon(code, isDay);
  dictionary[messageKeys.temperature] = Math.round(temperature) + '\u00b0';
  if (!queueAppMessage(dictionary, {
    key: 'weather',
    priority: 0
  })) {
    weatherFailed(generation, 'weather message queue was full', true);
    return false;
  }
  clearWeatherRetry(true);
  return true;
}

function getWeatherFromLatLong(latitude, longitude, generation) {
  var url;
  if (!validCoordinate(latitude, -90, 90) ||
      !validCoordinate(longitude, -180, 180) || generation !== weatherGeneration) {
    if (generation === weatherGeneration) {
      weatherFailed(generation, 'weather location contained invalid coordinates', true);
    }
    return;
  }
  url = 'https://api.open-meteo.com/v1/forecast?latitude=' +
    encodeURIComponent(latitude) + '&longitude=' + encodeURIComponent(longitude) +
    '&current=temperature_2m,weather_code,is_day&temperature_unit=' +
    (options.units === 'celsius' ? 'celsius' : 'fahrenheit');
  requestJson(url, generation, function(response) {
    sendWeather(response && response.current, generation);
  });
}

function getWeatherFromLocation(location, generation) {
  var name = typeof location === 'string' ?
    Codec.truncateText(location.replace(/^\s+|\s+$/g, ''), 100) : '';
  var url;
  if (!name || generation !== weatherGeneration) {
    console.warn('A location is required when GPS is disabled');
    return;
  }
  try {
    url = 'https://geocoding-api.open-meteo.com/v1/search?name=' +
      encodeURIComponent(name) + '&count=1&format=json';
  } catch (error) {
    weatherFailed(generation, 'location contains invalid text', false);
    return;
  }
  requestJson(url, generation, function(response) {
    var result = response && response.results && response.results[0];
    if (!result || !validCoordinate(result.latitude, -90, 90) ||
        !validCoordinate(result.longitude, -180, 180)) {
      weatherFailed(generation,
        'no valid coordinates were found for the configured location', false);
      return;
    }
    getWeatherFromLatLong(result.latitude, result.longitude, generation);
  });
}

function updateWeather(isRetry) {
  var generation = ++weatherGeneration;
  if (!isRetry) {
    clearWeatherRetry(true);
  }
  cancelActiveRequest();

  if (options.hideweather || !options.configured) {
    outboundQueue.discard('weather');
    return;
  }
  if (options.use_gps) {
    if (typeof navigator === 'undefined' || !navigator.geolocation ||
        typeof navigator.geolocation.getCurrentPosition !== 'function') {
      weatherFailed(generation, 'phone geolocation is unavailable', false);
      return;
    }
    try {
      navigator.geolocation.getCurrentPosition(function(position) {
        if (generation !== weatherGeneration || !position || !position.coords) {
          return;
        }
        getWeatherFromLatLong(position.coords.latitude, position.coords.longitude,
          generation);
      }, function(error) {
        if (generation === weatherGeneration) {
          weatherFailed(generation, 'location failed: ' +
            (error && error.message ? error.message : 'unknown error'),
            !(error && error.code === 1));
        }
      }, { timeout: 15000, maximumAge: 60000 });
    } catch (error) {
      weatherFailed(generation, 'location request could not be started', true);
    }
  } else {
    getWeatherFromLocation(options.location, generation);
  }
}

function scheduleWeather() {
  if (weatherTimer !== null) {
    clearTimeout(weatherTimer);
    weatherTimer = null;
  }
  if (options.hideweather || !options.configured) {
    return;
  }
  weatherTimer = setTimeout(function() {
    weatherTimer = null;
    updateWeather();
    scheduleWeather();
  }, options.refresh_interval);
}

function activateAndReconcileWatch(context) {
  var dictionary;
  activateWatchProfile(context);
  dictionary = Codec.buildWatchDictionary(storedSettings, messageKeys);
  queueAppMessage(dictionary, {
    key: 'configuration',
    durable: true,
    priority: 100
  });
  updateWeather();
  scheduleWeather();
}

Pebble.addEventListener('showConfiguration', function() {
  activateWatchProfile();
  // The active watch can change while Clay's webview remains open. Keep both
  // the destination key and its starting values so the response can never be
  // merged into a different watch's capability-specific profile.
  configurationProfileKey = activeProfileKey;
  configurationSettings = Codec.mergeSettings(Codec.defaultSettings(), storedSettings);
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function(event) {
  var responseSettings;
  var dictionary;
  var originProfileKey = configurationProfileKey || activeProfileKey;
  var originSettings = configurationSettings || storedSettings;
  var currentContext = readWatchContext();
  var watchChanged = originProfileKey && currentContext.profileKey !== originProfileKey;

  configurationProfileKey = null;
  configurationSettings = null;

  if (!event || !event.response) {
    console.log('Settings page closed without saving');
    if (watchChanged) {
      activateAndReconcileWatch(currentContext);
    }
    return;
  }
  try {
    // Parse independently of Clay so a localStorage privacy/quota exception in
    // Clay.getSettings() cannot prevent a valid Save from reaching the watch.
    // Typed wrappers remain intact until the codec validates and unwraps them.
    responseSettings = Codec.parseWebviewResponse(event.response);
  } catch (error) {
    console.warn('Ignoring invalid settings response: ' + error.message);
    if (watchChanged) {
      activateAndReconcileWatch(currentContext);
    }
    return;
  }

  originSettings = Codec.mergeSettings(originSettings, responseSettings);
  if (originProfileKey) {
    writeStoredSettings(originSettings, originProfileKey);
  }

  if (watchChanged) {
    // Preserve the page's valid response for the watch that opened it, but load
    // and resend the newly connected watch's own profile. In particular, never
    // send color-watch values from an old page to a newly connected B/W watch.
    activateAndReconcileWatch(currentContext);
    return;
  } else {
    storedSettings = originSettings;
    activeProfileKey = originProfileKey || currentContext.profileKey;
    writeStoredSettings(storedSettings, activeProfileKey);
    writeStoredSettings(storedSettings, SETTINGS_STORAGE_KEY);
    options = Codec.weatherOptions(storedSettings);
  }

  dictionary = Codec.buildWatchDictionary(storedSettings, messageKeys);
  queueAppMessage(dictionary, {
    key: 'configuration',
    durable: true,
    priority: 100
  });
  updateWeather();
  scheduleWeather();
});

Pebble.addEventListener('ready', function() {
  var dictionary;
  activateWatchProfile();
  // Reconcile the complete latest profile whenever PebbleKit JS starts (which
  // also covers a phone/watch reconnection after transport state was lost).
  dictionary = Codec.buildWatchDictionary(storedSettings, messageKeys);
  queueAppMessage(dictionary, {
    key: 'configuration',
    durable: true,
    priority: 100
  });
  outboundQueue.resume();
  updateWeather();
  scheduleWeather();
  console.log('TrekV4 PebbleKit JS ready');
});
