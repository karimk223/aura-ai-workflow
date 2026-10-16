// Authenticated Designer decisions and exact-ID cleanup. ZERO OpenAI transports.
import {createHash} from 'node:crypto';
import {essentialIO,ES_FOLDER,ES_VIEWS} from './essential-runtime.mjs';
import {planFinalCleanup,eligibleFinalPurge} from './final-cleanup-plan.mjs';
const DC_CREATOR='1LQzu9HFblegSGbDCurmeYZ1OrNJwJp0c';
const DC_APPROVED='1ivqifcaL0vr5nyLXn2P09yBGo2lqfUdQ';
const DC_REJECTED='14atX2ZW0zgz0yb2aV2OS4eMIgehG9CqP';
const DC_NAMES=['01_front.png','02_back.png','03_three-quarter-front.png','04_material-craftsmanship-collage.png'];
const dcFail=m=>{throw new Error(m);};
const dcHash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const dcId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v);
const dcSig=f=>({id:f.id,name:f.name,mimeType:f.mimeType,size:String(f.size||''),md5Checksum:f.md5Checksum||'',version:String(f.version)});
function dcTable(s,kind,pc,row,filters=[]){return essentialIO.table(s,kind,pc,row,filters);}
function dcIssue(s,method,url,body,pc){return essentialIO.issue(s,'drive_json',url,method,body,pc);}
function dcRead(s,id,pc){return essentialIO.drive(s,id,pc);}
function dcList(s,id,pc,token=''){
 return dcIssue(s,'GET',essentialIO.url('https://www.googleapis.com/drive/v3/files',{q:"'"+id+"' in parents",fields:'nextPageToken,files('+essentialIO.fields+')',pageSize:'1000',supportsAllDrives:'true',includeItemsFromAllDrives:'true',...(token?{pageToken:token}:{})}),undefined,pc);
}
function dcFinish(s,response){s.result=response;
 if(s.locked)return dcTable(s,'table_update','dc_released',{status:'idle',owner:'none'},[{keyName:'id',condition:'eq',keyValue:s.mutexId},{keyName:'owner',condition:'eq',keyValue:s.owner}]);
 s.done=true;s.command={kind:'done'};return s;
}
function dcSave(s,status,pc){return dcTable(s,'table_upsert',pc,{sourcePieceId:'__designer__:'+s.record.approval.pieceId,status,owner:s.owner,jobId:s.record.approval.runId,jobJson:JSON.stringify(s.record)});}
function dcImageRecord(piece,files){
 const images=files.filter(f=>f.mimeType?.startsWith('image/')&&!f.trashed);
 if(images.length!==4||new Set(images.map(f=>f.name)).size!==4||DC_NAMES.some(n=>!images.some(f=>f.name===n)))dcFail('Designer requires the four exact Creator-selected image filenames.');
 const ordered=DC_NAMES.map((n,i)=>({...dcSig(images.find(f=>f.name===n)),view:ES_VIEWS[i]}));
 for(const f of ordered)if(!dcId(f.id)||!/^\d+$/.test(f.size)||!f.md5Checksum||f.version==='undefined')dcFail('Image identity/content binding missing.');
 const revision=dcHash([piece.id,ordered]);return {pieceFolderId:piece.id,pieceName:piece.name,reviewRevision:revision,
  images:ordered.map(f=>({...f,url:'https://drive.google.com/thumbnail?id='+f.id+'&sz=w1600'})),ordered};
}
function dcNextPiece(s){
 if(!s.queue.length)return dcFinish(s,s.mode==='list'?{pieces:s.pieces}:{success:true,status:'complete',results:s.results});
 if(s.mode==='cleanup'){const row=s.queue.shift();s.record=JSON.parse(row.jobJson);s.recordStatus=row.status;s.piece={id:s.record.approval.pieceId};return dcRead(s,s.piece.id,'dc_piece');}
 s.piece=s.queue.shift();return dcRead(s,s.piece.id,'dc_piece');
}
function dcSnapshotNext(s){
 if(!s.folders.length)return dcPlanOrPurge(s);
 s.folder=s.folders.shift();if(s.visited.includes(s.folder))dcFail('Cleanup ancestry cycle.');s.visited.push(s.folder);s.pages=[];return dcList(s,s.folder,'dc_snapshot');
}
function dcContext(s){return {accountEmail:'aura.atelier.by.nada@gmail.com',activeJob:false,owner:s.owner,lockOwner:s.owner,
 enumerationComplete:true,designerApprovedFolderId:DC_APPROVED,piece:s.piece,files:s.files,now:s.now};}
