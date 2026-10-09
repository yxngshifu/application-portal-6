import { useState } from 'react';
import { Link } from 'react-router-dom';
import { missingDocuments } from '@shared/schema.js';
import { formUrl } from '../lib/api.js';
import { Check, Copy, Download } from './icons.jsx';

export default function SuccessPanel({ rec }) {
  const [copied, setCopied] = useState(false);
  const counts = {};
  rec.files.forEach((f) => (counts[f.category] = (counts[f.category] || 0) + 1));
  const missing = missingDocuments(counts);
  async function copy() {
    try { await navigator.clipboard.writeText(rec.id); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* select manually */ }
  }
  return (
    <div className="card mx-auto max-w-2xl p-6 text-center sm:p-10" role="status">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check width={28} height={28} strokeWidth={2.5} /></div>
      <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight">Application received</h2>
      <p className="mt-2 text-muted">Your information has been recorded and your documents are saved in your personal folder.</p>

      <div className="mt-7 rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/60 px-4 py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Your application ID</p>
        <p className="mt-2 select-all break-all font-mono text-3xl font-bold tracking-widest text-ink sm:text-4xl">{rec.id}</p>
        <button type="button" onClick={copy} className="btn-ghost btn-sm mt-4"><Copy width={15} height={15} />{copied ? 'Copied' : 'Copy ID'}</button>
      </div>
      <p className="mt-4 text-sm font-medium text-red-700">Keep this ID safe. It is the only way to return and edit your application, and it cannot be recovered if lost.</p>

      {missing.length > 0 && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900">
          <p className="font-semibold">Documents still to upload:</p>
          <ul className="mt-1 list-inside list-disc">{missing.map((d) => <li key={d.key}>{d.no}. {d.label.split(' (')[0]}</li>)}</ul>
        </div>
      )}

      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <a className="btn-primary" href={formUrl(rec.id)}><Download width={16} height={16} /> Download your filled form</a>
        <Link className="btn-ghost" to={`/application/${rec.id}`}>View or edit my application</Link>
      </div>
      <p className="mx-auto mt-5 max-w-md text-[13px] text-muted">Print the downloaded form, sign and date it at the bottom. The application is not valid without your signature.</p>
    </div>
  );
}
