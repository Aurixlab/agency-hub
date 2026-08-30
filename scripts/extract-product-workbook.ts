import { execFileSync } from 'node:child_process';

const workbookPath = process.argv[2];
if (!workbookPath) {
  throw new Error('Usage: tsx scripts/extract-product-workbook.ts <workbook.xlsx>');
}

const xml = (entry: string) => execFileSync('unzip', ['-p', workbookPath, entry], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});

const decodeXml = (value: string) => value
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));

const sharedStrings = Array.from(xml('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g))
  .map(match => Array.from(match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g))
    .map(text => decodeXml(text[1]))
    .join(''));

const workbookXml = xml('xl/workbook.xml');
const relationXml = xml('xl/_rels/workbook.xml.rels');
const relationTargets = new Map(Array.from(relationXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/>/g))
  .map(match => [match[1], match[2]]));
const sheets = Array.from(workbookXml.matchAll(/<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"[^>]*\/>/g))
  .map(match => ({ name: decodeXml(match[1]), target: relationTargets.get(match[2]) || '' }));

const columnIndex = (reference: string) => {
  const letters = reference.match(/[A-Z]+/)?.[0] || '';
  return letters.split('').reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
};

const cellValue = (cell: string, type: string) => {
  const raw = cell.match(/<v>([\s\S]*?)<\/v>/)?.[1] || '';
  if (type === 's') return sharedStrings[Number(raw)] || '';
  if (type === 'b') return raw === '1';
  return decodeXml(raw);
};

const output = sheets.slice(0, 6).map(sheet => {
  const sheetXml = xml(`xl/${sheet.target}`);
  const rows = Array.from(sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)).map(rowMatch => {
    const cells: unknown[] = [];
    for (const cellMatch of Array.from(rowMatch[1].matchAll(/<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g))) {
      const attributes = cellMatch[1] || cellMatch[2] || '';
      const reference = attributes.match(/\br="([^"]+)"/)?.[1];
      if (!reference) continue;
      const type = attributes.match(/\bt="([^"]+)"/)?.[1] || '';
      cells[columnIndex(reference)] = cellValue(cellMatch[3] || '', type);
    }
    return cells;
  });
  const headers = rows[0].map(value => String(value || '').trim());
  const records: Array<Record<string, unknown>> = rows.slice(1).map((row, index) => ({
    row: index + 2,
    ...Object.fromEntries(headers.map((header, column) => [header || `column_${column + 1}`, row[column] ?? ''])),
  }));
  const productRecords = records.filter(record => String(record['Item Code'] || '').trim());
  return { sheet: sheet.name, records: productRecords };
});

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
