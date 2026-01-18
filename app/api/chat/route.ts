import { NextResponse } from 'next/server';
import { createMessage } from '@/src/lib/db/db';
import {
  getRange,
  updateCell,
  getCellFormula,
  parseRange,
} from '@/src/lib/xlsx/xlsx';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    interface Message {
      role: 'user' | 'assistant' | 'system';
      content: string;
    }

    const { messages: rawMessages, threadId } = await req.json();

    if (!rawMessages || !Array.isArray(rawMessages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const messages: Message[] = rawMessages;

    if (!threadId) {
      return NextResponse.json({ error: 'Thread ID is required' }, { status: 400 });
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'user' && threadId) {
      try {
        createMessage(threadId, 'user', lastMessage.content);
      } catch (error) {
        console.error('Error saving user message:', error);
      }
    }

    const openAIApiKey = process.env.OPENAI_API_KEY;
    
    if (!openAIApiKey) {
      return NextResponse.json({
        error: 'OpenAI API key is not configured',
        hint: 'Please set the OPENAI_API_KEY environment variable'
      }, { status: 500 });
    }

    const tools = [
      {
        type: "function" as const,
        function: {
          name: "readExcelRange",
          description: "Read a range of cells from the Excel file 'example.xlsx'. The file has a sheet named 'Sheet1' with data including emails, amounts, statuses, and formulas. Range format: Sheet1!A1:B3",
          parameters: {
            type: "object",
            properties: {
              range: {
                type: "string",
                description: "Range in format Sheet1!A1:B3. The file has data in columns A-E with headers: Email, Amount, Status, Formula, Total"
              }
            },
            required: ["range"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "confirmAction",
          description: "Request user confirmation before performing dangerous actions like update/delete operations. This tool shows a confirmation dialog and waits for user response.",
          parameters: {
            type: "object",
            properties: {
              action: {
                type: "string",
                description: "Type of action to confirm: 'update', 'delete', 'clear'"
              },
              message: {
                type: "string",
                description: "Confirmation message to show to the user"
              },
              details: {
                type: "object",
                description: "Details about the action to be performed",
                properties: {
                  type: { type: "string" },
                  target: { type: "string" },
                  value: { type: "string" }
                }
              }
            },
            required: ["action", "message", "details"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "updateExcelCell",
          description: "Update a single cell in the Excel file 'example.xlsx'. This should only be called after user confirmation.",
          parameters: {
            type: "object",
            properties: {
              sheet: { 
                type: "string", 
                description: "Sheet name (usually 'Sheet1')" 
              },
              cell: { 
                type: "string", 
                description: "Cell address like 'A1', 'B2', etc." 
              },
              value: {
                description: "New value for the cell"
              },
              confirmed: {
                type: "boolean",
                description: "Whether this action has been confirmed by the user"
              }
            },
            required: ["sheet", "cell", "value"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "getCellFormula",
          description: "Get and explain the formula from a specific cell in the Excel file",
          parameters: {
            type: "object",
            properties: {
              sheet: { 
                type: "string", 
                description: "Sheet name (usually 'Sheet1')" 
              },
              cell: { 
                type: "string", 
                description: "Cell address like 'D2', 'E3', etc." 
              }
            },
            required: ["sheet", "cell"]
          }
        }
      }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        tools: tools,
        tool_choice: "auto",
        stream: true,
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: `OpenAI API error: ${response.status}`, details: errorData },
        { status: response.status }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let toolCallsBuffer: any = {};

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(data);

                  if (parsed.choices && parsed.choices[0]?.delta?.tool_calls) {
                    const toolCalls = parsed.choices[0].delta.tool_calls;

                    for (const toolCall of toolCalls) {
                      const index = toolCall.index;
                      
                      if (!toolCallsBuffer[index]) {
                        toolCallsBuffer[index] = {
                          id: toolCall.id,
                          type: toolCall.type,
                          function: {
                            name: toolCall.function?.name || '',
                            arguments: toolCall.function?.arguments || ''
                          }
                        };
                      } else {
                        if (toolCall.function?.name) {
                          toolCallsBuffer[index].function.name += toolCall.function.name;
                        }
                        if (toolCall.function?.arguments) {
                          toolCallsBuffer[index].function.arguments += toolCall.function.arguments;
                        }
                      }
                    }
                  }

                  if (parsed.choices && parsed.choices[0]?.finish_reason === 'tool_calls') {
                    const toolResults = [];
                    for (const [, toolCall] of Object.entries(toolCallsBuffer)) {
                      const toolName = (toolCall as any).function.name;
                      const args = (toolCall as any).function.arguments;

                      if (toolName && args) {
                        try {
                          const parsedArgs = JSON.parse(args);
                          let toolResult;
                          
                          switch (toolName) {
                            case 'readExcelRange':
                              const cleanRange = parsedArgs.range.startsWith('@')
                                ? parsedArgs.range.slice(1)
                                : parsedArgs.range;
                              const parsedRange = parseRange(cleanRange);
                              if (parsedRange) {
                                const data = getRange(parsedRange);
                                toolResult = {
                                  success: true,
                                  range: data.range,
                                  data: data.data,
                                };
                                
                                const toolResultMessage = {
                                  type: 'tool-result',
                                  toolName: 'readExcelRange',
                                  result: toolResult
                                };
                                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(toolResultMessage)}\n`));
                              } else {
                                toolResult = { error: 'Invalid range format. Use Sheet1!A1:B3' };
                              }
                              break;

                            case 'confirmAction':
                              toolResult = {
                                type: 'confirmation_required',
                                action: parsedArgs.action,
                                message: parsedArgs.message,
                                details: parsedArgs.details,
                                requiresConfirmation: true
                              };
                              
                              const confirmationMessage = {
                                type: 'tool-result',
                                toolName: 'confirmAction',
                                result: toolResult
                              };
                              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(confirmationMessage)}\n`));
                              break;

                            case 'updateExcelCell':
                              if (!parsedArgs.confirmed) {
                                toolResult = { 
                                  error: 'Action not confirmed. Use confirmAction tool first.' 
                                };
                              } else {
                                updateCell(parsedArgs.sheet, parsedArgs.cell, parsedArgs.value);
                                toolResult = {
                                  success: true,
                                  message: `Cell ${parsedArgs.sheet}!${parsedArgs.cell} updated to "${parsedArgs.value}"`,
                                };
                              }
                              break;

                            case 'getCellFormula':
                              let actualSheet = parsedArgs.sheet || 'Sheet1';
                              let actualCell = parsedArgs.cell;

                              if (actualCell.includes('!')) {
                                const parts = actualCell.split('!');
                                if (parts.length === 2) {
                                  actualSheet = parts[0].replace('@', '');
                                  actualCell = parts[1];
                                }
                              }

                              const formula = getCellFormula(actualSheet, actualCell);
                              if (formula) {
                                toolResult = {
                                  hasFormula: true,
                                  formula,
                                  cell: `${actualSheet}!${actualCell}`,
                                };
                              } else {
                                toolResult = {
                                  hasFormula: false,
                                  message: `Cell ${actualSheet}!${actualCell} has no formula`,
                                };
                              }
                              break;

                            default:
                              toolResult = { error: `Unknown tool: ${toolName}` };
                          }

                          toolResults.push({
                            tool_call_id: (toolCall as any).id,
                            output: JSON.stringify(toolResult)
                          });

                        } catch (toolError) {
                          toolResults.push({
                            tool_call_id: (toolCall as any).id,
                            output: JSON.stringify({ error: `Tool execution error: ${toolError}` })
                          });
                        }
                      }
                    }
                    
                    const toolResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        model: 'gpt-4o',
                        messages: [
                          ...messages.map(msg => ({
                            role: msg.role,
                            content: msg.content
                          })),
                          {
                            role: 'assistant',
                            tool_calls: Object.values(toolCallsBuffer).map((tc: any) => ({
                              id: tc.id,
                              type: tc.type,
                              function: {
                                name: tc.function.name,
                                arguments: tc.function.arguments
                              }
                            }))
                          },
                          ...toolResults.map(result => ({
                            role: 'tool',
                            tool_call_id: result.tool_call_id,
                            content: result.output
                          }))
                        ],
                        stream: true,
                      })
                    });

                    if (toolResponse.ok) {
                      const toolReader = toolResponse.body!.getReader();
                      const toolDecoder = new TextDecoder();
                      let toolBuffer = '';

                      while (true) {
                        const { done, value } = await toolReader.read();
                        if (done) break;

                        toolBuffer += toolDecoder.decode(value, { stream: true });
                        const toolLines = toolBuffer.split('\n');
                        toolBuffer = toolLines.pop() || '';

                        for (const toolLine of toolLines) {
                          if (toolLine.startsWith('data: ')) {
                            const toolData = toolLine.slice(6);
                            if (toolData === '[DONE]') {
                              break;
                            }
                            controller.enqueue(new TextEncoder().encode(toolLine + '\n'));
                          }
                        }
                      }
                    }
                    
                    toolCallsBuffer = {};
                    continue;
                  }

                  controller.enqueue(new TextEncoder().encode(line + '\n'));
                } catch (e) {
                  controller.enqueue(new TextEncoder().encode(line + '\n'));
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error in chat API:', error);

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}