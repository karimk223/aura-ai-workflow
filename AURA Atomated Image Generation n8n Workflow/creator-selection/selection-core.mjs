// Offline integration core. This module does not make API calls or mutate Drive.
import { createHash } from 'node:crypto';
import { VIEWS, CANDIDATE_ROOT, SELECTION_PROTOCOL, parseSelectionRequest, validatePiece, selectionIsComplete } from '../../content creator website/app/creator-selection.ts';

export const STAGES = Object.freeze({
  queue: '1O-kkEwshBXZ8AYVzPf6N7h0njySVri1V',
  approved: '1LQzu9HFblegSGbDCurmeYZ1OrNJwJp0c',
  rejected: '1d2vIe5wh3ysjuvK0Q4tz0qZ16-HMl1DL',
});
const FOLDER = 'application/vnd.google-apps.folder';
const STEMS = { front: '01_front', back: '02_back', three_quarter_front: '03_three-quarter-front', detail_collage: '04_material-craftsmanship-collage' };
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// `files` must be a trusted, completely paginated Drive snapshot, not browser input.
export function indexCandidatePool(piece, files) {
  if (piece.mimeType !== FOLDER || !piece.parents?.includes(STAGES.queue) || piece.trashed) throw new Error('Piece is not awaiting creator review.');
  if (new Set(files.map((file) => file.id)).size !== files.length) throw new Error('Duplicate Drive snapshot IDs.');
  const entries = files.filter((file) => !file.trashed);
  const children = (parentId) => entries.filter((file) => file.parents?.includes(parentId));
  const oneFolder = (parentId, name) => {
    const matches = children(parentId).filter((file) => file.name === name && file.mimeType === FOLDER);
    if (matches.length !== 1) throw new Error(`Expected exactly one ${name} folder under ${parentId}.`);
    return matches[0];
  };
  const outputs = oneFolder(piece.id, '04_PRODUCT_IMAGE_OUTPUTS');
  const run = oneFolder(outputs.id, '_run');
  const candidates = oneFolder(run.id, 'candidates');
  const issues = [];
  const pool = [];
  const visited = new Set();
  const descend = (parentId, path, view, ancestors = new Set()) => {
    if (ancestors.has(parentId)) throw new Error('Cyclic candidate folder ancestry.');
    const chain = new Set([...ancestors, parentId]);
    for (const file of children(parentId)) {
      if (file.parents.length !== 1) throw new Error('Ambiguous candidate ancestry.');
      if (visited.has(file.id)) throw new Error('A candidate appears in multiple view trees.');
      visited.add(file.id);
      const filePath = `${path}/${file.name}`;
      if (file.mimeType === FOLDER) descend(file.id, filePath, view, chain);
      else if (file.mimeType?.startsWith('image/')) pool.push({ file, view, path: filePath });
      else if (file.mimeType === 'application/vnd.google-apps.shortcut') issues.push(`Shortcuts are not accepted as candidates: ${file.name}`);
    }
  };
  for (const view of VIEWS) {
    const group = oneFolder(candidates.id, view);
    descend(group.id, `${CANDIDATE_ROOT}/${view}`, view);
  }
  if (children(candidates.id).some((file) => !VIEWS.includes(file.name))) issues.push('Unexpected files or view folders in candidates.');
  const images = VIEWS.flatMap((view) => {
    const group = pool.filter((entry) => entry.view === view).sort((a, b) => a.path.localeCompare(b.path) || a.file.id.localeCompare(b.file.id));
    if (group.length > 3) throw new Error(`More than three ${view} candidate images.`);
    return group.map(({ file, path }, index) => ({
      id: file.id, name: file.name, url: `https://drive.google.com/thumbnail?id=${encodeURIComponent(file.id)}&sz=w1600`, view,
      attempt: file.appProperties?.auraAttempt === undefined ? index + 1 : Number(file.appProperties.auraAttempt), path,
      aiReview: ['pass', 'fail'].includes(file.appProperties?.auraAIReview) ? file.appProperties.auraAIReview : 'not_available',
    }));
  });
  const revision = hash({ piece: [piece.id, piece.parents, piece.modifiedTime ?? null],
    roots: [outputs.id, run.id, candidates.id],
    images: pool.map(({ file, view, path }) => [file.id, view, path, file.parents, file.modifiedTime ?? null, file.md5Checksum ?? null, file.appProperties ?? {}])
      .sort((a, b) => a[0].localeCompare(b[0])) });
  const record = validatePiece({ pieceFolderId: piece.id, pieceName: piece.name, reviewRevision: revision, images, issues });
  return { protocol: SELECTION_PROTOCOL, record, piece, outputsFolderId: outputs.id, runFolderId: run.id, candidatesFolderId: candidates.id,
    rootChildren: children(piece.id), runChildren: children(run.id),
    candidates: pool, rootFinalCopies: children(outputs.id).filter((file) => file.mimeType?.startsWith('image/')) };
}

