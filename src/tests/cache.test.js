const MemoryCache = require('../cache/memoryCache');
const { RedisCache, createRedisCache } = require('../cache/redisCache');
const { createCache } = require('../cache');

const makeFakeRedisClient = () => {
  const store = new Map();
  return {
    store,
    isOpen: true,
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(),
    get: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    set: jest.fn(async (key, value) => {
      store.set(key, value);
      return 'OK';
    }),
    close: jest.fn().mockResolvedValue(),
  };
};

describe('MemoryCache', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return undefined for missing key and stored value after set', async () => {
    const cache = new MemoryCache({ ttl: 10, maxEntries: 10 });
    expect(await cache.get('k')).toBeUndefined();
    await cache.set('k', { is_infected: false, viruses: [] });
    expect(await cache.get('k')).toEqual({ is_infected: false, viruses: [] });
  });

  it('should expire entries after ttl', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const cache = new MemoryCache({ ttl: 10, maxEntries: 10 });
    await cache.set('k', 'v');
    jest.setSystemTime(new Date('2026-01-01T00:00:09Z'));
    expect(await cache.get('k')).toBe('v');
    jest.setSystemTime(new Date('2026-01-01T00:00:10Z'));
    expect(await cache.get('k')).toBeUndefined();
    expect(cache.store.size).toBe(0);
  });

  it('should evict least recently used entry when maxEntries exceeded', async () => {
    const cache = new MemoryCache({ ttl: 10, maxEntries: 2 });
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.get('a'); // 'b' is now least recently used
    await cache.set('c', 3);
    expect(await cache.get('b')).toBeUndefined();
    expect(await cache.get('a')).toBe(1);
    expect(await cache.get('c')).toBe(3);
    expect(cache.store.size).toBe(2);
  });

  it('should clear entries on close', async () => {
    const cache = new MemoryCache();
    await cache.set('a', 1);
    await cache.close();
    expect(await cache.get('a')).toBeUndefined();
  });
});

describe('RedisCache', () => {
  let errorSpy;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('should set JSON value with prefix and EX ttl', async () => {
    const client = makeFakeRedisClient();
    const cache = new RedisCache({ client, ttl: 123, prefix: 'p:' });
    await cache.set('k', { is_infected: true, viruses: ['v'] });
    expect(client.set).toHaveBeenCalledWith('p:k', JSON.stringify({ is_infected: true, viruses: ['v'] }), {
      expiration: { type: 'EX', value: 123 },
    });
  });

  it('should parse stored JSON on get and return undefined for missing key', async () => {
    const client = makeFakeRedisClient();
    const cache = new RedisCache({ client, ttl: 1, prefix: 'p:' });
    client.store.set('p:k', JSON.stringify({ is_infected: false, viruses: [] }));
    expect(await cache.get('k')).toEqual({ is_infected: false, viruses: [] });
    expect(client.get).toHaveBeenCalledWith('p:k');
    expect(await cache.get('missing')).toBeUndefined();
  });

  it('should swallow and log client errors', async () => {
    const client = makeFakeRedisClient();
    client.get.mockRejectedValue(new Error('boom'));
    client.set.mockRejectedValue(new Error('boom'));
    const cache = new RedisCache({ client });
    await expect(cache.get('k')).resolves.toBeUndefined();
    await expect(cache.set('k', { is_infected: false, viruses: [] })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('should treat invalid JSON as cache miss', async () => {
    const client = makeFakeRedisClient();
    client.store.set('cra:scan:k', 'not json');
    const cache = new RedisCache({ client });
    expect(await cache.get('k')).toBeUndefined();
  });

  it('should close open client', async () => {
    const client = makeFakeRedisClient();
    await new RedisCache({ client }).close();
    expect(client.close).toHaveBeenCalledTimes(1);
    client.isOpen = false;
    await new RedisCache({ client }).close();
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('should connect injected client and register error handler', async () => {
    const client = makeFakeRedisClient();
    const cache = await createRedisCache({ ttl: 5, redisPrefix: 'x:' }, client);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(cache).toBeInstanceOf(RedisCache);
    expect(cache.ttl).toBe(5);
    expect(cache.prefix).toBe('x:');
  });
});

describe('createCache', () => {
  let errorSpy;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('should return null when config is missing or disabled', async () => {
    expect(await createCache()).toBeNull();
    expect(await createCache({ enabled: false, type: 'memory' })).toBeNull();
  });

  it('should return memory cache by default', async () => {
    const cache = await createCache({ enabled: true, type: 'memory', ttl: 1, maxEntries: 5 });
    expect(cache).toBeInstanceOf(MemoryCache);
    expect(cache.maxEntries).toBe(5);
  });

  it('should return redis cache for type redis', async () => {
    const redisClient = makeFakeRedisClient();
    const cache = await createCache({ enabled: true, type: 'redis', ttl: 1 }, { redisClient });
    expect(cache).toBeInstanceOf(RedisCache);
  });

  it('should disable caching when redis connect fails (injected client)', async () => {
    const redisClient = makeFakeRedisClient();
    redisClient.connect.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await createCache({ enabled: true, type: 'redis', ttl: 1 }, { redisClient })).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('should disable caching when real redis client cannot connect', async () => {
    const cache = await createCache({ enabled: true, type: 'redis', ttl: 1, redisUrl: 'redis://127.0.0.1:1' });
    expect(cache).toBeNull();
  });
});
