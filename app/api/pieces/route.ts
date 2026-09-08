import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';

interface RawImage {
  id?: string;
  name?: string;
  url?: string;
  thumbnailLink?: string;
}

interface RawPiece {
  pieceFolderId?: string;
  id?: string;
  pieceName?: string;
  name?: string;
  images?: RawImage[];
}

const demoPieces = [
  {
    pieceFolderId: 'preview-piece',
    pieceName: 'Black Draped Evening Dress',
    images: [
      { id: 'front', name: 'Front', url: '/preview-front.jpg' },
      { id: 'back', name: 'Back', url: '/preview-back.jpg' },
      { id: 'three-quarter', name: 'Three-quarter', url: '/preview-three-quarter.jpg' },
      { id: 'detail', name: 'Detail', url: '/preview-detail.jpg' },
    ],
  },
];

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const endpoint = process.env.N8N_PIECES_URL;
  const username = process.env.N8N_BASIC_USERNAME;
  const password = process.env.N8N_BASIC_PASSWORD;

  if (!endpoint || !username || !password) {
    return NextResponse.json({
      pieces: process.env.NODE_ENV === 'production' ? [] : demoPieces,
    });
  }

  try {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      },
    });
    const payload = (await response.json()) as {
      pieces?: RawPiece[];
      error?: string;
    };

    if (!response.ok) {
      return NextResponse.json(
        { error: payload.error ?? 'Unable to load pieces.' },
        { status: response.status },
      );
    }

    const pieces = (payload.pieces ?? []).map((piece) => ({
      pieceFolderId: piece.pieceFolderId ?? piece.id ?? '',
      pieceName: piece.pieceName ?? piece.name ?? 'Untitled piece',
      images: (piece.images ?? []).map((image) => ({
        id: image.id ?? image.name ?? crypto.randomUUID(),
        name: image.name ?? 'Product image',
        url:
          image.url ??
          image.thumbnailLink ??
          (image.id
            ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(image.id)}&sz=w1600`
            : ''),
      })),
    }));

    return NextResponse.json({ pieces });
  } catch {
    return NextResponse.json(
      { error: 'Unable to reach the review service.' },
      { status: 502 },
    );
  }
}
