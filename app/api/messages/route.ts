import { NextRequest, NextResponse } from 'next/server';
import { createMessage } from '@/src/lib/db/db';

export async function POST(request: NextRequest) {
  try {
    const { threadId, role, content } = await request.json();
    
    if (!threadId || !role || !content) {
      return NextResponse.json(
        { error: 'threadId, role, and content are required' },
        { status: 400 }
      );
    }
    
    if (role !== 'user' && role !== 'assistant' && role !== 'system') {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }
    
    const message = createMessage(threadId, role, content);
    return NextResponse.json(message);
  } catch (error) {
    console.error('Error creating message:', error);
    return NextResponse.json(
      { error: 'Failed to create message' },
      { status: 500 }
    );
  }
}


