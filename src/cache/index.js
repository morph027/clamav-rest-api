const MemoryCache = require('./memoryCache');

// Returns a cache instance or null when caching is disabled.
// If Redis cannot be reached at startup, the error is logged and caching is disabled (null).
async function createCache(cacheConfig, { redisClient } = {}) {
  if (!cacheConfig || !cacheConfig.enabled) {
    return null;
  }

  if (cacheConfig.type === 'redis') {
    const { createRedisCache } = require('./redisCache');
    try {
      return await createRedisCache(cacheConfig, redisClient);
    } catch (err) {
      console.error(
        `Cache: cannot connect to Redis (${err && err.message ? err.message : err}), scan result cache disabled`
      );
      return null;
    }
  }

  return new MemoryCache({ ttl: cacheConfig.ttl, maxEntries: cacheConfig.maxEntries });
}

module.exports = { createCache };
