import * as XLSX from 'xlsx';
import fs from 'fs';

try {
  const buf = fs.readFileSync('f:\\australia company project\\airVoice\\airvoice\\10 ESR - HAMBANTHOTA  2026-02-19.xlsx');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  console.log('Sheet name:', sheetName);
  console.log('Total rows:', data.length);
  for(let i=0; i<Math.min(20, data.length); i++) {
    console.log(`Row ${i}:`, JSON.stringify(data[i]));
  }
} catch (e) {
  console.error(e);
}
