// Shared between the React client and the Express server.
// Single source of truth for: form shape, option lists, document slots,
// sanitising and validation.

export const OPTIONS = {
  gender: ['Male', 'Female'],
  maritalStatus: ['Single', 'Married', 'Other'],
  highestEducation: ['High School', 'Bachelor', 'Master', 'Doctoral'],
  proficiency: ['Excellent', 'Good', 'Poor', 'None'],
  hsk: ['No', 'HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6'],
  degreeType: ['Non-Degree', 'Bachelor', 'Master', 'Doctoral'],
  teachingLanguage: ['English', 'Chinese'],
};

// The 13 attachments listed at the bottom of the application form.
export const DOCUMENTS = [
  { key: 'passport', no: 1, label: 'Scanned copy of passport', required: true, max: 3 },
  { key: 'photo', no: 2, label: 'Passport size photograph', required: true, imageOnly: true, max: 1 },
  { key: 'diploma', no: 3, label: 'Highest diploma certificate (English or Chinese version)', required: true },
  { key: 'transcripts', no: 4, label: 'Official transcripts with marking criterion (English or Chinese version)', required: true },
  { key: 'recommendations', no: 5, label: 'Two recommendation letters from professors in the same academic field', required: true, min: 2, max: 4 },
  { key: 'cv', no: 6, label: 'CV', required: true },
  { key: 'physicalTest', no: 7, label: 'Physical test', required: true },
  { key: 'studyPlan', no: 8, label: 'Study plan (no less than 800 words)', required: true },
  { key: 'thesis', no: 9, label: 'Thesis', hint: 'Only for students who want to apply for PhD majors' },
  { key: 'transferLetter', no: 10, label: 'Transfer letter with attendance rate', hint: 'Only for students who have been studying in China and want to transfer to another university' },
  { key: 'studyCertificate', no: 11, label: 'Study certificate', hint: 'Only for students who have already studied in China' },
  { key: 'hskCertificate', no: 12, label: 'Certificate of HSK test or other certificates which can show your Chinese level', hint: 'If you have the certificate' },
  { key: 'policeClearance', no: 13, label: 'Non criminal record (police clearance)', required: true },
];

export const DEFAULT_MAX_FILES = 5;
export const maxFiles = (doc) => doc.max || DEFAULT_MAX_FILES;

export const FILE_RULES = {
  maxBytes: 15 * 1024 * 1024,
  maxPerRequest: 40,
  extensions: ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'],
  imageExtensions: ['.jpg', '.jpeg', '.png'],
};

export const MAX_EDU_ROWS = 15;
export const MAX_WORK_ROWS = 15;

const contact = () => ({ address: '', tel: '', email: '', postCode: '' });
const person = () => ({ name: '', relationship: '', email: '', telephone: '', address: '' });
const relative = () => ({ name: '', age: '', jobTitle: '', workPlace: '', phone: '', email: '' });
export const eduRow = () => ({ school: '', from: '', to: '', major: '', degree: '' });
export const workRow = () => ({ unit: '', from: '', to: '', position: '', place: '' });

export const emptyApplication = () => ({
  // 1. Personal information
  surname: '',
  givenName: '',
  dob: '', // YYYY-MM-DD
  placeOfBirth: '',
  nationality: '',
  presentCountryCity: '',
  passportNo: '',
  passportExpiry: '', // YYYY-MM-DD
  gender: '',
  religion: '',
  nativeLanguage: '',
  officialLanguage: '',
  consulateName: '',
  consulateMailbox: '',
  maritalStatus: '',
  highestEducation: '',
  present: contact(),
  permanent: contact(),
  chineseProficiency: '',
  hsk: '',
  englishProficiency: '',
  toefl: '',
  ielts: '',
  // 2 & 3
  education: [eduRow(), eduRow(), eduRow()],
  work: [workRow(), workRow(), workRow()],
  // 4. Proposed study in China
  study: {
    degreeType: '',
    majors: '',
    teachingLanguage: '',
    durationFrom: '', // YYYY-MM
    durationTo: '',
    prefUniversity: '', // '' | 'notImportant' | 'yes'
    prefUniversityText: '',
    prefCity: '',
    prefCityText: '',
    selfSupport: false,
    scholarship: false,
    fullScholarship: false,
    partialScholarship: false,
    otherScholarship: false,
    otherScholarshipText: '',
    remedialFrom: '',
    remedialTo: '',
  },
  // 5, 6, 7
  supporter: person(),
  emergency: person(),
  family: { father: relative(), mother: relative(), spouse: relative() },
  declaration: false,
});

