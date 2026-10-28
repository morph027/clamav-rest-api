// In-memory LRU cache with per-entry TTL.
// Expiry is checked lazily on get() - no timers, so nothing keeps the process alive.
class MemoryCache {
  constructor({ ttl = 3600, maxEntries = 10000 } = {}) {
    this.ttlMs = ttl * 1000;
    this.maxEntries = maxEntries;
    this.store = new Map();
  }

  async get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Map keeps insertion order: re-insert to mark as most recently used
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  async set(key, value) {
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.store.size > this.maxEntries) {
      // first key is the least recently used one
      this.store.delete(this.store.keys().next().value);
    }
  }

  async close() {
    this.store.clear();
  }
}

module.exports = MemoryCache;
