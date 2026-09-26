// Declarative Settings schema for @rebble/clay.
//
// The watch-only payload is assembled explicitly in app.js. Some color items below
// intentionally use local Clay message keys: they are persisted by Clay, then packed
// into one compact ARGB8 palette before being sent to the watch.

// The frame is themed as three regions. Every segment in a region shares one colour,
// so only the three region leaders (0, 4, 8) are shown as controls; the rest are
// hidden by clay-custom.js and mirrored from their leader, which keeps the packed
// 13-colour watch payload and its migrations unchanged.
var FRAME_DEFAULTS = [
  "#AAAAFF", "#AAAAFF", "#AAAAFF", "#AAAAFF",
  "#AA55FF", "#AA55FF", "#AA55FF", "#AA55FF",
  "#FF5555", "#FF5555", "#FF5555",
  "#FF5555", "#FF5555"
];

var FRAME_LABELS = [
  "LCARS top bar and left rail",
  "· top bar (follows the top region)",
  "· top bar right (follows the top region)",
  "· left rail (follows the top region)",
  "LCARS middle section",
  "· middle bar (follows the middle region)",
  "· middle bar centre (follows the middle region)",
  "· middle bar right (follows the middle region)",
  "LCARS bottom bar",
  "· bottom bar (follows the bottom region)",
  "· bottom bar right (follows the bottom region)",
  "· bottom stem (follows the bottom region)",
  "· bottom tip (follows the bottom region)"
];

var frameColorItems = FRAME_DEFAULTS.map(function(defaultValue, index) {
  return {
    "type": "color",
    "messageKey": "customcol" + index,
    "group": "frame_palette",
    "label": FRAME_LABELS[index],
    "defaultValue": defaultValue,
    "sunlight": true,
    "capabilities": ["NOT_PLATFORM_CHALK"]
  };
});

var rectangularThemes = [
  { "label": "Classic blue", "value": "0" },
  { "label": "Light blues", "value": "1" },
  { "label": "Purples", "value": "2" },
  { "label": "Yellows", "value": "3" },
  { "label": "White", "value": "4" },
  { "label": "Greys", "value": "5" },
  { "label": "Reds", "value": "6" },
  { "label": "Yellow and blue", "value": "7" },
  { "label": "Blue, purple, red and orange", "value": "8" },
  { "label": "Greens", "value": "9" },
  { "label": "Dark blues", "value": "10" },
  { "label": "Borg", "value": "11" },
  { "label": "Custom — tap the preview", "value": "12" }
];

var roundThemes = rectangularThemes.slice(0, 12);

var monochromeThemes = [
  { "label": "Classic monochrome", "value": "0" },
  { "label": "Custom black and white — tap the preview", "value": "12" }
];