// ---------------------------------------------------------------- sanitising
const LONG = new Set(['address', 'prefUniversityText', 'prefCityText', 'majors', 'otherScholarshipText']);

/** Rebuilds `input` using only the keys/types present in `template`. */
export function sanitize(template, input, key = '') {
  if (Array.isArray(template)) {
    const row = template[0];
    const src = Array.isArray(input) ? input : [];
    return src.slice(0, 30).map((r) => sanitize(row, r));
  }
  if (template && typeof template === 'object') {
    const out = {};
    const src = input && typeof input === 'object' ? input : {};
    for (const k of Object.keys(template)) out[k] = sanitize(template[k], src[k], k);
    return out;
  }
  if (typeof template === 'boolean') return input === true || input === 'true';
  const max = LONG.has(key) ? 1000 : 200;
  return String(input ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

export function sanitizeApplication(input) {
  const t = emptyApplication();
  // arrays: template element is a single row
  t.education = [eduRow()];
  t.work = [workRow()];
  const out = sanitize(t, input);
  out.education = out.education.slice(0, MAX_EDU_ROWS);
  out.work = out.work.slice(0, MAX_WORK_ROWS);
  // The form always has at least the 3 rows the paper form has
  while (out.education.length < 3) out.education.push(eduRow());
  while (out.work.length < 3) out.work.push(workRow());
  return out;
}

// ---------------------------------------------------------------- validation
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

export const REQUIRED = [
  ['surname', 'Surname'],
  ['givenName', 'Given name'],
  ['dob', 'Date of birth'],
  ['placeOfBirth', 'Place of birth'],
  ['nationality', 'Nationality'],
  ['presentCountryCity', 'Present country/city'],
  ['passportNo', 'Passport number'],
  ['passportExpiry', 'Passport expiration date'],
  ['gender', 'Gender'],
  ['nativeLanguage', 'Native language'],
  ['maritalStatus', 'Marital status'],
  ['highestEducation', 'Highest education level'],
  ['present.address', 'Present address'],
  ['present.tel', 'Present telephone'],
  ['present.email', 'Present email'],
  ['permanent.address', 'Permanent address'],
  ['permanent.tel', 'Permanent telephone'],
  ['permanent.email', 'Permanent email'],
  ['chineseProficiency', 'Chinese language proficiency'],
  ['englishProficiency', 'English language proficiency'],
  ['study.degreeType', 'Degree type'],
  ['study.majors', 'Proposed major'],
  ['study.teachingLanguage', 'Teaching language'],
  ['study.durationFrom', 'Study start'],
  ['study.durationTo', 'Study end'],
  ['study.prefUniversity', 'Preferred universities'],
  ['study.prefCity', 'Preferred city or province'],
  ['supporter.name', 'Financial supporter name'],
  ['supporter.relationship', 'Financial supporter relationship'],
  ['supporter.telephone', 'Financial supporter telephone'],
  ['emergency.name', 'Emergency contact name'],
  ['emergency.relationship', 'Emergency contact relationship'],
  ['emergency.telephone', 'Emergency contact telephone'],
  ['family.father.name', "Father's name"],
  ['family.mother.name', "Mother's name"],
];

/** Returns { [fieldPath]: message }. Empty object = valid. */
export function validateApplication(d, today = new Date()) {
  const e = {};
  for (const [path, label] of REQUIRED) {
    if (!String(get(d, path) ?? '').trim()) e[path] = `${label} is required`;
  }
  const email = (p, label) => {
    const v = get(d, p);
    if (v && !EMAIL.test(v)) e[p] = `${label} is not a valid email`;
  };
  email('present.email', 'Present email');
  email('permanent.email', 'Permanent email');
  email('supporter.email', 'Supporter email');
  email('emergency.email', 'Emergency contact email');
  for (const r of ['father', 'mother', 'spouse']) email(`family.${r}.email`, 'Email');

  const iso = today.toISOString().slice(0, 10);
  if (d.dob) {
    if (!DATE.test(d.dob) || isNaN(Date.parse(d.dob))) e.dob = 'Enter a valid date';
    else if (d.dob >= iso) e.dob = 'Date of birth must be in the past';
  }
  if (d.passportExpiry) {
    if (!DATE.test(d.passportExpiry) || isNaN(Date.parse(d.passportExpiry))) e.passportExpiry = 'Enter a valid date';
    else if (d.passportExpiry <= iso) e.passportExpiry = 'Passport must not be expired';
  }

  const s = d.study || {};
  if (s.durationFrom && !MONTH.test(s.durationFrom)) e['study.durationFrom'] = 'Enter a valid month';
  if (s.durationTo && !MONTH.test(s.durationTo)) e['study.durationTo'] = 'Enter a valid month';
  if (s.durationFrom && s.durationTo && s.durationTo < s.durationFrom) e['study.durationTo'] = 'End must be after start';
  if (s.remedialFrom && s.remedialTo && s.remedialTo < s.remedialFrom) e['study.remedialTo'] = 'End must be after start';
  if (s.prefUniversity === 'yes' && !s.prefUniversityText) e['study.prefUniversityText'] = 'Please name the universities';
  if (s.prefCity === 'yes' && !s.prefCityText) e['study.prefCityText'] = 'Please name the city or province';
  if (!s.selfSupport && !s.scholarship) e['study.category'] = 'Choose Self Support and/or Scholarship';
  if (s.scholarship && !s.fullScholarship && !s.partialScholarship && !s.otherScholarship)
    e['study.scholarshipType'] = 'Choose the kind of scholarship';
  if (s.otherScholarship && !s.otherScholarshipText) e['study.otherScholarshipText'] = 'Please describe the scholarship';

  const eduOk = (d.education || []).some((r) => r.school && r.from && r.major && r.degree);
  if (!eduOk) e.education = 'Add at least one school with dates, major and degree';
  (d.education || []).forEach((r, i) => {
    if (r.from && r.to && r.to < r.from) e[`education.${i}.to`] = 'End must be after start';
  });
  (d.work || []).forEach((r, i) => {
    if (r.from && r.to && r.to < r.from) e[`work.${i}.to`] = 'End must be after start';
  });

  if (!d.declaration) e.declaration = 'You must affirm the declaration to submit';
  return e;
}

/** Documents still missing for the checklist. `counts` = { [docKey]: number } */
export function missingDocuments(counts) {
  return DOCUMENTS.filter((doc) => doc.required && (counts[doc.key] || 0) < (doc.min || 1));
}

// ----------------------------------------------------------------- formatting
const p2 = (n) => String(n).padStart(2, '0');
/** 'YYYY-MM-DD' -> 'YYYY.MM.DD' */
export const fmtDate = (s) => (DATE.test(s || '') ? s.replaceAll('-', '.') : s || '');
/** 'YYYY-MM' -> 'YY.MM.' */
export const fmtYM = (s) => (MONTH.test(s || '') ? `${s.slice(2, 4)}.${s.slice(5, 7)}.` : s || '');
export const fmtRange = (from, to) => (from || to ? `${fmtYM(from)} - ${to ? fmtYM(to) : 'Present'}` : '');
export { p2 };
