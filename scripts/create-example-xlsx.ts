import * as XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import { join } from 'path';

const XLSX_PATH = join(process.cwd(), 'data', 'example.xlsx');

// Create a sample workbook
const wb = XLSX.utils.book_new();

// Create sample data
const data = [
  ['Email', 'Amount', 'Status', 'Formula', 'Total'],
  ['user1@example.com', 100, 'Active', '=B2*2', '=B2*2'],
  ['user2@example.com', 200, 'Pending', '=B3*2', '=B3*2'],
  ['user3@example.com', 150, 'Active', '=B4*2', '=B4*2'],
  ['user4@example.com', 300, 'Active', '=B5*2', '=B5*2'],
  ['user5@example.com', 250, 'Pending', '=B6*2', '=B6*2'],
];

const ws = XLSX.utils.aoa_to_sheet(data);

// Set column widths
ws['!cols'] = [
  { wch: 25 }, // Email
  { wch: 10 }, // Amount
  { wch: 12 }, // Status
  { wch: 15 }, // Formula
  { wch: 10 }, // Total
];

XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

// Write file
writeFileSync(XLSX_PATH, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

console.log(`Example XLSX file created at: ${XLSX_PATH}`);


