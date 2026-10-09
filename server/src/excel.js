// One row per application ID in data/applications.xlsx (updated in place on edits).
import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { DATA_DIR } from './config.js';
import { withLock } from './util.js';
import { DOCUMENTS, fmtDate, fmtRange, fmtYM, missingDocuments } from '../../shared/schema.js';

export const XLSX_PATH = path.join(DATA_DIR, 'applications.xlsx');
const SHEET = 'Applications';

const person = (m) => [m.name, m.relationship, m.email, m.telephone, m.address];
const rel = (m) => [m.name, m.age, m.jobTitle, m.workPlace, m.phone, m.email].filter(Boolean).join(' | ');
const lines = (arr) => arr.filter((x) => x.some(Boolean)).map((x) => x.filter(Boolean).join(' | ')).join('\n');
const yes = (b, label) => (b ? [label] : []);

const counts = (rec) => {
  const c = {};
  for (const f of rec.files) c[f.category] = (c[f.category] || 0) + 1;
  return c;
};

// [header, width, getter(rec) -> value]
export const COLUMNS = [
  ['Application ID', 18, (r) => r.id],
  ['Submitted At', 20, (r) => r.createdAt],
  ['Last Updated', 20, (r) => r.updatedAt],
  ['Surname', 16, (r) => r.data.surname],
  ['Given Name', 18, (r) => r.data.givenName],
  ['Date of Birth', 13, (r) => fmtDate(r.data.dob)],
  ['Place of Birth', 18, (r) => r.data.placeOfBirth],
  ['Nationality', 14, (r) => r.data.nationality],
  ['Present Country/City', 20, (r) => r.data.presentCountryCity],
  ['Passport No.', 14, (r) => r.data.passportNo],
  ['Passport Expiration', 14, (r) => fmtDate(r.data.passportExpiry)],
  ['Gender', 9, (r) => r.data.gender],
  ['Religion', 14, (r) => r.data.religion],
  ['Native Language', 14, (r) => r.data.nativeLanguage],
  ['Official Language', 14, (r) => r.data.officialLanguage],
  ['Consulate Name', 26, (r) => r.data.consulateName],
  ['Consulate Mailbox', 26, (r) => r.data.consulateMailbox],
  ['Marital Status', 12, (r) => r.data.maritalStatus],
  ['Highest Education', 14, (r) => r.data.highestEducation],
  ['Present Address', 36, (r) => r.data.present.address],
  ['Present Tel', 16, (r) => r.data.present.tel],
  ['Present Email', 26, (r) => r.data.present.email],
  ['Present Post Code', 12, (r) => r.data.present.postCode],
  ['Permanent Address', 36, (r) => r.data.permanent.address],
  ['Permanent Tel', 16, (r) => r.data.permanent.tel],
  ['Permanent Email', 26, (r) => r.data.permanent.email],
  ['Permanent Post Code', 12, (r) => r.data.permanent.postCode],
  ['Chinese Proficiency', 12, (r) => r.data.chineseProficiency],
  ['HSK Level', 10, (r) => r.data.hsk],
  ['English Proficiency', 12, (r) => r.data.englishProficiency],
  ['TOEFL', 10, (r) => r.data.toefl],
  ['IELTS', 10, (r) => r.data.ielts],
  ['Education Background', 50, (r) => lines(r.data.education.map((e) => [e.school, fmtRange(e.from, e.to), e.major, e.degree]))],
  ['Work Experience', 50, (r) => lines(r.data.work.map((w) => [w.unit, fmtRange(w.from, w.to), w.position, w.place]))],
  ['Degree Type', 12, (r) => r.data.study.degreeType],
  ['Proposed Major', 28, (r) => r.data.study.majors],
  ['Teaching Language', 12, (r) => r.data.study.teachingLanguage],
  ['Study Duration', 16, (r) => `${fmtYM(r.data.study.durationFrom)} - ${fmtYM(r.data.study.durationTo)}`],
  ['Preferred Universities', 26, (r) => (r.data.study.prefUniversity === 'yes' ? r.data.study.prefUniversityText : r.data.study.prefUniversity && 'Not important')],
  ['Preferred City/Province', 22, (r) => (r.data.study.prefCity === 'yes' ? r.data.study.prefCityText : r.data.study.prefCity && 'Not important')],
  ['Student Category', 30, (r) => {
    const s = r.data.study;
    return [
      ...yes(s.selfSupport, 'Self Support'),
      ...(s.scholarship
        ? ['Scholarship (' + [...yes(s.fullScholarship, 'Full'), ...yes(s.partialScholarship, 'Partial'), ...yes(s.otherScholarship, `Other: ${s.otherScholarshipText}`)].join(', ') + ')']
        : []),
    ].join('; ');
  }],
  ['Remedial Chinese Study', 16, (r) => (r.data.study.remedialFrom ? `${fmtYM(r.data.study.remedialFrom)} - ${fmtYM(r.data.study.remedialTo)}` : '')],
  ...['Name', 'Relationship', 'Email', 'Telephone', 'Address'].map((h, i) => [`Supporter ${h}`, 20, (r) => person(r.data.supporter)[i]]),
  ...['Name', 'Relationship', 'Email', 'Telephone', 'Address'].map((h, i) => [`Emergency Contact ${h}`, 20, (r) => person(r.data.emergency)[i]]),
  ['Father', 40, (r) => rel(r.data.family.father)],
  ['Mother', 40, (r) => rel(r.data.family.mother)],
  ['Spouse', 40, (r) => rel(r.data.family.spouse)],
  ...DOCUMENTS.map((doc) => [`Doc ${doc.no}: ${doc.label.split(' (')[0]}`, 28, (r) => r.files.filter((f) => f.category === doc.key).map((f) => f.name).join('\n')]),
  ['Missing Required Documents', 30, (r) => missingDocuments(counts(r)).map((d) => `${d.no}. ${d.label.split(' (')[0]}`).join('\n')],
  ['Drive / Storage Folder', 40, (r) => r.storage.link || r.storage.folderId],
  ['Folder ID', 36, (r) => r.storage.folderId],
];

