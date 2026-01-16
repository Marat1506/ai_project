import { NextRequest, NextResponse } from 'next/server';
import { getAllThreads, createThread, getThread } from '@/src/lib/db/db';

export async function GET() {
  try {
    const threads = getAllThreads();
    return NextResponse.json(threads);
  } catch (error: any) {
    console.error('Error fetching threads:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch threads',
        details: error?.message || 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { title } = await request.json();
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    
    const thread = createThread(title);
    return NextResponse.json(thread);
  } catch (error) {
    console.error('Error creating thread:', error);
    return NextResponse.json({ error: 'Failed to create thread' }, { status: 500 });
  }
}

