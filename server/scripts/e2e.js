// End-to-end API test against a running server (npm run dev -w server).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { sample } from './sample.js';
import { DATA_DIR } from '../src/config.js';

const BASE = process.env.BASE || 'http://localhost:3001/api';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

const form = (data, files = [], remove) => {
  const fd = new FormData();
  fd.set('data', JSON.stringify(data));
  if (remove) fd.set('removeFiles', JSON.stringify(remove));
  for (const [cat, name, buf, type] of files) fd.append(`doc__${cat}`, new Blob([buf], { type }), name);
  return fd;
};
const json = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });
const rows = async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(DATA_DIR, 'applications.xlsx'));
  const ws = wb.getWorksheet('Applications');
  const head = ws.getRow(1).values.slice(1);
  const out = [];
  ws.eachRow((r, n) => n > 1 && out.push(Object.fromEntries(head.map((h, i) => [h, r.values[i + 1]]))));
  return out;
};

// 1. validation rejects an incomplete form
let r = await json(await fetch(`${BASE}/applications`, { method: 'POST', body: form({ surname: 'x' }) }));
assert.equal(r.status, 422); assert.ok(r.body.fields.givenName);
console.log('✓ incomplete form rejected with field errors');

// 2. bad file type / signature rejected
r = await json(await fetch(`${BASE}/applications`, { method: 'POST', body: form(sample(), [['passport', 'evil.exe', PDF, 'application/pdf']]) }));
assert.equal(r.status, 400);
r = await json(await fetch(`${BASE}/applications`, { method: 'POST', body: form(sample(), [['passport', 'fake.pdf', Buffer.from('MZ not a pdf'), 'application/pdf']]) }));
assert.equal(r.status, 400);
console.log('✓ wrong extension / fake signature rejected');

// 3. create
const before = (await rows().catch(() => [])).length;
r = await json(await fetch(`${BASE}/applications`, { method: 'POST', body: form(sample(), [
  ['passport', 'passport.pdf', PDF, 'application/pdf'],
  ['photo', 'photo.png', PNG, 'image/png'],
  ['recommendations', 'letter1.pdf', PDF, 'application/pdf'],
  ['recommendations', 'letter2.pdf', PDF, 'application/pdf'],
]) }));
assert.equal(r.status, 201, JSON.stringify(r.body));
const { id } = r.body;
assert.match(id, /^APP-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
assert.equal(r.body.files.length, 4);
console.log('✓ created', id);

// 4. excel row + folder + exported form
let all = await rows();
assert.equal(all.length, before + 1);
const row = all.find((x) => x['Application ID'] === id);
assert.equal(row['Surname'], 'ADEBAYO');
assert.match(row['Doc 5: Two recommendation letters from professors in the same academic field'].toString(), /letter1[\s\S]*letter2/);
assert.match(row['Missing Required Documents'], /Highest diploma/);
const dir = path.join(DATA_DIR, 'uploads', id);
assert.ok(fs.existsSync(path.join(dir, `${id}_Application_Form.docx`)), 'form exported to folder');
assert.equal(fs.readdirSync(dir).length, 5);
console.log('✓ excel row written, folder created with 4 files + filled form');

// 5. fetch by id (messy input) and edit
const messy = id.toLowerCase().replace('-', ' ');
r = await json(await fetch(`${BASE}/applications/${encodeURIComponent(messy)}`));
assert.equal(r.status, 200); assert.equal(r.body.data.surname, 'ADEBAYO');
const edited = { ...r.body.data, surname: 'ADEBAYO-OKAFOR', hsk: 'HSK5' };
const passportId = r.body.files.find((f) => f.category === 'passport').id;
r = await json(await fetch(`${BASE}/applications/${id}`, { method: 'PUT', body: form(edited,
  [['passport', 'passport-new.pdf', PDF, 'application/pdf'], ['diploma', 'diploma.pdf', PDF, 'application/pdf']], [passportId]) }));
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.deepEqual(r.body.files.map((f) => f.name).sort(), ['diploma.pdf', 'letter1.pdf', 'letter2.pdf', 'passport-new.pdf', 'photo.png']);
console.log('✓ edit: info changed, passport replaced, diploma added');

all = await rows();
assert.equal(all.length, before + 1, 'row updated in place, not duplicated');
assert.equal(all.find((x) => x['Application ID'] === id)['Surname'], 'ADEBAYO-OKAFOR');
assert.equal(fs.readdirSync(dir).length, 6); // 5 files + form
assert.ok(!fs.readdirSync(dir).some((n) => n.includes('passport.pdf')), 'old passport removed');
console.log('✓ excel row updated in place; old file removed from folder');

// 6. exported docx + file download
const d = await fetch(`${BASE}/applications/${id}/form.docx`);
assert.equal(d.status, 200);
assert.ok((await d.arrayBuffer()).byteLength > 10_000);
const f = await fetch(`${BASE}/applications/${id}/files/${r.body.files[0].id}`);
assert.equal(f.status, 200);
console.log('✓ docx export + file download');

// 7. unknown id
r = await json(await fetch(`${BASE}/applications/APP-ZZZZ-ZZZZ`)); assert.equal(r.status, 404);
r = await json(await fetch(`${BASE}/applications/..%2F..%2Fetc`)); assert.equal(r.status, 404);
console.log('✓ unknown / malformed ids → 404');
console.log('\nALL PASSED —', id);
