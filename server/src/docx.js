// Fills the ORIGINAL application form (converted to .docx) in place, so the
// exported document has exactly the same structure, borders and layout.
import fs from 'node:fs/promises';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { TEMPLATE_PATH } from './config.js';
import { fmtDate, fmtRange } from '../../shared/schema.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const CHECKED = 'þ'; // Wingdings ☑
const EMPTY = '¨'; // Wingdings ☐

let templateBuf;
const loadTemplate = async () => (templateBuf ??= await fs.readFile(TEMPLATE_PATH));

// ------------------------------------------------------------ DOM helpers
const kids = (n, name) =>
  Array.from(n.childNodes).filter((c) => c.nodeType === 1 && c.namespaceURI === W && c.localName === name);
const runText = (r) => kids(r, 't').map((t) => t.textContent).join('');
const isWingdings = (r) => {
  const f = kids(r, 'rPr')[0] && kids(kids(r, 'rPr')[0], 'rFonts')[0];
  return !!f && /wingdings/i.test(f.getAttributeNS(W, 'ascii') || f.getAttribute('w:ascii') || '');
};
const isGlyph = (r) => isWingdings(r) && [EMPTY, CHECKED].includes(runText(r));
const hasUnderline = (r) => !!(kids(r, 'rPr')[0] && kids(kids(r, 'rPr')[0], 'u')[0]);

function setRunText(r, text) {
  kids(r, 't').forEach((t) => r.removeChild(t));
  const t = r.ownerDocument.createElementNS(W, 'w:t');
  t.setAttribute('xml:space', 'preserve');
  t.appendChild(r.ownerDocument.createTextNode(text));
  r.appendChild(t);
}

function newRun(p, text, rPrFrom) {
  const doc = p.ownerDocument;
  const r = doc.createElementNS(W, 'w:r');
  if (rPrFrom && kids(rPrFrom, 'rPr')[0]) {
    r.appendChild(kids(rPrFrom, 'rPr')[0].cloneNode(true));
  } else {
    const rPr = doc.createElementNS(W, 'w:rPr');
    const c = doc.createElementNS(W, 'w:color');
    c.setAttribute('w:val', '000000');
    rPr.appendChild(c);
    r.appendChild(rPr);
  }
  setRunText(r, text);
  return r;
}

const lastTextRun = (p) => [...kids(p, 'r')].reverse().find((r) => !isWingdings(r));

/** Replace everything in the paragraph with `text`, keeping the first run's formatting. */
function replaceParagraph(p, text) {
  const runs = kids(p, 'r');
  const base = runs.find((r) => !isWingdings(r)) || runs[0];
  if (!base) return p.appendChild(newRun(p, text));
  runs.forEach((r) => r !== base && p.removeChild(r));
  setRunText(base, text);
}

/** Add `text` after the existing label in the paragraph (e.g. "Tel: " + value). */
function appendToParagraph(p, text) {
  if (!text) return;
  const last = lastTextRun(p);
  const lastTxt = last ? runText(last) : '';
  const lead = lastTxt && !/\s$/.test(lastTxt) ? ' ' : '';
  const run = newRun(p, lead + text, last);
  // keep appended answer visible: drop underline/bold that may exist on a label run
  p.appendChild(run);
}

const paras = (tc) => kids(tc, 'p');

/** Fill a value cell (first paragraph by default). */
function fillCell(tc, text, pIdx = 0) {
  if (!tc || !text) return;
  const p = paras(tc)[pIdx] || paras(tc)[0];
  replaceParagraph(p, text);
}

/** Set each checkbox glyph by matching the label that follows it. */
function setChecks(tc, selected) {
  // selected: { 'label prefix (lowercase)': boolean }
  for (const p of paras(tc)) {
    const runs = kids(p, 'r');
    runs.forEach((r, i) => {
      if (!isGlyph(r)) return;
      let label = '';
      for (let j = i + 1; j < runs.length && !label; j++) {
        if (isGlyph(runs[j])) break;
        label = runText(runs[j]).trim().toLowerCase();
      }
      const key = Object.keys(selected).find((k) => label.startsWith(k));
      if (key !== undefined) setRunText(r, selected[key] ? CHECKED : EMPTY);
    });
  }
}

