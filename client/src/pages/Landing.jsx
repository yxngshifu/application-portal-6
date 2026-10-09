import { useState } from 'react';
import ApplicationForm, { NAV } from '../components/ApplicationForm.jsx';
import LookupBox from '../components/LookupBox.jsx';
import SuccessPanel from '../components/SuccessPanel.jsx';
import { Arrow } from '../components/icons.jsx';
import Shell from '../components/Shell.jsx';

const STEPS = [
  ['Fill in the form', 'Seven short sections that follow the official application form.'],
  ['Upload your documents', 'Passport, certificates, transcripts and more. Add the rest later if you need to.'],
  ['Get your ID and form', 'Receive a personal ID and a filled-in copy of the form, ready to sign.'],
];

export default function Landing() {
  const [done, setDone] = useState(null);
  return (
    <Shell>
      {!done ? (
        <>
          <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-brand-50 to-paper">
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-brand-100/60 blur-3xl" />
            <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:py-20 lg:grid-cols-[1.25fr_1fr] lg:items-center">
              <div>
                <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold tracking-wide text-brand-700 shadow-sm ring-1 ring-brand-100">申请表 · Application Form</p>
                <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.4rem]">Apply to study in China, in one sitting.</h1>
                <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
                  Complete your application online, upload your documents and receive a personal ID. Use it any time to correct your details or add files, with no need to start again.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <a href="#apply" className="btn-primary px-6 py-3 text-[15px]">Start your application <Arrow width={17} height={17} /></a>
                  <a href="#returning" className="btn-ghost px-6 py-3 text-[15px]">I already have an ID</a>
                </div>
              </div>
              <div id="returning" className="card scroll-mt-24 p-6 shadow-lg shadow-brand-900/5">
                <h2 className="font-display text-xl font-semibold">Already applied?</h2>
                <p className="mb-4 mt-1 text-sm text-muted">Enter your ID to edit your information, re-upload files or add new ones.</p>
                <LookupBox />
              </div>
            </div>
          </section>

          <section aria-label="How it works" className="mx-auto max-w-6xl px-4 py-10">
            <ol className="grid gap-4 sm:grid-cols-3">
              {STEPS.map(([t, d], i) => (
                <li key={t} className="flex gap-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 font-display text-lg font-semibold text-white">{i + 1}</span>
                  <div><p className="font-semibold">{t}</p><p className="mt-0.5 text-sm text-muted">{d}</p></div>
                </li>
              ))}
            </ol>
          </section>

          <div id="apply" className="mx-auto grid max-w-6xl scroll-mt-20 gap-8 px-4 pb-24 grid-cols-1 lg:grid-cols-[210px_minmax(0,1fr)]">
            <nav aria-label="Form sections" className="no-print hidden lg:block">
              <ul className="sticky top-24 space-y-0.5 text-sm">
                {NAV.map(([id, n, label]) => (
                  <li key={id}><a href={`#${id}`} className="flex gap-3 rounded-lg px-3 py-1.5 text-muted transition hover:bg-white hover:text-ink">
                    <span className="w-4 font-display font-semibold text-brand-600">{n}</span>{label}</a></li>
                ))}
              </ul>
            </nav>
            <ApplicationForm onSaved={(rec) => { setDone(rec); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
          </div>
        </>
      ) : (
        <div className="mx-auto max-w-6xl px-4 py-12"><SuccessPanel rec={done} /></div>
      )}
    </Shell>
  );
}
