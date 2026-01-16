import { NextResponse } from 'next/server';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

export async function GET() {
  try {
    console.log('Testing OpenAI connection...');
    console.log('API Key exists:', !!process.env.OPENAI_API_KEY);
    console.log('Base URL:', process.env.OPENAI_BASE_URL || 'default');

    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
    });

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      prompt: 'Say "Hello, World!" in one word.',
    });

    return NextResponse.json({
      success: true,
      text: result.text,
      usage: result.usage,
    });
  } catch (error: any) {
    console.error('OpenAI test error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      cause: error.cause?.message,
      statusCode: error.statusCode,
    }, { status: 500 });
  }
}