/** Single choice: tick the option equal to `value`, clear the rest (also clears template defaults). */
function choice(tc, options, value) {
  setChecks(tc, Object.fromEntries(options.map((o) => [o.toLowerCase(), o === value])));
}

/** Fill the four underlined gaps in "From ___ Year ___ Month To ___ Year ___ Month". */
function fillDuration(tc, fromYM, toYM) {
  const p = paras(tc)[0];
  const [fy, fm] = (fromYM || '').split('-');
  const [ty, tm] = (toYM || '').split('-');
  const vals = [fy, fm, ty, tm];
  const groups = [];
  let cur = null;
  for (const r of kids(p, 'r')) {
    if (hasUnderline(r)) (cur ??= []).push(r);
    else if (cur) (groups.push(cur), (cur = null));
  }
  if (cur) groups.push(cur);
  groups.forEach((g, i) => {
    if (!vals[i]) return;
    setRunText(g[0], `  ${vals[i]}  `);
    g.slice(1).forEach((r) => r.parentNode.removeChild(r));
  });
}

function blankRow(tr) {
  for (const t of Array.from(tr.getElementsByTagNameNS(W, 't'))) t.textContent = '';
}

function ensureDataRows(tbl, needed) {
  const rows = kids(tbl, 'tr');
  let have = rows.length - 1;
  let last = rows[rows.length - 1];
  while (have < needed) {
    const clone = last.cloneNode(true);
    blankRow(clone);
    last.parentNode.insertBefore(clone, last.nextSibling);
    last = clone;
    have++;
  }
}

