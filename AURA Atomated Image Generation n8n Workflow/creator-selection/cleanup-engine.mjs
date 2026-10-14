import { indexCandidatePool } from './selection-core.mjs';
import { MUTEX_KEY } from './routing-engine.mjs';

export const CLEANUP_PROTOCOL = 'aura-archive-cleanup/v1';
export function cleanupRequest(input) {
  if (!input || typeof input !== 'object' || !/^[A-Za-z0-9_-]{1,256}$/.test(input.pieceFolderId)
    || !/^[A-Za-z0-9_-]{1,256}$/.test(input.runId)) throw new Error('A piece ID and completed generation run ID are required.');
  return {pieceFolderId:input.pieceFolderId,runId:input.runId};
}
export function newCleanupSession(request, completion, snapshot, owner) {
  const input=cleanupRequest(request), roots=snapshot.rootChildren;
  if(completion.sourcePieceId!==input.pieceFolderId||completion.runId!==input.runId||snapshot.piece.id!==input.pieceFolderId
    ||completion.pipelineStatus!=='completed'||completion.generatorStatus!=='completed'||completion.reviewerStatus!=='completed'
    ||completion.extractionVerified!==true||snapshot.record.issues.length)throw new Error('Generation, review and retained outputs are not verified complete.');
  const references=completion.referenceAssets, archives=completion.intakeArchives;
  if(!Array.isArray(references)||!references.length||!Array.isArray(archives)||archives.length!==2)throw new Error('Trusted intake/preparation manifests are required.');
  const roles=new Set(archives.map(file=>file.role));
  if(roles.size!==2||!roles.has('original_transfer_zip')||!roles.has('extracted_frames_zip')||archives[0].id===archives[1].id)throw new Error('Exactly the two recorded ZIP roles are required.');
  const rootNames=['01_MATERIAL_CLOSEUPS_4K','02_WHOLE_FRONT_BACK_SIDE','03_SIZE_FIT_MODEL_MANNEQUIN'];
  const referenceRoots=rootNames.map(name=>{
    const matching=roots.filter(file=>file.name===name&&file.mimeType==='application/vnd.google-apps.folder');
    if(matching.length!==1)throw new Error('Retained reference root is missing or ambiguous.');return matching[0];
  });
  const operations=[], ancestry=new Map();
  const addAsset=(file,kind)=>{
    if(!/^[A-Za-z0-9_-]{1,256}$/.test(file.id)||!file.name||!file.parentId||!file.md5Checksum)throw new Error('Retained file/archive provenance is incomplete.');
    if(kind==='reference'&&!file.mimeType?.startsWith('image/'))throw new Error('Reference evidence must be retained image assets.');
    if(kind==='archive_check'&&!['application/zip','application/x-zip-compressed'].includes(file.mimeType))throw new Error('Cleanup targets must be ZIP files, never folders.');
    let parent=file.parentId;
    const chain=file.ancestorChain??[];
    if(!Array.isArray(chain)||chain.length>24)throw new Error('Invalid archive/reference ancestry.');
    const seen=new Set();
    for(const folder of chain){
      if(folder.id!==parent||seen.has(folder.id)||!folder.name||!folder.parentId)throw new Error('Invalid ancestor chain.');
      seen.add(folder.id);ancestry.set(folder.id,{kind:'reference',id:folder.id,parent:folder.parentId,name:folder.name,mimeType:'application/vnd.google-apps.folder'});parent=folder.parentId;
    }
    if(parent!==input.pieceFolderId)throw new Error('Cleanup asset is outside this piece.');
    if(kind==='reference'&&!referenceRoots.some(root=>root.id===file.parentId||chain.some(folder=>folder.id===root.id)))throw new Error('Reference is not within a retained reference root.');
    return {kind,id:file.id,parent:file.parentId,name:file.name,mimeType:file.mimeType,checksum:file.md5Checksum};
  };
  const retained=references.map(file=>addAsset(file,'reference'));
  for(const root of referenceRoots){
    if(!references.some(file=>file.parentId===root.id||(file.ancestorChain??[]).some(folder=>folder.id===root.id)))throw new Error('Each reference category must have retained evidence.');
    ancestry.set(root.id,{kind:'reference',id:root.id,parent:input.pieceFolderId,name:root.name,mimeType:root.mimeType});
  }
  const outputs=snapshot.candidates.map(({file})=>({kind:'reference',id:file.id,parent:file.parents[0],name:file.name,mimeType:file.mimeType,checksum:file.md5Checksum}));
  if(outputs.some(file=>!file.checksum))throw new Error('Product output checksums are missing.');
  const retainedIds=new Set([...retained,...outputs].map(file=>file.id));
  const archiveChecks=archives.map(file=>{
    if(file.sourcePieceId!==input.pieceFolderId||file.extractionVerified!==true||retainedIds.has(file.id))throw new Error('Archive is not a trusted input container for this piece.');
    const consumers=file.consumerPieceIds??[input.pieceFolderId];
    if(!consumers.includes(input.pieceFolderId)||consumers.some(id=>!(file.completedConsumerIds??[]).includes(id)))throw new Error('A shared ZIP still has unfinished consumers.');
    return addAsset(file,'archive_check');
  });
  operations.push(...ancestry.values(),...retained,...outputs,...archiveChecks);
  operations.push(...archiveChecks.map(operation=>({...operation,kind:'delete_archive'})));
  operations.push(...retained,...outputs);
  return {owner:String(owner),request:input,status:'running',finished:false,job:{type:'cleanup',jobId:`cleanup-${input.runId}`,
    journalKey:`cleanup:${input.pieceFolderId}:${input.runId}`,request:input,phase:'operate',step:'inspect',index:0,operations,confirmed:[],
    archiveIds:archiveChecks.map(file=>file.id),runId:input.runId,
    plan:{sourcePieceId:input.pieceFolderId,approved:[],rejected:[]}}};
}
export function resumeCleanupSession(request,journal,owner){
  const input=cleanupRequest(request),session=JSON.parse(journal.jobJson);
  if(journal.sourcePieceId!==`cleanup:${input.pieceFolderId}:${input.runId}`||journal.jobId!==`cleanup-${input.runId}`
    ||session.job.type!=='cleanup'||JSON.stringify(session.job.request)!==JSON.stringify(input))throw new Error('Invalid cleanup journal.');
  session.owner=String(owner);
  if(journal.status==='committed')return session;
  session.finished=false;session.status='running';session.job.step='inspect';delete session.response;delete session.error;delete session.command;
  return session;
}
