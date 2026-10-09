// Authoritative copy of each application: data/records/<ID>.json
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { ID_RE } from './util.js';

const DIR = path.join(DATA_DIR, 'records');
const file = (id) => {
  if (!ID_RE.test(id)) throw new Error('bad id');
  return path.join(DIR, `${id}.json`);
};

export async function initRecords() {
  await fs.mkdir(DIR, { recursive: true });
}

export async function readRecord(id) {
  try {
    return JSON.parse(await fs.readFile(file(id), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export async function writeRecord(rec) {
  const f = file(rec.id);
  const tmp = `${f}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rec, null, 2));
  await fs.rename(tmp, f);
}

export async function listRecords() {
  const names = (await fs.readdir(DIR)).filter((n) => n.endsWith('.json'));
  const out = [];
  for (const n of names) out.push(JSON.parse(await fs.readFile(path.join(DIR, n), 'utf8')));
  return out;
}
