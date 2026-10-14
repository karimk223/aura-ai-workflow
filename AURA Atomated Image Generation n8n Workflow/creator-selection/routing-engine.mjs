import { createHash } from 'node:crypto';
import { STAGES, planSelection } from './selection-core.mjs';
import { parseSelectionRequest, SELECTION_PROTOCOL } from '../../content creator website/app/creator-selection.ts';

export const ROUTING_TABLE_ID = '0jVQUhHbb9ApVzSH';
export const MUTEX_KEY = '__creator_mutex__';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const META = 'id,name,mimeType,parents,trashed,md5Checksum,appProperties';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const clone = value => JSON.parse(JSON.stringify(value));
export const requestJobId = body => createHash('sha256').update(JSON.stringify(parseSelectionRequest(body))).digest('hex');

export function newRoutingSession(body, snapshot, owner) {
  const request = parseSelectionRequest(body), plan = planSelection(request, snapshot);
  const folders = [], known = { piece: plan.sourcePieceId, outputs: snapshot.outputsFolderId, run: snapshot.runFolderId, rejectedStage: STAGES.rejected };
  const references = plan.referenceFoldersToPreserve.map(name => {
    const matches = snapshot.rootChildren.filter(file => file.name === name && file.mimeType === FOLDER_MIME);
    if (matches.length !== 1) throw new Error(`Required reference folder is missing or ambiguous: ${name}`);
    return { id: matches[0].id, name };
  });
  if (plan.rejected.length) {
    folders.push({ key: 'rejectedPiece', name: snapshot.piece.name, parentKey: 'rejectedStage' });
    for (const image of plan.rejected) {
      const parts = image.targetRelativePath.split('/').slice(0, -1);
      let parentKey = 'rejectedPiece';
      for (let length = 1; length <= parts.length; length++) {
        const key = `rejected:${parts.slice(0, length).join('/')}`;
        if (!folders.some(folder => folder.key === key)) folders.push({ key, name: parts[length - 1], parentKey });
        parentKey = key;
      }
    }
  }
  if (plan.preservedRootCopies.length) {
    const existing = snapshot.runChildren.filter(file => file.name === 'final_copies' && file.mimeType === FOLDER_MIME);
    if (existing.length > 1) throw new Error('Ambiguous final-copy archive.');
    if (existing.length) known.finalCopies = existing[0].id;
    else folders.push({ key: 'finalCopies', name: 'final_copies', parentKey: 'run' });
  }
  const originals = Object.fromEntries([...snapshot.candidates.map(entry => entry.file), ...snapshot.rootFinalCopies, snapshot.piece].map(file => [file.id, file]));
  const job = { jobId: plan.jobId, request, plan, pieceName: snapshot.piece.name, references, originals,
    folders, known, phase: folders.length ? 'allocate' : 'operate', step: 'inspect', index: 0, operations: [], confirmed: [] };
  if (!folders.length) assembleOperations(job);
  return { owner: String(owner), request, job, finished: false, status: 'running' };
}

export function resumeRoutingSession(body, journal, owner) {
  const request = parseSelectionRequest(body);
  if (journal.jobId !== requestJobId(request) || journal.sourcePieceId !== request.pieceFolderId) throw new Error('A different selection is already recorded for this piece.');
  const session = JSON.parse(journal.jobJson);
  if (session.job.jobId !== journal.jobId || JSON.stringify(session.job.request) !== JSON.stringify(request)) throw new Error('Invalid routing journal.');
  session.owner = String(owner);
  if (journal.status === 'committed') return routingComplete(session);
  session.finished = false; session.status = 'running'; delete session.response; delete session.error; delete session.command;
  if (session.job.phase === 'operate') session.job.step = 'inspect';
  return session;
}

