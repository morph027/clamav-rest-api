const DB_VERSION_TTL = 60 * 1000; // 60 seconds

// 'ClamAV 1.4.1/27000/Wed Oct ...' -> '27000'
const parseDbVersion = (version) => {
  const dbVersion = String(version).split('/')[1];
  return dbVersion && dbVersion.trim() ? dbVersion.trim() : undefined;
};

// Returns an async function resolving to the ClamAV signature DB version, memoized for ttlMs.
// Rejects when clamd cannot be asked or the version cannot be parsed (failures are not memoized).
const createDbVersionGetter = (av, ttlMs = DB_VERSION_TTL) => {
  let cached;
  let expiresAt = 0;
  let pending = null;

  return async () => {
    if (cached && Date.now() < expiresAt) {
      return cached;
    }
    if (!pending) {
      pending = Promise.resolve()
        .then(() => av.getVersion())
        .then((version) => {
          const dbVersion = parseDbVersion(version);
          if (!dbVersion) {
            throw new Error(`Cannot parse ClamAV DB version from: ${version}`);
          }
          cached = dbVersion;
          expiresAt = Date.now() + ttlMs;
          return dbVersion;
        })
        .finally(() => {
          pending = null;
        });
    }
    return pending;
  };
};

module.exports = { parseDbVersion, createDbVersionGetter };
