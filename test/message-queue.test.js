'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var createMessageQueue = require('../src/pkjs/message-queue.js');

function fakeScheduler() {
  var tasks = [];
  var nextId = 1;
  return {
    setTimeout: function(callback, delay) {
      var task = { callback: callback, delay: delay, id: nextId++, cancelled: false };
      tasks.push(task);
      return task.id;
    },
    clearTimeout: function(id) {
      tasks.forEach(function(task) {
        if (task.id === id) {
          task.cancelled = true;
        }
      });
    },
    next: function() {
      var task;
      do {
        task = tasks.shift();
      } while (task && task.cancelled);
      assert.ok(task, 'expected a scheduled retry');
      task.callback();
      return task.delay;
    },
    count: function() {
      return tasks.filter(function(task) { return !task.cancelled; }).length;
    }
  };
}

test('NACK retries preserve FIFO order until the head is acknowledged', function() {
  var scheduler = fakeScheduler();
  var calls = [];
  var firstAttempts = 0;
  var queue = createMessageQueue(function(dictionary, acknowledge, reject) {
    calls.push(dictionary.id);
    if (dictionary.id === 'first' && firstAttempts++ === 0) {
      reject({ error: { message: 'busy' } });
    } else {
      acknowledge();
    }
  }, {
    maxRetries: 2,
    baseDelay: 100,
    setTimeout: scheduler.setTimeout
  });

  queue.enqueue({ id: 'first' });
  queue.enqueue({ id: 'second' });

  assert.deepEqual(calls, ['first']);
  assert.equal(queue.pendingCount(), 2);
  assert.equal(scheduler.next(), 100);
  assert.deepEqual(calls, ['first', 'first', 'second']);
  assert.equal(queue.pendingCount(), 0);
});

test('retries are bounded and the queue advances after exhaustion', function() {
  var scheduler = fakeScheduler();
  var calls = [];
  var failures = [];
  var queue = createMessageQueue(function(dictionary, acknowledge, reject) {
    calls.push(dictionary.id);
    if (dictionary.id === 'bad') {
      reject(new Error('offline'));
    } else {
      acknowledge();
    }
  }, {
    maxRetries: 2,
    baseDelay: 50,
    maxDelay: 75,
    setTimeout: scheduler.setTimeout,
    onFailure: function(error, state) {
      failures.push({ message: error.message, state: state });
    }
  });

  queue.enqueue({ id: 'bad' });
  queue.enqueue({ id: 'good' });
  assert.equal(scheduler.next(), 50);
  assert.equal(scheduler.next(), 75);

  assert.deepEqual(calls, ['bad', 'bad', 'bad', 'good']);
  assert.deepEqual(failures.map(function(failure) {
    return failure.state.willRetry;
  }), [true, true, false]);
  assert.equal(queue.pendingCount(), 0);
  assert.equal(scheduler.count(), 0);
});

test('a synchronous sender exception cannot wedge the queue', function() {
  var scheduler = fakeScheduler();
  var calls = [];
  var attempts = 0;
  var queue = createMessageQueue(function(dictionary, acknowledge) {
    calls.push(dictionary.id);
    if (attempts++ === 0) {
      throw new Error('transport unavailable');
    }
    acknowledge();
  }, {
    maxRetries: 1,
    baseDelay: 25,
    setTimeout: scheduler.setTimeout
  });

  queue.enqueue({ id: 'config' });
  queue.enqueue({ id: 'weather' });
  assert.equal(scheduler.next(), 25);

  assert.deepEqual(calls, ['config', 'config', 'weather']);
  assert.equal(queue.pendingCount(), 0);
});

test('a diagnostic failure callback cannot wedge delivery', function() {
  var calls = [];
  var queue = createMessageQueue(function(dictionary, acknowledge, reject) {
    calls.push(dictionary.id);
    if (dictionary.id === 'bad') {
      reject(new Error('offline'));
    } else {
      acknowledge();
    }
  }, {
    maxRetries: 0,
    onFailure: function() {
      throw new Error('logger unavailable');
    }
  });

  queue.enqueue({ id: 'bad' });
  queue.enqueue({ id: 'good' });
  assert.deepEqual(calls, ['bad', 'good']);
  assert.equal(queue.pendingCount(), 0);
});

