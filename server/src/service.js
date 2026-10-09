import fs from 'node:fs/promises';
import {
  DOCUMENTS, FILE_RULES, maxFiles, sanitizeApplication, validateApplication,
} from '../../shared/schema.js';
import { buildFormDocx } from './docx.js';
import { rowFor, upsertRow } from './excel.js';
import { callScript } from './appsscript.js';
import { scriptConfigured } from './config.js';
import { listRecords, readRecord, writeRecord } from './records.js';
import { DOCX_MIME, defaultStore, storeFor } from './storage.js';
import { HttpError, newId, safeFileName, withLock } from './util.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const DOC = Object.fromEntries(DOCUMENTS.map((d) => [d.key, d]));
const MAGIC = {
  '.pdf': [[0x25, 0x50, 0x44, 0x46]],
  '.jpg': [[0xff, 0xd8, 0xff]],
  '.jpeg': [[0xff, 0xd8, 0xff]],
  '.png': [[0x89, 0x50, 0x4e, 0x47]],
  '.docx': [[0x50, 0x4b]],
  '.doc': [[0xd0, 0xcf, 0x11, 0xe0]],
};
const MIME = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.doc': 'application/msword', '.docx': DOCX_MIME };

const formName = (id) => `${id}_Application_Form.docx`;

/** Verifies extension, size and file signature of each upload. */
async function checkUpload(f) {
  const ext = path.extname(f.name).toLowerCase();
  const doc = DOC[f.category];
  if (!doc) throw new HttpError(400, `Unknown document category "${f.category}"`);
  if (!FILE_RULES.extensions.includes(ext)) throw new HttpError(400, `"${f.name}": only PDF, JPG, PNG, DOC and DOCX files are accepted`);
  if (doc.imageOnly && !FILE_RULES.imageExtensions.includes(ext)) throw new HttpError(400, `"${f.name}": the photograph must be a JPG or PNG image`);
  const fh = await fs.open(f.path, 'r');
  try {
    const buf = Buffer.alloc(8);
    await fh.read(buf, 0, 8, 0);
    if (!MAGIC[ext].some((sig) => sig.every((b, i) => buf[i] === b)))
      throw new HttpError(400, `"${f.name}" does not look like a valid ${ext.slice(1).toUpperCase()} file`);
  } finally {
    await fh.close();
  }
  return { ext, mime: MIME[ext] };
}

function uniqueName(rec, category, original) {
  const doc = DOC[category];
  const base = `${String(doc.no).padStart(2, '0')}_${safeFileName(original)}`;
  const taken = new Set(rec.files.map((f) => f.storeName));
  if (!taken.has(base)) return base;
  const ext = path.extname(base);
  for (let n = 2; ; n++) {
    const cand = `${base.slice(0, base.length - ext.length)} (${n})${ext}`;
    if (!taken.has(cand)) return cand;
  }
}

async function addUploads(rec, store, uploads) {
  const added = [];
  for (const u of uploads) {
    const { mime } = await checkUpload(u);
    const storeName = uniqueName(rec, u.category, u.name);
    const storeId = await store.putFile(rec.storage, storeName, { path: u.path }, mime);
    const file = {
      id: randomUUID(), category: u.category, name: u.name, storeName, storeId,
      size: u.size, mime, uploadedAt: new Date().toISOString(),
    };
    rec.files.push(file);
    added.push(file);
  }
  return added;
}

function checkCounts(rec) {
  for (const doc of DOCUMENTS) {
    const n = rec.files.filter((f) => f.category === doc.key).length;
    if (n > maxFiles(doc)) throw new HttpError(400, `"${doc.label.split(' (')[0]}" accepts at most ${maxFiles(doc)} file(s). Remove one first.`);
  }
}

async function publishForm(rec, store) {
  const buf = await buildFormDocx(rec.data);
  rec.formFileId = await store.putFile(rec.storage, formName(rec.id), { buffer: buf }, DOCX_MIME, rec.formFileId);
}

