import { NextRequest, NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';

export async function POST(request: NextRequest) {
  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  const body = (await request.json()) as {
    pieceFolderId?: string;
    decision?: string;
  };

  if (!body.pieceFolderId || !['good', 'no_good'].includes(body.decision ?? '')) {
    return NextResponse.json(
      { success: false, error: 'Invalid designer decision.' },
      { status: 400 },
    );
  }

  const endpoint = process.env.N8N_DECISION_URL;
  const username = process.env.N8N_BASIC_USERNAME;
  const password = process.env.N8N_BASIC_PASSWORD;

  if (!endpoint || !username || !password) {
    if (process.env.NODE_ENV !== 'production') {
      return NextResponse.json({ success: true, preview: true });
    }
    return NextResponse.json(
      { success: false, error: 'Review service is not configured.' },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
    };
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Unable to reach the review service.' },
      { status: 502 },
    );
  }
}
