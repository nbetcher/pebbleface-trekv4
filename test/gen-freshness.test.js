'use strict';
// app.js ships src/pkjs/clay-custom.gen.js, which make_shim.py derives from the readable
// src/pkjs/clay-custom.js by removing comments and indentation. If someone edits the
// source and forgets to regenerate, the phone would silently run stale code.
//
// The check is a SHA-256 the generator stamps into the artifact's header, rather than a
// second copy of the comment stripper - a re-implementation would drift from the real one
// and start reporting false failures (or, worse, false passes).

var test = require('node:test');
var assert = require('node:assert/strict');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var PKJS = path.join(__dirname, '..', 'src', 'pkjs');
var SRC = path.join(PKJS, 'clay-custom.js');
var GEN = path.join(PKJS, 'clay-custom.gen.js');

test('clay-custom.gen.js was generated from the current clay-custom.js', function () {
  assert.ok(fs.existsSync(GEN), 'clay-custom.gen.js missing - run: python make_shim.py');
  var gen = fs.readFileSync(GEN, 'utf8');
  var stamped = /^\/\/ source-sha256: ([0-9a-f]{64})$/m.exec(gen);
  assert.ok(stamped, 'clay-custom.gen.js has no source-sha256 stamp - regenerate it');
  var actual = crypto.createHash('sha256')
    .update(fs.readFileSync(SRC, 'utf8'), 'utf8').digest('hex');
  assert.equal(stamped[1], actual,
    'clay-custom.gen.js is stale (built from a different clay-custom.js) - ' +
    're-run: python make_shim.py');
});

test('the shipped artifact carries no comments and is smaller than its source', function () {
  var gen = fs.readFileSync(GEN, 'utf8');
  var body = gen.split('\n').slice(3).join('\n');      // past the generated header
  assert.doesNotMatch(body, /\/\*/, 'block comment survived stripping');
  assert.ok(fs.statSync(GEN).size < fs.statSync(SRC).size,
    'generated artifact should be smaller than the source it came from');
});

test('app.js requires the generated artifact, not the readable source', function () {
  var app = fs.readFileSync(path.join(PKJS, 'app.js'), 'utf8');
  assert.match(app, /require\(['"]\.\/clay-custom\.gen\.js['"]\)/,
    'app.js must require ./clay-custom.gen.js so the phone gets the stripped copy');
  assert.doesNotMatch(app, /require\(['"]\.\/clay-custom\.js['"]\)/,
    'app.js must not require the unstripped source');
});
