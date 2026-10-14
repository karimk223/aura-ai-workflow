// Scope-limited, paginated metadata collection. No HTTP or Drive writes here.
import { STAGES } from './selection-core.mjs';
import { VIEWS, parseSelectionRequest } from '../../content creator website/app/creator-selection.ts';
const DRIVE_FOLDER = 'application/vnd.google-apps.folder';
const MAX_READ_REQUESTS = 1000, MAX_METADATA_FILES = 20000, MAX_DEPTH = 24;

export function startTraversal(mode, request) {
  if (!['queue', 'plan', 'cleanup'].includes(mode)) throw new Error('Unknown traversal mode.');
  let selection;
  if (mode === 'plan') {
    try { selection = parseSelectionRequest(request); }
    catch (error) { return { mode, done: true, status: 400, error: error.message }; }
  }
  if (mode === 'cleanup') {
    if (!request || !/^[A-Za-z0-9_-]{1,256}$/.test(request.pieceFolderId)) return {mode,done:true,status:400,error:'Invalid cleanup piece.'};
    selection = {pieceFolderId:request.pieceFolderId};
  }
  return { mode, selection, todo: [{ id: STAGES.queue, kind: 'queue', depth: 0 }], current: null,
    files: [], seenFolders: [STAGES.queue], pageTokens: [], pageToken: '', requestCount: 0, done: false };
}

export function prepareFolderPage(state) {
  const next = JSON.parse(JSON.stringify(state));
  if (next.done) throw new Error('Traversal already complete.');
  if (!next.current) {
    next.current = next.todo.shift(); next.pageToken = ''; next.pageTokens = [];
  }
  if (!next.current || !/^[A-Za-z0-9_-]{1,256}$/.test(next.current.id)) throw new Error('Invalid traversal folder.');
  next.requestCount += 1;
  return next;
}

export function collectFolderPage(state, response) {
  const next = JSON.parse(JSON.stringify(state));
  try {
    if (!response || !Array.isArray(response.files) || response.incompleteSearch) throw new Error('Incomplete Drive metadata response.');
    const known = new Set(next.files.map((file) => file.id));
    const current = next.current;
    for (const file of response.files) {
      if (!file.id || file.trashed || !file.parents?.includes(current.id) || known.has(file.id)) throw new Error('Drive snapshot changed or contains ambiguous metadata.');
      known.add(file.id); next.files.push(file);
      if (file.mimeType !== DRIVE_FOLDER) continue;
      let kind;
      if (current.kind === 'queue' && (next.mode === 'queue' || file.id === next.selection.pieceFolderId)) kind = 'piece';
      else if (current.kind === 'piece' && file.name === '04_PRODUCT_IMAGE_OUTPUTS') kind = 'outputs';
      else if (current.kind === 'outputs' && file.name === '_run') kind = 'run';
      else if (current.kind === 'run' && file.name === 'candidates') kind = 'candidates';
      else if (current.kind === 'candidates' && VIEWS.includes(file.name)) kind = 'view';
      else if (current.kind === 'view' || current.kind === 'descendant') kind = 'descendant';
      if (!kind) continue;
      if (next.seenFolders.includes(file.id)) throw new Error('Duplicate or cyclic folder traversal.');
      if (current.depth + 1 > MAX_DEPTH) throw new Error('Candidate ancestry exceeds the depth safety limit.');
      next.seenFolders.push(file.id); next.todo.push({ id: file.id, kind, depth: current.depth + 1 });
    }
    if (next.files.length > MAX_METADATA_FILES) throw new Error('Queue exceeds the metadata safety limit; no partial queue returned.');
    if (response.nextPageToken) {
      if (typeof response.nextPageToken !== 'string' || next.pageTokens.includes(response.nextPageToken)) throw new Error('Invalid or repeated Drive page token.');
      next.pageTokens.push(response.nextPageToken); next.pageToken = response.nextPageToken;
    } else {
      next.current = null; next.pageToken = ''; next.pageTokens = [];
    }
    next.done = !next.current && next.todo.length === 0;
    if (!next.done && next.requestCount >= MAX_READ_REQUESTS) throw new Error('Queue read budget exceeded; no partial queue returned.');
  } catch (error) { next.done = true; next.status = 502; next.error = error.message; }
  return next;
}
