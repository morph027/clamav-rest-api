const errMsg = (err) => (err && err.message ? err.message : err);

// Redis backed cache. Values are stored as JSON with EX ttl.
// Errors are logged and swallowed: get() resolves to undefined, set() resolves.
class RedisCache {
  constructor({ client, ttl = 3600, prefix = 'cra:scan:' }) {
    this.client = client;
    this.ttl = ttl;
    this.prefix = prefix;
  }

  async get(key) {
    try {
      const raw = await this.client.get(this.prefix + key);
      return raw === null || raw === undefined ? undefined : JSON.parse(raw);
    } catch (err) {
      console.error(`Cache: Redis get failed: ${errMsg(err)}`);
      return undefined;
    }
  }

  async set(key, value) {
    try {
      await this.client.set(this.prefix + key, JSON.stringify(value), {
        expiration: { type: 'EX', value: this.ttl },
      });
    } catch (err) {
      console.error(`Cache: Redis set failed: ${errMsg(err)}`);
    }
  }

  async close() {
    try {
      if (this.client.isOpen) {
        await this.client.close();
      }
    } catch (err) {
      console.error(`Cache: Redis close failed: ${errMsg(err)}`);
    }
  }
}

// Connects to Redis and returns a RedisCache. Rejects if the initial connection fails.
// `client` can be injected (tests); otherwise the `redis` package is required lazily.
async function createRedisCache(cacheConfig, client) {
  if (!client) {
    const { createClient } = require('redis');
    let connected = false;
    client = createClient({
      url: cacheConfig.redisUrl,
      // fail fast instead of queueing commands while disconnected, so scans are never blocked
      disableOfflineQueue: true,
      socket: {
        // give up on the initial connect (startup falls back to no caching), retry with backoff afterwards
        // (wrap the cause in a new Error: redis checks `instanceof Error`, which fails for errors from other realms, e.g. jest)
        reconnectStrategy: (retries, cause) =>
          connected ? Math.min(retries * 100, 3000) : new Error(`Redis connection failed: ${errMsg(cause)}`),
      },
    });
    client.on('ready', () => {
      connected = true;
    });
  }
  client.on('error', (err) => console.error(`Cache: Redis error: ${errMsg(err)}`));
  await client.connect();
  return new RedisCache({ client, ttl: cacheConfig.ttl, prefix: cacheConfig.redisPrefix });
}

module.exports = { RedisCache, createRedisCache };