var config = [
  {
    "type": "heading",
    "defaultValue": "TrekV4 Settings",
    "size": 2
  },
  {
    "type": "text",
    "id": "device_summary",
    "defaultValue": "Settings are tailored to the connected watch."
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Appearance",
        "size": 3
      },
      {
        "type": "select",
        "messageKey": "background",
        "label": "LCARS theme",
        "description": "Choose a preset, or select Custom and tap individual frame pieces in the preview.",
        "defaultValue": "0",
        "options": rectangularThemes,
        "capabilities": ["COLOR", "RECT"]
      },
      {
        "type": "select",
        "messageKey": "background",
        "label": "LCARS theme",
        "description": "Round watches use the original raster artwork, so per-piece recoloring is unavailable.",
        "defaultValue": "0",
        "options": roundThemes,
        "capabilities": ["PLATFORM_CHALK"]
      },
      {
        "type": "select",
        "messageKey": "background",
        "label": "LCARS theme",
        "description": "Choose a preset, or select Custom and tap individual drawn frame pieces in the preview.",
        "defaultValue": "0",
        "options": rectangularThemes,
        "capabilities": ["PLATFORM_GABBRO"]
      },
      {
        "type": "select",
        "messageKey": "background",
        "label": "LCARS theme",
        "description": "Choose Classic, or select Custom and tap individual frame pieces in the preview.",
        "defaultValue": "0",
        "options": monochromeThemes,
        "capabilities": ["BW", "RECT"]
      },
      {
        "type": "color",
        "messageKey": "textcol",
        "label": "Primary text",
        "defaultValue": "#FFFFFF",
        "sunlight": true
      },
      {
        "type": "color",
        "messageKey": "othertextcol",
        "label": "Secondary text",
        "defaultValue": "#FFFFFF",
        "sunlight": true
      },
      {
        "type": "color",
        "messageKey": "backgroundcol",
        "label": "Screen background",
        "defaultValue": "#000000",
        "sunlight": true
      },
      {
        "type": "color",
        "messageKey": "bluetooth_color",
        "label": "Bluetooth symbol",
        "defaultValue": "#FFFFFF",
        "sunlight": true,
        "capabilities": ["NOT_PLATFORM_CHALK"]
      },
      {
        "type": "toggle",
        "messageKey": "invert",
        "label": "Invert the watchface",
        "description": "Available on every supported watch.",
        "defaultValue": false
      }
    ]
  },
  {
    "type": "section",
    "capabilities": ["NOT_PLATFORM_CHALK"],
    "items": [{
      "type": "heading",
      "defaultValue": "Custom frame pieces",
      "size": 3
    }, {
      "type": "text",
      "defaultValue": "Tap a frame piece in the always-visible preview to open its Pebble palette, or choose it below. Changing a piece automatically selects the Custom theme."
    }].concat(frameColorItems)
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Battery",
        "size": 3
      },
      {
        "type": "select",
        "messageKey": "battery_background",
        "label": "Background behind the bars",
        "defaultValue": "0",
        "options": [
          { "label": "Black", "value": "0" },
          { "label": "Let the LCARS theme show through", "value": "1" },
          { "label": "Match the screen background", "value": "2" }
        ]
      },
      {
        "type": "toggle",
        "messageKey": "battery_colorized",
        "label": "Use custom bar colors",
        "description": "Off keeps the classic white and shaded-white bars.",
        "defaultValue": false
      },
      {
        "type": "color",
        "messageKey": "battery_full_color",
        "label": "Filled battery bars",
        "description": "Used only when custom bar colors are enabled.",
        "defaultValue": "#FFAA00",
        "sunlight": true
      },
      {
        "type": "color",
        "messageKey": "battery_empty_color",
        "label": "Empty battery bars",
        "description": "Used only when custom bar colors are enabled.",
        "defaultValue": "#550000",
        "sunlight": true
      }
    ]
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Information and layout",
        "size": 3
      },
      {
        "type": "radiogroup",
        "messageKey": "secs_ampm",
        "label": "Upper-right information",
        "description": "AM/PM is hidden automatically when the watch uses 24-hour time.",
        "defaultValue": "1",
        "options": [
          { "label": "Seconds", "value": "1" },
          { "label": "AM/PM", "value": "0" }
        ]
      },
      {
        "type": "toggle",
        "messageKey": "preview_24h",
        "label": "Preview 24-hour clock",
        "description": "Phone preview only. The watchface itself follows the watch’s system clock setting.",
        "defaultValue": false
      },
      {
        "type": "select",
        "messageKey": "bottom_left",
        "label": "Bottom-left information",
        "defaultValue": "1",
        "options": [
          { "label": "Heart rate", "value": "0" },
          { "label": "Abbreviated date", "value": "1" }
        ],
        "capabilities": ["PLATFORM_DIORITE"]
      },
      {
        "type": "select",
        "messageKey": "bottom_left",
        "label": "Bottom-left information",
        "defaultValue": "1",
        "options": [
          { "label": "Heart rate", "value": "0" },
          { "label": "Abbreviated date", "value": "1" }
        ],
        "capabilities": ["PLATFORM_EMERY"]
      },
      {
        "type": "toggle",
        "messageKey": "date_bracket",
        "label": "Date in the LCARS bracket",
        "description": "Available when Heart rate is selected for the bottom-left area.",
        "defaultValue": false,
        "capabilities": ["PLATFORM_DIORITE"]
      },
      {
        "type": "toggle",
        "messageKey": "date_bracket",
        "label": "Date in the LCARS bracket",
        "description": "Available when Heart rate is selected for the bottom-left area.",
        "defaultValue": false,
        "capabilities": ["PLATFORM_EMERY"]
      },
      {
        "type": "select",
        "messageKey": "bottom_right",
        "label": "Bottom-right information",
        "defaultValue": "1",
        "options": [
          { "label": "Step count", "value": "0" },
          { "label": "Extra date", "value": "1" }
        ],
        "capabilities": ["HEALTH"]
      },
      {
        "type": "select",
        "messageKey": "format",
        "label": "Extra-date format",
        "defaultValue": "0",
        "options": [
          { "label": "Week", "value": "0" },
          { "label": "Day of year (stardate)", "value": "1" },
          { "label": "DD/MM/YY", "value": "2" },
          { "label": "MM/DD/YY", "value": "3" },
          { "label": "Wxxx Dxxx", "value": "4" },
          { "label": "YYYY MM DD", "value": "5" },
          { "label": "DD.MM.YYYY", "value": "6" },
          { "label": "YY.WW.DD", "value": "7" }
        ]
      },
      {
        "type": "radiogroup",
        "messageKey": "startday_status",
        "label": "Week starts on",
        "defaultValue": "1",
        "options": [
          { "label": "Monday", "value": "0" },
          { "label": "Sunday", "value": "1" }
        ]
      }
    ]
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Weather",
        "size": 3
      },
      {
        "type": "toggle",
        "messageKey": "hideweather",
        "label": "Hide and disable weather",
        "defaultValue": false
      },
      {
        "type": "toggle",
        "messageKey": "use_gps",
        "label": "Use phone GPS",
        "description": "Off by default. Enable to grant location access; the phone sends coordinates to Open-Meteo for the current forecast and TrekV4 does not retain them.",
        "defaultValue": false
      },
      {
        "type": "input",
        "messageKey": "location",
        "label": "Location",
        "description": "Used only when phone GPS is off. Enter a city or postal code to enable weather without sharing GPS coordinates.",
        "defaultValue": "",
        "attributes": {
          "placeholder": "City or postal code",
          "type": "text",
          "maxlength": 100
        }
      },
      {
        "type": "radiogroup",
        "messageKey": "units",
        "label": "Temperature units",
        "defaultValue": "fahrenheit",
        "options": [
          { "label": "Celsius", "value": "celsius" },
          { "label": "Fahrenheit", "value": "fahrenheit" }
        ]
      },
      {
        "type": "select",
        "messageKey": "refresh_interval",
        "label": "Refresh interval",
        "description": "More frequent updates use more watch and phone battery.",
        "defaultValue": "1800000",
        "options": [
          { "label": "5 minutes", "value": "300000" },
          { "label": "10 minutes", "value": "600000" },
          { "label": "20 minutes", "value": "1200000" },
          { "label": "30 minutes", "value": "1800000" },
          { "label": "60 minutes", "value": "3600000" }
        ]
      }
    ]
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Alerts",
        "size": 3
      },
      {
        "type": "toggle",
        "messageKey": "bluetoothvibe_status",
        "label": "Vibrate on Bluetooth disconnect",
        "defaultValue": true
      },
      {
        "type": "select",
        "messageKey": "bt_vibe_pattern",
        "label": "Disconnect pattern",
        "defaultValue": "1",
        "options": [
          { "label": "Standard", "value": "0" },
          { "label": "Red Alert", "value": "1" },
          { "label": "Comm Chirp", "value": "2" },
          { "label": "Transporter", "value": "3" },
          { "label": "Phaser", "value": "4" },
          { "label": "Photon Torpedo", "value": "5" },
          { "label": "Warp Core Breach", "value": "6" },
          { "label": "Klingon Disruptor", "value": "7" },
          { "label": "Computer Acknowledge", "value": "8" }
        ]
      },
      {
        "type": "select",
        "messageKey": "bt_vibe_repeat",
        "label": "Repeat disconnect vibration",
        "description": "Repeats until reconnection or a hard shake dismisses the alert.",
        "defaultValue": "0",
        "options": [
          { "label": "Off — vibrate once", "value": "0" },
          { "label": "Every 10 seconds", "value": "10000" },
          { "label": "Every 30 seconds", "value": "30000" },
          { "label": "Every minute", "value": "60000" },
          { "label": "Every 2 minutes", "value": "120000" },
          { "label": "Every 5 minutes", "value": "300000" }
        ]
      },
      {
        "type": "toggle",
        "messageKey": "bt_popup",
        "label": "Show disconnect popup",
        "description": "The repeat vibration can remain active even when this visual popup is off.",
        "defaultValue": true
      },
      {
        "type": "toggle",
        "messageKey": "preview_disconnected",
        "label": "Preview the disconnected state",
        "description": "Phone preview only; this does not change the watch’s connection.",
        "defaultValue": false
      },
      {
        "type": "color",
        "messageKey": "popup_color",
        "label": "Disconnect alert accent",
        "description": "Changes the drawn alert text on every watch and the vector popup rails. Pebble Time Round rails remain raster artwork.",
        "defaultValue": "#FF0000",
        "sunlight": true
      },
      {
        "type": "color",
        "messageKey": "popup_time_color",
        "label": "Disconnect alert clock",
        "description": "Changes the live clock drawn inside the disconnect popup.",
        "defaultValue": "#FFAA00",
        "sunlight": true
      },
      {
        "type": "color",
        "messageKey": "popup_hint_color",
        "label": "Disconnect alert hint",
        "description": "Changes the SHAKE TO DISMISS hint drawn inside the disconnect popup.",
        "defaultValue": "#FFFFFF",
        "sunlight": true
      },
      {
        "type": "toggle",
        "messageKey": "hourlyvibe",
        "label": "Vibrate on the hour",
        "defaultValue": false
      }
    ]
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Language",
        "size": 3
      },
      {
        "type": "select",
        "messageKey": "language",
        "label": "Watchface language",
        "defaultValue": "0",
        "options": [
          { "label": "Catalan", "value": "12" },
          { "label": "Croatian", "value": "4" },
          { "label": "Czech", "value": "16" },
          { "label": "Danish", "value": "10" },
          { "label": "Dutch", "value": "1" },
          { "label": "English", "value": "0" },
          { "label": "Finnish", "value": "9" },
          { "label": "French", "value": "3" },
          { "label": "German", "value": "2" },
          { "label": "Hungarian", "value": "15" },
          { "label": "Italian", "value": "6" },
          { "label": "Norwegian", "value": "7" },
          { "label": "Portuguese", "value": "14" },
          { "label": "Slovak", "value": "13" },
          { "label": "Spanish", "value": "5" },
          { "label": "Swedish", "value": "8" },
          { "label": "Turkish", "value": "11" }
        ]
      }
    ]
  },
  {
    "type": "submit",
    "defaultValue": "Save Settings"
  },
  {
    "type": "text",
    "defaultValue": "<small>Changes are previewed immediately. They are sent to the watch only after you tap Save Settings.</small>"
  },
  {
    "type": "text",
    "defaultValue": "<small>If TrekV4 is useful to you, you can <a href='https://www.paypal.me/markchopsreed'>support its original author</a>.</small>"
  },
  {
    "type": "text",
    "defaultValue": "<small>Weather data: <a href='https://open-meteo.com/'>Open-Meteo</a>, licensed under <a href='https://creativecommons.org/licenses/by/4.0/'>CC BY 4.0</a>.</small>"
  }
];

module.exports = config;
