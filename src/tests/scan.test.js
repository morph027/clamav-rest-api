const request = require('supertest');
const { makeServer } = require('../server');
const config = require('../config');
const { PassThrough } = require('stream');

const cleanFile01 = 'src/tests/1Mfile01.rnd';
const cleanFile02 = 'src/tests/1Mfile02.rnd';
const cleanFile03 = 'src/tests/1Mfile03.rnd';
const cleanFile04 = 'src/tests/1Mfile04.rnd';
const bigFile = 'src/tests/3Mfile.rnd';
const infectedFile = 'src/tests/eicar_com.zip';

const NodeClam = require('clamscan');
const { rejectErrorMessage } = require('./__mocks__/clamscan');
jest.mock('clamscan');

describe('Test "scan" API endpoint', () => {
  let srv;
  beforeEach(async () => {
    srv = await makeServer(config);
  });

  afterEach((done) => {
    srv.close(done);
  });

  it('should return 400 on scan without file', async () => {
    const res = await request(srv).post('/api/v1/scan');
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('success');
    expect(res.body.success).toBe(false);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('error');
  });

  it('should return 400 on wrong form key', async () => {
    const res = await request(srv).post('/api/v1/scan').attach(`__${process.env.APP_FORM_KEY}`, cleanFile01);
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('success');
    expect(res.body.success).toBe(false);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('error');
  });

  it('should return 400 on more than one form key', async () => {
    const res = await request(srv)
      .post('/api/v1/scan')
      .attach(`__${process.env.APP_FORM_KEY}`, cleanFile01)
      .attach(`${process.env.APP_FORM_KEY}`, cleanFile02);
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('success');
    expect(res.body.success).toBe(false);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('error');
  });

  it('should return 413 on scan too big file', async () => {
    const res = await request(srv).post('/api/v1/scan').attach(`${process.env.APP_FORM_KEY}`, bigFile);
    expect(res.statusCode).toEqual(413);
    expect(res.body).toHaveProperty('success');
    expect(res.body.success).toBe(false);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('error');
  });

  it('should return 400 on upload too much files', async () => {
    const res = await request(srv)
      .post('/api/v1/scan')
      .attach(`${process.env.APP_FORM_KEY}`, cleanFile01)
      .attach(`${process.env.APP_FORM_KEY}`, cleanFile02)
      .attach(`${process.env.APP_FORM_KEY}`, cleanFile03)
      .attach(`${process.env.APP_FORM_KEY}`, cleanFile04);
    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('success');
    expect(res.body.success).toBe(false);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('error');
  });

  it('should return 500 on clamd error', async () => {
    const mockedStream = new PassThrough();
    NodeClam.__setMockedStream(mockedStream);
    setTimeout(() => mockedStream.emit('error', new Error(rejectErrorMessage)), 100);
    const res = await request(srv).post('/api/v1/scan').attach(`${process.env.APP_FORM_KEY}`, cleanFile01);
    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty('success');
    expect(res.body.success).toBe(false);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('error');
  });

  it('should return 500 on clamd timeout', async () => {
    const mockedStream = new PassThrough();
    NodeClam.__setMockedStream(mockedStream);
    setTimeout(() => mockedStream.emit('timeout', new Error(rejectErrorMessage)), 100);
    const res = await request(srv).post('/api/v1/scan').attach(`${process.env.APP_FORM_KEY}`, cleanFile01);
    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty('success');
    expect(res.body.success).toBe(false);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('error');
  });

  it('should report is_infected=false on scan one clean file', async () => {
    const mockedStream = new PassThrough();
    NodeClam.__setMockedStream(mockedStream);
    setTimeout(() => mockedStream.emit('scan-complete', { isInfected: false, viruses: [] }), 100);
    const res = await request(srv).post('/api/v1/scan').attach(`${process.env.APP_FORM_KEY}`, cleanFile01);
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('success');
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('result');
    expect(Array.isArray(res.body.data.result)).toBe(true);
    expect(Array.isArray(res.body.data.result[0].viruses)).toBe(true);
    expect(res.body.data.result[0].viruses.length).toBe(0);
    expect(res.body.data.result[0].is_infected).toBe(false);
  });

  it('should report is_infected=false on scan two clean files', async () => {
    const mockedStream = new PassThrough();
    NodeClam.__setMockedStream(mockedStream);
    setTimeout(() => {
      mockedStream.emit('scan-complete', { isInfected: false, viruses: [] });
      mockedStream.resume();
    }, 100);

    setTimeout(() => {
      mockedStream.emit('scan-complete', { isInfected: false, viruses: [] });
    }, 150);

    const res = await request(srv)
      .post('/api/v1/scan')
      .attach(`${process.env.APP_FORM_KEY}`, cleanFile01)
      .attach(`${process.env.APP_FORM_KEY}`, cleanFile02);
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('success');
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('result');
    expect(Array.isArray(res.body.data.result)).toBe(true);
    expect(Array.isArray(res.body.data.result[0].viruses)).toBe(true);
    expect(res.body.data.result[0].viruses.length).toBe(0);
    expect(Array.isArray(res.body.data.result[1].viruses)).toBe(true);
    expect(res.body.data.result[1].viruses.length).toBe(0);
    expect(res.body.data.result[0].is_infected).toBe(false);
    expect(res.body.data.result[1].is_infected).toBe(false);
  });

  it('should report is_infected=true on scan one infected file', async () => {
    const mockedStream = new PassThrough();
    NodeClam.__setMockedStream(mockedStream);
    setTimeout(() => mockedStream.emit('scan-complete', { isInfected: true, viruses: ['bad_virus'] }), 100);
    const res = await request(srv).post('/api/v1/scan').attach(`${process.env.APP_FORM_KEY}`, infectedFile);
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('success');
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('result');
    expect(Array.isArray(res.body.data.result)).toBe(true);
    expect(Array.isArray(res.body.data.result[0].viruses)).toBe(true);
    expect(res.body.data.result[0].viruses.length).toBe(1);
    expect(res.body.data.result[0].is_infected).toBe(true);
  });

  it('should report is_infected=true and is_infected=false on scan infected and clean file', async () => {
    const mockedStream = new PassThrough();
    NodeClam.__setMockedStream(mockedStream);
    setTimeout(() => {
      mockedStream.emit('scan-complete', { isInfected: true, viruses: ['bad_virus'] });
      mockedStream.resume();
    }, 100);

    setTimeout(() => {
      mockedStream.emit('scan-complete', { isInfected: false, viruses: [] });
    }, 150);

    const res = await request(srv)
      .post('/api/v1/scan')
      .attach(`${process.env.APP_FORM_KEY}`, infectedFile)
      .attach(`${process.env.APP_FORM_KEY}`, cleanFile01);
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('success');
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('result');
    expect(Array.isArray(res.body.data.result)).toBe(true);
    expect(Array.isArray(res.body.data.result[0].viruses)).toBe(true);
    expect(res.body.data.result[0].viruses.length).toBe(1);
    expect(Array.isArray(res.body.data.result[1].viruses)).toBe(true);
    expect(res.body.data.result[1].viruses.length).toBe(0);
    expect(res.body.data.result[0].is_infected).toBe(true);
    expect(res.body.data.result[1].is_infected).toBe(false);
  });
});

