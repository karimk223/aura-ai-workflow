// Pure planning only. Callers must supply authenticated, fully paginated Drive
// snapshots and a trusted approval journal. This module never calls Drive.
import {createHash} from 'node:crypto';

const FOLDER='application/vnd.google-apps.folder';
const VIEWS=['front','back','three_quarter_front','detail_collage'];
export const RECOVERY_MS=48*60*60*1000;
const fail=message=>{throw new Error(message);};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function required(value,label){if(typeof value!=='string'||!value.trim())fail('Missing '+label);return value;}
function stamp(value,label){const time=Date.parse(value);if(!Number.isFinite(time))fail('Invalid '+label);return time;}
function signature(file){
  required(file.id,'file ID');required(file.name,'file name');required(file.version,'Drive version');
  if(file.mimeType!==FOLDER){
    if(!/^\d+$/.test(String(file.size))||Number(file.size)<1)fail('Invalid file size');
    if(!/^[a-f0-9]{32}$/i.test(file.md5Checksum||''))fail('Missing binary checksum');
  }
  return {id:file.id,name:file.name,mimeType:file.mimeType,size:String(file.size||''),
    md5Checksum:file.md5Checksum||'',version:file.version};
}
function binding(context,approval,afterRetention=false){
  if(context.accountEmail!=='aura.atelier.by.nada@gmail.com')fail('Wrong Drive account');
  if(context.activeJob!==false||context.lockOwner!==context.owner||!context.owner)fail('Missing exclusive idle-piece lock');
  if(!context.enumerationComplete||!Array.isArray(context.files))fail('Incomplete paginated snapshot');
  if(approval.status!=='approved'||approval.pieceId!==context.piece.id)fail('Approval does not bind this piece');
  for(const key of ['approvalId','revision','reviewerIdentity','runId','sourceManifestSha256'])required(approval[key],key);
  stamp(approval.approvedAt,'approval time');
  if(!context.designerApprovedFolderId||context.piece.trashed||context.piece.mimeType!==FOLDER||
    context.piece.parents?.length!==1||context.piece.parents[0]!==context.designerApprovedFolderId)fail('Piece is not in DesignerApproved');
  if(!Array.isArray(approval.images)||approval.images.length!==4)fail('Exactly four approved images required');
  if(new Set(approval.images.map(x=>x.id)).size!==4||new Set(approval.images.map(x=>x.view)).size!==4||
    approval.images.some(x=>!VIEWS.includes(x.view)))fail('Four distinct IDs and views required');
  if(context.now&&stamp(approval.approvedAt,'approval time')>stamp(context.now,'now'))fail('Future approval');
  const files=new Map();
  for(const file of context.files){if(file.id===context.piece.id||files.has(file.id))fail('Duplicate snapshot ID');files.set(file.id,file);}
  for(const image of approval.images){
    const file=files.get(image.id);
    if(!file||file.trashed||!file.mimeType?.startsWith('image/'))fail('Approved image missing');
    // A parent move can increment Drive's metadata version without changing the
    // approved bytes. After retention, compare content/name/type/size instead.
    const actual=signature(file),expected=signature(image);
    if(afterRetention)actual.version=expected.version;
    if(digest(actual)!==digest(expected))fail('Approved image changed');
  }
  return {files,approvalHash:digest(approval)};
}
function graph(context,files){
  const depth=new Map();
  for(const file of files.values()){
    let current=file,seen=new Set(),count=0;
    while(current.id!==context.piece.id){
      if(seen.has(current.id)||current.parents?.length!==1)fail('Ambiguous ancestry');
      seen.add(current.id);count++;
      const parent=current.parents[0];
      if(parent===context.piece.id)break;
      current=files.get(parent);
      if(!current||current.mimeType!==FOLDER)fail('Foreign or incomplete subtree');
    }
    if(file.mimeType==='application/vnd.google-apps.shortcut')fail('Shortcuts require manual review');
    if(file.consumerPieceIds?.some(id=>id!==context.piece.id))fail('Shared asset requires manual review');
    depth.set(file.id,count);
  }
  return depth;
}

