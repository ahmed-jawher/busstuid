// Writes docs/demo-accounts.xlsx and docs/demo-accounts.csv from src/ops/demo-accounts.ts, so the
// sheet handed to a tester can never drift from the accounts the seeder actually creates.
//
//   pnpm --filter @wusool/api demo:sheet     (builds the API first; no dependencies are used)
//
// The .xlsx is written by hand: a spreadsheet is a zip of XML files, and the few kilobytes below
// are cheaper than a library. Entries are stored uncompressed, which Excel, Numbers and Google
// Sheets all accept.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { crc32 } from 'node:zlib';

const require = createRequire(import.meta.url);
const apiRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(apiRoot, '..', '..');
const { DEMO_PEOPLE, DEMO_PASSWORD, emailOf } = require(
  path.join(apiRoot, 'dist', 'ops', 'demo-accounts.js'),
);

const HEADERS = ['النوع', 'البريد الإلكتروني', 'كلمة المرور', 'السيناريو', 'Role', 'Scenario'];
const rows = DEMO_PEOPLE.map((p) => [
  p.role,
  emailOf(p.local),
  DEMO_PASSWORD,
  p.scenario,
  p.roleEn,
  p.scenarioEn,
]);

// ── CSV, for anyone without a spreadsheet program ──
const csvCell = (v) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
const csv = [HEADERS, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
// A byte-order mark, or Excel reads the Arabic as mojibake.
writeFileSync(path.join(repoRoot, 'docs', 'demo-accounts.csv'), '﻿' + csv + '\n');

// ── XLSX ──
const xml = (v) =>
  String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const column = (i) => {
  let name = '';
  for (let n = i + 1; n > 0; ) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
};

const sheetRow = (cells, rowIndex, style) =>
  `<row r="${rowIndex}">${cells
    .map(
      (value, i) =>
        `<c r="${column(i)}${rowIndex}" t="inlineStr"${style ? ` s="${style}"` : ''}>` +
        `<is><t xml:space="preserve">${xml(value)}</t></is></c>`,
    )
    .join('')}</row>`;

const widths = [18, 22, 14, 70, 22, 70]
  .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
  .join('');

const sheet =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
  `<cols>${widths}</cols><sheetData>` +
  sheetRow(HEADERS, 1, 1) +
  rows.map((r, i) => sheetRow(r, i + 2)).join('') +
  `</sheetData></worksheet>`;

const styles =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
  `<borders count="1"><border/></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">` +
  `<alignment vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
  `</styleSheet>`;

const files = {
  '[Content_Types].xml':
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`,
  '_rels/.rels':
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`,
  'xl/workbook.xml':
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="حسابات الاختبار" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  'xl/_rels/workbook.xml.rels':
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`,
  'xl/styles.xml': styles,
  'xl/worksheets/sheet1.xml': sheet,
};

/** A zip with stored (uncompressed) entries: local headers, then the central directory. */
function zip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  // A fixed timestamp (2026-01-01 00:00) keeps the file byte-identical between runs, so git
  // only sees a change when the accounts change.
  const time = 0;
  const date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const [name, text] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.from(text, 'utf8');
    const sum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(date, 14);
    entry.writeUInt32LE(sum, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

mkdirSync(path.join(repoRoot, 'docs'), { recursive: true });
writeFileSync(path.join(repoRoot, 'docs', 'demo-accounts.xlsx'), zip(files));
console.log(`✓ docs/demo-accounts.xlsx and .csv — ${rows.length} accounts`);
