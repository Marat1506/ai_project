import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const XLSX_PATH = join(process.cwd(), 'data', 'example.xlsx');

export interface CellRange {
  sheet: string;
  from: string; // e.g., "A1"
  to: string;   // e.g., "B3"
}

export interface CellData {
  value: any;
  formula?: string;
  type: 'n' | 's' | 'b' | 'e';
}

export interface RangeData {
  range: CellRange;
  data: CellData[][];
}

// Parse range string like "Sheet1!A1:B3"
export function parseRange(rangeStr: string): CellRange | null {
  const match = rangeStr.match(/^([^!]+)!([A-Z]+\d+):([A-Z]+\d+)$/);
  if (!match) return null;
  
  return {
    sheet: match[1],
    from: match[2],
    to: match[3],
  };
}

// Convert cell address to row/col (e.g., "A1" -> {r: 0, c: 0})
function addressToRC(address: string): { r: number; c: number } {
  const match = address.match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Invalid cell address: ${address}`);
  
  const colStr = match[1];
  const row = parseInt(match[2], 10) - 1;
  
  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }
  col -= 1;
  
  return { r: row, c: col };
}

// Convert row/col to cell address
function rcToAddress(r: number, c: number): string {
  let colStr = '';
  let col = c + 1;
  while (col > 0) {
    const remainder = (col - 1) % 26;
    colStr = String.fromCharCode(65 + remainder) + colStr;
    col = Math.floor((col - 1) / 26);
  }
  return `${colStr}${r + 1}`;
}

// Load workbook
function loadWorkbook() {
  try {
    const file = readFileSync(XLSX_PATH);
    return XLSX.read(file, { type: 'buffer', cellFormulas: true });
  } catch (error) {
    // Try to create directory if it doesn't exist
    try {
      mkdirSync(dirname(XLSX_PATH), { recursive: true });
    } catch (e) {
      // Directory might already exist
    }
    
    // Create a new workbook if file doesn't exist
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Email', 'Amount', 'Status', 'Formula', 'Total'],
      ['user1@example.com', 100, 'Active', '=B2*2', '=B2*2'],
      ['user2@example.com', 200, 'Pending', '=B3*2', '=B3*2'],
      ['user3@example.com', 150, 'Active', '=B4*2', '=B4*2'],
      ['user4@example.com', 300, 'Active', '=B5*2', '=B5*2'],
      ['user5@example.com', 250, 'Pending', '=B6*2', '=B6*2'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    
    try {
      XLSX.writeFile(wb, XLSX_PATH);
    } catch (e) {
      console.error('Error creating XLSX file:', e);
    }
    
    return wb;
  }
}

// Save workbook
function saveWorkbook(wb: XLSX.WorkBook) {
  writeFileSync(XLSX_PATH, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// Get range data
export function getRange(range: CellRange): RangeData {
  const wb = loadWorkbook();
  const ws = wb.Sheets[range.sheet];
  
  if (!ws) {
    throw new Error(`Sheet "${range.sheet}" not found`);
  }

  const from = addressToRC(range.from);
  const to = addressToRC(range.to);
  
  const data: CellData[][] = [];
  
  for (let r = from.r; r <= to.r; r++) {
    const row: CellData[] = [];
    for (let c = from.c; c <= to.c; c++) {
      const address = rcToAddress(r, c);
      const cell = ws[address];
      
      if (cell) {
        row.push({
          value: cell.v,
          formula: cell.f,
          type: cell.t || 's',
        });
      } else {
        row.push({
          value: null,
          type: 's',
        });
      }
    }
    data.push(row);
  }
  
  return { range, data };
}

// Update cell
export function updateCell(sheet: string, cell: string, value: any): void {
  const wb = loadWorkbook();
  let ws = wb.Sheets[sheet];
  
  if (!ws) {
    ws = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(wb, ws, sheet);
  }
  
  const rc = addressToRC(cell);
  XLSX.utils.sheet_add_aoa(ws, [[value]], { origin: cell });
  
  saveWorkbook(wb);
}

// Update range
export function updateRange(range: CellRange, values: any[][]): void {
  const wb = loadWorkbook();
  let ws = wb.Sheets[range.sheet];
  
  if (!ws) {
    ws = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(wb, ws, range.sheet);
  }
  
  XLSX.utils.sheet_add_aoa(ws, values, { origin: range.from });
  
  saveWorkbook(wb);
}

// Get cell formula explanation
export function getCellFormula(sheet: string, cell: string): string | null {
  const wb = loadWorkbook();
  const ws = wb.Sheets[sheet];
  
  if (!ws) {
    return null;
  }
  
  const cellObj = ws[cell];
  if (!cellObj || !cellObj.f) {
    return null;
  }
  
  return cellObj.f;
}

// Get all sheets
export function getSheets(): string[] {
  const wb = loadWorkbook();
  return wb.SheetNames;
}