/** Header row + values for one application (also what is pushed to the Google Sheet). */
export function rowFor(rec) {
  return {
    headers: COLUMNS.map(([header]) => header),
    values: COLUMNS.map(([, , get]) => {
      const v = get(rec);
      return v == null ? '' : String(v);
    }),
  };
}

async function loadOrCreate() {
  const wb = new ExcelJS.Workbook();
  let ws;
  const exists = await fs.access(XLSX_PATH).then(() => true, () => false);
  if (exists) {
    await wb.xlsx.readFile(XLSX_PATH); // a real read error (corrupt/locked file) must surface, not be hidden
    ws = wb.getWorksheet(SHEET);
  }
  if (!ws) {
    ws = wb.addWorksheet(SHEET, { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
    ws.columns = COLUMNS.map(([header, width]) => ({ header, width }));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB3261E' } };
    head.alignment = { vertical: 'middle', wrapText: true };
    head.height = 30;
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  }
  return [wb, ws];
}

/** Insert or update the row whose first cell equals rec.id. */
export function upsertRow(rec) {
  return withLock('excel', async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const [wb, ws] = await loadOrCreate();
    const values = COLUMNS.map(([, , get]) => {
      const v = get(rec);
      return v == null ? '' : String(v);
    });
    let target;
    ws.eachRow((row, n) => {
      if (n > 1 && row.getCell(1).value === rec.id) target = row;
    });
    const row = target || ws.addRow([]);
    values.forEach((v, i) => (row.getCell(i + 1).value = v));
    row.alignment = { vertical: 'top', wrapText: true };
    const tmp = `${XLSX_PATH}.${process.pid}.tmp`;
    await wb.xlsx.writeFile(tmp);
    await fs.rename(tmp, XLSX_PATH);
  });
}
