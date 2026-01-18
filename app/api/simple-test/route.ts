import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ error: 'No API key' }, { status: 500 });
    }

    console.log('Testing with API key:', apiKey.substring(0, 7) + '...' + apiKey.slice(-4));

    // Простой запрос к OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Say hello' }],
        max_tokens: 10
      })
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorData = await response.text();
      console.log('Error response:', errorData);
      return NextResponse.json({
        success: false,
        status: response.status,
        error: errorData
      });
    }

    const data = await response.json();
    return NextResponse.json({
      success: true,
      data: data
    });

  } catch (error: any) {
    console.error('Test error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}