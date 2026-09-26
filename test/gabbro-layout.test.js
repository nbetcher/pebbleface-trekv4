'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');

var mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'c', 'main.c'), 'utf8');
var frameSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'c', 'frame_tables.h'), 'utf8');

function everyPixelInsideRoundSafeArea(rect) {
  var x;
  var y;
  var dx;
  var dy;
  for (y = rect.y; y < rect.y + rect.h; y++) {
    for (x = rect.x; x < rect.x + rect.w; x++) {
      dx = x + 0.5 - 130;
      dy = y + 0.5 - 130;
      if (dx * dx + dy * dy > 128 * 128) {
        return false;
      }
    }
  }
  return true;
}

test('Gabbro lower information and formerly clipped frame pieces are circle-safe', function() {
  var rects = [
    { name: 'top frame chord', x: 144, y: 20, w: 52, h: 9 },
    { name: 'lower frame left bar', x: 48, y: 184, w: 58, h: 16 },
    { name: 'lower frame right bar', x: 109, y: 184, w: 115, h: 16 },
    { name: 'lower stub', x: 43, y: 202, w: 8, h: 14 },
    { name: 'lower stub tip', x: 51, y: 217, w: 7, h: 6 },
    { name: 'abbreviated date', x: 58, y: 201, w: 82, h: 27 },
    { name: 'extra date', x: 143, y: 201, w: 70, h: 27 },
    { name: 'step count', x: 105, y: 201, w: 72, h: 27 },
    { name: 'footprint', x: 181, y: 202, w: 24, h: 26 }
  ];

  rects.forEach(function(rect) {
    assert.equal(everyPixelInsideRoundSafeArea(rect), true, rect.name);
  });

  assert.match(frameSource, /\{ 0, 144,\s+20,\s+52,\s+9,/);
  assert.match(frameSource, /\{ 0,\s+43, 202,\s+8,\s+14,/);
  assert.match(frameSource, /\{ 0,\s+51, 217,\s+7,\s+6,/);
  assert.match(mainSource,
    /DATE_RECT\s+= ConstantGRect\(\s+58, 201,\s+82,\s+27 \)/);
  assert.match(mainSource,
    /WEEK_RECT\s+= ConstantGRect\( 143, 201,\s+70,\s+27 \)/);
  assert.match(mainSource,
    /DAYS_RECT\s+= ConstantGRect\(\s+55, 146, 202,\s+43 \)/);
  assert.match(mainSource, /GRect footprintframe = GRect\(181, 202, 24, 26\)/);
  assert.match(mainSource,
    /steps_label = text_layer_create\(GRect\(105, 201, 72, 27\)\)/);
  assert.ok(58 + 82 < 143, 'date and extra-date rectangles have a visible gap');
  assert.match(mainSource, /PBL_PLATFORM_GABBRO\)[\s\S]*?, font_days \);/);
});
