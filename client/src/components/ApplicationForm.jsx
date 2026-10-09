import { useMemo, useRef, useState } from 'react';
import {
  MAX_EDU_ROWS, MAX_WORK_ROWS, OPTIONS, eduRow, emptyApplication, missingDocuments, validateApplication, workRow,
} from '@shared/schema.js';
import { ApiError, saveApplication } from '../lib/api.js';
import DocumentUploads from './DocumentUploads.jsx';
import { Plus, Trash } from './icons.jsx';
import { Check, Choice, FormCtx, Grid, Input, Section, SubHead, useForm } from './ui.jsx';

const AFFIRM = [
  ['申请表中所填写的内容和提供的材料真实无误；', 'All information and materials given in this form are true and correct.'],
  ['同意申请代理机构接收本人录取材料(包含录取通知书和JW202)；', 'I agree the agency who helps me apply for your school to receive my admission documents (including Admission Notice and JW202).'],
  ['在华期间，遵守中国的法律、法规，不从事任何危害中国社会秩序的、与本人来华学习身份不符合的活动；', 'During my stay in China, I shall abide by the laws and decrees of the Chinese government, and will not participate in any activities in China which are deemed to be adverse to the social order of China and are inappropriate to the capacity as a student.'],
  ['来华后服从学校的安排，不得无故要求变更学校和所学专业；', 'During my study in China, I will obey the arrangements of the school, and will not ask for transferring to another major or another school unreasonably.'],
  ['在学期间，遵守学校的校纪、校规，全力投入学习和研究工作。尊重学校的教学安排；', 'During my study in China, I shall abide by the rules and regulations of the host university, and concentrate on my studies and researches, and follow the teaching programs arranged by the university.'],
  ['如违反上述保证而受到中国法律、法规或校纪、校规的惩处，我愿意接受中止或取消奖学金及其它相应的处罚。', 'If I am judged by the Chinese laws and decrees and the rules and regulations of the university as having violated any of the above, I will not lodge any appeal against the decision on suspending, or withdrawing my scholarship, or other penalties.'],
];

export const NAV = [
  ['personal', '1', 'Personal information'],
  ['education', '2', 'Education background'],
  ['work', '3', 'Work experience'],
  ['study', '4', 'Proposed study'],
  ['supporter', '5', 'Financial supporter'],
  ['emergency', '6', 'Emergency contact'],
  ['family', '7', 'Family members'],
  ['documents', '8', 'Documents'],
  ['declaration', '9', 'Declaration'],
];

function setIn(obj, path, value) {
  const next = structuredClone(obj);
  const keys = path.split('.');
  let o = next;
  keys.slice(0, -1).forEach((k) => (o = o[k]));
  o[keys.at(-1)] = value;
  return next;
}

function Rows({ path, rows, blank, max, title, fields }) {
  const { data, set, errors } = useForm();
  return (
    <div className="space-y-3" data-field={path}>
      {rows.map((row, i) => (
        <div key={i} className="rounded-xl border border-line bg-stone-50/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <SubHead>{title} {i + 1}</SubHead>
            {rows.length > 1 && (
              <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-red-600"
                onClick={() => set(path, rows.filter((_, j) => j !== i))}>
                <Trash width={14} height={14} /> Remove
              </button>
            )}
          </div>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-6">
            {fields.map((f) => (
              <Input key={f.key} path={`${path}.${i}.${f.key}`} label={f.label} hint={f.hint} type={f.type} required={false} className={f.span} />
            ))}
          </div>
        </div>
      ))}
      {errors[path] && <p role="alert" className="text-[13px] font-medium text-red-600">{errors[path]}</p>}
      {rows.length < max && (
        <button type="button" className="btn-ghost btn-sm" onClick={() => set(path, [...rows, blank()])}>
          <Plus width={15} height={15} /> Add another row
        </button>
      )}
    </div>
  );
}

function Person({ base }) {
  return (
    <Grid>
      <Input path={`${base}.name`} label="Name" />
      <Input path={`${base}.relationship`} label="Relationship with the applicant" />
      <Input path={`${base}.email`} label="Email" type="email" />
      <Input path={`${base}.telephone`} label="Telephone" type="tel" />
      <Input path={`${base}.address`} label="Address" hint="(Street / City / Country)" multiline className="sm:col-span-2" required={false} />
    </Grid>
  );
}

