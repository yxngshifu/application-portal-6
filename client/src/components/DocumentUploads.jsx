import { useRef, useState } from 'react';
import { DOCUMENTS, FILE_RULES, maxFiles } from '@shared/schema.js';
import { fileUrl } from '../lib/api.js';
import { Check, Download, FileIcon, Plus, Refresh, Trash, Undo, Upload } from './icons.jsx';

const ext = (n) => n.slice(n.lastIndexOf('.')).toLowerCase();
const size = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

export function checkFile(doc, file) {
  const e = ext(file.name);
  if (!FILE_RULES.extensions.includes(e)) return `"${file.name}" is not allowed. Use PDF, JPG, PNG, DOC or DOCX.`;
  if (doc.imageOnly && !FILE_RULES.imageExtensions.includes(e)) return 'The photograph must be a JPG or PNG image.';
  if (file.size > FILE_RULES.maxBytes) return `"${file.name}" is larger than ${FILE_RULES.maxBytes / 1024 / 1024} MB.`;
  if (file.size === 0) return `"${file.name}" is empty.`;
  return null;
}

export default function DocumentUploads({ appId, existing, pending, removed, setPending, setRemoved }) {
  const [problems, setProblems] = useState({});
  const [drag, setDrag] = useState(null);
  const addInput = useRef(null);
  const target = useRef(null); // { category, replaceId? }

  const note = (cat, msg) => setProblems((p) => ({ ...p, [cat]: msg }));

  function accept(doc, fileList, replaceId) {
    const files = [...fileList];
    if (!files.length) return;
    const bad = files.map((f) => checkFile(doc, f)).find(Boolean);
    if (bad) return note(doc.key, bad);
    const kept = existing.filter((f) => f.category === doc.key && !removed.has(f.id) && f.id !== replaceId).length;
    const inCat = pending.filter((p) => p.category === doc.key).length;
    if (kept + inCat + files.length > maxFiles(doc))
      return note(doc.key, `You can attach at most ${maxFiles(doc)} file${maxFiles(doc) > 1 ? 's' : ''} here. Remove or replace one instead.`);
    note(doc.key, '');
    setPending((p) => [...p, ...files.map((file) => ({ key: crypto.randomUUID(), category: doc.key, file, replaces: replaceId }))]);
    if (replaceId) setRemoved((r) => new Set(r).add(replaceId));
  }

  const open = (category, replaceId) => {
    target.current = { category, replaceId };
    addInput.current.value = '';
    addInput.current.click();
  };

  return (
    <div className="space-y-3">
      <input
        ref={addInput} type="file" multiple className="sr-only" tabIndex={-1}
        accept={FILE_RULES.extensions.join(',')}
        onChange={(e) => {
          const t = target.current;
          if (t) accept(DOCUMENTS.find((d) => d.key === t.category), e.target.files, t.replaceId);
        }}
      />
      {DOCUMENTS.map((doc) => {
        const mine = existing.filter((f) => f.category === doc.key);
        const newOnes = pending.filter((p) => p.category === doc.key);
        const count = mine.filter((f) => !removed.has(f.id)).length + newOnes.length;
        const need = doc.min || 1;
        const done = count >= need;
        const full = count >= maxFiles(doc);
        return (
          <div
            key={doc.key}
            onDragOver={(e) => { e.preventDefault(); setDrag(doc.key); }}
            onDragLeave={() => setDrag(null)}
            onDrop={(e) => { e.preventDefault(); setDrag(null); accept(doc, e.dataTransfer.files); }}
            className={`rounded-xl border p-4 transition ${drag === doc.key ? 'border-brand-500 bg-brand-50' : done ? 'border-emerald-200 bg-emerald-50/40' : 'border-line bg-white'}`}
          >
            <div className="flex flex-wrap items-start gap-3">
              <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600'}`}>
                {done ? <Check width={15} height={15} /> : doc.no}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">
                  {doc.label}
                  <span className={`ml-2 rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold ${doc.required ? 'bg-brand-50 text-brand-700' : 'bg-stone-100 text-stone-500'}`}>
                    {doc.required ? 'Required' : 'If applicable'}
                  </span>
                </p>
                {doc.hint && <p className="mt-0.5 text-[13px] text-muted">{doc.hint}</p>}
                {doc.min > 1 && <p className="mt-0.5 text-[13px] text-muted">{Math.min(count, doc.min)} of {doc.min} uploaded</p>}
              </div>
              {!full && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => open(doc.key)}>
                  <Plus width={15} height={15} /> {count ? 'Add another' : 'Add file'}
                </button>
              )}
            </div>

            {(mine.length > 0 || newOnes.length > 0) && (
              <ul className="mt-3 space-y-1.5 pl-10">
                {mine.map((f) => {
                  const gone = removed.has(f.id);
                  return (
                    <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white/70 px-3 py-2 text-sm ring-1 ring-line">
                      <FileIcon className="shrink-0 text-stone-400" />
                      <span className={`min-w-0 flex-1 truncate ${gone ? 'text-stone-400 line-through' : ''}`}>{f.name}</span>
                      <span className="text-xs text-muted">{size(f.size)}</span>
                      {gone ? (
                        <button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => setRemoved((r) => { const n = new Set(r); n.delete(f.id); return n; })}>
                          <Undo width={13} height={13} className="mr-1 inline" />Undo
                        </button>
                      ) : (
                        <span className="flex items-center gap-3 text-xs font-semibold">
                          <a className="text-stone-600 hover:text-brand-700" href={fileUrl(appId, f.id)} aria-label={`Download ${f.name}`}><Download width={14} height={14} className="inline" /></a>
                          <button type="button" className="text-stone-600 hover:text-brand-700" onClick={() => open(doc.key, f.id)}><Refresh width={13} height={13} className="mr-1 inline" />Replace</button>
                          <button type="button" className="text-stone-600 hover:text-red-600" onClick={() => setRemoved((r) => new Set(r).add(f.id))}><Trash width={13} height={13} className="mr-1 inline" />Remove</button>
                        </span>
                      )}
                    </li>
                  );
                })}
                {newOnes.map((p) => (
                  <li key={p.key} className="flex items-center gap-3 rounded-lg bg-brand-50/60 px-3 py-2 text-sm ring-1 ring-brand-100">
                    <Upload className="shrink-0 text-brand-600" />
                    <span className="min-w-0 flex-1 truncate">{p.file.name}</span>
                    <span className="text-xs text-muted">{size(p.file.size)}</span>
                    <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{p.replaces ? 'Replaces' : 'New'}</span>
                    <button
                      type="button" className="text-xs font-semibold text-stone-600 hover:text-red-600"
                      onClick={() => {
                        setPending((l) => l.filter((x) => x.key !== p.key));
                        if (p.replaces) setRemoved((r) => { const n = new Set(r); n.delete(p.replaces); return n; });
                      }}
                    >
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {problems[doc.key] && <p role="alert" className="mt-2 pl-10 text-[13px] font-medium text-red-600">{problems[doc.key]}</p>}
          </div>
        );
      })}
      <p className="pt-1 text-[13px] text-muted">
        PDF, JPG, PNG, DOC or DOCX, up to {FILE_RULES.maxBytes / 1024 / 1024} MB each. You can drag files onto a document, and you can come back with your ID to add or replace files at any time.
        {' '}* All certificates or diplomas issued in a third language should be notarized in Chinese or English editions.
      </p>
    </div>
  );
}
