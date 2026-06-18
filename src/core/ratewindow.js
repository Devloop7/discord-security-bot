// src/core/ratewindow.js
// Tracks timestamps per key; record() prunes expired entries and returns the
// current count inside the window. Used by spam, raid, and nuke detection.
class RateWindow {
  constructor(windowMs) {
    this.windowMs = windowMs;
    this.events = new Map();
  }

  record(key, now = Date.now()) {
    const kept = (this.events.get(key) || []).filter((t) => now - t < this.windowMs);
    kept.push(now);
    this.events.set(key, kept);
    return kept.length;
  }

  reset(key) {
    this.events.delete(key);
  }
}

module.exports = RateWindow;