async function syncExcel(rec) {
  try {
    await upsertRow(rec);
    rec.excelSynced = true;
  } catch (e) {
    rec.excelSynced = false;
    console.error(`[excel] could not write row for ${rec.id}:`, e.message);
  }
  if (scriptConfigured) {
    try {
      await callScript('sheetUpsert', rowFor(rec));
      rec.sheetSynced = true;
    } catch (e) {
      rec.sheetSynced = false;
      console.error(`[sheet] could not write Google Sheet row for ${rec.id}:`, e.message);
    }
  }
  await writeRecord(rec);
}

export const publicView = (rec) => ({
  id: rec.id,
  createdAt: rec.createdAt,
  updatedAt: rec.updatedAt,
  data: rec.data,
  files: rec.files.map(({ id, category, name, size, uploadedAt }) => ({ id, category, name, size, uploadedAt })),
  storageMode: rec.storage.mode,
});

function parseData(raw) {
  let obj;
  try { obj = JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid form data'); }
  const data = sanitizeApplication(obj);
  const errors = validateApplication(data);
  if (Object.keys(errors).length) throw new HttpError(422, 'Please correct the highlighted fields', errors);
  return data;
}

export async function createApplication(rawData, uploads) {
  const data = parseData(rawData);
  for (const u of uploads) await checkUpload(u); // fail early, before creating anything
  let id;
  do { id = newId(); } while (await readRecord(id));

  return withLock(id, async () => {
    const store = defaultStore();
    const now = new Date().toISOString();
    const rec = {
      id, createdAt: now, updatedAt: now, data, files: [], formFileId: null, excelSynced: false,
      storage: { mode: store.mode, ...(await store.ensureFolder(id)) },
    };
    try {
      checkCounts({ files: uploads.map((u) => ({ category: u.category })) });
      await addUploads(rec, store, uploads);
      await publishForm(rec, store);
    } catch (e) {
      // Persist what we have so nothing uploaded is orphaned; the user can retry via their ID.
      await writeRecord(rec);
      throw e instanceof HttpError ? e : new HttpError(502, `Storage error: ${e.message}`);
    }
    await writeRecord(rec);
    await syncExcel(rec);
    return rec;
  });
}

export async function updateApplication(id, rawData, uploads, removeIds) {
  const data = parseData(rawData);
  for (const u of uploads) await checkUpload(u);
  return withLock(id, async () => {
    const rec = await readRecord(id);
    if (!rec) throw new HttpError(404, 'Application not found');
    const store = storeFor(rec.storage.mode);
    {
      // validate the resulting file set before touching storage
      const left = rec.files.filter((f) => !removeIds.includes(f.id));
      checkCounts({ files: [...left, ...uploads.map((u) => ({ category: u.category }))] });
    }
    try {
      for (const fid of removeIds) {
        const i = rec.files.findIndex((f) => f.id === fid);
        if (i < 0) continue;
        await store.remove(rec.storage, rec.files[i].storeId);
        rec.files.splice(i, 1);
      }
      await addUploads(rec, store, uploads);
      rec.data = data;
      rec.updatedAt = new Date().toISOString();
      await publishForm(rec, store);
    } catch (e) {
      await writeRecord(rec);
      await syncExcel(rec);
      throw e instanceof HttpError ? e : new HttpError(502, `Storage error: ${e.message}`);
    }
    await writeRecord(rec);
    await syncExcel(rec);
    return rec;
  });
}

export async function getRecord(id) {
  const rec = await readRecord(id);
  if (!rec) throw new HttpError(404, 'We could not find an application with that ID');
  return rec;
}

export const formDocx = async (rec) => ({ name: formName(rec.id), buffer: await buildFormDocx(rec.data) });

export async function openFile(rec, fileId) {
  const f = rec.files.find((x) => x.id === fileId);
  if (!f) throw new HttpError(404, 'File not found');
  return { file: f, stream: await storeFor(rec.storage.mode).stream(rec.storage, f.storeId) };
}

/** On boot: retry Excel rows that failed (e.g. workbook was open in Excel). */
export async function resyncExcel() {
  for (const rec of await listRecords()) {
    if (!rec.excelSynced || (scriptConfigured && rec.sheetSynced === false)) await withLock(rec.id, async () => syncExcel(await readRecord(rec.id)));
  }
}
