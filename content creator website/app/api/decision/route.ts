import { NextRequest, NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';
import { SELECTION_PROTOCOL, parseSelectionRequest, jsonObject } from '../../creator-selection';

export async function POST(request: NextRequest) {
  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  let body;
  try { body = parseSelectionRequest(await request.json()); }
  catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Invalid selection.' }, { status: 400 });
  }
  if (process.env.NODE_ENV !== 'production' && process.env.AURA_CREATOR_PREVIEW === '1') {
    return NextResponse.json({ success: true, protocol: SELECTION_PROTOCOL, committed: false, preview: true });
  }
  // Never fall back to N8N_DECISION_URL: that endpoint moves an entire piece.
  const endpoint = process.env.N8N_SELECTION_URL;
  const username = process.env.N8N_BASIC_USERNAME;
  const password = process.env.N8N_BASIC_PASSWORD;
  if (!endpoint || !username || !password) {
    return NextResponse.json({ success: false, error: 'Four-view selection routing is not configured. No files were moved.' }, { status: 503 });
  }
  try {
    const response = await fetch(endpoint, { method: 'POST', signal: AbortSignal.timeout(60000), headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      'Content-Type': 'application/json',
    }, body: JSON.stringify(body) });
    const payload = jsonObject(await response.json());
    if (!response.ok) {
      return NextResponse.json({ success: false, error: response.status === 409
        ? 'This piece or its candidates changed. Refresh the queue before selecting again.'
        : 'Selection could not be confirmed. Check the n8n execution before retrying.' }, { status: response.status });
    }
    if (payload.protocol !== SELECTION_PROTOCOL || payload.success !== true || payload.committed !== true) {
      throw new Error('Unconfirmed selection commit.');
    }
    return NextResponse.json({ success: true, protocol: SELECTION_PROTOCOL, committed: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Routing could not be confirmed. Check the n8n execution before retrying; files may already have moved.' }, { status: 502 });
  }
}
