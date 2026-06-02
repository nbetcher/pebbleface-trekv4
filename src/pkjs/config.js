// based on: http://www.themapman.com/pebblewatch/trekv6.html

module.exports = [
    {
        "type": "heading",
        "defaultValue": "TrekV4-V2 Config"
    },
    {
        "type": "text",
        "defaultValue": "<h6>A white button = OFF <br> An orange button = ON</h6>",
    },
    {
        "type": "section",
        "items": [
            {
                "type": "heading",
                "defaultValue": "<h5>Weather</h5>"
            },
            {
                "type": "input",
                "messageKey": "location",
                "label": "Location",
                "description": "If you aren't using GPS, <strong>You must</strong> enter a city name. zipcode doesn't appear to work.",
                "defaultValue": ""
            },
            {
                "type": "input",
                "messageKey": "apiKey",
                "label": "API Key",
                "description": "<strong>You must</strong> enter an OpenWeather API key",
                "defaultValue": ""
            },
            {
                "type": "toggle",
                "messageKey": "use_gps",
                "label": "Use GPS",
                "description": "If you want to conserve battery, disable using GPS AND enter your location eg. London.",
                "defaultValue": true
            },
            {
                "type": "radiogroup",
                "messageKey": "units",
                "label": "Temp. Units",
                "defaultValue": "fahrenheit",
                "options": [
                    {
                        "label": "Celsius",
                        "value": "celsius"
                    },
                    {
                        "label": "Fahrenheit",
                        "value": "fahrenheit"
                    }
                ]
            },
            {
                "type": "radiogroup",
                "messageKey": "refresh_interval",
                "label": "Refresh Interval",
                "defaultValue": "1800000",
                "options": [
                    {
                        "label": "1 minute",
                        "value": "60000"
                    },
                    {
                        "label": "5 minutes",
                        "value": "300000"
                    }
                    ,
                    {
                        "label": "10 minutes",
                        "value": "600000"
                    }
                    ,
                    {
                        "label": "20 minutes",
                        "value": "1200000"
                    }
                    ,
                    {
                        "label": "30 minutes",
                        "value": "1800000"
                    }
                ]
            },
            {
                "type": "toggle",
                "messageKey": "hideweather",
                "label": "Hide (and disable) weather",
                "defaultValue": false
            }
        ]
    },
    {
        "type": "section",
        "items": [
            {
                "type": "heading",
                "defaultValue": "<h5>Display</h5>"
            },
            {
                "type": "radiogroup",
                "messageKey": "startday_status",
                "label": "Week start day",
                "defaultValue": "1.",
                "options": [
                    {
                        "label": "Monday",
                        "value": "0."
                    },
                    {
                        "label": "Sunday",
                        "value": "1."
                    }
                ]
            },
            {
                "type": "radiogroup",
                "messageKey": "secs_ampm",
                "label": "Upper right info",
                "description": "If 24h format, AM/PM is not displayed.",
                "defaultValue": "1.",
                "options": [
                    {
                        "label": "Seconds",
                        "value": "1."
                    },
                    {
                        "label": "AM/PM",
                        "value": "0."
                    }
                ]
            },
            {
                "type": "toggle",
                "messageKey": "steps_status",
                "label": "Show steps",
                "description": "Displayed at the bottom right and will block out this area when enabled for Pebble Time. For the PTR, steps are displayed at the very bottom.",
                "defaultValue": false
            },
            {
                "type": "toggle",
                "messageKey": "invert",
                "label": "Invert colour",
                "defaultValue": false
            },
            {
                "type": "color",
                "messageKey": "textcol",
                "label": "Primary text colour",
                "description": "Set this to colour the time and date text.",
                "defaultValue": "#FFFFFF",
                "sunlight": false,
                "capabilities": ["COLOR"]
            },
            {
                "type": "color",
                "messageKey": "othertextcol",
                "label": "Secondary text colour",
                "description": "Set this to colour the week desc., temperature, battery num., AM/PM or seconds, and steps text.",
                "defaultValue": "#FFFFFF",
                "sunlight": false,
                "capabilities": ["COLOR"]
            },
            {
                "type": "color",
                "messageKey": "backgroundcol",
                "label": "Background colour",
                "defaultValue": "#000000",
                "sunlight": false,
                "capabilities": ["COLOR"]
            },
            {
                "type": "select",
                "messageKey": "background",
                "defaultValue": "0.",
                "label": "BG Colour Scheme",
                "capabilities": ["COLOR"],
                "options": [
                    {
                        "label": "Blue or B&W",
                        "value": "0."
                    },
                    {
                        "label": "Light Blues",
                        "value": "1."
                    },
                    {
                        "label": "Purples",
                        "value": "2."
                    },
                    {
                        "label": "Yellows",
                        "value": "3."
                    },
                    {
                        "label": "White",
                        "value": "4."
                    },
                    {
                        "label": "Greys",
                        "value": "5."
                    },
                    {
                        "label": "Reds",
                        "value": "6."
                    },
                    {
                        "label": "Yellows/Blue",
                        "value": "7."
                    },
                    {
                        "label": "Blues/Red/Orange",
                        "value": "8."
                    },
                    {
                        "label": "Greens",
                        "value": "9."
                    },
                    {
                        "label": "Dark Blues",
                        "value": "10."
                    },
                    {
                        "label": "Borg",
                        "value": "11."
                    }
                ]
            },
            {
                "type": "select",
                "messageKey": "battery_background",
                "label": "Battery bar bg",
                "defaultValue": "0.",
                "capabilities": ["COLOR"],
                "options": [
                    {
                        "label": "Black",
                        "value": "0."
                    },
                    {
                        "label": "Same as bg scheme",
                        "value": "1."
                    },
                    {
                        "label": "Same as bg color",
                        "value": "2."
                    }
                ]
            },
            {
                "type": "select",
                "messageKey": "language",
                "defaultValue": "0.",
                "label": "Language",
                "options": [
                    {
                        "label": "Catalan",
                        "value": "12."
                    },
                    {
                        "label": "Croation",
                        "value": "4."
                    },
                    {
                        "label": "Czech",
                        "value": "16."
                    },
                    {
                        "label": "Danish",
                        "value": "10."
                    },
                    {
                        "label": "Dutch",
                        "value": "1."
                    },
                    {
                        "label": "English",
                        "value": "0."
                    },
                    {
                        "label": "Finnish",
                        "value": "9."
                    },
                    {
                        "label": "French",
                        "value": "3."
                    },
                    {
                        "label": "German",
                        "value": "2."
                    },
                    {
                        "label": "Hungarian",
                        "value": "15."
                    },
                    {
                        "label": "Italian",
                        "value": "6."
                    },
                    {
                        "label": "Norweigan",
                        "value": "7."
                    },
                    {
                        "label": "Portugese",
                        "value": "14."
                    },
                    {
                        "label": "Slovak",
                        "value": "13."
                    },
                    {
                        "label": "Spanish",
                        "value": "5."
                    },
                    {
                        "label": "Swedish",
                        "value": "8."
                    },
                    {
                        "label": "Turkish",
                        "value": "11."
                    }

                ]
            },
            {
                "type": "select",
                "messageKey": "format",
                "defaultValue": "0.",
                "label": "Extra Date Format",
                "options": [
                    {
                        "label": "Week",
                        "value": "0."
                    },
                    {
                        "label": "Day of the year (stardate)",
                        "value": "1."
                    },
                    {
                        "label": "DD/MM/YY",
                        "value": "2."
                    },
                    {
                        "label": "MM/DD/YY",
                        "value": "3."
                    },
                    {
                        "label": "Wxxx Dxxx",
                        "value": "4."
                    },
                    {
                        "label": "YYYY MM DD",
                        "value": "5."
                    },
                    {
                        "label": "DD.MM.YYYY",
                        "value": "6."
                    },
                    {
                        "label": "YY.WW.DDD",
                        "value": "7."
                    }
                ]
            }
        ]
    },
    {
        "type": "section",
        "items": [
            {
                "type": "heading",
                "defaultValue": "<h5>Vibration</h5>"
            },
            {
                "type": "toggle",
                "messageKey": "bluetoothvibe_status",
                "label": "Bluetooth vibration",
                "defaultValue": false
            },
            {
                "type": "toggle",
                "messageKey": "hourlyvibe",
                "label": "Hourly vibration",
                "defaultValue": false
            }
        ]
    },
    {
        "type": "submit",
        "defaultValue": "Save Settings"
    },
    {
        "type": "text",
        "defaultValue": "<h6><center>If you find this watchface useful, <br> please consider making a <a href='https://www.paypal.me/markchopsreed'>small donation</a>. <br> Thank you. </center></h6>"
    }
];
