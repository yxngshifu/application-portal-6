import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const pick = (n) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

export const newId = () => `APP-${pick(4)}-${pick(4)}`;
export const ID_RE = /^APP-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

/** Accepts "app k7qx m4td", "APPK7QXM4TD", etc. Returns canonical id or null. */
export function normalizeId(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== 11 || !s.startsWith('APP')) return null;
  const id = `APP-${s.slice(3, 7)}-${s.slice(7)}`;
  return ID_RE.test(id) ? id : null;
}

const chains = new Map();
/** Runs fn after any earlier fn with the same key has finished. */
export function withLock(key, fn) {
  const prev = chains.get(key) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  chains.set(key, tail);
  tail.then(() => chains.get(key) === tail && chains.delete(key));
  return run;
}

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** multer decodes filenames as latin1; recover UTF-8 names (e.g. Chinese). */
export function fixName(name) {
  try {
    if (/[^\u0000-ÿ]/.test(name)) return name;
    const dec = Buffer.from(name, 'latin1').toString('utf8');
    return dec.includes('�') ? name : dec;
  } catch {
    return name;
  }
}

export const safeFileName = (name) =>
  String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';
