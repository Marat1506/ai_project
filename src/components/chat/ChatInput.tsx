'use client';

import { useState } from 'react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  onInsertMention?: (mention: string) => void;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  onInsertMention,
}: ChatInputProps) {
  const [showMentions, setShowMentions] = useState(false);
  const [savedRanges, setSavedRanges] = useState<string[]>([]);

  // Load saved ranges from localStorage
  useState(() => {
    const saved = localStorage.getItem('savedRanges');
    if (saved) {
      setSavedRanges(JSON.parse(saved));
    }
  });

  const handleInsertMention = (mention: string) => {
    if (onInsertMention) {
      onInsertMention(mention);
    } else {
      onChange(value + (value ? ' ' : '') + mention);
    }
    setShowMentions(false);
  };

  const handleSaveRange = (range: string) => {
    const updated = [...savedRanges, range];
    setSavedRanges(updated);
    localStorage.setItem('savedRanges', JSON.stringify(updated));
  };

  return (
    <div className="relative">
      <form onSubmit={onSubmit} className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Введите сообщение... (используйте @ для меншонов диапазонов)"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === '@') {
                setShowMentions(true);
              }
            }}
          />
          
          {showMentions && savedRanges.length > 0 && (
            <div className="absolute bottom-full mb-2 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
              {savedRanges.map((range, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleInsertMention(range)}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 border-b border-gray-200 last:border-b-0"
                >
                  {range}
                </button>
              ))}
            </div>
          )}
        </div>
        
        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Отправка...' : 'Отправить'}
        </button>
      </form>
    </div>
  );
}


