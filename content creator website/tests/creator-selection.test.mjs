import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VIEWS, SELECTION_PROTOCOL, previewPieces, parseSelectionRequest, validatePiece, selectionIsComplete } from '../app/creator-selection.ts';

const piece = () => structuredClone(previewPieces()[0]);
const choices = (p) => Object.fromEntries(VIEWS.map((view) => [view, p.images.find((image) => image.view === view).id]));
const request = () => { const p = piece(); return { protocol: SELECTION_PROTOCOL, pieceFolderId: p.pieceFolderId, reviewRevision: p.reviewRevision, selections: choices(p) }; };

test('twelve candidates are presented as three per view', () => {
  const p = validatePiece(piece());
  assert.equal(p.images.length, 12);
  for (const view of VIEWS) assert.equal(p.images.filter((image) => image.view === view).length, 3);
  assert.ok(selectionIsComplete(p, choices(p)));
});
test('exactly four distinct view choices are required', () => {
  assert.equal(Object.keys(parseSelectionRequest(request()).selections).length, 4);
  const missing = request(); delete missing.selections.back;
  assert.throws(() => parseSelectionRequest(missing));
  const duplicate = request(); duplicate.selections.back = duplicate.selections.front;
  assert.throws(() => parseSelectionRequest(duplicate));
  const extra = request(); extra.selections.side = 'extra';
  assert.throws(() => parseSelectionRequest(extra));
  assert.throws(() => parseSelectionRequest({ pieceFolderId: 'preview-piece', decision: 'good' }));
});
test('a choice cannot be borrowed from another view or piece', () => {
  const p = piece(), s = choices(p);
  s.front = p.images.find((image) => image.view === 'back').id;
  assert.equal(selectionIsComplete(p, s), false);
  s.front = 'other-piece-image';
  assert.equal(selectionIsComplete(p, s), false);
});
test('root final copies and mismatched ancestry are not candidate options', () => {
  const p = piece(); p.images[0].path = '04_PRODUCT_IMAGE_OUTPUTS/01_front.png';
  assert.throws(() => validatePiece(p));
  p.images[0].path = '04_PRODUCT_IMAGE_OUTPUTS/_run/candidates/back/attempt_1.png';
  assert.throws(() => validatePiece(p));
  p.images[0].path = '04_PRODUCT_IMAGE_OUTPUTS/_run/candidates/front/../attempt_1.png';
  assert.throws(() => validatePiece(p));
});
test('recursive candidates are accepted, but excessive/duplicate attempts are blocked', () => {
  const p = piece(); p.images[0].path = '04_PRODUCT_IMAGE_OUTPUTS/_run/candidates/front/nested/attempt_1.png';
  assert.equal(validatePiece(p).images.length, 12);
  p.images[0].attempt = 2;
  assert.throws(() => validatePiece(p));
  const excess = piece(); excess.images.push({ ...excess.images[0], id: 'extra', attempt: 4 });
  assert.throws(() => validatePiece(excess));
  const duplicate = piece(); duplicate.images[0].id = duplicate.images[1].id;
  assert.throws(() => validatePiece(duplicate));
});
test('missing views and backend warnings prevent submission', () => {
  const p = piece(); p.images = p.images.filter((image) => image.view !== 'back');
  const validated = validatePiece(p);
  assert.match(validated.issues.join(' '), /Back/);
  assert.equal(selectionIsComplete(validated, choices(piece())), false);
  const warned = piece(); warned.issues = ['Generation has not finished.'];
  assert.equal(selectionIsComplete(validatePiece(warned), choices(warned)), false);
});
test('unsafe image URLs and malformed requests are rejected', () => {
  for (const url of ['javascript:alert(1)', 'http://insecure.example/image.png', '//example/image']) {
    const p = piece(); p.images[0].url = url; assert.throws(() => validatePiece(p));
  }
  assert.throws(() => parseSelectionRequest(null));
  assert.throws(() => parseSelectionRequest([]));
  const malformed = request(); malformed.reviewRevision = '';
  assert.throws(() => parseSelectionRequest(malformed));
  const stripped = parseSelectionRequest({ ...request(), rejectedIds: ['do-not-trust'] });
  assert.equal('rejectedIds' in stripped, false);
});
