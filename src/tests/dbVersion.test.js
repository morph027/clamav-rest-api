const { parseDbVersion, createDbVersionGetter } = require('../utils/dbVersion');

describe('parseDbVersion', () => {
  it('should extract signature DB version', () => {
    expect(parseDbVersion('ClamAV 1.4.1/27000/Wed Oct 28 10:00:00 2026')).toBe('27000');
    expect(parseDbVersion('ClamAV 111.111.111/111/')).toBe('111');
  });

  it('should return undefined for unexpected format', () => {
    expect(parseDbVersion('ClamAV 1.4.1')).toBeUndefined();
    expect(parseDbVersion('ClamAV 1.4.1//')).toBeUndefined();
  });
});

describe('createDbVersionGetter', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('should memoize DB version for ttl', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const av = { getVersion: jest.fn().mockResolvedValue('ClamAV 1.4.1/27000/') };
    const getDbVersion = createDbVersionGetter(av, 60000);
    expect(await getDbVersion()).toBe('27000');
    expect(await getDbVersion()).toBe('27000');
    expect(av.getVersion).toHaveBeenCalledTimes(1);

    av.getVersion.mockResolvedValue('ClamAV 1.4.1/27001/');
    jest.setSystemTime(new Date('2026-01-01T00:01:00Z'));
    expect(await getDbVersion()).toBe('27001');
    expect(av.getVersion).toHaveBeenCalledTimes(2);
  });

  it('should share one pending clamd request between concurrent callers', async () => {
    const av = { getVersion: jest.fn().mockResolvedValue('ClamAV 1.4.1/27000/') };
    const getDbVersion = createDbVersionGetter(av);
    expect(await Promise.all([getDbVersion(), getDbVersion()])).toEqual(['27000', '27000']);
    expect(av.getVersion).toHaveBeenCalledTimes(1);
  });

  it('should reject and not memoize failures', async () => {
    const av = { getVersion: jest.fn().mockRejectedValue('Reject error') };
    const getDbVersion = createDbVersionGetter(av);
    await expect(getDbVersion()).rejects.toBe('Reject error');
    av.getVersion.mockResolvedValue('unparseable');
    await expect(getDbVersion()).rejects.toThrow(/Cannot parse/);
    av.getVersion.mockResolvedValue('ClamAV 1.4.1/27000/');
    expect(await getDbVersion()).toBe('27000');
    expect(av.getVersion).toHaveBeenCalledTimes(3);
  });
});
