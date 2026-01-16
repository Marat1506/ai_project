import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { NextResponse } from 'next/server';

export const maxDuration = 30;
export const runtime = 'nodejs';

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    
    console.log('Testing non-streaming response');
    console.log('Messages:', messages.length);

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      messages: messages.slice(-5), // Only last 5 messages for context
    });

    console.log('Generated text:', result.text);

    return NextResponse.json({
      role: 'assistant',
      content: result.text,
    });
  } catch (error: any) {
    console.error('Error in chat-test API:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
