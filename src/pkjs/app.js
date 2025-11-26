// config page

var Clay = require('pebble-clay');
var clayConfig = require('./config.js');
var clay = new Clay(clayConfig, null, { autoHandleEvents: false });

// constants

var messageKeys = require('message_keys');

var CLEAR_DAY = 0;
var CLEAR_NIGHT = 1;
var WINDY = 2;
var COLD = 3;
var PARTLY_CLOUDY_DAY = 4;
var PARTLY_CLOUDY_NIGHT = 5;
var HAZE = 6;
var CLOUD = 7;
var RAIN = 8;
var SNOW = 9;
var HAIL = 10;
var CLOUDY = 11;
var STORM = 12;
var FOG = 13;
var NA = 14;

var imageId = {
  0: STORM, //tornado
  1: STORM, //tropical storm
  2: STORM, //hurricane
  3: STORM, //severe thunderstorms
  4: STORM, //thunderstorms
  5: HAIL, //mixed rain and snow
  6: HAIL, //mixed rain and sleet
  7: HAIL, //mixed snow and sleet
  8: HAIL, //freezing drizzle
  9: RAIN, //drizzle
  10: HAIL, //freezing rain
  11: RAIN, //showers
  12: RAIN, //showers
  13: SNOW, //snow flurries
  14: SNOW, //light snow showers
  15: SNOW, //blowing snow
  16: SNOW, //snow
  17: HAIL, //hail
  18: HAIL, //sleet
  19: HAZE, //dust
  20: FOG, //foggy
  21: HAZE, //haze
  22: HAZE, //smoky
  23: WINDY, //blustery
  24: WINDY, //windy
  25: COLD, //cold
  26: CLOUDY, //cloudy
  27: CLOUDY, //mostly cloudy (night)
  28: CLOUDY, //mostly cloudy (day)
  29: PARTLY_CLOUDY_NIGHT, //partly cloudy (night)
  30: PARTLY_CLOUDY_DAY, //partly cloudy (day)
  31: CLEAR_NIGHT, //clear (night)
  32: CLEAR_DAY, //sunny
  33: CLEAR_NIGHT, //fair (night)
  34: CLEAR_DAY, //fair (day)
  35: HAIL, //mixed rain and hail
  36: CLEAR_DAY, //hot
  37: STORM, //isolated thunderstorms
  38: STORM, //scattered thunderstorms
  39: STORM, //scattered thunderstorms
  40: STORM, //scattered showers
  41: SNOW, //heavy snow
  42: SNOW, //scattered snow showers
  43: SNOW, //heavy snow
  44: CLOUD, //partly cloudy
  45: STORM, //thundershowers
  46: SNOW, //snow showers
  47: STORM, //isolated thundershowers
  3200: NA, //not available
};

var options = localStorage.getItem('clay-settings');
var options = JSON.parse(options);

// if no options are available, then the JS needs this minimal config to work
// the watch will have it's defaults set in the C code
if (options === null)
  options = {
    "use_gps": true,
    "units": "fahrenheit",
    "hideweather": false,
    "apiKey": "",
    "location": "London",
    "refresh_interval": "30000"
  };

function getWeatherFromLatLong(latitude, longitude) {
  console.log(latitude, longitude);
  getWeatherFromLocation(`lat=${latitude}&lon=${longitude}`);
}
function parse_weather_code(code) {
  if (code >= 200 && code <= 232) return 0;
  if (code >= 300 && code <= 531) return 11;
  if (code >= 600 && code <= 622) return 13;
  if (code >= 700 && code <= 781) return 20;
  if (code >= 801 && code <= 804) return 26;
  if (code == 800) return 36;

}
//location string can be a city name, lat/long string, or zipcode
function getWeatherFromLocation(location_string) {
  var celsius = (options.units == 'celsius');
  var query = `${location_string}&APPID=${options.apiKey}&units=${celsius ? 'metric' : 'imperial'}`;
  var url = "https://api.openweathermap.org/data/2.5/weather?" + query;
  var req = new XMLHttpRequest();
  req.open('GET', url, true);
  req.timeout = 20000;
  req.onload = function (e) {
    if (req.status != 200) {
      return
    }
    var response;
    try {
      response = JSON.parse(req.responseText);
    }
    catch (error) {
      console.log(error);
      return;
    }
    console.log(response.weather[0].id);
    var temperature = parseInt(response.main.temp) + '\u00B0';
    var icon = imageId[parse_weather_code(parseInt(response.weather[0].id))];
    console.log(parse_weather_code(parseInt(response.weather[0].id)));

    Pebble.sendAppMessage({
      "icon": icon,
      "temperature": temperature
    });
  }
  req.send(null);

}

var locationOptions = { "timeout": 15000, "maximumAge": 60000 };

function updateWeather() {
  if (options.hideweather === true) return;

  if (options.use_gps === true) {
    navigator.geolocation.getCurrentPosition(locationSuccess,
      locationError,
      locationOptions);
  } else {
    getWeatherFromLocation(`q=${options.location}`);
  }
}

function locationSuccess(pos) {
  getWeatherFromLatLong(pos.coords.latitude, pos.coords.longitude);
}

function locationError(err) {
  console.warn('location error (' + err.code + '): ' + err.message);

  Pebble.sendAppMessage({
    "icon": 14,
    "temperature": "00"
  });
}

Pebble.addEventListener('showConfiguration', function (e) {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function (e) {
  if (e && !e.response) {
    console.log('no options received');
    return;
  }

  var dict = clay.getSettings(e.response);

  console.log("new options dump: " + JSON.stringify(dict));

  // transform values to be backward compatible
  for (var key in dict) {
    if (dict.hasOwnProperty(key)) {
      // if the value is a string, simply parse it to int
      if (typeof dict[key] == "string") {
        dict[key] = parseInt(dict[key]);
      }
    }
  }
  console.log("transformed options dump: " + JSON.stringify(dict));

  // we have to delete NaN key, because some options do not have messageKey
  // those options are used only in this JS!
  delete dict.NaN;

  // send new values to pebble
  Pebble.sendAppMessage(dict);

  // load the flattened edition of settings
  options = JSON.parse(localStorage.getItem('clay-settings'));
  console.log(parseInt(options.refresh_interval));

  updateWeather();
});

Pebble.addEventListener("ready", function (e) {

  updateWeather();
  setInterval(function () {
    updateWeather();
  }, parseInt(options.refresh_interval) || 1800000);

  console.log(e.type);
});