function assembleOperations(job) {
  const op = [];
  for (const folder of job.folders) op.push({ kind: 'folder', id: job.known[folder.key], name: folder.name,
    parent: job.known[folder.parentKey], mimeType: FOLDER_MIME });
  const move = (image, parent, name) => ({ kind: 'move', id: image.fileId, source: image.sourceParentId,
    parent, name, mimeType: job.originals[image.fileId].mimeType, checksum: job.originals[image.fileId].md5Checksum ?? null });
  for (const image of job.plan.preservedRootCopies) op.push(move(image, job.known.finalCopies, job.originals[image.fileId].name));
  for (const image of job.plan.rejected) op.push(move(image, job.known[`rejected:${image.targetRelativePath.split('/').slice(0, -1).join('/')}`], job.originals[image.fileId].name));
  for (const image of job.plan.approved) op.push(move(image, job.known.outputs, image.targetRelativePath.split('/').at(-1)));
  for (const reference of job.references) op.push({ kind: 'reference', id: reference.id, parent: job.plan.sourcePieceId, name: reference.name, mimeType: FOLDER_MIME });
  op.push({ kind: 'reference', id: job.known.outputs, parent: job.plan.sourcePieceId, name: '04_PRODUCT_IMAGE_OUTPUTS', mimeType: FOLDER_MIME });
  op.push({ kind: 'root', parent: job.known.outputs, ids: job.plan.approved.map(image => image.fileId) });
  op.push({ kind: 'piece', id: job.plan.sourcePieceId, source: STAGES.queue, parent: STAGES.approved, name: job.pieceName, mimeType: FOLDER_MIME });
  job.operations = op;
}

export function nextRoutingCommand(input) {
  const session = clone(input), job = session.job;
  if (session.finished) return session;
  if (job.phase === 'allocate') {
    session.command = { method: 'GET', url: `${DRIVE}/files/generateIds`, query: { count: job.folders.length, space: 'drive', type: 'files' } };
    return session;
  }
  const operation = job.operations[job.index];
  if (!operation) return routingComplete(session);
  if (operation.kind === 'root') {
    session.command = { method: 'GET', url: `${DRIVE}/files`, query: { q: `'${operation.parent}' in parents and trashed = false and mimeType contains 'image/'`,
      fields: `nextPageToken,incompleteSearch,files(${META})`, pageSize: 1000, supportsAllDrives: true, includeItemsFromAllDrives: true } };
    return session;
  }
  if (job.step !== 'apply') {
    session.command = { method: 'GET', url: `${DRIVE}/files/${operation.id}`, query: { fields: META, supportsAllDrives: true } };
  } else if (operation.kind === 'folder') {
    session.command = { method: 'POST', url: `${DRIVE}/files`, query: { fields: META, supportsAllDrives: true },
      body: { id: operation.id, name: operation.name, mimeType: FOLDER_MIME, parents: [operation.parent],
        appProperties: { auraSourcePieceId: job.plan.sourcePieceId, auraSelectionJobId: job.jobId } } };
  } else if (operation.kind === 'delete_archive') {
    session.command = { method: 'DELETE', url: `${DRIVE}/files/${operation.id}`, query: { supportsAllDrives: true } };
  } else {
    session.command = { method: 'PATCH', url: `${DRIVE}/files/${operation.id}`,
      query: { addParents: operation.parent, removeParents: operation.source, fields: META, supportsAllDrives: true },
      body: { name: operation.name, ...(operation.kind === 'piece' ? { appProperties: {
        ...(job.originals[operation.id].appProperties ?? {}), auraSourcePieceId: job.plan.sourcePieceId,
        auraSelectionJobId: job.jobId, auraCreatorReviewState: 'complete' } } : {}) } };
  }
  return session;
}

function matches(file, operation) {
  return file?.id === operation.id && !file.trashed && file.name === operation.name && file.mimeType === operation.mimeType
    && file.parents?.length === 1 && file.parents[0] === operation.parent && (!operation.checksum || file.md5Checksum === operation.checksum);
}
function operationDone(session) {
  const job = session.job, operation = job.operations[job.index];
  job.confirmed.push({ index: job.index, id: operation.id ?? operation.parent, kind: operation.kind });
  job.index += 1; job.step = 'inspect';
  if (job.index === job.operations.length) return routingComplete(session);
  return session;
}
function routingComplete(session) {
  session.job.phase = 'committed'; session.finished = true; session.status = 'committed';
  session.response = { status: 200, body: session.job.type === 'cleanup'
    ? { protocol: 'aura-archive-cleanup/v1', success: true, committed: true, deletedArchiveIds: session.job.archiveIds, runId: session.job.runId }
    : { protocol: SELECTION_PROTOCOL, success: true, committed: true, jobId: session.job.jobId,
      approved: session.job.plan.approved.length, rejected: session.job.plan.rejected.length } };
  return session;
}
export function routingFailure(input, error) {
  const session = clone(input); session.finished = true; session.status = 'failed'; session.error = String(error);
  session.response = { status: 502, body: { protocol: session.job.type === 'cleanup' ? 'aura-archive-cleanup/v1' : SELECTION_PROTOCOL, success: false, committed: false,
    error: 'Drive job stopped safely and its progress was saved.', jobId: session.job.jobId } };
  return session;
}

