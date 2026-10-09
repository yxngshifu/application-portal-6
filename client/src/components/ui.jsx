import { createContext, useContext } from 'react';
import { REQUIRED } from '@shared/schema.js';

export const FormCtx = createContext(null);
export const useForm = () => useContext(FormCtx);

const REQ = new Set(REQUIRED.map(([p]) => p));
export const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

const Star = () => <span className="ml-0.5 text-brand-600" aria-hidden="true">*</span>;

export function Label({ htmlFor, children, required, hint }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-stone-700">
      {children}
      {required && <Star />}
      {hint && <span className="ml-1.5 font-normal text-muted">{hint}</span>}
    </label>
  );
}

export function FieldError({ id, children }) {
  if (!children) return null;
  return <p id={id} role="alert" className="mt-1.5 text-[13px] font-medium text-red-600">{children}</p>;
}

/** Text-like input bound to a dotted path in the form data. */
export function Input({ path, label, hint, type = 'text', placeholder, multiline, className = '', required, autoComplete }) {
  const { data, errors, set } = useForm();
  const err = errors[path];
  const isReq = required ?? REQ.has(path);
  const props = {
    id: path, name: path, 'data-field': path, className: 'input', value: get(data, path) ?? '',
    onChange: (e) => set(path, e.target.value), placeholder, autoComplete,
    'aria-invalid': !!err, 'aria-describedby': err ? `${path}-err` : undefined, 'aria-required': isReq || undefined,
  };
  return (
    <div className={className}>
      {label && <Label htmlFor={path} required={isReq} hint={hint}>{label}</Label>}
      {multiline ? <textarea rows={2} {...props} /> : <input type={type} {...props} />}
      <FieldError id={`${path}-err`}>{err}</FieldError>
    </div>
  );
}

/** Single-choice pills (a styled radio group). Optional groups can be cleared by clicking again. */
export function Choice({ path, label, options, labels = {}, className = '', required, onPick }) {
  const { data, errors, set } = useForm();
  const cur = get(data, path);
  const err = errors[path];
  const isReq = required ?? REQ.has(path);
  return (
    <fieldset className={className} data-field={path} aria-describedby={err ? `${path}-err` : undefined}>
      {label && <legend className="mb-1.5 text-[13px] font-medium text-stone-700">{label}{isReq && <Star />}</legend>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o} className="cursor-pointer">
            <input
              type="radio" name={path} value={o} checked={cur === o} className="peer sr-only"
              onChange={() => (onPick ? onPick(o) : set(path, o))}
              onClick={() => cur === o && !isReq && set(path, '')}
            />
            <span className="block rounded-lg border border-line bg-white px-3.5 py-2 text-sm text-stone-700 shadow-sm transition select-none hover:border-stone-300 peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:font-semibold peer-checked:text-brand-700 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100">
              {labels[o] ?? o}
            </span>
          </label>
        ))}
      </div>
      <FieldError id={`${path}-err`}>{err}</FieldError>
    </fieldset>
  );
}

export function Check({ path, label, className = '', onToggle }) {
  const { data, set } = useForm();
  const on = !!get(data, path);
  return (
    <label className={`flex cursor-pointer items-start gap-2.5 text-sm text-stone-800 ${className}`}>
      <input
        type="checkbox" checked={on} data-field={path}
        onChange={(e) => (onToggle ? onToggle(e.target.checked) : set(path, e.target.checked))}
        className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-brand-600"
      />
      <span>{label}</span>
    </label>
  );
}

export function Section({ id, no, title, note, children }) {
  return (
    <section id={id} className="card scroll-mt-24 p-5 sm:p-7">
      <header className="mb-5 flex items-baseline gap-3 border-b border-line pb-4">
        <span className="font-display text-2xl font-semibold text-brand-600">{no}</span>
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
          {note && <p className="mt-0.5 text-sm text-muted">{note}</p>}
        </div>
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

export const Grid = ({ cols = 2, children, className = '' }) => (
  <div className={`grid gap-x-5 gap-y-4 ${cols === 3 ? 'sm:grid-cols-3' : cols === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2'} ${className}`}>{children}</div>
);

export const SubHead = ({ children }) => (
  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{children}</h3>
);
