'use client';

import { useState, useRef, useEffect } from 'react';
import type { CellRange } from '@/src/lib/xlsx/xlsx';

interface TableViewerProps {
  data: {
    range: CellRange;
    data: any[][];
  };
  onClose: () => void;
  onSelectRange?: (range: string) => void;
}

export function TableViewer({ data, onClose, onSelectRange }: TableViewerProps) {
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [startCell, setStartCell] = useState<{ r: number; c: number } | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // Convert cell indices to address (e.g., A1)
  const rcToAddress = (r: number, c: number): string => {
    let colStr = '';
    let col = c + 1;
    while (col > 0) {
      const remainder = (col - 1) % 26;
      colStr = String.fromCharCode(65 + remainder) + colStr;
      col = Math.floor((col - 1) / 26);
    }
    return `${colStr}${r + 1}`;
  };

  // Parse address to row/col
  const addressToRC = (address: string): { r: number; c: number } => {
    const match = address.match(/^([A-Z]+)(\d+)$/);
    if (!match) return { r: 0, c: 0 };
    
    const colStr = match[1];
    const row = parseInt(match[2], 10) - 1;
    
    let col = 0;
    for (let i = 0; i < colStr.length; i++) {
      col = col * 26 + (colStr.charCodeAt(i) - 64);
    }
    col -= 1;
    
    return { r: row, c: col };
  };

  const handleCellMouseDown = (r: number, c: number) => {
    setIsSelecting(true);
    setStartCell({ r, c });
    setSelectedCells(new Set([`${r}-${c}`]));
  };

  const handleCellMouseEnter = (r: number, c: number) => {
    if (isSelecting && startCell) {
      const newSelection = new Set<string>();
      const minR = Math.min(startCell.r, r);
      const maxR = Math.max(startCell.r, r);
      const minC = Math.min(startCell.c, c);
      const maxC = Math.max(startCell.c, c);
      
      for (let row = minR; row <= maxR; row++) {
        for (let col = minC; col <= maxC; col++) {
          newSelection.add(`${row}-${col}`);
        }
      }
      
      setSelectedCells(newSelection);
    }
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
    setStartCell(null);
  };

  const handleSaveRange = () => {
    if (selectedCells.size === 0) return;
    
    const cells = Array.from(selectedCells).map((key) => {
      const [r, c] = key.split('-').map(Number);
      return { r, c };
    });
    
    // Adjust for actual range in data
    const baseFrom = addressToRC(data.range.from);
    const baseTo = addressToRC(data.range.to);
    
    const minR = Math.min(...cells.map((c) => c.r)) + baseFrom.r;
    const maxR = Math.max(...cells.map((c) => c.r)) + baseFrom.r;
    const minC = Math.min(...cells.map((c) => c.c)) + baseFrom.c;
    const maxC = Math.max(...cells.map((c) => c.c)) + baseFrom.c;
    
    const from = rcToAddress(minR, minC);
    const to = rcToAddress(maxR, maxC);
    const rangeStr = `${data.range.sheet}!${from}:${to}`;
    
    // Save to localStorage
    const saved = localStorage.getItem('savedRanges');
    const ranges = saved ? JSON.parse(saved) : [];
    if (!ranges.includes(rangeStr)) {
      ranges.push(rangeStr);
      localStorage.setItem('savedRanges', JSON.stringify(ranges));
    }
    
    if (onSelectRange) {
      onSelectRange(rangeStr);
    }
    
    onClose();
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      handleMouseUp();
    };
    
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">
            Таблица: {data.range.sheet}!{data.range.from}:{data.range.to}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>
        
        <div className="mb-4">
          <div className="text-sm text-gray-600 mb-2">
            Выделите ячейки для создания меншона диапазона
          </div>
          {selectedCells.size > 0 && (
            <button
              onClick={handleSaveRange}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Сохранить диапазон
            </button>
          )}
        </div>
        
        <div className="overflow-auto border border-gray-300">
          <table ref={tableRef} className="border-collapse">
            <thead>
              <tr>
                <th className="border border-gray-300 bg-gray-100 p-2 w-16"></th>
                {data.data[0]?.map((_, c) => (
                  <th
                    key={c}
                    className="border border-gray-300 bg-gray-100 p-2 min-w-[100px]"
                  >
                    {rcToAddress(0, c).replace(/\d+/, '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.map((row, r) => (
                <tr key={r}>
                  <td className="border border-gray-300 bg-gray-100 p-2 text-center">
                    {r + 1}
                  </td>
                  {row.map((cell, c) => {
                    const cellKey = `${r}-${c}`;
                    const isSelected = selectedCells.has(cellKey);
                    const address = rcToAddress(r, c);
                    
                    return (
                      <td
                        key={c}
                        className={`border border-gray-300 p-2 cursor-cell ${
                          isSelected ? 'bg-blue-200' : 'bg-white'
                        } hover:bg-blue-100`}
                        onMouseDown={() => handleCellMouseDown(r, c)}
                        onMouseEnter={() => handleCellMouseEnter(r, c)}
                        title={address}
                      >
                        {cell?.value !== null && cell?.value !== undefined
                          ? String(cell.value)
                          : ''}
                        {cell?.formula && (
                          <div className="text-xs text-gray-500 mt-1">
                            ={cell.formula}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