function dcPlanOrPurge(s){
 if(s.recordStatus==='approved'){
  s.record.plan=planFinalCleanup(dcContext(s),s.record.approval);s.record.receipts=[];s.record.position=0;
  if(!s.config.cleanupEnabled){s.results.push({pieceId:s.piece.id,status:'cleanup_dry_run',retain:s.record.plan.retain.map(x=>x.id),trash:s.record.plan.trash.map(x=>x.id)});return dcNextPiece(s);}
  return dcSave(s,'cleanup_in_progress','dc_plan_saved');
 }
 const eligibility=eligibleFinalPurge(dcContext(s),s.record.approval,s.record.plan,s.record.receipts);
 if(!eligibility.ready||!s.config.purgeEnabled){s.results.push({pieceId:s.piece.id,status:eligibility.ready?'purge_disabled':'within_48_hour_recovery'});return dcNextPiece(s);}
 s.purgeIds=eligibility.eligibleIds;s.purgePosition=0;return dcPurgeNext(s);
}
function dcRetainNext(s){
 if(s.record.position>=4){s.record.position=0;return dcTrashNext(s);}
 const move=s.record.plan.retain[s.record.position];s.target=move;
 return dcRead(s,move.id,'dc_retain_before');
}
function dcTrashNext(s){
 if(s.record.position>=s.record.plan.trash.length){s.finalFiles=[];s.pages=[];return dcList(s,s.piece.id,'dc_final_four');}
 s.target=s.record.plan.trash[s.record.position];return dcRead(s,s.target.id,'dc_trash_before');
}
function dcPurgeNext(s){
 if(s.purgePosition>=s.purgeIds.length){s.record.purgedAt=s.now;return dcSave(s,'cleanup_purged','dc_purged_saved');}
 const id=s.purgeIds[s.purgePosition];if(s.record.approval.images.some(i=>i.id===id)||id===s.piece.id)dcFail('Protected purge target.');
 return essentialIO.issue(s,'drive_delete',essentialIO.fileUrl(id),'DELETE',undefined,'dc_deleted');
}
export function startDesignerCleanup(input,config,owner){
 if(!['list','decide','cleanup'].includes(input?.mode))dcFail('Unknown Designer/cleanup job.');
 const s={mode:input.mode,config,owner:String(owner),webhook:input.isWebhook===true,now:new Date().toISOString(),queue:[],pieces:[],results:[],locked:false};
 if(!config.enabled)return dcFinish(s,{success:false,error:'Workflow disabled for setup.',pieces:[]});
 if(s.mode==='decide'){
  const body=input.body;if(!dcId(body?.pieceFolderId)||!['good','no_good'].includes(body.decision)||
   !/^[a-f0-9]{64}$/.test(body.reviewRevision||'')||typeof body.reviewerIdentity!=='string'||!body.reviewerIdentity.startsWith('chatgpt:')||body.reviewerIdentity.length>300)
   dcFail('Authenticated reviewer identity, exact image revision and decision are required.');s.request={pieceFolderId:body.pieceFolderId,decision:body.decision,reviewRevision:body.reviewRevision,reviewerIdentity:body.reviewerIdentity};
 }
 s.pc='dc_account';s.command={kind:'drive_json',method:'GET',url:'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,permissionId)'};return s;
}
export async function advanceDesignerCleanup(s,r){
 switch(s.pc){
 case 'dc_account':{
  if(r?.user?.emailAddress!=='aura.atelier.by.nada@gmail.com'||r.user.permissionId!=='07994205433657544212')dcFail('Wrong cleanup Drive account.');
  if(s.mode==='list'){s.stagePages=[];return dcList(s,DC_CREATOR,'dc_creator_pieces');}
  return dcTable(s,'table_get','dc_mutex',undefined,[{keyName:'sourcePieceId',condition:'eq',keyValue:'__aura_pipeline_mutex__'}]);}
 case 'dc_mutex':if(r.length!==1||r[0].status!=='idle')dcFail('Pipeline locked; do not overlap approval/cleanup with a live job.');s.mutexId=r[0].id;return dcTable(s,'table_update','dc_claimed',{status:'busy',owner:s.owner},[{keyName:'id',condition:'eq',keyValue:s.mutexId},{keyName:'status',condition:'eq',keyValue:'idle'}]);
 case 'dc_claimed':{
  if(r.length!==1||r[0].owner!==s.owner||r[0].status!=='busy')dcFail('Approval/cleanup lock not owned.');s.locked=true;
  if(s.mode==='cleanup')return dcTable(s,'table_get','dc_cleanup_rows');
  s.queue=[{id:s.request.pieceFolderId}];return dcNextPiece(s);}
 case 'dc_creator_pieces':{
  if(!Array.isArray(r.files))dcFail('Invalid Designer queue listing.');s.queue.push(...r.files.filter(f=>!f.trashed&&f.mimeType===ES_FOLDER));
  if(r.nextPageToken){if(s.stagePages.includes(r.nextPageToken))dcFail('Repeated queue page.');s.stagePages.push(r.nextPageToken);return dcList(s,DC_CREATOR,'dc_creator_pieces',r.nextPageToken);}return dcNextPiece(s);}
 case 'dc_cleanup_rows':s.queue=r.filter(row=>row.sourcePieceId?.startsWith('__designer__:')&&['approved','cleanup_trashed'].includes(row.status));return dcNextPiece(s);
 case 'dc_piece':{
  const expected=s.mode==='cleanup'?DC_APPROVED:DC_CREATOR;
  if(r.id!==s.piece.id||r.mimeType!==ES_FOLDER||r.trashed||r.parents?.length!==1||r.parents[0]!==expected)dcFail('Piece moved or no longer in the required approval stage.');s.piece=r;
  if(s.mode==='cleanup'){s.files=[];s.folders=[r.id];s.visited=[];return dcSnapshotNext(s);}
  s.direct=[];s.pages=[];return dcList(s,r.id,'dc_piece_children');}
 case 'dc_piece_children':{
  if(!Array.isArray(r.files))dcFail('Missing direct piece census.');s.direct.push(...r.files);
  if(r.nextPageToken){if(s.pages.includes(r.nextPageToken))dcFail('Repeated piece page.');s.pages.push(r.nextPageToken);return dcList(s,s.piece.id,'dc_piece_children',r.nextPageToken);}
  const roots=s.direct.filter(f=>!f.trashed&&f.name==='04_PRODUCT_IMAGE_OUTPUTS'&&f.mimeType===ES_FOLDER);
  if(roots.length!==1)dcFail('Creator-selected output root missing or ambiguous.');s.outputRoot=roots[0];s.images=[];s.pages=[];return dcList(s,s.outputRoot.id,'dc_images');}
 case 'dc_images':{
  if(!Array.isArray(r.files))dcFail('Missing exact-four image census.');s.images.push(...r.files);
  if(r.nextPageToken){if(s.pages.includes(r.nextPageToken))dcFail('Repeated image page.');s.pages.push(r.nextPageToken);return dcList(s,s.outputRoot.id,'dc_images',r.nextPageToken);}
  const record=dcImageRecord(s.piece,s.images);
  if(s.mode==='list'){delete record.ordered;s.pieces.push(record);return dcNextPiece(s);}
  if(s.request.reviewRevision!==record.reviewRevision)dcFail('STALE_REVIEW: the four images changed. Reload before deciding.');s.selected=record;
  return dcTable(s,'table_get','dc_generation_receipt',undefined,[{keyName:'sourcePieceId',condition:'eq',keyValue:'__essential__:generator:'+s.piece.id}]);}
 case 'dc_generation_receipt':{
  if(r.length!==1||r[0].status!=='complete')dcFail('Verified generation completion receipt is missing.');const job=JSON.parse(r[0].jobJson);
  if(!/^[a-f0-9]{64}$/.test(job.sourceManifestSha256||''))dcFail('Source manifest binding missing.');
  s.record={protocol:'aura-designer-approval/v1',approval:{status:s.request.decision==='good'?'approved':'rejected',pieceId:s.piece.id,
   approvalId:dcHash([s.piece.id,s.request.reviewRevision,s.owner]),revision:s.request.reviewRevision,reviewerIdentity:s.request.reviewerIdentity,
   runId:job.runId,sourceManifestSha256:job.sourceManifestSha256,approvedAt:s.now,images:s.selected.ordered}};
  return dcSave(s,'approval_pending','dc_approval_saved');}
 case 'dc_approval_saved':if(r.length!==1)dcFail('Approval journal missing.');s.approvalCheckPosition=0;return dcRead(s,s.record.approval.images[0].id,'dc_approval_image');
 case 'dc_approval_image':{
  const expected=s.record.approval.images[s.approvalCheckPosition];
  if(r.trashed||r.parents?.length!==1||r.parents[0]!==s.outputRoot.id||dcHash(dcSig(r))!==dcHash(dcSig(expected)))dcFail('The selected image changed while the approval was being saved.');
  if(++s.approvalCheckPosition<4)return dcRead(s,s.record.approval.images[s.approvalCheckPosition].id,'dc_approval_image');
  return dcRead(s,s.piece.id,'dc_move_before');}
 case 'dc_move_before':{
  if(r.id!==s.piece.id||r.trashed||r.parents?.length!==1||r.parents[0]!==DC_CREATOR)dcFail('Stale approval destination.');
  s.destination=s.request.decision==='good'?DC_APPROVED:DC_REJECTED;
  return dcIssue(s,'PATCH',essentialIO.fileUrl(r.id,{addParents:s.destination,removeParents:DC_CREATOR,fields:essentialIO.fields}),{},'dc_moved');}
 case 'dc_moved':if(r.id!==s.piece.id||r.parents?.length!==1||r.parents[0]!==s.destination)dcFail('Designer move unconfirmed.');return dcSave(s,s.request.decision==='good'?'approved':'rejected','dc_decision_saved');
 case 'dc_decision_saved':if(r.length!==1)dcFail('Final approval receipt was not saved.');return dcFinish(s,{success:true,pieceFolderId:s.piece.id,decision:s.request.decision,approvalId:s.record.approval.approvalId});
 case 'dc_snapshot':{
  if(!Array.isArray(r.files))dcFail('Incomplete cleanup snapshot.');
  for(const f of r.files){if(!dcId(f.id)||f.parents?.length!==1||f.parents[0]!==s.folder||s.files.some(x=>x.id===f.id))dcFail('Duplicate or foreign cleanup descendant.');s.files.push(f);if(f.mimeType===ES_FOLDER)s.folders.push(f.id);if(s.files.length>10000)dcFail('Cleanup scope too large.');}
  if(r.nextPageToken){if(s.pages.includes(r.nextPageToken))dcFail('Repeated cleanup page.');s.pages.push(r.nextPageToken);return dcList(s,s.folder,'dc_snapshot',r.nextPageToken);}return dcSnapshotNext(s);}
 case 'dc_plan_saved':if(r.length!==1)dcFail('Cleanup plan not saved.');return dcRetainNext(s);
 case 'dc_retain_before':{
  const target=s.target,expected=target.fingerprint;
  if(r.id!==target.id||r.trashed||r.parents?.length!==1||r.parents[0]!==target.fromParentId||dcHash(dcSig(r))!==dcHash(expected))dcFail('Approved retained image changed.');
  if(r.parents[0]===s.piece.id){s.record.position++;return dcRetainNext(s);}
  return dcIssue(s,'PATCH',essentialIO.fileUrl(r.id,{addParents:s.piece.id,removeParents:target.fromParentId,fields:essentialIO.fields}),{},'dc_retained');}
 case 'dc_retained':{
  const actual=dcSig(r);actual.version=s.target.fingerprint.version;
  if(r.id!==s.target.id||r.parents?.length!==1||r.parents[0]!==s.piece.id||r.trashed||dcHash(actual)!==dcHash(s.target.fingerprint))dcFail('Retained image readback failed.');s.record.position++;return dcRetainNext(s);}
 case 'dc_trash_before':{
  if(r.id!==s.target.id||r.trashed||r.parents?.[0]!==s.target.parentId||dcHash(dcSig(r))!==dcHash(s.target.fingerprint))dcFail('A Trash target changed.');
  return dcIssue(s,'PATCH',essentialIO.fileUrl(r.id,{fields:essentialIO.fields}),{trashed:true},'dc_trashed');}
 case 'dc_trashed':{
  const actual=dcSig(r),bound={...actual,version:s.target.fingerprint.version};
  if(r.id!==s.target.id||r.trashed!==true||r.parents?.[0]!==s.target.parentId||dcHash(bound)!==dcHash(s.target.fingerprint))dcFail('Trash readback failed.');
  s.record.receipts.push({id:r.id,planHash:s.record.plan.planHash,readbackVerified:true,fingerprint:actual,verifiedTrashedAt:new Date().toISOString()});s.record.position++;
  return dcSave(s,'cleanup_in_progress','dc_trash_saved');}
 case 'dc_trash_saved':if(r.length!==1)dcFail('Trash receipt not saved.');return dcTrashNext(s);
 case 'dc_final_four':{
  if(!Array.isArray(r.files))dcFail('Missing final piece listing.');s.finalFiles.push(...r.files.filter(f=>!f.trashed));
  if(r.nextPageToken){if(s.pages.includes(r.nextPageToken))dcFail('Repeated final page.');s.pages.push(r.nextPageToken);return dcList(s,s.piece.id,'dc_final_four',r.nextPageToken);}
  if(s.finalFiles.length!==4||s.finalFiles.some(f=>!s.record.approval.images.some(i=>i.id===f.id&&i.md5Checksum===f.md5Checksum&&String(i.size)===String(f.size))))dcFail('Final piece does not contain exactly the approved four images.');return dcSave(s,'cleanup_trashed','dc_trashed_saved');}
 case 'dc_trashed_saved':s.results.push({pieceId:s.piece.id,status:'recoverable_trash_48_hours',fileIds:s.record.plan.trash.map(f=>f.id)});return dcNextPiece(s);
 case 'dc_deleted':if(![200,204].includes(r?.statusCode))dcFail('Permanent deletion was not confirmed by Drive.');s.purgePosition++;s.record.purgeProgress=s.purgeIds.slice(0,s.purgePosition);return dcSave(s,'cleanup_trashed','dc_purge_checkpoint');
 case 'dc_purge_checkpoint':return dcPurgeNext(s);
 case 'dc_purged_saved':s.results.push({pieceId:s.piece.id,status:'purged_exact_recorded_nonfinal_ids',fileIds:s.purgeIds});return dcNextPiece(s);
 case 'dc_released':if(r.length!==1||r[0].status!=='idle')dcFail('Approval/cleanup lock release needs attention.');s.done=true;s.command={kind:'done'};return s;
 default:dcFail('Unknown Designer/cleanup checkpoint '+s.pc);
 }
}
