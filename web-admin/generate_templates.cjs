const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// ── Column headers ──────────────────────────────────────────
const dataHeaders = [
  "No.",
  "Service No",
  "Name",
  "GU/No",
  "GU/Name",
  "Unit",
  "Monthly Rental",
  "Term",
  "Sale Date",
  "Oct-24",
  "Nov-24",
  "Dec-24",
  "Jan-25",
];

// ── Sample data rows ─────────────────────────────────────────
const sampleRows = [
  ["1", "EMP001", "John Perera",   "G001", "Mary Silva",   "Base Unit A", "1500", "12", "2023-10-01", "1500", "1500", "0",    "1500"],
  ["2", "EMP002", "Kasun Fernando","G002", "Sunil Fonseka","Base Unit B", "2000", "24", "2023-11-15", "2000", "",    "2000", "2000"],
  ["3", "EMP003", "Nimal Bandara", "G003", "Priya Jayawardena","Camp C", "1200", "18", "2024-01-10", "1200", "1200","1200", ""],
];

// ── Instructions sheet ───────────────────────────────────────
const instructions = [
  ["📋 AIRVOICE — 7 ESR Deduction Sheet / Unit Wise Summary — Upload Template Guide"],
  [],
  ["COLUMN NAME",       "WHAT TO FILL",                                    "EXAMPLE VALUE",     "REQUIRED?"],
  ["No.",               "Row number (you can leave this auto-numbered)",    "1, 2, 3…",         "No"],
  ["Service No",        "Staff service / employee number",                  "EMP001",            "YES"],
  ["Name",              "Full name of the staff member",                    "John Perera",       "YES"],
  ["GU/No",             "Guarantor ID / Service number",                    "G001",              "YES"],
  ["GU/Name",           "Full name of the guarantor",                       "Mary Silva",        "YES"],
  ["Unit",              "Army / Camp unit name",                             "Base Unit A",       "YES"],
  ["Monthly Rental",    "Monthly installment amount in LKR (numbers only)", "1500",              "YES"],
  ["Term",              "Total number of installment months",                "12",                "YES"],
  ["Sale Date",         "Date phone was sold (YYYY-MM-DD format)",           "2023-10-01",        "YES"],
  ["Oct-24, Nov-24 …",  "Monthly deduction columns (one per month). Header must be MMM-YY format.", "Oct-24", "YES (add as many months as needed)"],
  [],
  ["📌 MONTHLY DEDUCTION COLUMN VALUES:"],
  [],
  ["VALUE",             "MEANING"],
  ["500 or 1500",       "Deduction was made this month — enter the actual amount paid"],
  ["0 or (blank)",      "No deduction this month — system will mark this installment as MISSED"],
  [],
  ["⚠️  IMPORTANT NOTES:"],
  ["1.", "Do NOT change column header names — the system uses exact column names to detect fields."],
  ["2.", "Month columns must use MMM-YY format exactly: Oct-24, Nov-24, Dec-24, Jan-25, etc."],
  ["3.", "Each row = one staff member's phone plan."],
  ["4.", "You can add as many month columns as needed — the system will auto-detect all of them."],
  ["5.", "Save the file as .xlsx (Excel format) before uploading."],
];

// ── Helper to auto-size columns ───────────────────────────────
function autoWidth(ws) {
  const range = XLSX.utils.decode_range(ws['!ref']);
  const colWidths = [];
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      const len = cell ? String(cell.v).length : 0;
      colWidths[C] = Math.max(colWidths[C] || 10, Math.min(len + 4, 60));
    }
  }
  ws['!cols'] = colWidths.map(w => ({ wch: w }));
}

// ── Build workbooks ───────────────────────────────────────────
function buildWorkbook(sheetName) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Data template
  const ws1 = XLSX.utils.aoa_to_sheet([dataHeaders, ...sampleRows]);
  autoWidth(ws1);
  XLSX.utils.book_append_sheet(wb, ws1, sheetName);

  // Sheet 2: Instructions
  const ws2 = XLSX.utils.aoa_to_sheet(instructions);
  ws2['!cols'] = [{ wch: 22 }, { wch: 62 }, { wch: 22 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Instructions (READ ME)");

  return wb;
}

const wb1 = buildWorkbook("Deduction Sheet");
XLSX.writeFile(wb1, path.join(publicDir, 'Deduction_Template.xlsx'));

const wb2 = buildWorkbook("Unit Wise Summary");
XLSX.writeFile(wb2, path.join(publicDir, 'Unit_Wise_Summary_Template.xlsx'));

console.log('✅  Templates created successfully in public/ folder.');
console.log('   → Deduction_Template.xlsx');
console.log('   → Unit_Wise_Summary_Template.xlsx');