export function acceptRoutingResponse(input, response) {
  const session = clone(input), job = session.job;
  try {
    const status = Number(response.statusCode), data = response.body;
    if (!Number.isInteger(status)) throw new Error('Drive response was not received.');
    if (job.phase === 'allocate') {
      if (status !== 200 || !Array.isArray(data?.ids) || data.ids.length !== job.folders.length
        || new Set(data.ids).size !== data.ids.length || data.ids.some(id => !/^[A-Za-z0-9_-]+$/.test(id))) throw new Error('Unable to reserve stable destination IDs.');
      job.folders.forEach((folder, index) => { job.known[folder.key] = data.ids[index]; });
      assembleOperations(job); job.phase = 'operate'; return session;
    }
    const operation = job.operations[job.index];
    job.attempts ??= {};
    job.attempts[job.index] = (job.attempts[job.index] ?? 0) + 1;
    if (job.attempts[job.index] > 12) throw new Error('Drive operation retry budget exceeded.');
    if (operation.kind === 'root') {
      if (status !== 200 || !Array.isArray(data?.files) || data.nextPageToken || data.incompleteSearch || data.files.length !== 4
        || new Set(data.files.map(file => file.id)).size !== 4 || data.files.some(file => !operation.ids.includes(file.id))) throw new Error('Designer root is not exactly the selected four images.');
      for (const approved of job.plan.approved) {
        const expected = job.operations.find(op => op.id === approved.fileId);
        if (!matches(data.files.find(file => file.id === approved.fileId), expected)) throw new Error('Selected image verification failed.');
      }
      return operationDone(session);
    }
    if (job.step === 'apply') {
      if (status < 200 || status >= 300) throw new Error('Drive write was not confirmed.');
      job.step = 'verify'; return session;
    }
    if (operation.kind === 'delete_archive' && status === 404) {
      if (!job.confirmed.some(check => check.kind === 'archive_check' && check.id === operation.id)) throw new Error('Archive was not preflight-verified.');
      return operationDone(session);
    }
    if (status === 200 && matches(data, operation)) {
      if (operation.kind === 'delete_archive') { job.step = 'apply'; return session; }
      if (operation.kind === 'folder' && (data.appProperties?.auraSourcePieceId !== job.plan.sourcePieceId || data.appProperties?.auraSelectionJobId !== job.jobId)) throw new Error('Reserved destination provenance does not match.');
      return operationDone(session);
    }
    if (job.step === 'verify' || operation.kind === 'reference') throw new Error('Post-move verification failed.');
    if (operation.kind === 'folder' && status === 404) { job.step = 'apply'; return session; }
    if (['move','piece'].includes(operation.kind) && status === 200 && data.id === operation.id && !data.trashed
      && data.parents?.length === 1 && data.parents[0] === operation.source && data.mimeType === operation.mimeType
      && (!operation.checksum || data.md5Checksum === operation.checksum)) { job.step = 'apply'; return session; }
    throw new Error('A source file changed or is outside the expected folder.');
  } catch (error) { return routingFailure(session, error.message); }
}

export function routingJournal(session) {
  const compact = clone(session);
  for (const key of ['command','journal','hasJob','needsSnapshot']) delete compact[key];
  return { sourcePieceId: session.job.journalKey ?? session.job.plan.sourcePieceId, status: session.status, owner: session.owner,
    jobId: session.job.jobId, jobJson: JSON.stringify(compact) };
}