test('duplicate callbacks settle an attempt only once', function() {
  var calls = [];
  var queue = createMessageQueue(function(dictionary, acknowledge, reject) {
    calls.push(dictionary.id);
    acknowledge();
    reject(new Error('late NACK'));
  });

  queue.enqueue({ id: 'one' });
  queue.enqueue({ id: 'two' });
  assert.deepEqual(calls, ['one', 'two']);
  assert.equal(queue.pendingCount(), 0);
});

test('an ACK watchdog advances a transport that never calls back', function() {
  var scheduler = fakeScheduler();
  var calls = [];
  var failures = [];
  var queue = createMessageQueue(function(dictionary, acknowledge) {
    calls.push(dictionary.id);
    if (dictionary.id === 'good') {
      acknowledge();
    }
  }, {
    maxRetries: 0,
    attemptTimeout: 250,
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    onFailure: function(error, state) {
      failures.push({ error: error, state: state });
    }
  });

  queue.enqueue({ id: 'silent' });
  queue.enqueue({ id: 'good' });
  assert.equal(scheduler.next(), 250);
  assert.deepEqual(calls, ['silent', 'good']);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].error.timeout, true);
  assert.equal(queue.pendingCount(), 0);
});

test('latest keyed configuration supersedes stale queued state', function() {
  var callbacks = [];
  var calls = [];
  var queue = createMessageQueue(function(dictionary, acknowledge, reject) {
    calls.push(dictionary.id);
    callbacks.push({ acknowledge: acknowledge, reject: reject });
  });

  queue.enqueue({ id: 'config-1' }, {
    key: 'configuration', durable: true, priority: 100
  });
  queue.enqueue({ id: 'weather-1' }, { key: 'weather' });
  queue.enqueue({ id: 'config-2' }, {
    key: 'configuration', durable: true, priority: 100
  });

  callbacks[0].acknowledge();
  assert.deepEqual(calls, ['config-1', 'config-2']);
  callbacks[1].acknowledge();
  assert.deepEqual(calls, ['config-1', 'config-2', 'weather-1']);
  callbacks[2].acknowledge();
  assert.equal(queue.pendingCount(), 0);
});

test('exhausted durable configuration retries at the next opportunity', function() {
  var calls = [];
  var configAttempts = 0;
  var queue = createMessageQueue(function(dictionary, acknowledge, reject) {
    calls.push(dictionary.id);
    if (dictionary.id === 'config' && configAttempts++ === 0) {
      reject(new Error('watch offline'));
    } else {
      acknowledge();
    }
  }, { maxRetries: 0 });

  queue.enqueue({ id: 'config' }, {
    key: 'configuration', durable: true, priority: 100
  });
  assert.equal(queue.pendingCount(), 1);

  queue.enqueue({ id: 'weather' }, { key: 'weather' });
  assert.deepEqual(calls, ['config', 'config', 'weather']);
  assert.equal(queue.pendingCount(), 0);
});

test('replaceable observations remain bounded while one send is active', function() {
  var scheduler = fakeScheduler();
  var firstAcknowledge;
  var currentAcknowledge;
  var queue = createMessageQueue(function(dictionary, acknowledge) {
    if (!firstAcknowledge) {
      firstAcknowledge = acknowledge;
    }
    currentAcknowledge = acknowledge;
  }, {
    maxEntries: 4,
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout
  });
  var index;

  queue.enqueue({ value: 0 }, { key: 'weather' });
  for (index = 1; index < 100; index++) {
    queue.enqueue({ value: index }, { key: 'weather' });
  }
  assert.equal(queue.pendingCount(), 2);
  firstAcknowledge();
  assert.equal(queue.pendingCount(), 1);
  currentAcknowledge();
  assert.equal(queue.pendingCount(), 0);
});
