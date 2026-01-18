// Database schema types
export interface Thread {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_invocations?: string; // JSON string of tool invocations
  created_at: string;
}