// ------------------------------------------------------------------ main
export async function buildFormDocx(d) {
  const zip = await JSZip.loadAsync(await loadTemplate());
  const xml = await zip.file('word/document.xml').async('string');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const tbls = Array.from(doc.getElementsByTagNameNS(W, 'tbl')).filter((t) => t.parentNode.localName === 'body');
  const [t0, t1, t2, t3, t4, t5, t6] = tbls;
  const rowOf = (t, i) => kids(t, 'tr')[i];
  const cell = (t, r, c) => kids(rowOf(t, r), 'tc')[c];
  const lastCell = (t, r) => kids(rowOf(t, r), 'tc').slice(-1)[0];
  const O = (o) => Object.values(o);

  // --- 1. Personal information
  fillCell(cell(t0, 0, 1), d.surname);
  fillCell(cell(t0, 0, 3), d.givenName);
  fillCell(cell(t0, 1, 1), fmtDate(d.dob));
  fillCell(cell(t0, 1, 3), d.placeOfBirth);
  fillCell(cell(t0, 2, 1), d.nationality);
  fillCell(cell(t0, 2, 3), d.presentCountryCity);
  fillCell(cell(t0, 3, 1), d.passportNo);
  fillCell(cell(t0, 3, 3), fmtDate(d.passportExpiry));
  choice(cell(t0, 4, 1), ['Male', 'Female'], d.gender);
  fillCell(cell(t0, 4, 3), d.religion);
  fillCell(cell(t0, 5, 1), d.nativeLanguage);
  fillCell(cell(t0, 5, 3), d.officialLanguage);
  fillCell(cell(t0, 6, 1), d.consulateName);
  fillCell(cell(t0, 6, 3), d.consulateMailbox);
  choice(cell(t0, 7, 1), ['Single', 'Married', 'Other'], d.maritalStatus);
  choice(cell(t0, 8, 1), ['High School', 'Bachelor', 'Master', 'Doctoral'], d.highestEducation);

  const contact = (rAddr, c) => {
    fillCell(cell(t0, rAddr, 1), c.address, 1); // blank writing line between label and hint
    appendToParagraph(paras(cell(t0, rAddr + 1, 1))[0], c.tel);
    appendToParagraph(paras(cell(t0, rAddr + 2, 1))[0], c.email);
    appendToParagraph(paras(cell(t0, rAddr + 2, 2))[0], c.postCode);
  };
  contact(9, d.present);
  contact(12, d.permanent);

  const prof = ['Excellent', 'Good', 'Poor', 'None'];
  choice(cell(t0, 15, 1), prof, d.chineseProficiency);
  choice(cell(t0, 16, 1), ['No', 'HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6'], d.hsk);
  choice(cell(t0, 17, 1), prof, d.englishProficiency);
  fillCell(cell(t0, 18, 1), d.toefl);
  fillCell(cell(t0, 18, 3), d.ielts);

  // --- 2. Education / 3. Work experience
  const edu = d.education.filter((r) => r.school || r.major || r.degree || r.from || r.to);
  ensureDataRows(t1, Math.max(3, edu.length));
  edu.forEach((r, i) => {
    [r.school, fmtRange(r.from, r.to), r.major, r.degree].forEach((v, c) => fillCell(cell(t1, i + 1, c), v));
  });
  const work = d.work.filter((r) => r.unit || r.position || r.place || r.from || r.to);
  ensureDataRows(t2, Math.max(3, work.length));
  work.forEach((r, i) => {
    [r.unit, fmtRange(r.from, r.to), r.position, r.place].forEach((v, c) => fillCell(cell(t2, i + 1, c), v));
  });

  // --- 4. Proposed study in China
  const s = d.study;
  choice(cell(t3, 0, 1), ['Non-Degree', 'Bachelor', 'Master', 'Doctoral'], s.degreeType);
  fillCell(cell(t3, 1, 1), s.majors);
  choice(cell(t3, 2, 1), ['English', 'Chinese'], s.teachingLanguage);
  fillDuration(cell(t3, 3, 1), s.durationFrom, s.durationTo);
  const pref = (rNot, rYes, val, text) => {
    setChecks(cell(t3, rNot, 1), { 'not important': val === 'notImportant' });
    setChecks(cell(t3, rYes, 1), { yes: val === 'yes' });
    if (val === 'yes') appendToParagraph(paras(cell(t3, rYes, 1))[0], text);
  };
  pref(4, 5, s.prefUniversity, s.prefUniversityText);
  pref(6, 7, s.prefCity, s.prefCityText);
  setChecks(cell(t3, 8, 1), { 'self support': s.selfSupport });
  setChecks(cell(t3, 9, 1), { scholarship: s.scholarship });
  setChecks(lastCell(t3, 9), { full: s.scholarship && s.fullScholarship });
  setChecks(lastCell(t3, 10), { partial: s.scholarship && s.partialScholarship });
  setChecks(lastCell(t3, 11), { others: s.scholarship && s.otherScholarship });
  if (s.scholarship && s.otherScholarship) appendToParagraph(paras(lastCell(t3, 11))[0], s.otherScholarshipText);
  fillDuration(cell(t3, 12, 1), s.remedialFrom, s.remedialTo);

  // --- 5 & 6. Financial supporter / Emergency contact
  for (const [t, p] of [[t4, d.supporter], [t5, d.emergency]]) {
    fillCell(cell(t, 0, 1), p.name);
    fillCell(cell(t, 0, 3), p.relationship);
    fillCell(cell(t, 1, 1), p.email);
    fillCell(cell(t, 1, 3), p.telephone);
    fillCell(cell(t, 2, 0), p.address, 1);
  }

  // --- 7. Family members
  [d.family.father, d.family.mother, d.family.spouse].forEach((m, i) => {
    [m.name, m.age, m.jobTitle, m.workPlace, m.phone, m.email].forEach((v, c) => fillCell(cell(t6, i + 1, c + 1), v));
  });

  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
