// Prints a generated, read-only n8n draft. Does not import, publish or run it.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../content creator website/package.json', import.meta.url));
const ts = require('typescript');
const stripModule = (text) => text.replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '');

export function buildDraft() {
  const common = ts.transpileModule(readFileSync(new URL('../../content creator website/app/creator-selection.ts', import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const selection = readFileSync(new URL('./selection-core.mjs', import.meta.url), 'utf8');
  const traversal = readFileSync(new URL('./traversal-core.mjs', import.meta.url), 'utf8');
  const library = `const { createHash } = require('crypto');\n${stripModule(common)}\n${stripModule(selection)}\n${stripModule(traversal)}\n`;
  let sequence = 0;
  const node = (name, type, typeVersion, position, parameters, extra = {}) => ({
    id: `aura-selection-draft-${++sequence}`, name, type: `n8n-nodes-base.${type}`, typeVersion, position, parameters, ...extra,
  });
  const code = (name, position, body) => node(name, 'code', 2, position, { jsCode: library + body });
  const auth = { httpBasicAuth: { name: 'AURA Creator Review' } };
  const condition = { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
    conditions: [{ id: 'continue-read', leftValue: '={{ !$json.done }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} };
  const nodes = [
    node('Get Creator Candidates — DRAFT', 'webhook', 2.1, [0, 0], { path: 'creator-review/candidates', authentication: 'basicAuth', responseMode: 'responseNode', options: {} }, { credentials: auth }),
    code('Start Candidate Queue Read', [240, 0], "return [{ json: startTraversal('queue') }];"),
    node('Validate Creator Selection — DRAFT', 'webhook', 2.1, [0, 280], { httpMethod: 'POST', path: 'creator-review/selection', authentication: 'basicAuth', responseMode: 'responseNode', options: {} }, { credentials: auth }),
    code('Start Selection Validation', [240, 280], "return [{ json: startTraversal('plan', $input.first().json.body) }];"),
    node('More Folder Pages?', 'if', 2.3, [480, 0], condition),
    code('Prepare Folder Page', [700, -120], 'return [{ json: prepareFolderPage($input.first().json) }];'),
    node('Read Drive Children — GET only', 'httpRequest', 4.2, [940, -120], {
      method: 'GET', url: 'https://www.googleapis.com/drive/v3/files', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api', sendQuery: true,
      queryParameters: { parameters: [
        { name: 'q', value: '={{ "\'" + $json.current.id + "\' in parents and trashed = false" }}' },
        { name: 'fields', value: 'nextPageToken,incompleteSearch,files(id,name,mimeType,parents,trashed,modifiedTime,md5Checksum,appProperties)' },
        { name: 'pageSize', value: '1000' }, { name: 'pageToken', value: '={{ $json.pageToken || "" }}' },
        { name: 'spaces', value: 'drive' }, { name: 'corpora', value: 'user' },
        { name: 'supportsAllDrives', value: 'true' }, { name: 'includeItemsFromAllDrives', value: 'true' },
      ] }, options: { timeout: 30000, response: { response: { responseFormat: 'json' } } },
    }, { credentials: { googleDriveOAuth2Api: { name: 'Aura Google Drive' } } }),
    code('Collect Page and Queue Descendants', [1180, -120], "const state = $('Prepare Folder Page').first(0, $runIndex).json;\nreturn [{ json: collectFolderPage(state, $input.first().json) }];"),
    code('Build Queue or Validate Plan', [720, 180], `
const state = $input.first().json;
if (state.error) return [{ json: { status: state.status || 502, body: { protocol: SELECTION_PROTOCOL, success: false, committed: false, error: state.error } } }];
const pieces = state.files.filter(file => file.mimeType === DRIVE_FOLDER && file.parents.includes(STAGES.queue));
if (state.mode === 'queue') {
  const records = pieces.map(piece => {
    try { return indexCandidatePool(piece, state.files).record; }
    catch (error) { return { pieceFolderId: piece.id, pieceName: piece.name, reviewRevision: hash([piece.id, piece.modifiedTime || null]), images: [], issues: [error.message] }; }
  });
  return [{ json: { status: 200, body: { protocol: SELECTION_PROTOCOL, pieces: records } } }];
}
const piece = pieces.find(piece => piece.id === state.selection.pieceFolderId);
if (!piece) return [{ json: { status: 409, body: { protocol: SELECTION_PROTOCOL, success: false, committed: false, error: 'Piece is no longer awaiting creator review.' } } }];
try {
  const plan = planSelection(state.selection, indexCandidatePool(piece, state.files));
  // Deliberate safety stop: no move/delete nodes exist in this draft.
  return [{ json: { status: 503, body: { protocol: SELECTION_PROTOCOL, success: false, committed: false,
    error: 'Draft validation passed. Durable Drive selection commit is not connected.',
    validation: { approved: plan.approved.length, rejected: plan.rejected.length, jobId: plan.jobId } } } }];
} catch (error) {
  return [{ json: { status: error.message.startsWith('STALE_SELECTION') ? 409 : 400,
    body: { protocol: SELECTION_PROTOCOL, success: false, committed: false, error: error.message } } }];
}`),
    node('Return Creator Selection Draft Result', 'respondToWebhook', 1.5, [1000, 180], { respondWith: 'json', responseBody: '={{ $json.body }}', options: { responseCode: '={{ $json.status }}' } }),
    node('DRAFT — NO DRIVE MOVES OR DELETES', 'stickyNote', 1, [0, -330], { width: 860, height: 230,
      content: '# Candidate selection — read-only draft\nKeep unpublished. This is not the final DEV 04 replacement. GET reads only the AIApproved piece/output/candidate trees, recursively and with pagination. POST validates four choices but deliberately returns 503 until durable locking, journaling and verified per-file routing are connected. No file move, delete or generation nodes are present. Select existing AURA Creator Review and Aura Google Drive credentials after import if n8n does not resolve their names.' }),
  ];
  const edge = (node, index = 0) => ({ node, type: 'main', index });
  return { name: 'DEV - 04B Creator Candidate Selection — READ-ONLY DRAFT', active: false,
    nodes, connections: {
      'Get Creator Candidates — DRAFT': { main: [[edge('Start Candidate Queue Read')]] },
      'Start Candidate Queue Read': { main: [[edge('More Folder Pages?')]] },
      'Validate Creator Selection — DRAFT': { main: [[edge('Start Selection Validation')]] },
      'Start Selection Validation': { main: [[edge('More Folder Pages?')]] },
      'More Folder Pages?': { main: [[edge('Prepare Folder Page')], [edge('Build Queue or Validate Plan')]] },
      'Prepare Folder Page': { main: [[edge('Read Drive Children — GET only')]] },
      'Read Drive Children — GET only': { main: [[edge('Collect Page and Queue Descendants')]] },
      'Collect Page and Queue Descendants': { main: [[edge('More Folder Pages?')]] },
      'Build Queue or Validate Plan': { main: [[edge('Return Creator Selection Draft Result')]] },
    }, settings: { executionOrder: 'v1' }, pinData: {}, tags: [],
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--print')) process.stdout.write(JSON.stringify(buildDraft(), null, 2) + '\n');
