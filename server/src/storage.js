// File storage per application: Google Drive folder named after the ID,
// or (when Drive isn't configured) a local folder data/uploads/<ID>.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { DATA_DIR, driveConfigured, googleCfg, scriptConfigured } from './config.js';
import { callScript } from './appsscript.js';
import { HttpError } from './util.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export { DOCX_MIME };

// ------------------------------------------------------------------- local
const LOCAL_ROOT = path.join(DATA_DIR, 'uploads');
const localDir = (folderId) => path.join(LOCAL_ROOT, path.basename(folderId));

const local = {
  mode: 'local',
  async ensureFolder(id) {
    await fsp.mkdir(localDir(id), { recursive: true });
    return { folderId: id, link: '' };
  },
  async putFile(folder, name, { path: src, buffer }, _mime, existingId) {
    const dest = path.join(localDir(folder.folderId), path.basename(existingId || name));
    if (buffer) await fsp.writeFile(dest, buffer);
    else await fsp.copyFile(src, dest);
    return path.basename(dest);
  },
  async remove(folder, storeId) {
    await fsp.rm(path.join(localDir(folder.folderId), path.basename(storeId)), { force: true });
  },
  async stream(folder, storeId) {
    return fs.createReadStream(path.join(localDir(folder.folderId), path.basename(storeId)));
  },
};

// ------------------------------------------------------------------- drive
let driveClient;
function realDrive() {
  if (driveClient) return driveClient;
  let auth;
  if (googleCfg.serviceAccountFile) {
    auth = new google.auth.GoogleAuth({
      keyFile: googleCfg.serviceAccountFile,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
  } else {
    auth = new google.auth.OAuth2(googleCfg.clientId, googleCfg.clientSecret);
    auth.setCredentials({ refresh_token: googleCfg.refreshToken });
  }
  return (driveClient = google.drive({ version: 'v3', auth }));
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** `getDrive` is injectable so the request code can be tested against a fake Drive API. */
export function makeDriveStore(getDrive, parentFolderId) {
  return {
    mode: 'drive',
    async ensureFolder(id) {
      const d = getDrive();
      const parent = parentFolderId || 'root';
      const q = `name='${esc(id)}' and mimeType='application/vnd.google-apps.folder' and '${esc(parent)}' in parents and trashed=false`;
      const found = await d.files.list({ q, fields: 'files(id,webViewLink)', pageSize: 1, supportsAllDrives: true, includeItemsFromAllDrives: true });
      if (found.data.files?.length) {
        const f = found.data.files[0];
        return { folderId: f.id, link: f.webViewLink };
      }
      const made = await d.files.create({
        requestBody: { name: id, mimeType: 'application/vnd.google-apps.folder', parents: [parent] },
        fields: 'id,webViewLink',
        supportsAllDrives: true,
      });
      return { folderId: made.data.id, link: made.data.webViewLink };
    },
    async putFile(folder, name, { path: src, buffer }, mime, existingId) {
      const d = getDrive();
      const body = () => (buffer ? Readable.from(buffer) : fs.createReadStream(src));
      if (existingId) {
        try {
          const r = await d.files.update({ fileId: existingId, media: { mimeType: mime, body: body() }, fields: 'id', supportsAllDrives: true });
          return r.data.id;
        } catch (e) {
          if (e.code !== 404) throw e; // deleted manually in Drive: fall through and recreate
        }
      }
      const r = await d.files.create({
        requestBody: { name, parents: [folder.folderId] },
        media: { mimeType: mime, body: body() },
        fields: 'id',
        supportsAllDrives: true,
      });
      return r.data.id;
    },
    async remove(_folder, fileId) {
      // Move to Drive's trash (recoverable) instead of deleting for good.
      try {
        await getDrive().files.update({ fileId, requestBody: { trashed: true }, supportsAllDrives: true });
      } catch (e) {
        if (e.code !== 404) throw e;
      }
    },
    async stream(_folder, fileId) {
      const r = await getDrive().files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
      return r.data;
    },
  };
}

const gdrive = makeDriveStore(realDrive, googleCfg.parentFolderId);

// ------------------------------------------------------------------ script
/** Drive via the Apps Script web app (apps-script/Code.gs). `call` is injectable for tests. */
export function makeScriptStore(call = callScript) {
  return {
    mode: 'script',
    async ensureFolder(id) {
      const r = await call('ensureFolder', { id });
      return { folderId: r.folderId, link: r.link };
    },
    async putFile(folder, name, { path: src, buffer }, mime, existingId) {
      const bytes = buffer || (await fsp.readFile(src));
      const r = await call('putFile', {
        folderId: folder.folderId, name, mime, data: bytes.toString('base64'), fileId: existingId || undefined,
      });
      return r.fileId;
    },
    async remove(_folder, fileId) {
      await call('removeFile', { fileId });
    },
    async stream(_folder, fileId) {
      const r = await call('getFile', { fileId });
      return Readable.from(Buffer.from(r.data, 'base64'));
    },
  };
}
const script = makeScriptStore();

export const defaultStore = () => (scriptConfigured ? script : driveConfigured ? gdrive : local);
export function storeFor(mode) {
  if (mode === 'local') return local;
  if (mode === 'script') {
    if (!scriptConfigured) throw new HttpError(503, 'The Google Apps Script bridge is not configured on the server');
    return script;
  }
  if (!driveConfigured) throw new HttpError(503, 'Google Drive is not configured on the server');
  return gdrive;
}
