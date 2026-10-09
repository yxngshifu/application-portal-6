import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { CLIENT_DIST, DATA_DIR, PORT, driveConfigured, scriptConfigured } from './config.js';
import { DOCUMENTS, FILE_RULES } from '../../shared/schema.js';
import { initRecords } from './records.js';
import {
  createApplication, formDocx, getRecord, openFile, publicView, resyncExcel, updateApplication,
} from './service.js';
import { HttpError, fixName, normalizeId } from './util.js';

await initRecords();
const TMP = path.join(DATA_DIR, 'tmp');
await fsp.mkdir(TMP, { recursive: true });

const app = express();
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' });
  next();
});

const docKeys = new Set(DOCUMENTS.map((d) => d.key));
const upload = multer({
  storage: multer.diskStorage({ destination: TMP }),
  limits: { fileSize: FILE_RULES.maxBytes, files: FILE_RULES.maxPerRequest, fields: 10, fieldSize: 512 * 1024 },
  fileFilter: (_req, file, cb) =>
    docKeys.has(file.fieldname.replace(/^doc__/, '')) && file.fieldname.startsWith('doc__')
      ? cb(null, true)
      : cb(new HttpError(400, 'Unexpected file field')),
});

/** Parses multipart, hands uploads to `handler`, and always removes temp files. */
const withUploads = (handler) => (req, res, next) =>
  upload.any()(req, res, async (err) => {
    const files = (req.files || []).map((f) => ({
      path: f.path, size: f.size, category: f.fieldname.slice(5), name: fixName(f.originalname),
    }));
    try {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') throw new HttpError(413, `Each file must be ${FILE_RULES.maxBytes / 1024 / 1024} MB or smaller`);
        throw err;
      }
      await handler(req, res, files);
    } catch (e) {
      next(e);
    } finally {
      await Promise.all(files.map((f) => fsp.rm(f.path, { force: true })));
    }
  });

const idFrom = (req) => {
  const id = normalizeId(req.params.id);
  if (!id) throw new HttpError(404, 'We could not find an application with that ID');
  return id;
};

const limit = (windowMs, max, message) =>
  rateLimit({ windowMs, limit: max, standardHeaders: true, legacyHeaders: false, message: { error: message } });
const lookupLimit = limit(60_000, 30, 'Too many attempts. Please wait a minute and try again.');
const writeLimit = limit(60 * 60_000, 40, 'Too many submissions from this network. Please try again later.');

const api = express.Router();

api.get('/config', (_req, res) =>
  res.json({ documents: DOCUMENTS, limits: FILE_RULES, storage: scriptConfigured || driveConfigured ? 'drive' : 'local' }));

api.post('/applications', writeLimit, withUploads(async (req, res, files) => {
  const rec = await createApplication(req.body.data, files);
  res.status(201).json(publicView(rec));
}));

api.get('/applications/:id', lookupLimit, async (req, res) => {
  res.json(publicView(await getRecord(idFrom(req))));
});

api.put('/applications/:id', writeLimit, withUploads(async (req, res, files) => {
  let remove = [];
  try { remove = JSON.parse(req.body.removeFiles || '[]'); } catch { /* ignore */ }
  const rec = await updateApplication(idFrom(req), req.body.data, files, Array.isArray(remove) ? remove.map(String) : []);
  res.json(publicView(rec));
}));

api.get('/applications/:id/form.docx', lookupLimit, async (req, res) => {
  const { name, buffer } = await formDocx(await getRecord(idFrom(req)));
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'Content-Disposition': `attachment; filename="${name}"`,
    'Cache-Control': 'no-store',
  });
  res.send(buffer);
});

api.get('/applications/:id/files/:fileId', lookupLimit, async (req, res) => {
  const { file, stream } = await openFile(await getRecord(idFrom(req)), req.params.fileId);
  res.set({
    'Content-Type': file.mime,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'Cache-Control': 'no-store',
  });
  stream.on('error', () => res.destroy());
  stream.pipe(res);
});

api.use((_req, _res, next) => next(new HttpError(404, 'Not found')));
app.use('/api', api);

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 && !(err instanceof HttpError) ? 'Something went wrong on our side. Please try again.' : err.message,
    fields: err.details,
  });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  console.log(scriptConfigured ? 'Files: Google Drive + Google Sheet (via Apps Script)' : driveConfigured ? 'Files: Google Drive' : `Files: local folder (${path.join(DATA_DIR, 'uploads')}) — Google Drive not configured`);
  console.log(`Excel:  ${path.join(DATA_DIR, 'applications.xlsx')}  (host: ${os.hostname()})`);
  resyncExcel().catch((e) => console.error('[excel] resync failed', e.message));
});
