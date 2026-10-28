const crypto = require('crypto');
const { Readable } = require('stream');

const errMsg = (err) => (err && err.message ? err.message : err);

// Cache key = signature DB version + sha256 of the content, so results are invalidated
// when new signatures land. Returns undefined (skip cache) if the DB version is unavailable.
const getCacheKey = async (upload, scanCache) => {
  try {
    const dbVersion = await scanCache.getDbVersion();
    const hash = crypto.createHash('sha256').update(upload.data).digest('hex');
    return `${dbVersion}:${hash}`;
  } catch (err) {
    console.error(`Cache: skipping cache, cannot get ClamAV DB version: ${errMsg(err)}`);
    return undefined;
  }
};

// scanCache (optional): { cache, getDbVersion }
const scanFile = async (upload, av, scanCache) => {
  if (upload.size <= 0) {
    return {
      name: upload.name,
      is_infected: false,
      viruses: [],
    };
  }

  const cacheKey = scanCache ? await getCacheKey(upload, scanCache) : undefined;
  if (cacheKey) {
    try {
      const cached = await scanCache.cache.get(cacheKey);
      if (cached) {
        return {
          name: upload.name,
          is_infected: cached.is_infected,
          viruses: [...cached.viruses],
        };
      }
    } catch (err) {
      console.error(`Cache: get failed: ${errMsg(err)}`);
    }
  }

  let chunk = new Buffer.from(upload.data);

  const fileStream = new Readable();
  fileStream._read = () => {
    fileStream.push(chunk);
    chunk = null;
  };

  const tcpStream = av.passthrough();
  fileStream.pipe(tcpStream);

  const result = await new Promise((resolve, reject) =>
    tcpStream
      .on('scan-complete', (data) => {
        resolve(data);
      })
      .on('error', (error) => {
        reject(error);
      })
      .on('timeout', (error) => {
        reject(error);
      })
  );

  // only cache definite results
  if (cacheKey && typeof result.isInfected === 'boolean' && Array.isArray(result.viruses)) {
    try {
      await scanCache.cache.set(cacheKey, { is_infected: result.isInfected, viruses: [...result.viruses] });
    } catch (err) {
      console.error(`Cache: set failed: ${errMsg(err)}`);
    }
  }

  return {
    name: upload.name,
    is_infected: result.isInfected,
    viruses: result.viruses,
  };
};

module.exports = scanFile;
