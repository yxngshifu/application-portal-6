import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ApplicationForm from '../components/ApplicationForm.jsx';
import LookupBox from '../components/LookupBox.jsx';
import Shell from '../components/Shell.jsx';
import { Download } from '../components/icons.jsx';
import { formUrl, getApplication } from '../lib/api.js';

export default function Edit() {
  const { id: param } = useParams();
  const [rec, setRec] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let live = true;
    setRec(null); setError(''); setSaved(null);
    getApplication(param).then((r) => live && setRec(r)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [param]);

  return (
    <Shell>
      <div className="mx-auto max-w-4xl px-4 py-8 pb-24">
        <Link to="/" className="text-sm font-medium text-muted hover:text-ink">← Back to home</Link>

        {!rec && !error && <p className="mt-10 text-center text-muted" role="status">Loading your application…</p>}

        {error && (
          <div className="card mx-auto mt-8 max-w-md p-6">
            <h1 className="font-display text-2xl font-semibold">We couldn't open that application</h1>
            <p className="mb-5 mt-2 text-sm text-red-700" role="alert">{error}</p>
            <LookupBox initial={param} />
          </div>
        )}

        {rec && (
          <>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Editing your application</p>
                <h1 className="mt-1 font-mono text-3xl font-bold tracking-widest">{rec.id}</h1>
                <p className="mt-1 text-sm text-muted">
                  Submitted {new Date(rec.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })} · Last saved {new Date(saved?.updatedAt || rec.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
              <a className="btn-ghost" href={`${formUrl(rec.id)}?v=${rev}`}><Download width={16} height={16} /> Download filled form</a>
            </div>

            {saved && (
              <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                Changes saved. Your filled form and records have been updated.
              </p>
            )}

            <div className="mt-6">
              <ApplicationForm
                key={`${rec.id}-${rev}`} appId={rec.id} initial={rec.data} existingFiles={rec.files}
                onSaved={(r) => { setSaved(r); setRec(r); setRev((n) => n + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              />
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
