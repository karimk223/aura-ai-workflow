import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STAGES, indexCandidatePool, planSelection, planArchiveCleanup } from './selection-core.mjs';
import { VIEWS, SELECTION_PROTOCOL } from '../../content creator website/app/creator-selection.ts';

function fixture() {
  const folder = (id, name, parent) => ({ id, name, parents: [parent], mimeType: 'application/vnd.google-apps.folder', trashed: false });
  const piece = folder('piece-1', 'Dress', STAGES.queue);
  const files = [folder('outputs', '04_PRODUCT_IMAGE_OUTPUTS', piece.id), folder('run', '_run', 'outputs'), folder('candidates', 'candidates', 'run')];
  for (const view of VIEWS) {
    files.push(folder(`${view}-folder`, view, 'candidates'));
    files.push(folder(`${view}-nested`, 'nested', `${view}-folder`));
    for (let attempt = 1; attempt <= 3; attempt++) files.push({ id: `${view}-${attempt}`, name: `attempt_${attempt}.png`,
      parents: [`${view}-nested`], mimeType: 'image/png', modifiedTime: '2026-10-14T12:00:00Z', md5Checksum: `${view}-${attempt}-checksum`,
      appProperties: { auraAttempt: String(attempt), auraAIReview: attempt === 3 ? 'pass' : 'fail' } });
  }
  files.push({ id: 'root-final', name: '01_front.png', parents: ['outputs'], mimeType: 'image/png' });
  return { piece, files };
}
function request(snapshot) { return { protocol: SELECTION_PROTOCOL, pieceFolderId: snapshot.record.pieceFolderId, reviewRevision: snapshot.record.reviewRevision,
  selections: Object.fromEntries(VIEWS.map((view) => [view, `${view}-2`])) }; }

test('recursive traversal returns twelve candidates, not root-level final copies', () => {
  const f = fixture(), s = indexCandidatePool(f.piece, f.files);
  assert.equal(s.record.images.length, 12);
  assert.equal(s.rootFinalCopies.length, 1);
  assert.equal(s.record.images.some((image) => image.id === 'root-final'), false);
  assert.match(s.record.images[0].path, /\/nested\//);
});
test('plan approves four different views and rejects the other eight without deleting images', () => {
  const f = fixture(), s = indexCandidatePool(f.piece, f.files), plan = planSelection(request(s), s);
  assert.equal(plan.approved.length, 4); assert.equal(plan.rejected.length, 8);
  assert.equal(new Set([...plan.approved, ...plan.rejected].map((entry) => entry.fileId)).size, 12);
  assert.equal(plan.approved[0].targetRelativePath, '04_PRODUCT_IMAGE_OUTPUTS/01_front.png');
  assert.equal(plan.preservedRootCopies[0].fileId, 'root-final'); assert.equal(plan.committed, false);
  assert.equal(plan.jobId, planSelection(request(s), s).jobId);
});
test('revision is order-independent but invalidates modified files and stale selections', () => {
  const f = fixture(), first = indexCandidatePool(f.piece, f.files);
  assert.equal(first.record.reviewRevision, indexCandidatePool(f.piece, [...f.files].reverse()).record.reviewRevision);
  f.files.find((file) => file.id === 'front-1').md5Checksum = 'changed';
  const changed = indexCandidatePool(f.piece, f.files);
  assert.notEqual(first.record.reviewRevision, changed.record.reviewRevision);
  assert.throws(() => planSelection(request(first), changed), /STALE_SELECTION/);
});
test('cross-view, foreign IDs, and pieces already moved out of the queue are rejected', () => {
  const f = fixture(), s = indexCandidatePool(f.piece, f.files), body = request(s);
  body.selections.front = 'back-1'; assert.throws(() => planSelection(body, s), /membership/);
  body.selections.front = 'foreign-image'; assert.throws(() => planSelection(body, s), /membership/);
  f.piece.parents = [STAGES.approved]; assert.throws(() => indexCandidatePool(f.piece, f.files), /awaiting/);
});
test('ambiguous roots, duplicate attempts, excessive candidates and missing views fail safely', () => {
  let f = fixture(); f.files.push({ ...f.files[0], id: 'second-output' });
  assert.throws(() => indexCandidatePool(f.piece, f.files), /exactly one/);
  f = fixture(); f.files.find((file) => file.id === 'front-1').appProperties.auraAttempt = '2';
  assert.throws(() => indexCandidatePool(f.piece, f.files), /attempt pool/);
  f = fixture(); f.files.push({ ...f.files.find((file) => file.id === 'front-1'), id: 'front-extra' });
  assert.throws(() => indexCandidatePool(f.piece, f.files), /More than three/);
  f = fixture(); f.files = f.files.filter((file) => !file.id.startsWith('back-') || file.mimeType.includes('folder'));
  const s = indexCandidatePool(f.piece, f.files); assert.match(s.record.issues.join(' '), /Back/);
  assert.throws(() => planSelection(request(s), s));
});
test('ZIP cleanup is a plan only and requires completion gates and an exact checksum allowlist', () => {
  const file = { id: 'zip-1', name: 'original.zip', mimeType: 'application/zip', md5Checksum: 'checksum-1' };
  const input = { pieceId: 'piece-1', extractionVerified: true, fourViewReviewPassed: true, files: [file],
    archiveManifest: [{ fileId: 'zip-1', pieceId: 'piece-1', role: 'original_transfer_zip', extractionVerified: true,
      extractedAssetIds: ['retained-reference'], expectedChecksum: 'checksum-1' }] };
  const plan = planArchiveCleanup(input); assert.equal(plan.length, 1); assert.equal(plan[0].requiresActionTimeConfirmation, true);
  assert.throws(() => planArchiveCleanup({ ...input, fourViewReviewPassed: false }));
  assert.throws(() => planArchiveCleanup({ ...input, extractionVerified: false }));
  assert.throws(() => planArchiveCleanup({ ...input, files: [{ ...file, mimeType: 'application/vnd.google-apps.folder' }] }));
  assert.throws(() => planArchiveCleanup({ ...input, files: [{ ...file, md5Checksum: 'different' }] }));
});
