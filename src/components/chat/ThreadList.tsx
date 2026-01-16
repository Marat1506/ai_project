'use client';

import { useEffect, useState } from 'react';
import type { Thread } from '@/src/lib/db/schema';

interface ThreadListProps {
  threads: Thread[];
  currentThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onCreateThread: () => void;
}

export function ThreadList({
  threads,
  currentThreadId,
  onSelectThread,
  onCreateThread,
}: ThreadListProps) {
  return (
    <div className="flex flex-col h-full bg-[#171717] text-gray-200">
      {/* Logo/Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-white rounded flex items-center justify-center">
            <span className="text-black font-bold text-sm">AI</span>
          </div>
          <span className="font-semibold text-white">ChatGPT</span>
        </div>
        <button
          onClick={onCreateThread}
          className="w-full px-3 py-2.5 bg-transparent border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 hover:border-gray-600 transition-colors flex items-center gap-2 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Новый чат
        </button>
      </div>
      
      {/* Threads list */}
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="p-4 text-gray-500 text-sm text-center">
            Нет чатов
          </div>
        ) : (
          <div className="p-2">
            {threads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => onSelectThread(thread.id)}
                className={`w-full text-left p-3 rounded-lg mb-1 transition-colors group ${
                  currentThreadId === thread.id
                    ? 'bg-gray-800 text-white'
                    : 'hover:bg-gray-800/50 text-gray-300'
                }`}
              >
                <div className="font-medium truncate text-sm">{thread.title}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

