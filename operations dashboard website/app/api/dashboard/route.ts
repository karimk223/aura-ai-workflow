import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';

const stageKeys = [
  'received',
  'processed',
  'approved',
  'rejected',
  'aiApproved',
  'aiRejected',
  'creatorApproved',
  'creatorRejected',
  'designerApproved',
  'designerRejected',
] as const;

type StageKey = (typeof stageKeys)[number];

interface RawPiece {
  id?: string;
  name?: string;
  pieceFolderId?: string;
  pieceName?: string;
  area?: 'raw' | 'content';
  category?: 'raw' | 'content';
  stage?: StageKey;
  status?: StageKey;
  updatedAt?: string | null;
  modifiedTime?: string | null;
  driveUrl?: string | null;
  url?: string | null;
}

interface RawDashboard {
  generatedAt?: string;
  counts?: Partial<Record<StageKey, number>>;
  pieces?: RawPiece[];
}

export const dynamic = 'force-dynamic';

function emptyCounts(): Record<StageKey, number> {
  return Object.fromEntries(stageKeys.map((key) => [key, 0])) as Record<
    StageKey,
    number
  >;
}

export async function GET() {
  const user = await getChatGPTUser();

  if (!user && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const endpoint = process.env.N8N_DASHBOARD_URL;

  if (!endpoint) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      counts: emptyCounts(),
      pieces: [],
      connection: 'pending',
      message: 'The live dashboard connection is ready to be configured.',
    });
  }

  try {
    const headers: HeadersInit = { Accept: 'application/json' };
    const username = process.env.N8N_BASIC_USERNAME;
    const password = process.env.N8N_BASIC_PASSWORD;

    if (username && password) {
      headers.Authorization = `Basic ${Buffer.from(
        `${username}:${password}`,
      ).toString('base64')}`;
    }

    const response = await fetch(endpoint, {
      cache: 'no-store',
      headers,
      signal: AbortSignal.timeout(20000),
    });

    const payload = (await response.json()) as RawDashboard & {
      error?: string;
    };

    if (!response.ok) {
      return NextResponse.json(
        { error: payload.error ?? 'Unable to load dashboard data.' },
        { status: response.status },
      );
    }

    const counts = emptyCounts();
    for (const key of stageKeys) {
      counts[key] = Math.max(0, Number(payload.counts?.[key] ?? 0));
    }

    const pieces = (payload.pieces ?? [])
      .map((piece) => {
        const stage = piece.stage ?? piece.status;
        if (!stage || !stageKeys.includes(stage)) return null;

        const area =
          piece.area ??
          piece.category ??
          (['received', 'processed', 'approved', 'rejected'].includes(stage)
            ? 'raw'
            : 'content');

        return {
          id: piece.id ?? piece.pieceFolderId ?? '',
          name: piece.name ?? piece.pieceName ?? 'Untitled piece',
          area,
          stage,
          updatedAt: piece.updatedAt ?? piece.modifiedTime ?? null,
          driveUrl:
            piece.driveUrl ??
            piece.url ??
            (piece.id
              ? `https://drive.google.com/drive/folders/${encodeURIComponent(piece.id)}`
              : null),
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      generatedAt: payload.generatedAt ?? new Date().toISOString(),
      counts,
      pieces,
      connection: 'live',
    });
  } catch {
    return NextResponse.json(
      { error: 'Unable to reach the dashboard service.' },
      { status: 502 },
    );
  }
}
