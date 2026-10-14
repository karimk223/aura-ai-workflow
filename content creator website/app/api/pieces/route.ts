import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';
import { SELECTION_PROTOCOL, previewPieces, validatePiece, jsonObject } from '../../creator-selection';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Explicit offline preview takes precedence over any local live-service secrets.
  if (process.env.NODE_ENV !== 'production' && process.env.AURA_CREATOR_PREVIEW === '1') {
    return NextResponse.json({ protocol: SELECTION_PROTOCOL, pieces: previewPieces(), preview: true });
  }
  const endpoint = process.env.N8N_PIECES_URL;
  const username = process.env.N8N_BASIC_USERNAME;
  const password = process.env.N8N_BASIC_PASSWORD;
  if (!endpoint || !username || !password) {
    return NextResponse.json({ error: 'The candidate queue service is not configured.' }, { status: 503 });
  }
  try {
    const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(60000), headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
    } });
    const payload = jsonObject(await response.json());
    if (!response.ok) return NextResponse.json({ error: 'The candidate queue service could not load this queue.' }, { status: response.status });
    if (payload.protocol !== SELECTION_PROTOCOL || !Array.isArray(payload.pieces)) {
      return NextResponse.json({ error: 'The old whole-piece backend is still connected. Configure the candidate-selection backend before reviewing.' }, { status: 503 });
    }
    const pieces = payload.pieces.map(validatePiece);
    if (new Set(pieces.map((piece: { pieceFolderId: string }) => piece.pieceFolderId)).size !== pieces.length) {
      throw new Error('Duplicate pieces in queue.');
    }
    return NextResponse.json({ protocol: SELECTION_PROTOCOL, pieces });
  } catch {
    return NextResponse.json({ error: 'Unable to load a valid candidate queue. Check the n8n service and candidate folder structure.' }, { status: 502 });
  }
}
