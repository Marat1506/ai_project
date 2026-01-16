import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { createMessage } from '@/src/lib/db/db';
import {
  getRange,
  updateCell,
  updateRange,
  getCellFormula,
  parseRange,
} from '@/src/lib/xlsx/xlsx';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages, threadId } = await req.json();

  // Save user message
  const lastMessage = messages[messages.length - 1];
  if (lastMessage && lastMessage.role === 'user' && threadId) {
    try {
      createMessage(threadId, 'user', lastMessage.content);
    } catch (error) {
      console.error('Error saving user message:', error);
    }
  }

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages,
    tools: {
      readExcelRange: {
        description: 'Read a range of cells from an Excel sheet. Range format: Sheet1!A1:B3',
        inputSchema: z.object({
          range: z.string().describe('Range in format Sheet1!A1:B3'),
        }),
        execute: async ({ range }) => {
          const cleanRange = range.startsWith('@') ? range.slice(1) : range;
          const parsed = parseRange(cleanRange);
          if (!parsed) {
            return { error: 'Invalid range format. Use Sheet1!A1:B3' };
          }
          
          try {
            const data = getRange(parsed);
            return {
              success: true,
              range: data.range,
              data: data.data,
            };
          } catch (error: any) {
            return { error: error.message };
          }
        },
      },
      updateExcelCell: {
        description: 'Update a cell in Excel',
        inputSchema: z.object({
          sheet: z.string(),
          cell: z.string(),
          value: z.any(),
        }),
        execute: async ({ sheet, cell, value }) => {
          try {
            updateCell(sheet, cell, value);
            return {
              success: true,
              message: `Cell ${sheet}!${cell} updated`,
            };
          } catch (error: any) {
            return { error: error.message };
          }
        },
      },
      getCellFormula: {
        description: 'Get formula from a cell',
        inputSchema: z.object({
          sheet: z.string().optional(),
          cell: z.string(),
        }),
        execute: async ({ sheet, cell }) => {
          try {
            let actualSheet = sheet || 'Sheet1';
            let actualCell = cell;
            
            if (cell.includes('!')) {
              const parts = cell.split('!');
              if (parts.length === 2) {
                actualSheet = parts[0].replace('@', '');
                actualCell = parts[1];
              }
            }
            
            const formula = getCellFormula(actualSheet, actualCell);
            if (!formula) {
              return {
                hasFormula: false,
                message: `Cell ${actualSheet}!${actualCell} has no formula`,
              };
            }
            
            return {
              hasFormula: true,
              formula,
              cell: `${actualSheet}!${actualCell}`,
            };
          } catch (error: any) {
            return { error: error.message };
          }
        },
      },
    },
  });

  return result.toTextStreamResponse();
}
