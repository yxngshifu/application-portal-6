// Runs the real storage + Sheet-sync code against a fake Apps Script web app (incl. its 302 redirect).
import assert from 'node:assert/strict';
import http from 'node:http';
import { callScript } from '../src/appsscript.js';
import { makeScriptStore } from '../src/storage.js';

const SECRET = 's3cret';
const folders = new Map(), files = new Map(), rows = new Map();
let n = 0;
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/result')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(globalThis.__next); }
  const chunks = []; for await (const c of req) chunks.push(c);
  const b = JSON.parse(Buffer.concat(chunks).toString());
  let out;
  if (b.secret !== SECRET) out = { ok: false, error: 'Unauthorized' };
  else if (b.action === 'ensureFolder') { if (!folders.has(b.id)) folders.set(b.id, `F${++n}`); out = { ok: true, folderId: folders.get(b.id), link: `https://drive/${folders.get(b.id)}` }; }
  else if (b.action === 'putFile') { if (b.fileId) files.delete(b.fileId); const id = `X${++n}`; files.set(id, { folder: b.folderId, name: b.name, mime: b.mime, data: b.data }); out = { ok: true, fileId: id }; }
  else if (b.action === 'removeFile') { files.delete(b.fileId); out = { ok: true }; }
  else if (b.action === 'getFile') out = { ok: true, ...files.get(b.fileId) };
  else if (b.action === 'sheetUpsert') { rows.set(b.values[0], b); out = { ok: true }; }
  globalThis.__next = JSON.stringify(out);
  res.writeHead(302, { location: `http://127.0.0.1:${server.address().port}/result` }); res.end(); // like script.google.com
});
await new Promise((r) => server.listen(0, r));
const cfg = { url: `http://127.0.0.1:${server.address().port}/exec`, secret: SECRET };
const store = makeScriptStore((a, p) => callScript(a, p, cfg));

const folder = { mode: 'script', ...(await store.ensureFolder('APP-AAAA-BBBB')) };
assert.equal((await store.ensureFolder('APP-AAAA-BBBB')).folderId, folder.folderId);
const id1 = await store.putFile(folder, 'APP-AAAA-BBBB_Application_Form.docx', { buffer: Buffer.from('v1') }, 'x/y');
const id2 = await store.putFile(folder, 'APP-AAAA-BBBB_Application_Form.docx', { buffer: Buffer.from('v2') }, 'x/y', id1);
assert.equal(files.size, 1); assert.ok(files.has(id2) && !files.has(id1));
let got = ''; for await (const c of await store.stream(folder, id2)) got += c;
assert.equal(got, 'v2');
await store.remove(folder, id2); assert.equal(files.size, 0);
await callScript('sheetUpsert', { headers: ['Application ID'], values: ['APP-AAAA-BBBB'] }, cfg);
assert.ok(rows.has('APP-AAAA-BBBB'));
await assert.rejects(callScript('ensureFolder', { id: 'x' }, { ...cfg, secret: 'bad' }), /Unauthorized/);
console.log('script mock OK'); server.close();
