const NodeClam = require('clamscan');
const cors = require('cors');
const express = require('express');
const morgan = require('morgan');
const fileUpload = require('express-fileupload');

const versionRouter = require('./routes/version');
const scanRouter = require('./routes/scan');
const dbSignaturesRouter = require('./routes/dbsignatures');
const { createCache } = require('./cache');
const { createDbVersionGetter } = require('./utils/dbVersion');

async function makeServer(cfg) {
  try {
    const newAvConfig = Object.assign({}, cfg.avConfig);
    const clamscan = await new NodeClam().init(newAvConfig);
    const cache = await createCache(cfg.cacheConfig);
    const scanCache = cache ? { cache, getDbVersion: createDbVersionGetter(clamscan) } : null;
    const PORT = process.env.APP_PORT || 3000;
    const app = express();

    app.use(cors());
    app.use((req, res, next) => {
      req._av = clamscan;
      req._cache = scanCache;
      next();
    });

    app.use(fileUpload({ ...cfg.fuConfig }));
    process.env.NODE_ENV !== 'test' &&
      app.use(morgan(process.env.APP_MORGAN_LOG_FORMAT || 'combined'));
    app.use('/api/v1/version', versionRouter);
    app.use('/api/v1/scan', scanRouter);
    app.use('/api/v1/dbsignatures', dbSignaturesRouter);
    app.all('/{*splat}', (req, res) => {
      res.status(405).json({ success: false, data: { error: 'Not allowed.' } });
    });

    const srv = app.listen(PORT, () => {
      process.env.NODE_ENV !== 'test' &&
        console.log(`Server started on PORT: ${PORT}`);
    });
    cache && srv.on('close', () => cache.close());
    return srv;
  } catch (error) {
    throw new Error(`Cannot initialize clamav object: ${error}`);
  }
}

module.exports = { makeServer };
