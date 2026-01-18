'use client';

import { useEffect, useState, useRef } from 'react';
import { TableViewer } from './TableViewer';
import { ChatMessage } from './ChatMessage';

interface ChatInterfaceProps {
  threadId: string | null;
  initialMessages?: any[];
  isLoadingMessages?: boolean;
  onAddMessage?: (message: any) => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolInvocations?: any[];
}

export function ChatInterface({ 
  threadId, 
  initialMessages = [], 
  isLoadingMessages = false,
  onAddMessage
}: ChatInterfaceProps) {
  const [selectedRange, setSelectedRange] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [tableData, setTableData] = useState<any>(null);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSavedRanges, setShowSavedRanges] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
    setError(null);
  }, [threadId]);

  const prevInitialMessages = useRef(initialMessages);
  useEffect(() => {
    if (JSON.stringify(initialMessages) !== JSON.stringify(prevInitialMessages.current)) {
      setMessages(initialMessages);
      prevInitialMessages.current = initialMessages;
    }
  }, [initialMessages]);

  const prevMessagesLength = useRef(0);
  useEffect(() => {
    if (messages.length > prevMessagesLength.current && messages.length > initialMessages.length) {
      const newMessages = messages.slice(prevMessagesLength.current);
      newMessages.forEach(message => {
        if (onAddMessage) {
          onAddMessage(message);
        }
      });
    }
    prevMessagesLength.current = messages.length;
  }, [messages, onAddMessage, initialMessages.length]);

  const sendMessageToApi = async (message: string) => {
    if (!threadId) {
      setError('Ошибка: не выбран тред для отправки сообщения');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, { role: 'user' as const, content: message }],
          threadId
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Ошибка сервера';
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || `HTTP ${response.status}`;
          
          if (response.status === 500) {
            errorMessage = 'Внутренняя ошибка сервера. Возможно, проблема с подключением к OpenAI API.';
          } else if (response.status === 503) {
            errorMessage = 'Сервис временно недоступен. Попробуйте снова через несколько минут.';
          } else if (response.status === 429) {
            errorMessage = 'Превышен лимит запросов. Подождите немного перед следующим запросом.';
          }
        } catch (parseError) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let assistantMessage = '';
      let buffer = '';

      const tempMessageId = `temp-${Date.now()}`;
      const tempMessage = { id: tempMessageId, role: 'assistant' as const, content: '' };
      setMessages(prev => [...prev, tempMessage]);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '') continue;
            
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                break;
              }

              try {
                const parsed = JSON.parse(data);
                
                if (parsed.choices && parsed.choices[0]?.delta?.content) {
                  const content = parsed.choices[0].delta.content;
                  assistantMessage += content;

                  setMessages(prev =>
                    prev.map(msg =>
                      msg.id === tempMessageId
                        ? { ...msg, content: assistantMessage }
                        : msg
                    )
                  );
                }
                
                else if (parsed.type === 'text-delta' && parsed.value) {
                  assistantMessage += parsed.value;

                  setMessages(prev =>
                    prev.map(msg =>
                      msg.id === tempMessageId
                        ? { ...msg, content: assistantMessage }
                        : msg
                    )
                  );
                } else if (parsed.type === 'tool-result' && parsed.result) {
                  
                  if (parsed.toolName === 'readExcelRange' && parsed.result.success) {
                    setMessages(prev =>
                      prev.map(msg =>
                        msg.id === tempMessageId
                          ? { 
                              ...msg, 
                              content: assistantMessage,
                              toolInvocations: [
                                ...(msg.toolInvocations || []),
                                {
                                  toolCallId: parsed.toolCallId || `tool-${Date.now()}`,
                                  toolName: 'readExcelRange',
                                  state: 'result',
                                  result: parsed.result
                                }
                              ]
                            }
                          : msg
                      )
                    );
                  }
                  else if (parsed.result.requiresConfirmation) {
                    setMessages(prev =>
                      prev.map(msg =>
                        msg.id === tempMessageId
                          ? { 
                              ...msg, 
                              content: assistantMessage,
                              toolInvocations: [
                                ...(msg.toolInvocations || []),
                                {
                                  toolCallId: parsed.toolCallId,
                                  toolName: 'confirmAction',
                                  state: 'result',
                                  result: parsed.result
                                }
                              ]
                            }
                          : msg
                      )
                    );
                  }
                }
              } catch (parseError) {
                // Ignore parsing errors for service data
              }
            }
          }
        }

        if (assistantMessage) {
          const finalMessageId = `msg-${Date.now()}`;
          let savedToolInvocations: any[] | undefined;
          
          setMessages(prev => {
            const tempMessage = prev.find(m => m.id === tempMessageId);
            savedToolInvocations = tempMessage?.toolInvocations;
            
            return prev.map(msg =>
              msg.id === tempMessageId
                ? { 
                    id: finalMessageId, 
                    role: 'assistant' as const, 
                    content: assistantMessage,
                    toolInvocations: msg.toolInvocations
                  }
                : msg
            ).filter(msg => msg.id !== tempMessageId);
          });

          if (threadId) {
            try {
              await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  threadId,
                  role: 'assistant',
                  content: assistantMessage,
                  toolInvocations: savedToolInvocations
                }),
              });
            } catch (error) {
              console.error('Error saving assistant message:', error);
            }
          }
        } else {
          setMessages(prev => prev.filter(msg => msg.id !== tempMessageId));
        }
      } catch (streamError) {
        setMessages(prev => prev.filter(msg => msg.id !== tempMessageId));
        throw streamError;
      }

    } catch (error: any) {
      let errorMessage = 'Произошла ошибка при отправке сообщения';
      
      if (error.message?.includes('fetch failed') || error.message?.includes('Failed to fetch')) {
        errorMessage = 'Проблема с подключением к серверу. Проверьте интернет-соединение и попробуйте снова.';
      } else if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
        errorMessage = 'Превышено время ожидания ответа. Попробуйте снова через несколько секунд.';
      } else if (error.message?.includes('500')) {
        errorMessage = 'Внутренняя ошибка сервера. Попробуйте снова или обратитесь к администратору.';
      } else if (error.message?.includes('401') || error.message?.includes('403')) {
        errorMessage = 'Ошибка авторизации. Проверьте настройки API ключа.';
      } else if (error.message?.includes('429')) {
        errorMessage = 'Превышен лимит запросов. Подождите немного и попробуйте снова.';
      } else if (error.message) {
        errorMessage = `Ошибка: ${error.message}`;
      }
      
      setError(errorMessage);
      
      setTimeout(() => {
        setError(null);
      }, 10000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading || !threadId) return;

    const messageContent = inputValue.trim();
    setInputValue('');
    setError(null);

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: messageContent,
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);

    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          role: 'user',
          content: messageContent,
        }),
      });
    } catch (error) {
      console.error('Error saving user message:', error);
    }

    try {
      await sendMessageToApi(messageContent);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showSavedRanges) {
        const target = event.target as Element;
        if (!target.closest('.saved-ranges-dropdown')) {
          setShowSavedRanges(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSavedRanges]);

  const handleInsertMention = (mention: string) => {
    const currentInput = inputValue || '';
    setInputValue(currentInput + (currentInput ? ' ' : '') + mention);
  };

  const handleSelectRange = (range: string) => {
    setSelectedRange(range);
    const mention = `@${range}`;
    handleInsertMention(mention);
    setShowTable(false);
  };

  const getSavedRanges = (): string[] => {
    try {
      const saved = localStorage.getItem('savedRanges');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  };

  const handleInsertSavedRange = (range: string) => {
    const mention = `@${range}`;
    handleInsertMention(mention);
    setShowSavedRanges(false);
  };

  const handleConfirmAction = async ({ toolName, data }: any) => {
    if (data.action === 'clear' || data.action === 'delete') {
      const details = data.details;
      const target = details.target;
      
      if (target.includes(':')) {
        const message = `Подтверждаю удаление диапазона ${target}. Выполни updateExcelCell для каждой ячейки в диапазоне с пустым значением и параметром confirmed=true.`;
        setInputValue(message);
        await sendMessageToApi(message);
      } else {
        const message = `Подтверждаю удаление ячейки ${target}. Выполни updateExcelCell с пустым значением и параметром confirmed=true.`;
        setInputValue(message);
        await sendMessageToApi(message);
      }
    } else if (data.action === 'update') {
      const details = data.details;
      const message = `Подтверждаю обновление ${details.target} значением "${details.value}". Выполни updateExcelCell с параметром confirmed=true.`;
      setInputValue(message);
      await sendMessageToApi(message);
    }
  };

  const handleCancelAction = async () => {
    const message = 'Отменяю действие. Операция не будет выполнена.';
    setInputValue(message);
    await sendMessageToApi(message);
  };

  if (!threadId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
        <div className="text-2xl font-light text-gray-400 mb-4">
          Выберите или создайте тред
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
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
        {error && (
          <div className="mx-4 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm text-red-800">{error}</p>
              </div>
              <div className="ml-auto pl-3">
                <button
                  onClick={() => setError(null)}
                  className="inline-flex text-red-400 hover:text-red-600"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {isLoadingMessages && (
          <div className="flex items-center justify-center p-8">
            <div className="flex items-center gap-2 text-gray-500">
              <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Загрузка сообщений...</span>
            </div>
          </div>
        )}

        {messages.length === 0 && !isLoadingMessages ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="text-2xl font-light text-gray-400 mb-4">
              Готов, когда ты готов.
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role}
                content={message.content}
                toolInvocations={message.toolInvocations}
                onTableClick={(data) => {
                  setTableData(data);
                  setShowTable(true);
                }}
                threadId={threadId}
                onConfirmAction={handleConfirmAction}
                onCancelAction={handleCancelAction}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 bg-white">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await handleSend();
          }}
          className="max-w-3xl mx-auto p-4"
        >
          <div className="relative flex items-end gap-2">
            <button
              type="button"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors mb-1"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            
            <div className="relative saved-ranges-dropdown">
              <button
                type="button"
                onClick={() => setShowSavedRanges(!showSavedRanges)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors mb-1"
                title="Сохраненные диапазоны"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h2a2 2 0 002-2z" />
                </svg>
              </button>
              {showSavedRanges && (
                <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-300 rounded-lg shadow-lg min-w-[200px] max-h-[200px] overflow-y-auto z-10">
                  <div className="p-2 border-b border-gray-200 text-sm font-medium text-gray-700">
                    Сохраненные диапазоны
                  </div>
                  {getSavedRanges().length === 0 ? (
                    <div className="p-3 text-sm text-gray-500 text-center">
                      Нет сохраненных диапазонов
                    </div>
                  ) : (
                    getSavedRanges().map((range, index) => (
                      <button
                        key={index}
                        onClick={() => handleInsertSavedRange(range)}
                        className="w-full text-left p-2 hover:bg-gray-100 text-sm border-b border-gray-100 last:border-b-0"
                      >
                        @{range}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="flex-1 relative">
              <textarea
                name="message"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                }}
                placeholder="Спросите что-нибудь... (используйте @Sheet1!A1:B3 для ссылки на диапазоны)"
                className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent resize-none max-h-32 overflow-y-auto"
                disabled={isLoading}
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (inputValue && inputValue.trim() && threadId) {
                      handleSend();
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
                  disabled={isLoading || !inputValue || !inputValue.trim() || !threadId}
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