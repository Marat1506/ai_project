'use client';

import { useState } from 'react';

interface ConfirmationDialogProps {
  action: string;
  message: string;
  data: any;
  onConfirm: (data: any) => void;
  onCancel: () => void;
}

export function ConfirmationDialog({ 
  action, 
  message, 
  data, 
  onConfirm, 
  onCancel 
}: ConfirmationDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirm = async () => {
    setIsProcessing(true);
    
    const toolName = getToolName(action);
    const confirmedData = {
      ...data,
      confirmed: true,
    };
    
    onConfirm({ toolName, data: confirmedData });
    
    setIsProcessing(false);
  };

  const handleCancel = () => {
    onCancel();
  };

  const getToolName = (action: string): string => {
    switch (action) {
      case 'updateCell':
        return 'updateExcelCell';
      case 'updateRange':
        return 'updateExcelRange';
      case 'deleteThread':
        return 'deleteThread';
      default:
        return action;
    }
  };

  return (
    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
      <div className="text-sm font-medium text-yellow-900 mb-2">
        ⚠️ Требуется подтверждение
      </div>
      <div className="text-sm text-yellow-800 mb-3">{message}</div>
      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={isProcessing}
          className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          Да
        </button>
        <button
          onClick={handleCancel}
          disabled={isProcessing}
          className="px-4 py-2 bg-gray-300 text-gray-800 text-sm rounded-lg hover:bg-gray-400 disabled:opacity-50 transition-colors"
        >
          Нет
        </button>
      </div>
    </div>
  );
}

