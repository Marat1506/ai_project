'use client';

import { useState } from 'react';
import { ToolInvocation } from 'ai/react';
import { ConfirmationDialog } from './ConfirmationDialog';
import { TableViewer } from './TableViewer';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  toolInvocations?: ToolInvocation[];
  onTableClick?: (data: any) => void;
  threadId?: string | null;
  onConfirmAction?: (data: any) => void;
  onCancelAction?: () => void;
}

export function ChatMessage({ 
  role, 
  content, 
  toolInvocations, 
  onTableClick, 
  threadId,
  onConfirmAction,
  onCancelAction,
}: ChatMessageProps) {
  const [showTable, setShowTable] = useState(false);
  const [tableData, setTableData] = useState<any>(null);

  const isUser = role === 'user';

  // Extract table data from tool invocations
  const tableToolInvocation = toolInvocations?.find(
    (inv) => inv.toolName === 'readExcelRange' && inv.state === 'result'
  );

  const handleTableClick = () => {
    if (tableToolInvocation?.result?.data) {
      const data = {
        range: tableToolInvocation.result.range,
        data: tableToolInvocation.result.data,
      };
      setTableData(data);
      setShowTable(true);
      if (onTableClick) {
        onTableClick(data);
      }
    }
  };

  const handleConfirm = async ({ toolName, data: confirmedData }: any) => {
    if (onConfirmAction) {
      onConfirmAction({ toolName, data: confirmedData });
    }
  };

  const handleCancel = async () => {
    if (onCancelAction) {
      onCancelAction();
    }
  };

  return (
    <>
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-6 px-4`}>
        <div className={`flex gap-4 max-w-3xl ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          {/* Avatar */}
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            isUser ? 'bg-gray-800' : 'bg-gray-200'
          }`}>
            {isUser ? (
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            )}
          </div>
          
          {/* Message content */}
          <div className="flex-1">
            <div className={`rounded-2xl px-4 py-3 ${
              isUser
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-900'
            }`}>
              <div className="whitespace-pre-wrap leading-relaxed">{content}</div>
          
          {/* Render tool invocations */}
          {toolInvocations && toolInvocations.length > 0 && (
            <div className="mt-3 space-y-2">
              {toolInvocations.map((invocation, idx) => {
                if (invocation.state === 'result' && invocation.result) {
                  const result = invocation.result as any;
                  
                  // Handle table display
                  if (invocation.toolName === 'readExcelRange' && result.data) {
                    return (
                      <div key={idx} className="mt-3">
                        <button
                          onClick={handleTableClick}
                          className={`text-sm underline ${
                            isUser 
                              ? 'text-blue-300 hover:text-blue-200' 
                              : 'text-blue-600 hover:text-blue-800'
                          }`}
                        >
                          📊 Показать таблицу: {result.range?.sheet}!{result.range?.from}:{result.range?.to}
                        </button>
                        <div className={`mt-2 text-xs p-2 rounded border ${
                          isUser 
                            ? 'bg-gray-700 border-gray-600 text-gray-200' 
                            : 'bg-white border-gray-300'
                        }`}>
                          <pre className="overflow-x-auto">
                            {JSON.stringify(result.data, null, 2)}
                          </pre>
                        </div>
                      </div>
                    );
                  }
                  
                  // Handle confirmation requests
                  if (result.requiresConfirmation) {
                    return (
                      <ConfirmationDialog
                        key={idx}
                        action={result.action}
                        message={result.message}
                        data={result}
                        onConfirm={handleConfirm}
                        onCancel={handleCancel}
                      />
                    );
                  }
                  
                  // Handle success messages
                  if (result.success || result.message) {
                    return (
                      <div key={idx} className={`text-sm mt-2 ${
                        isUser ? 'text-green-300' : 'text-green-600'
                      }`}>
                        ✓ {result.message || 'Успешно выполнено'}
                      </div>
                    );
                  }
                }
                
                if (invocation.state === 'call') {
                  return (
                    <div key={idx} className={`text-xs mt-1 ${
                      isUser ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      🔧 Вызов: {invocation.toolName}
                    </div>
                  );
                }
                
                return null;
              })}
            </div>
          )}
            </div>
          </div>
        </div>
      </div>
      
      {showTable && tableData && (
        <TableViewer
          data={tableData}
          onClose={() => setShowTable(false)}
        />
      )}
    </>
  );
}

