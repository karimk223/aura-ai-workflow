export const VIEWS = ['front', 'back', 'three_quarter_front', 'detail_collage'] as const;
export type ProductView = (typeof VIEWS)[number];
export const VIEW_LABELS: Record<ProductView, string> = {
  front: 'Front', back: 'Back', three_quarter_front: 'Three-quarter front', detail_collage: 'Detail collage',
};
export const SELECTION_PROTOCOL = 'aura-creator-selection/v1';
export const CANDIDATE_ROOT = '04_PRODUCT_IMAGE_OUTPUTS/_run/candidates';

export type ProductImage = {
  id: string; name: string; url: string; view: ProductView; attempt: number; path: string;
  aiReview?: 'pass' | 'fail' | 'not_available';
};
export type Piece = {
  pieceFolderId: string; pieceName: string; reviewRevision: string;
  images: ProductImage[]; issues: string[];
};
export type Selection = Partial<Record<ProductView, string>>;
export type SelectionRequest = {
  protocol: typeof SELECTION_PROTOCOL; pieceFolderId: string; reviewRevision: string;
  selections: Record<ProductView, string>;
};

export function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(value)) throw new Error('Invalid file or piece ID.');
  return value;
}
function revision(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000 || /[\x00-\x1f]/.test(value)) {
    throw new Error('Missing or invalid candidate revision. Refresh the queue.');
  }
  return value;
}

export function parseSelectionRequest(value: unknown): SelectionRequest {
  const body = jsonObject(value);
  if (body.protocol !== SELECTION_PROTOCOL) throw new Error('The four-view selection format is required.');
  const input = jsonObject(body.selections);
  if (Object.keys(input).length !== VIEWS.length || Object.keys(input).some((key) => !VIEWS.includes(key as ProductView))) {
    throw new Error('Select exactly one image for each of the four views.');
  }
  const selections = Object.fromEntries(VIEWS.map((view) => [view, id(input[view])])) as Record<ProductView, string>;
  if (new Set(Object.values(selections)).size !== VIEWS.length) throw new Error('Each view needs a different image.');
  return { protocol: SELECTION_PROTOCOL, pieceFolderId: id(body.pieceFolderId), reviewRevision: revision(body.reviewRevision), selections };
}

export function validatePiece(value: unknown): Piece {
  const raw = jsonObject(value);
  if (typeof raw.pieceName !== 'string' || !raw.pieceName.trim() || !Array.isArray(raw.images)) {
    throw new Error('Invalid candidate queue response.');
  }
  if (raw.images.length > 12) throw new Error('A piece cannot have more than twelve candidates.');
  const images = raw.images.map((value): ProductImage => {
    const image = jsonObject(value);
    const view = image.view as ProductView;
    if (!VIEWS.includes(view) || typeof image.name !== 'string' || !image.name.trim()
      || typeof image.url !== 'string' || typeof image.path !== 'string'
      || !Number.isInteger(image.attempt) || Number(image.attempt) < 1 || Number(image.attempt) > 3) {
      throw new Error('A candidate has an invalid view, attempt, or image record.');
    }
    const prefix = `${CANDIDATE_ROOT}/${view}/`;
    if (!image.path.startsWith(prefix) || image.path.split('/').some((part) => !part || part === '.' || part === '..')) {
      throw new Error('Only images inside the four candidate-view folders can be reviewed.');
    }
    if (!image.url.startsWith('/preview-')) {
      try { if (new URL(image.url).protocol !== 'https:') throw new Error(); }
      catch { throw new Error('Invalid candidate image URL.'); }
    }
    if (image.aiReview !== undefined && !['pass', 'fail', 'not_available'].includes(String(image.aiReview))) {
      throw new Error('Invalid candidate review status.');
    }
    return { id: id(image.id), name: image.name, url: image.url, view, attempt: Number(image.attempt), path: image.path,
      ...(image.aiReview ? { aiReview: image.aiReview as ProductImage['aiReview'] } : {}) };
  });
  if (new Set(images.map((image) => image.id)).size !== images.length) throw new Error('Duplicate candidate file IDs.');
  if (raw.issues !== undefined && (!Array.isArray(raw.issues) || raw.issues.some((issue) => typeof issue !== 'string'))) {
    throw new Error('Invalid candidate warnings.');
  }
  const issues = [...(raw.issues as string[] ?? [])];
  for (const view of VIEWS) {
    const group = images.filter((image) => image.view === view);
    if (group.length > 3 || new Set(group.map((image) => image.attempt)).size !== group.length) {
      throw new Error(`Invalid attempt pool for ${VIEW_LABELS[view]}.`);
    }
    if (group.length === 0) issues.push(`${VIEW_LABELS[view]} has no candidates yet.`);
  }
  return { pieceFolderId: id(raw.pieceFolderId), pieceName: raw.pieceName,
    reviewRevision: revision(raw.reviewRevision), images, issues: [...new Set(issues)] };
}

export function selectionIsComplete(piece: Piece, selections: Selection): boolean {
  return piece.issues.length === 0 && VIEWS.every((view) => piece.images.some((image) => image.view === view && image.id === selections[view]))
    && new Set(VIEWS.map((view) => selections[view])).size === VIEWS.length;
}

export function previewPieces(): Piece[] {
  return [{ pieceFolderId: 'preview-piece', pieceName: 'Black Draped Evening Dress', reviewRevision: 'preview-candidates-v1', issues: [],
    images: VIEWS.flatMap((view) => [1, 2, 3].map((attempt) => ({ id: `preview-${view}-${attempt}`,
      name: `attempt_${attempt}.png`, url: `/preview-${view}-${attempt}.jpg`, view, attempt,
      path: `${CANDIDATE_ROOT}/${view}/attempt_${attempt}.png`, aiReview: attempt === 3 ? 'pass' as const : 'fail' as const }))) }];
}