describe('Test "scan" result cache', () => {
  let srv;
  let errorSpy;
  const formKey = () => `${process.env.APP_FORM_KEY}`;

  // prepares a fresh mocked clamd stream which emits `event` shortly after the request starts
  const mockClamd = (event, payload) => {
    const mockedStream = new PassThrough();
    NodeClam.__setMockedStream(mockedStream);
    setTimeout(() => mockedStream.emit(event, payload), 50);
  };

  beforeEach(() => {
    NodeClam.mockPassThrough.mockClear();
    NodeClam.mockGetVersion.mockClear();
    NodeClam.__setGetVersionReject(false);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach((done) => {
    NodeClam.__setGetVersionReject(false);
    errorSpy.mockRestore();
    srv.close(done);
  });

  it('should scan the same clean file only once and return cached result with current name', async () => {
    srv = await makeServer(config);
    mockClamd('scan-complete', { isInfected: false, viruses: [] });
    const res1 = await request(srv).post('/api/v1/scan').attach(formKey(), cleanFile01);
    const res2 = await request(srv).post('/api/v1/scan').attach(formKey(), cleanFile01, 'renamed.rnd');
    expect(res1.statusCode).toEqual(200);
    expect(res2.statusCode).toEqual(200);
    expect(NodeClam.mockPassThrough).toHaveBeenCalledTimes(1);
    expect(NodeClam.mockGetVersion).toHaveBeenCalledTimes(1);
    expect(res1.body.data.result).toEqual([{ name: '1Mfile01.rnd', is_infected: false, viruses: [] }]);
    expect(res2.body).toEqual({
      success: true,
      data: { result: [{ name: 'renamed.rnd', is_infected: false, viruses: [] }] },
    });
  });

  it('should cache infected result', async () => {
    srv = await makeServer(config);
    mockClamd('scan-complete', { isInfected: true, viruses: ['bad_virus'] });
    const res1 = await request(srv).post('/api/v1/scan').attach(formKey(), infectedFile);
    const res2 = await request(srv).post('/api/v1/scan').attach(formKey(), infectedFile);
    expect(NodeClam.mockPassThrough).toHaveBeenCalledTimes(1);
    expect(res1.body.data.result).toEqual([{ name: 'eicar_com.zip', is_infected: true, viruses: ['bad_virus'] }]);
    expect(res2.body).toEqual(res1.body);
  });

  it('should scan cached and uncached files in one request', async () => {
    srv = await makeServer(config);
    mockClamd('scan-complete', { isInfected: false, viruses: [] });
    await request(srv).post('/api/v1/scan').attach(formKey(), cleanFile01);
    mockClamd('scan-complete', { isInfected: true, viruses: ['bad_virus'] });
    const res = await request(srv).post('/api/v1/scan').attach(formKey(), cleanFile01).attach(formKey(), infectedFile);
    expect(NodeClam.mockPassThrough).toHaveBeenCalledTimes(2);
    expect(res.body.data.result).toEqual([
      { name: '1Mfile01.rnd', is_infected: false, viruses: [] },
      { name: 'eicar_com.zip', is_infected: true, viruses: ['bad_virus'] },
    ]);
  });

  it('should scan twice when cache is disabled', async () => {
    srv = await makeServer({ ...config, cacheConfig: { ...config.cacheConfig, enabled: false } });
    mockClamd('scan-complete', { isInfected: false, viruses: [] });
    await request(srv).post('/api/v1/scan').attach(formKey(), cleanFile01);
    mockClamd('scan-complete', { isInfected: false, viruses: [] });
    const res = await request(srv).post('/api/v1/scan').attach(formKey(), cleanFile01);
    expect(res.statusCode).toEqual(200);
    expect(NodeClam.mockPassThrough).toHaveBeenCalledTimes(2);
    expect(NodeClam.mockGetVersion).not.toHaveBeenCalled();
  });

  it('should scan twice when cacheConfig is missing', async () => {
    srv = await makeServer({ avConfig: config.avConfig, fuConfig: config.fuConfig });
    mockClamd('scan-complete', { isInfected: false, viruses: [] });
    await request(srv).post('/api/v1/scan').attach(formKey(), cleanFile01);
    mockClamd('scan-complete', { isInfected: false, viruses: [] });
    await request(srv).post('/api/v1/scan').attach(formKey(), cleanFile01);
    expect(NodeClam.mockPassThrough).toHaveBeenCalledTimes(2);
  });

  it('should not cache error and timeout results', async () => {
    srv = await makeServer(config);
    mockClamd('error', new Error(rejectErrorMessage));
    const res1 = await request(srv).post('/api/v1/scan').attach(formKey(), cleanFile01);
    mockClamd('timeout', new Error(rejectErrorMessage));
    const res2 = await request(srv).post('/api/v1/scan').attach(formKey(), cleanFile01);
    mockClamd('scan-complete', { isInfected: false, viruses: [] });
    const res3 = await request(srv).post('/api/v1/scan').attach(formKey(), cleanFile01);
    expect(res1.statusCode).toEqual(500);
    expect(res2.statusCode).toEqual(500);
    expect(res3.statusCode).toEqual(200);
    expect(NodeClam.mockPassThrough).toHaveBeenCalledTimes(3);
  });

  it('should skip cache and still scan when DB version is unavailable', async () => {
    srv = await makeServer(config);
    NodeClam.__setGetVersionReject(true);
    mockClamd('scan-complete', { isInfected: false, viruses: [] });
    const res1 = await request(srv).post('/api/v1/scan').attach(formKey(), cleanFile01);
    mockClamd('scan-complete', { isInfected: false, viruses: [] });
    const res2 = await request(srv).post('/api/v1/scan').attach(formKey(), cleanFile01);
    expect(res1.statusCode).toEqual(200);
    expect(res2.statusCode).toEqual(200);
    expect(res2.body.data.result).toEqual([{ name: '1Mfile01.rnd', is_infected: false, viruses: [] }]);
    expect(NodeClam.mockPassThrough).toHaveBeenCalledTimes(2);
  });

  it('should still scan when the cache backend fails', async () => {
    srv = await makeServer(config);
    const failingCache = {
      get: jest.fn().mockRejectedValue(new Error('cache down')),
      set: jest.fn().mockRejectedValue(new Error('cache down')),
    };
    const scanFile = require('../utils/scanFile');
    const av = await new NodeClam().init();
    mockClamd('scan-complete', { isInfected: false, viruses: [] });
    const upload = { name: 'f', size: 3, data: Buffer.from('abc') };
    const r = await scanFile(upload, av, { cache: failingCache, getDbVersion: async () => '1' });
    expect(r).toEqual({ name: 'f', is_infected: false, viruses: [] });
    expect(failingCache.get).toHaveBeenCalledTimes(1);
    expect(failingCache.set).toHaveBeenCalledTimes(1);
  });
});