function ContactBlock({ base, title }) {
  return (
    <div className="space-y-3">
      <SubHead>{title}</SubHead>
      <Input path={`${base}.address`} label="Address" hint="(Street / City / Country)" multiline />
      <Grid cols={3}>
        <Input path={`${base}.tel`} label="Tel" type="tel" />
        <Input path={`${base}.email`} label="Email" type="email" />
        <Input path={`${base}.postCode`} label="Post code" />
      </Grid>
    </div>
  );
}

function MonthRange({ from, to, label, fromRequired, hint }) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-stone-700">
        {label}{fromRequired && <span className="ml-0.5 text-brand-600">*</span>}
        {hint && <span className="ml-1.5 font-normal text-muted">{hint}</span>}
      </p>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1"><Input path={from} type="month" required={false} /></div>
        <span className="pt-3 text-sm text-muted">to</span>
        <div className="min-w-0 flex-1"><Input path={to} type="month" required={false} /></div>
      </div>
    </div>
  );
}

export default function ApplicationForm({ appId, initial, existingFiles = [], onSaved }) {
  const editing = !!appId;
  const [data, setData] = useState(() => initial || emptyApplication());
  const [files, setFiles] = useState(existingFiles);
  const [pending, setPending] = useState([]);
  const [removed, setRemoved] = useState(new Set());
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [topError, setTopError] = useState('');
  const formRef = useRef(null);

  const set = (path, value) => {
    setData((d) => setIn(d, path, value));
    setErrors((e) => { if (!e[path]) return e; const { [path]: _drop, ...rest } = e; return rest; });
  };
  const ctx = useMemo(() => ({ data, errors, set }), [data, errors]);

  const counts = useMemo(() => {
    const c = {};
    files.forEach((f) => !removed.has(f.id) && (c[f.category] = (c[f.category] || 0) + 1));
    pending.forEach((p) => (c[p.category] = (c[p.category] || 0) + 1));
    return c;
  }, [files, pending, removed]);
  const missing = missingDocuments(counts);
  const attached = Object.values(counts).reduce((a, b) => a + b, 0);

  function focusFirst(errs) {
    const nodes = [...formRef.current.querySelectorAll('[data-field]')];
    const hit = nodes.find((n) => errs[n.dataset.field]);
    if (!hit) return;
    hit.scrollIntoView({ block: 'center', behavior: 'smooth' });
    (hit.matches('input,textarea,select') ? hit : hit.querySelector('input,textarea,select'))?.focus({ preventScroll: true });
  }

  async function submit(e) {
    e.preventDefault();
    setTopError('');
    const errs = validateApplication(data);
    if (Object.keys(errs).length) {
      setErrors(errs);
      setTopError(`Please fix the ${Object.keys(errs).length} highlighted field${Object.keys(errs).length > 1 ? 's' : ''} below.`);
      return focusFirst(errs);
    }
    setBusy(true);
    setProgress(0);
    try {
      const rec = await saveApplication({ id: appId, data, pending, removeIds: [...removed], onProgress: setProgress });
      setFiles(rec.files);
      setPending([]);
      setRemoved(new Set());
      setData(rec.data);
      setErrors({});
      onSaved(rec);
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setErrors(err.fields);
        focusFirst(err.fields);
      }
      setTopError(err.message);
      window.scrollTo({ top: formRef.current.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  }

  const s = data.study;
  const changes = pending.length + removed.size;

  return (
    <FormCtx.Provider value={ctx}>
      <form ref={formRef} onSubmit={submit} noValidate className="min-w-0 space-y-6" autoComplete="on">
        <p className="text-sm text-muted">
          <span className="text-brand-600">*</span> Required. Please complete the form in Chinese or English, exactly as it appears in your passport where indicated.
        </p>

        <Section id="personal" no="1" title="Personal Information">
          <Grid>
            <Input path="surname" label="Surname" hint="(like in passport)" autoComplete="family-name" />
            <Input path="givenName" label="Given name" hint="(like in passport)" autoComplete="given-name" />
            <Input path="dob" label="Date of Birth" hint="(YYYY.MM.DD)" type="date" autoComplete="bday" />
            <Input path="placeOfBirth" label="Place of Birth" />
            <Input path="nationality" label="Nationality" />
            <Input path="presentCountryCity" label="Present Country/City" />
            <Input path="passportNo" label="Passport No." />
            <Input path="passportExpiry" label="Passport Expiration Date" type="date" />
            <Choice path="gender" label="Gender" options={OPTIONS.gender} />
            <Input path="religion" label="Religion" />
            <Input path="nativeLanguage" label="Native Language" />
            <Input path="officialLanguage" label="Official Language" />
            <Input path="consulateName" label="The Name of the Consulate Applying for the Visa" />
            <Input path="consulateMailbox" label="The Mailbox of the Consulate Applying for the Visa" />
          </Grid>
          <Choice path="maritalStatus" label="Marital Status" options={OPTIONS.maritalStatus} />
          <Choice path="highestEducation" label="Highest Education Level" options={OPTIONS.highestEducation} />
          <ContactBlock base="present" title="Present Information" />
          <ContactBlock base="permanent" title="Permanent Information" />
          <Choice path="chineseProficiency" label="Chinese Language Proficiency" options={OPTIONS.proficiency} />
          <Choice path="hsk" label="Level of HSK" options={OPTIONS.hsk} labels={{ No: 'No HSK' }} />
          <Choice path="englishProficiency" label="English Language Proficiency" options={OPTIONS.proficiency} />
          <Grid>
            <Input path="toefl" label="TOEFL Score" />
            <Input path="ielts" label="IELTS Results" />
          </Grid>
        </Section>

        <Section id="education" no="2" title="Education Background" note="From primary school to now. Add a row for each school.">
          <Rows path="education" rows={data.education} blank={eduRow} max={MAX_EDU_ROWS} title="School"
            fields={[
              { key: 'school', label: 'School Name', span: 'sm:col-span-6' },
              { key: 'from', label: 'From', type: 'month', span: 'sm:col-span-3' },
              { key: 'to', label: 'To', hint: '(blank if ongoing)', type: 'month', span: 'sm:col-span-3' },
              { key: 'major', label: 'Major', span: 'sm:col-span-3' },
              { key: 'degree', label: 'Degree', span: 'sm:col-span-3' },
            ]} />
        </Section>

        <Section id="work" no="3" title="Work Experience" note="If applicants have worked.">
          <Rows path="work" rows={data.work} blank={workRow} max={MAX_WORK_ROWS} title="Employer"
            fields={[
              { key: 'unit', label: 'Working Unit Name', span: 'sm:col-span-6' },
              { key: 'from', label: 'From', type: 'month', span: 'sm:col-span-3' },
              { key: 'to', label: 'To', hint: '(blank if current)', type: 'month', span: 'sm:col-span-3' },
              { key: 'position', label: 'Position', span: 'sm:col-span-3' },
              { key: 'place', label: 'Work Place', span: 'sm:col-span-3' },
            ]} />
        </Section>

        <Section id="study" no="4" title="Proposed Study in China">
          <Choice path="study.degreeType" label="Degree Type" options={OPTIONS.degreeType} />
          <Input path="study.majors" label="Proposed Major" hint="(Multiple choices: list them separated by commas or semicolons)" multiline />
          <Choice path="study.teachingLanguage" label="Teaching Language" options={OPTIONS.teachingLanguage} />
          <MonthRange from="study.durationFrom" to="study.durationTo" label="Duration of Study" hint="(YY.MM. - YY.MM.)" fromRequired />
          <div className="space-y-2">
            <Choice path="study.prefUniversity" label="Preferred Universities" options={['notImportant', 'yes']} labels={{ notImportant: 'Not important', yes: 'Yes' }} />
            {s.prefUniversity === 'yes' && <Input path="study.prefUniversityText" placeholder="Which universities?" />}
          </div>
          <div className="space-y-2">
            <Choice path="study.prefCity" label="Preferred City or Province" options={['notImportant', 'yes']} labels={{ notImportant: 'Not important', yes: 'Yes' }} />
            {s.prefCity === 'yes' && <Input path="study.prefCityText" placeholder="Which city or province?" />}
          </div>
          <div data-field="study.category" className="space-y-3">
            <p className="text-[13px] font-medium text-stone-700">Student Category <span className="text-brand-600">*</span></p>
            <Check path="study.selfSupport" label="Self Support" />
            <Check path="study.scholarship" label="Scholarship (multiple choices)"
              onToggle={(on) => {
                set('study.scholarship', on);
                if (!on) ['fullScholarship', 'partialScholarship', 'otherScholarship'].forEach((k) => set(`study.${k}`, false));
              }} />
            {s.scholarship && (
              <div data-field="study.scholarshipType" className="ml-7 space-y-2.5 border-l-2 border-brand-100 pl-4">
                <Check path="study.fullScholarship" label="Full scholarship" />
                <Check path="study.partialScholarship" label="Partial scholarship" />
                <Check path="study.otherScholarship" label="Others (any kind of scholarship)" />
                {s.otherScholarship && <Input path="study.otherScholarshipText" placeholder="Name of the scholarship" />}
              </div>
            )}
            {[errors['study.category'], errors['study.scholarshipType']].filter(Boolean).map((m) => (
              <p key={m} role="alert" className="text-[13px] font-medium text-red-600">{m}</p>
            ))}
          </div>
          <MonthRange from="study.remedialFrom" to="study.remedialTo" label="Duration of remedial Chinese Study, if needed" />
        </Section>

        <Section id="supporter" no="5" title="Financial Supporter"><Person base="supporter" /></Section>
        <Section id="emergency" no="6" title="Emergency Contact in China"><Person base="emergency" /></Section>

        <Section id="family" no="7" title="Family Members of the Applicant">
          {[['father', 'Father'], ['mother', 'Mother'], ['spouse', 'Spouse']].map(([k, label]) => (
            <div key={k} className="rounded-xl border border-line bg-stone-50/60 p-4">
              <div className="mb-3"><SubHead>{label}</SubHead></div>
              <Grid cols={3}>
                <Input path={`family.${k}.name`} label="Name" required={k !== 'spouse' && undefined} />
                <Input path={`family.${k}.age`} label="Age" />
                <Input path={`family.${k}.jobTitle`} label="Job title" />
                <Input path={`family.${k}.workPlace`} label="Work place" />
                <Input path={`family.${k}.phone`} label="Phone" type="tel" />
                <Input path={`family.${k}.email`} label="E-mail" type="email" />
              </Grid>
            </div>
          ))}
        </Section>

        <Section id="documents" no="8" title="Documents" note="Please attach the following documents. You can submit now and add the rest later using your ID.">
          <DocumentUploads appId={appId} existing={files} pending={pending} removed={removed} setPending={setPending} setRemoved={setRemoved} />
          {missing.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">Still needed ({missing.length}):</p>
              <p className="mt-0.5">{missing.map((d) => `${d.no}. ${d.label.split(' (')[0]}`).join(' · ')}</p>
            </div>
          )}
        </Section>

        <Section id="declaration" no="9" title="Declaration" note="申请人保证 / I Hereby Affirm That:">
          <ol className="space-y-3 text-sm leading-relaxed">
            {AFFIRM.map(([zh, en], i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 font-display font-semibold text-brand-600">{i + 1}.</span>
                <span><span className="block text-stone-800">{zh}</span><span className="block text-muted">{en}</span></span>
              </li>
            ))}
          </ol>
          <div data-field="declaration" className="rounded-xl bg-brand-50/60 p-4">
            <Check path="declaration" label={<span className="font-medium">I affirm that the above statements are true and that I agree to them.</span>} />
            {errors.declaration && <p role="alert" className="mt-2 text-[13px] font-medium text-red-600">{errors.declaration}</p>}
            <p className="mt-2 pl-7 text-[13px] text-muted">The exported form includes a signature line. It is not valid until you sign and date it.</p>
          </div>
        </Section>

        <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-paper/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
          {topError && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{topError}</p>}
          {busy && (
            <div className="mb-3" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-1.5 overflow-hidden rounded-full bg-stone-200"><div className="h-full bg-brand-600 transition-all" style={{ width: `${Math.max(8, progress * 100)}%` }} /></div>
              <p className="mt-1 text-xs text-muted">{progress >= 1 ? 'Creating your folder and filling in your form…' : 'Uploading…'}</p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {editing ? (changes ? `${pending.length} file${pending.length === 1 ? '' : 's'} to add${removed.size ? `, ${removed.size} to remove` : ''}` : 'Make your changes, then save.') : (attached ? `${attached} file${attached === 1 ? '' : 's'} attached` : 'No documents attached yet')}
            </p>
            <button type="submit" className="btn-primary px-7 py-3 text-[15px]" disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Submit application'}
            </button>
          </div>
        </div>
      </form>
    </FormCtx.Provider>
  );
}
