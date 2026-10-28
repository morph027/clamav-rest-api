const DEFAULT_MAX_FILE_SIZE = 1024 * 1024 * 25; // 25 MB
const avConfig = {
  debugMode: false,
  preference: 'clamdscan',
  clamdscan: {
    host: process.env.CLAMD_IP || '127.0.0.1',
    port: process.env.CLAMD_PORT || 3310,
    timeout: parseInt(process.env.CLAMD_TIMEOUT || 60000),
    socket: null,
    active: true,
  },
};

const fuConfig = {
  useTempFiles: false,
  limits: {
    fileSize: parseInt(process.env.APP_MAX_FILE_SIZE || DEFAULT_MAX_FILE_SIZE),
  },
  abortOnLimit: true,
  limitHandler: (req, res) => {
    res.writeHead(413, {
      Connection: 'close',
      'Content-Type': 'application/json',
    });
    res.end(
      JSON.stringify({
        success: false,
        data: {
          error: `File size limit exceeded. Max size of uploaded file is: ${
            process.env.APP_MAX_FILE_SIZE / 1024 || DEFAULT_MAX_FILE_SIZE / 1024
          } KB`,
        },
      })
    );
  },
};

const positiveInt = (value, defaultValue) => {
  const n = parseInt(value);
  return n > 0 ? n : defaultValue;
};

const cacheConfig = {
  enabled: process.env.CACHE_ENABLED !== 'false',
  type: (process.env.CACHE_TYPE || 'memory').toLowerCase(),
  ttl: positiveInt(process.env.CACHE_TTL, 3600), // seconds
  maxEntries: positiveInt(process.env.CACHE_MAX_ENTRIES, 10000), // memory cache only
  redisUrl: process.env.CACHE_REDIS_URL,
  redisPrefix: process.env.CACHE_REDIS_PREFIX || 'cra:scan:',
};

module.exports = {
  avConfig,
  fuConfig,
  cacheConfig,
};
