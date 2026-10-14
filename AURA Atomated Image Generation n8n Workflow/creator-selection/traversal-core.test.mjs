import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { startTraversal, prepareFolderPage, collectFolderPage } from './traversal-core.mjs';
import { STAGES } from './selection-core.mjs';
import { buildDraft } from './build-draft.mjs';
const require = createRequire(import.meta.url);
const folder = (id, name, parent) => ({ id, name, mimeType: 'application/vnd.google-apps.folder', parents: [parent], trashed: false });

test('malformed POST is rejected before reading Drive', () => {
  const state = startTraversal('plan', { decision: 'good', pieceFolderId: 'piece' });
  assert.equal(state.done, true); assert.equal(state.status, 400); assert.equal(state.todo, undefined);
});
test('Drive pagination is consumed without dropping the first page', () => {
  let state = prepareFolderPage(startTraversal('queue'));
  state = collectFolderPage(state, { files: [folder('piece-1', 'Dress 1', STAGES.queue)], nextPageToken: 'page-two' });
  assert.equal(state.done, false); assert.equal(state.current.id, STAGES.queue); assert.equal(state.pageToken, 'page-two');
  state = prepareFolderPage(state);
  state = collectFolderPage(state, { files: [folder('piece-2', 'Dress 2', STAGES.queue)] });
  assert.equal(state.files.length, 2); assert.equal(state.todo.length, 2); assert.equal(state.current, null);
});
test('piece references and ZIP directories are not recursively traversed', () => {
  let state = prepareFolderPage(startTraversal('queue'));
  state = collectFolderPage(state, { files: [folder('piece-1', 'Dress', STAGES.queue)] });
  state = prepareFolderPage(state);
  state = collectFolderPage(state, { files: [folder('references', '01_MATERIAL_CLOSEUPS_4K', 'piece-1'),
    folder('archive', 'frames.zip', 'piece-1'), folder('outputs', '04_PRODUCT_IMAGE_OUTPUTS', 'piece-1')] });
  assert.deepEqual(state.todo.map((item) => item.id), ['outputs']);
});
test('repeated page tokens, partial searches and foreign-parent records fail closed', () => {
  let state = prepareFolderPage(startTraversal('queue'));
  state = collectFolderPage(state, { files: [], nextPageToken: 'repeat' });
  state = prepareFolderPage(state); state = collectFolderPage(state, { files: [], nextPageToken: 'repeat' });
  assert.equal(state.status, 502); assert.equal(state.done, true);
  assert.equal(collectFolderPage(prepareFolderPage(startTraversal('queue')), { files: [], incompleteSearch: true }).status, 502);
  assert.equal(collectFolderPage(prepareFolderPage(startTraversal('queue')), { files: [folder('foreign', 'Dress', 'other-stage')] }).status, 502);
});
test('generated n8n draft is inactive, syntactically valid, and has no Drive mutations', () => {
  const draft = buildDraft(); assert.equal(draft.active, false);
  for (const node of draft.nodes) {
    if (node.type === 'n8n-nodes-base.code') assert.doesNotThrow(() => new Function('$input', '$', '$runIndex', 'require', node.parameters.jsCode));
    if (node.type === 'n8n-nodes-base.httpRequest') assert.equal(node.parameters.method, 'GET');
    assert.notEqual(node.type, 'n8n-nodes-base.googleDrive');
  }
  const known = new Set(draft.nodes.map((node) => node.name));
  for (const outputs of Object.values(draft.connections)) for (const edges of outputs.main) for (const edge of edges) assert.ok(known.has(edge.node));
  const start = draft.nodes.find((node) => node.name === 'Start Candidate Queue Read');
  const result = new Function('$input', '$', '$runIndex', 'require', start.parameters.jsCode)({}, () => {}, 0, require);
  assert.equal(result[0].json.todo[0].id, STAGES.queue);
  const terminal = draft.nodes.find((node) => node.name === 'Build Queue or Validate Plan');
  const response = new Function('$input', '$', '$runIndex', 'require', terminal.parameters.jsCode)({first: () => ({json: { mode: 'queue', files: [] }})}, () => {}, 0, require);
  assert.equal(response[0].json.body.protocol, 'aura-creator-selection/v1'); assert.equal(response[0].json.status, 200);
});
