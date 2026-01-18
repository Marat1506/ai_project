'use client';

import { useEffect, useState, useRef } from 'react';
import { ThreadList } from '@/src/components/chat/ThreadList';
import { ChatInterface } from '@/src/components/chat/ChatInterface';
import type { Thread } from '@/src/lib/db/schema';

export default function Home() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadThreads();
  }, []);

  useEffect(() => {
    if (currentThreadId) {
      loadMessages(currentThreadId);
    } else {
      setMessages([]);
    }
  }, [currentThreadId]);

  const loadThreads = async () => {
    try {
      const response = await fetch('/api/threads');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Response is not JSON');
      }
      const data = await response.json();
      setThreads(data);
      
      if (data.length > 0 && !currentThreadId) {
        setCurrentThreadId(data[0].id);
      }
    } catch (error) {
      console.error('Error loading threads:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMessages = async (threadId: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    setIsLoadingMessages(true);
    
    try {
      const response = await fetch(`/api/threads/${threadId}/messages`, {
        signal: abortController.signal
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Response is not JSON');
      }
      const data = await response.json();
      
      if (abortController.signal.aborted) {
        return;
      }
      
      const formattedMessages = data.map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        toolInvocations: msg.toolInvocations,
      }));
      
      setMessages(formattedMessages);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Error loading messages:', error);
    } finally {
      setIsLoadingMessages(false);
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleCreateThread = async () => {
    try {
      const response = await fetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Новый тред ${new Date().toLocaleTimeString('ru-RU')}` }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create thread');
      }
      
      const newThread = await response.json();
      
      setThreads([newThread, ...threads]);
      setCurrentThreadId(newThread.id);
      setMessages([]);
    } catch (error) {
      console.error('❌ Error creating thread:', error);
      alert('Ошибка при создании треда');
    }
  };

  const handleSelectThread = (threadId: string) => {
    setMessages([]);
    setCurrentThreadId(threadId);
  };

  const handleAddMessage = async (message: any) => {
    setMessages(prev => [...prev, message]);
    
    if (message.role === 'assistant' && message.content && currentThreadId) {
      try {
        await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            threadId: currentThreadId,
            role: message.role,
            content: message.content,
            toolInvocations: message.toolInvocations
          }),
        });
      } catch (error) {
        console.error('Error saving assistant message:', error);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white">
      <div className="w-64 flex-shrink-0 border-r border-gray-200">
        <ThreadList
          threads={threads}
          currentThreadId={currentThreadId}
          onSelectThread={handleSelectThread}
          onCreateThread={handleCreateThread}
        />
      </div>
      
      <div className="flex-1 flex flex-col bg-white">
        <ChatInterface
          threadId={currentThreadId}
          initialMessages={messages}
          isLoadingMessages={isLoadingMessages}
          onAddMessage={handleAddMessage}
        />
      </div>
    </div>
  );
}
