'use client';

import { useEffect, useState, useRef } from 'react';
import { useChat } from 'ai';
import { ChatMessage } from './ChatMessage';
import { TableViewer } from './TableViewer';

interface ChatInterfaceProps {
  threadId: string | null;
  initialMessages?: any[];
}

export function ChatInterface({ threadId, initialMessages = [] }: ChatInterfaceProps) {
  const [selectedRange, setSelectedRange] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [tableData, setTableData] = useState<any>(null);
  
  const { messages, input, handleInputChange, handleSubmit, isLoading, toolInvocations, setInput, append, error } = useChat({
    api: '/api/chat',
    body: {
      threadId,
    },
    initialMessages,
    onFinish: async (message) => {
      console.log('Chat finished, message:', message);
      // Save assistant message to database
      if (threadId && message.role === 'assistant') {
        try {
          await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              threadId,
              role: 'assistant',
              content: message.content,
            }),
          });
        } catch (error) {
          console.error('Error saving assistant message:', error);
        }
      }
    },
    onError: (error) => {
      console.error('Chat error:', error);
      console.error('Error type:', typeof error);
      console.error('Error keys:', Object.keys(error));
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
    },
    onResponse: async (response) => {
      console.log('Chat response received:', response.status, response.statusText);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      // Try to read the response body for debugging
      const clone = response.clone();
      try {
        const text = await clone.text();
        console.log('Response body preview:', text.substring(0, 500));
      } catch (e) {
        console.log('Could not read response body');
      }
    },
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleInsertMention = (mention: string) => {
    setInput(input + (input ? ' ' : '') + mention);
  };

  const handleSelectRange = (range: string) => {
    setSelectedRange(range);
    handleInsertMention(range);
    setShowTable(false);
  };

  const handleConfirmAction = async ({ toolName, data }: any) => {
    // Send a message that will trigger the tool call with confirmation
    const message = `Подтверждаю выполнение ${toolName}`;
    await append({
      role: 'user',
      content: message,
      experimental_toolCalls: [{
        toolCallId: `confirm-${Date.now()}`,
        toolName,
        args: data,
      }],
    });
  };

  const handleCancelAction = async () => {
    await append({
      role: 'user',
      content: 'Отменяю действие',
    });
  };

  if (!threadId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
        <div className="text-2xl font-light text-gray-400 mb-4">
          Готов, когда ты готов.
        </div>
      </div>
    );
  }

  // Show error if present
  useEffect(() => {
    if (error) {
      console.error('useChat error:', error);
    }
  }, [error]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">ChatGPT</span>
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="text-2xl font-light text-gray-400 mb-4">
              Готов, когда ты готов.
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {messages.map((message, idx) => {
              // Find tool invocations for this message
              const messageToolInvocations = toolInvocations?.filter(
                (inv) => inv.messageId === message.id
              );

              return (
                <ChatMessage
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  toolInvocations={messageToolInvocations}
                  onTableClick={(data) => {
                    setTableData(data);
                    setShowTable(true);
                  }}
                  threadId={threadId}
                  onConfirmAction={handleConfirmAction}
                  onCancelAction={handleCancelAction}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 bg-white">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto p-4">
          <div className="relative flex items-end gap-2">
            <button
              type="button"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors mb-1"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => {
                  const syntheticEvent = {
                    target: { value: e.target.value }
                  } as React.ChangeEvent<HTMLInputElement>;
                  handleInputChange(syntheticEvent);
                }}
                placeholder="Спросите что-нибудь..."
                className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent resize-none max-h-32 overflow-y-auto"
                disabled={isLoading}
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim()) {
                      handleSubmit(e as any);
                    }
                  }
                }}
              />
              <div className="absolute right-3 bottom-3 flex items-center gap-2">
                <button
                  type="button"
                  className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="p-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      {showTable && tableData && (
        <TableViewer
          data={tableData}
          onClose={() => setShowTable(false)}
          onSelectRange={handleSelectRange}
        />
      )}
    </div>
  );
}

