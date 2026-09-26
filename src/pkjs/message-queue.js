'use strict';

// Bounded AppMessage delivery with two useful classes of message:
//
// * durable/keyed messages (watch configuration) retain only their newest
//   value and are reconciled on resume or the next enqueue after exhaustion;
// * replaceable/keyed messages (weather) retain only their newest observation
//   and may be discarded after bounded retries.
//
// A per-attempt watchdog also makes a missing ACK/NACK equivalent to a NACK,
// preventing a buggy or disconnected transport from wedging the FIFO forever.
function createMessageQueue(send, options) {
  options = options || {};
  if (typeof send !== 'function') {
    throw new TypeError('A send function is required');
  }

  var entries = [];
  var deferred = {};
  var inFlight = false;
  var retryTimer = null;
  var watchdogTimer = null;
  var schedule = options.setTimeout || setTimeout;
  var cancel = options.clearTimeout || clearTimeout;
  var onFailure = typeof options.onFailure === 'function' ?
    options.onFailure : function() {};
  var maxRetries = typeof options.maxRetries === 'number' &&
    options.maxRetries >= 0 ? Math.floor(options.maxRetries) : 3;
  var baseDelay = typeof options.baseDelay === 'number' &&
    options.baseDelay >= 0 ? options.baseDelay : 500;
  var maxDelay = typeof options.maxDelay === 'number' &&
    options.maxDelay >= baseDelay ? options.maxDelay : 4000;
  var attemptTimeout = typeof options.attemptTimeout === 'number' &&
    options.attemptTimeout > 0 ? options.attemptTimeout : 10000;
  var maxEntries = typeof options.maxEntries === 'number' &&
    options.maxEntries >= 2 ? Math.floor(options.maxEntries) : 16;

  function hasOwn(object, property) {
    return Object.prototype.hasOwnProperty.call(object, property);
  }

  function clearWatchdog() {
    if (watchdogTimer !== null) {
      cancel(watchdogTimer);
      watchdogTimer = null;
    }
  }

  function insertByPriority(entry) {
    var index = inFlight ? 1 : 0;
    while (index < entries.length &&
        entries[index].priority >= entry.priority) {
      index++;
    }
    entries.splice(index, 0, entry);
  }

  function removeQueuedKey(key) {
    var index;
    for (index = entries.length - 1; index >= 0; index--) {
      if (entries[index].key !== key) {
        continue;
      }
      if (index === 0 && inFlight) {
        // The transport call cannot be cancelled safely. Its callbacks will
        // settle it, but it must never retry or overwrite the newer value.
        entries[index].superseded = true;
      } else {
        entries.splice(index, 1);
      }
    }
  }

  function promoteDeferred() {
    var key;
    var entry;
    for (key in deferred) {
      if (hasOwn(deferred, key)) {
        entry = deferred[key];
        delete deferred[key];
        removeQueuedKey(key);
        insertByPriority(entry);
      }
    }
  }

  function deferredCount() {
    var count = 0;
    var key;
    for (key in deferred) {
      if (hasOwn(deferred, key)) {
        count++;
      }
    }
    return count;
  }

  function pump() {
    var entry;
    var settled = false;

    if (inFlight || retryTimer !== null || entries.length === 0) {
      return;
    }

    entry = entries[0];
    entry.attempts++;
    inFlight = true;

    function acknowledge() {
      if (settled) {
        return;
      }
      settled = true;
      clearWatchdog();
      inFlight = false;
      if (entries[0] === entry) {
        entries.shift();
      }
      pump();
    }

    function reject(error) {
      var willRetry;
      var delay;
      var index;
      if (settled) {
        return;
      }
      settled = true;
      clearWatchdog();
      inFlight = false;
      if (entries[0] !== entry) {
        pump();
        return;
      }

      willRetry = !entry.superseded && entry.attempts <= maxRetries;
      try {
        onFailure(error, {
          attempt: entry.attempts,
          willRetry: willRetry,
          key: entry.key,
          durable: entry.durable
        });
      } catch (callbackError) {
        // Diagnostics must not be able to wedge transport reconciliation.
      }

      if (!willRetry) {
        entries.shift();
        if (entry.durable && entry.key && !entry.superseded) {
          entry.attempts = 0;
          deferred[entry.key] = entry;
          // Weather observed before an unapplied configuration can be based on
          // the wrong units/settings. Let the next observation replace it only
          // after configuration reconciliation is attempted again.
          for (index = entries.length - 1; index >= 0; index--) {
            if (!entries[index].durable &&
                entries[index].priority < entry.priority) {
              entries.splice(index, 1);
            }
          }
        }
        pump();
        return;
      }

      delay = Math.min(baseDelay * Math.pow(2, entry.attempts - 1), maxDelay);
      retryTimer = schedule(function() {
        retryTimer = null;
        pump();
      }, delay);
    }

    try {
      send(entry.dictionary, acknowledge, reject);
    } catch (error) {
      reject(error);
    }
    if (!settled) {
      watchdogTimer = schedule(function() {
        reject({
          error: { message: 'AppMessage acknowledgement timed out' },
          timeout: true
        });
      }, attemptTimeout);
    }
  }

  function makeRoom() {
    var index;
    if (entries.length < maxEntries) {
      return true;
    }
    // Drop the oldest queued disposable item. Never remove the active head or
    // a durable configuration solely to make room.
    for (index = inFlight ? 1 : 0; index < entries.length; index++) {
      if (!entries[index].durable) {
        entries.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  return {
    enqueue: function(dictionary, enqueueOptions) {
      var entry;
      enqueueOptions = enqueueOptions || {};
      if (!dictionary || typeof dictionary !== 'object') {
        return false;
      }

      // An external enqueue is a new transport opportunity. Reconcile any
      // previously exhausted durable state before sending disposable data.
      promoteDeferred();
      entry = {
        dictionary: dictionary,
        attempts: 0,
        key: typeof enqueueOptions.key === 'string' ? enqueueOptions.key : null,
        durable: enqueueOptions.durable === true,
        priority: typeof enqueueOptions.priority === 'number' ?
          enqueueOptions.priority : 0,
        superseded: false
      };
      if (entry.key) {
        removeQueuedKey(entry.key);
        delete deferred[entry.key];
      }
      if (!makeRoom()) {
        return false;
      }
      insertByPriority(entry);
      pump();
      return true;
    },
    resume: function() {
      promoteDeferred();
      pump();
    },
    discard: function(key) {
      if (typeof key !== 'string') {
        return;
      }
      removeQueuedKey(key);
      delete deferred[key];
    },
    pendingCount: function() {
      return entries.length + deferredCount();
    }
  };
}

module.exports = createMessageQueue;
