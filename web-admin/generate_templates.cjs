const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const columns = [
  "No.",
  "Service No",
  "Name",
  "GU/No",
  "GU/Name",
  "Unit",
  "Monthly Rental",
  "Term",
  "Sale Date",
  "[Oct-24]",
  "[Nov-24]"
];

// Sample data row
const sampleRow = [
  "1",
  "EMP001",
  "John Doe",
  "G001",
  "Jane Doe",
  "Base Unit A",
  "1500",
  "12",
  "2023-10-01",
  "500",
  "500"
];

const wb1 = XLSX.utils.book_new();
const ws1 = XLSX.utils.aoa_to_sheet([columns, sampleRow]);
XLSX.utils.book_append_sheet(wb1, ws1, "Deduction Sheet");
XLSX.writeFile(wb1, path.join(publicDir, 'Deduction_Template.xlsx'));

const wb2 = XLSX.utils.book_new();
const ws2 = XLSX.utils.aoa_to_sheet([columns, sampleRow]);
XLSX.utils.book_append_sheet(wb2, ws2, "Unit Wise Summary");
XLSX.writeFile(wb2, path.join(publicDir, 'Unit_Wise_Summary_Template.xlsx'));

console.log('Templates created successfully in public folder.');