export function planSelection(request, snapshot) {
  const body = parseSelectionRequest(request);
  if (body.pieceFolderId !== snapshot.record.pieceFolderId || body.reviewRevision !== snapshot.record.reviewRevision) {
    throw new Error('STALE_SELECTION: refresh and select from the current candidate pool.');
  }
  if (!selectionIsComplete(snapshot.record, body.selections)) throw new Error('Invalid candidate membership or view selection.');
  const selected = new Set(Object.values(body.selections));
  const extension = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
  const approved = VIEWS.map((view) => {
    const entry = snapshot.candidates.find((entry) => entry.view === view && entry.file.id === body.selections[view]);
    if (!extension[entry.file.mimeType]) throw new Error('Unsupported product image type.');
    return { fileId: entry.file.id, sourceParentId: entry.file.parents[0], view,
      targetRelativePath: `04_PRODUCT_IMAGE_OUTPUTS/${STEMS[view]}${extension[entry.file.mimeType]}` };
  });
  const rejected = snapshot.candidates.filter((entry) => !selected.has(entry.file.id)).map((entry) => ({
    fileId: entry.file.id, sourceParentId: entry.file.parents[0], view: entry.view, targetRelativePath: entry.path,
  }));
  return { protocol: SELECTION_PROTOCOL, jobId: hash(body), sourcePieceId: body.pieceFolderId,
    reviewRevision: body.reviewRevision, stageIds: STAGES, approved, rejected,
    // Preserve root-level final copies outside the designer's four-image root, without deleting them.
    preservedRootCopies: snapshot.rootFinalCopies.map((file) => ({ fileId: file.id, sourceParentId: snapshot.outputsFolderId,
      targetRelativePath: `04_PRODUCT_IMAGE_OUTPUTS/_run/final_copies/${file.name}` })),
    referenceFoldersToPreserve: ['01_MATERIAL_CLOSEUPS_4K', '02_WHOLE_FRONT_BACK_SIDE', '03_SIZE_FIT_MODEL_MANNEQUIN'],
    committed: false,
  };
}

export function planArchiveCleanup({ pieceId, extractionVerified, fourViewReviewPassed, archiveManifest, files }) {
  if (!extractionVerified || !fourViewReviewPassed) throw new Error('Archive cleanup requires verified extraction and passing four-view review.');
  if (!Array.isArray(archiveManifest) || new Set(archiveManifest.map((entry) => entry.fileId)).size !== archiveManifest.length) throw new Error('An exact archive allowlist is required.');
  return archiveManifest.map((entry) => {
    const file = files.find((file) => file.id === entry.fileId);
    if (!['original_transfer_zip', 'extracted_frames_zip'].includes(entry.role) || entry.pieceId !== pieceId || entry.extractionVerified !== true
      || !file || file.trashed || !['application/zip', 'application/x-zip-compressed'].includes(file.mimeType)
      || !entry.extractedAssetIds?.length || !entry.expectedChecksum || file.md5Checksum !== entry.expectedChecksum) {
      throw new Error('Archive is not safely allowlisted for cleanup.');
    }
    return { fileId: file.id, name: file.name, role: entry.role, operation: 'permanent_delete', requiresActionTimeConfirmation: true };
  });
}
