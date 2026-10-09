/* ═══════════════════════════════════════════════════════════════════════════
   25CONSULTANCY — GOOGLE DRIVE + SHEET BRIDGE (Apps Script web app)

   The Node server (server/src/appsscript.js) calls this script so that every
   application is saved into YOUR Drive and YOUR Google Sheet:

     Sheet FILE : "Applicant Data"  (SHEET_ID below), tab "Applications"
     Drive      : PARENT_FOLDER_ID / <APPLICATION_ID> / uploaded files + <ID>_Application_Form.docx

   Actions (POST, JSON text body, every call must carry the shared "secret"):
     ensureFolder { id }                          → { folderId, link }
     putFile      { folderId, name, mime, data, fileId? } → { fileId }   (data = base64; fileId = copy to replace)
     removeFile   { fileId }                      → move to Drive trash
     getFile      { fileId }                      → { name, mime, data }
     sheetUpsert  { headers, values }             → insert / update the row whose first cell is the application ID

   DEPLOY: Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
   Copy the /exec URL into APPS_SCRIPT_URL in the server's .env (SECRET below goes in APPS_SCRIPT_SECRET).
   After editing this file, use Deploy → Manage deployments → Edit → New version.
   ═══════════════════════════════════════════════════════════════════════════ */

const SHEET_ID         = '1tiEGZFb0Ktqavsjh4RnAL0ckQJ8KTLNfB4Udsxd0ZvQ';
const PARENT_FOLDER_ID = '1-icJGxnOqVK9oLaKpDFRtx4HlaEvHP73';
const SHEET_NAME       = 'Applications';
const SECRET           = '546d9dfac962acf862732e468ca72a603729c27d40d941f1';   // must equal APPS_SCRIPT_SECRET in the server's .env

const ID_RE          = /^APP-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;   // must match server/src/util.js
const MAX_FILE_BYTES = 16 * 1024 * 1024;                              // server limit is 15 MB per file

/* ───────────────────────────── entry points ───────────────────────────── */

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse(e.postData.contents);
    if (!body || body.secret !== SECRET) throw fail('Unauthorized', 'UNAUTHORIZED');
    lock.waitLock(30000);                       // serialise writes: no duplicate rows / folders
    switch (body.action) {
      case 'ensureFolder': return json(ensureFolder(body));
      case 'putFile':      return json(putFile(body));
      case 'removeFile':   return json(removeFile(body));
      case 'getFile':      return json(getFile(body));
      case 'sheetUpsert':  return json(sheetUpsert(body));
      default: throw fail('Unknown action');
    }
  } catch (err) {
    return json({ ok: false, error: String(err.message || err), code: err.code || 'ERROR' });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// Open the /exec URL in a browser to check the deployment is live.
function doGet() { return json({ ok: true, service: '25consultancy-application-bridge' }); }

/* ───────────────────────────── actions ───────────────────────────── */

function ensureFolder(body) {
  if (typeof body.id !== 'string' || !ID_RE.test(body.id)) throw fail('Invalid application ID', 'BAD_ID');
  const parent = DriveApp.getFolderById(PARENT_FOLDER_ID);
  const it = parent.getFoldersByName(body.id);
  const folder = it.hasNext() ? it.next() : parent.createFolder(body.id);
  return { ok: true, folderId: folder.getId(), link: folder.getUrl() };
}

function putFile(body) {
  const folder = folderInTree(body.folderId);
  const name = safeName(body.name);
  if (typeof body.data !== 'string' || !body.data) throw fail('Empty file');
  const bytes = Utilities.base64Decode(body.data);
  if (bytes.length > MAX_FILE_BYTES) throw fail('File too large');
  if (body.fileId) trash(body.fileId);          // replacing the filled form: old copy goes to the trash
  const file = folder.createFile(Utilities.newBlob(bytes, body.mime || 'application/octet-stream', name));
  return { ok: true, fileId: file.getId() };
}

function removeFile(body) {
  trash(body.fileId);
  return { ok: true };
}

function getFile(body) {
  const file = fileInTree(body.fileId);
  const blob = file.getBlob();
  return { ok: true, name: file.getName(), mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

function sheetUpsert(body) {
  const headers = body.headers, values = body.values;
  if (!Array.isArray(headers) || !Array.isArray(values) || headers.length !== values.length) throw fail('Bad row');
  if (typeof values[0] !== 'string' || !ID_RE.test(values[0])) throw fail('Invalid application ID', 'BAD_ID');

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  const head = sheet.getRange(1, 1, 1, headers.length);
  head.setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);

  var target = -1;
  const last = sheet.getLastRow();
  if (last >= 2) {
    const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === values[0]) { target = i + 2; break; }
  }
  if (target === -1) target = Math.max(last, 1) + 1;

  // Everything is stored as text: keeps "2026.09", "00123", "+234…" intact and stops values
  // starting with = + - @ from being run as formulas.
  const cells = values.map(function (v) { return v === null || v === undefined ? '' : String(v).slice(0, 49000); });
  const range = sheet.getRange(target, 1, 1, cells.length);
  range.setNumberFormat('@');
  range.setValues([cells]);
  range.setVerticalAlignment('top').setWrap(true);
  return { ok: true, rowNumber: target };
}

/* ───────────────────────────── helpers ───────────────────────────── */

function fail(message, code) { const e = new Error(message); e.code = code || 'ERROR'; return e; }
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function safeName(n) { return String(n || 'file').replace(/[\\\/:*?"<>|\r\n]/g, '_').slice(0, 150); }

// Only ever touch folders / files that live inside the application parent folder.
function isDirectChildOf(item, folderId) {
  const it = item.getParents();
  while (it.hasNext()) if (it.next().getId() === folderId) return true;
  return false;
}
function folderInTree(folderId) {
  if (!folderId) throw fail('Missing folder');
  const folder = DriveApp.getFolderById(folderId);
  if (!isDirectChildOf(folder, PARENT_FOLDER_ID)) throw fail('Folder is outside the application folder', 'FORBIDDEN');
  return folder;
}
function fileInTree(fileId) {
  if (!fileId) throw fail('Missing file');
  const file = DriveApp.getFileById(fileId);
  const it = file.getParents();
  while (it.hasNext()) if (isDirectChildOf(it.next(), PARENT_FOLDER_ID)) return file;
  throw fail('File is outside the application folder', 'FORBIDDEN');
}
function trash(fileId) {
  try { fileInTree(fileId).setTrashed(true); }
  catch (e) { if (e.code === 'FORBIDDEN') throw e; /* already deleted in Drive */ }
}