export function planFinalCleanup(context,approval){
  const {files,approvalHash}=binding(context,approval),depth=graph(context,files);
  if([...files.values()].some(file=>file.trashed))fail('Initial snapshot contains trashed items');
  const keep=new Set(approval.images.map(x=>x.id));
  if((context.protectedFileIds||[]).some(id=>files.has(id)&&!keep.has(id)))fail('Non-final protected asset blocks cleanup');
  const retain=approval.images.map(image=>({id:image.id,parentId:context.piece.id,
    fromParentId:files.get(image.id).parents[0],fingerprint:signature(image)}));
  const trash=[...files.values()].filter(file=>!keep.has(file.id))
    .sort((a,b)=>depth.get(b.id)-depth.get(a.id)||a.id.localeCompare(b.id))
    .map(file=>({id:file.id,parentId:file.parents[0],depth:depth.get(file.id),fingerprint:signature(file)}));
  return {protocol:'aura-designer-cleanup/v1',pieceId:context.piece.id,approvalHash,
    approvalId:approval.approvalId,revision:approval.revision,retain,trash,
    recoveryMs:RECOVERY_MS,planHash:digest({pieceId:context.piece.id,approvalHash,retain,trash})};
}

// Run only after every move/readback, Trash/readback, and final four-file listing
// has succeeded and the resulting journal has been durably committed elsewhere.
export function eligibleFinalPurge(context,approval,plan,receipts){
  const {files,approvalHash}=binding(context,approval,true);
  if(plan.protocol!=='aura-designer-cleanup/v1'||plan.pieceId!==context.piece.id||approvalHash!==plan.approvalHash)fail('Approval changed');
  if(plan.planHash!==digest({pieceId:plan.pieceId,approvalHash:plan.approvalHash,retain:plan.retain,trash:plan.trash}))fail('Cleanup plan changed');
  const now=stamp(context.now,'now'),keep=new Set(approval.images.map(x=>x.id)),targets=new Set(plan.trash.map(x=>x.id));
  if(new Set(plan.retain.map(x=>x.id)).size!==4||plan.retain.some(x=>!keep.has(x.id)))fail('Retained set changed');
  for(const image of approval.images){const file=files.get(image.id);if(file.parents?.length!==1||file.parents[0]!==context.piece.id)fail('Final images not flattened');}
  const receiptMap=new Map();
  for(const receipt of receipts){if(receiptMap.has(receipt.id)||!targets.has(receipt.id))fail('Unexpected receipt');receiptMap.set(receipt.id,receipt);}
  for(const file of files.values())if(!keep.has(file.id)&&!targets.has(file.id))fail('Unrecorded descendant blocks purge');
  let ready=true;
  for(const target of plan.trash){
    if(keep.has(target.id)||target.id===context.piece.id)fail('Protected purge target');
    const file=files.get(target.id),receipt=receiptMap.get(target.id);
    // Missing items require explicit reconciliation, never a wider replacement search.
    if(!file||!receipt||receipt.readbackVerified!==true||receipt.planHash!==plan.planHash)fail('Missing Trash readback');
    if(!file.trashed||file.parents?.length!==1||file.parents[0]!==target.parentId||
      digest(signature(file))!==digest(receipt.fingerprint)||
      digest({...signature(file),version:target.fingerprint.version})!==digest(target.fingerprint))fail('Trash asset changed');
    const trashedAt=stamp(receipt.verifiedTrashedAt,'Trash time');
    if(trashedAt<stamp(approval.approvedAt,'approval time')||trashedAt>now)fail('Invalid Trash time');
    if(now-trashedAt<RECOVERY_MS)ready=false;
  }
  return {ready,eligibleIds:ready?plan.trash.map(x=>x.id):[],pieceId:plan.pieceId,planHash:plan.planHash};
}
