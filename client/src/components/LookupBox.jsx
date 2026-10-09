import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Arrow } from './icons.jsx';

export default function LookupBox({ initial = '', compact }) {
  const [v, setV] = useState(initial);
  const [err, setErr] = useState('');
  const nav = useNavigate();
  function go(e) {
    e.preventDefault();
    const id = v.trim();
    if (id.replace(/[^a-z0-9]/gi, '').length < 11) return setErr('Your ID looks like APP-XXXX-XXXX');
    nav(`/application/${encodeURIComponent(id)}`);
  }
  return (
    <form onSubmit={go} noValidate>
      <label htmlFor="lookup" className="mb-1.5 block text-[13px] font-medium text-stone-700">Application ID</label>
      <div className="flex gap-2">
        <input
          id="lookup" value={v} onChange={(e) => { setV(e.target.value); setErr(''); }}
          placeholder="APP-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false}
          aria-invalid={!!err} aria-describedby={err ? 'lookup-err' : undefined}
          className="input font-mono tracking-wider uppercase"
        />
        <button className="btn-primary shrink-0" type="submit">{compact ? 'Open' : <>Open <Arrow width={16} height={16} /></>}</button>
      </div>
      {err && <p id="lookup-err" role="alert" className="mt-1.5 text-[13px] font-medium text-red-600">{err}</p>}
    </form>
  );
}
