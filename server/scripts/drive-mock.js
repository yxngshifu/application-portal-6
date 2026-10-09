// Exercises the real Drive request code against a local fake of the Drive v3 API.
import assert from 'node:assert/strict';
import http from 'node:http';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { makeDriveStore } from '../src/storage.js';

const log = [];
const files = new Map(); // id -> {name, parents, trashed, mime, body}
let n = 0;
const server = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString('latin1');
  const u = new URL(req.url, 'http://x');
  log.push(`${req.method} ${u.pathname}${u.search.includes('uploadType') ? '?upload' : ''}`);
  const send = (o, code = 200) => (res.writeHead(code, { 'content-type': 'application/json' }), res.end(JSON.stringify(o)));
  const id = u.pathname.split('/').pop();
  if (req.method === 'GET' && u.pathname === '/drive/v3/files') {
    const q = u.searchParams.get('q');
    const name = /name='([^']+)'/.exec(q)[1];
    const hit = [...files].find(([, f]) => f.name === name && f.folder && !f.trashed);
    return send({ files: hit ? [{ id: hit[0], webViewLink: `https://drive.google.com/drive/folders/${hit[0]}` }] : [] });
  }
  if (req.method === 'POST' && u.pathname === '/drive/v3/files') {
    const j = JSON.parse(body); const fid = `folder${++n}`;
    files.set(fid, { name: j.name, folder: true, parents: j.parents });
    return send({ id: fid, webViewLink: `https://drive.google.com/drive/folders/${fid}` });
  }
  if (req.method === 'POST' && u.pathname === '/upload/drive/v3/files') {
    const meta = JSON.parse(/\r\n\r\n(\{[\s\S]*?\})\r\n--/.exec(body)[1]); const fid = `file${++n}`;
    files.set(fid, { name: meta.name, parents: meta.parents, body });
    return send({ id: fid });
  }
  if (req.method === 'PATCH' && u.pathname.startsWith('/upload/drive/v3/files/')) {
    if (!files.has(id)) return send({ error: { code: 404, message: 'not found' } }, 404);
    files.get(id).body = body; return send({ id });
  }
  if (req.method === 'PATCH' && u.pathname.startsWith('/drive/v3/files/')) {
    if (!files.has(id)) return send({ error: { code: 404, message: 'not found' } }, 404);
    Object.assign(files.get(id), JSON.parse(body)); return send({ id });
  }
  if (req.method === 'GET' && u.searchParams.get('alt') === 'media') { res.writeHead(200); return res.end('FILEDATA'); }
  send({ error: { code: 400, message: `unhandled ${req.method} ${u.pathname}` } }, 400);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

// googleapis hard-codes www.googleapis.com for media uploads, so redirect every request to the fake server.
class RedirectingClient extends OAuth2Client {
  request(opts) {
    const url = String(opts.url).replace('https://www.googleapis.com', `http://localhost:${port}`);
    return super.request({ ...opts, url });
  }
}
const auth = new RedirectingClient();
auth.setCredentials({ access_token: 'fake', expiry_date: Date.now() + 3.6e6 });
const drive = google.drive({ version: 'v3', auth });
const store = makeDriveStore(() => drive, 'PARENT123');

const f1 = await store.ensureFolder('APP-TEST-0001');
assert.equal(f1.folderId, 'folder1'); assert.match(f1.link, /folders\/folder1/);
assert.deepEqual(files.get('folder1').parents, ['PARENT123']);
const f1b = await store.ensureFolder('APP-TEST-0001');
assert.equal(f1b.folderId, 'folder1', 'folder is reused, not duplicated');
console.log('✓ folder named after ID created in parent, reused on second call');

const fid = await store.putFile(f1, '01_passport.pdf', { buffer: Buffer.from('%PDF-hello') }, 'application/pdf');
assert.deepEqual(files.get(fid).parents, ['folder1']); assert.equal(files.get(fid).name, '01_passport.pdf');
assert.match(files.get(fid).body, /%PDF-hello/);
console.log('✓ file uploaded into the folder');

const fid2 = await store.putFile(f1, 'form.docx', { buffer: Buffer.from('v2') }, 'application/x-test', fid);
assert.equal(fid2, fid); assert.match(files.get(fid).body, /v2/);
console.log('✓ existing file updated in place (filled form refresh)');

const fid3 = await store.putFile(f1, 'form.docx', { buffer: Buffer.from('v3') }, 'application/x-test', 'gone-id');
assert.notEqual(fid3, 'gone-id'); assert.equal(files.get(fid3).name, 'form.docx');
console.log('✓ file deleted in Drive is recreated');

await store.remove(f1, fid); assert.equal(files.get(fid).trashed, true);
await store.remove(f1, 'already-gone');
console.log('✓ remove moves to trash; missing file tolerated');

const chunks = []; for await (const c of await store.stream(f1, fid3)) chunks.push(c);
assert.equal(Buffer.concat(chunks).toString(), 'FILEDATA');
console.log('✓ download streams file content');
console.log('\nDRIVE MOCK PASSED\n', log.join('\n '));
server.close();
