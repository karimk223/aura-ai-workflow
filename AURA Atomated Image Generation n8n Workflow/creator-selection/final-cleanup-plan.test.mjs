import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planFinalCleanup,eligibleFinalPurge,RECOVERY_MS} from './final-cleanup-plan.mjs';
const folder=(id,parent)=>({id,name:id,mimeType:'application/vnd.google-apps.folder',parents:[parent],version:'1',trashed:false});
const image=(id,parent)=>({id,name:id+'.png',mimeType:'image/png',parents:[parent],size:'123',md5Checksum:'a'.repeat(32),version:'1',trashed:false});
function fixture(){
  const images=['front','back','three_quarter_front','detail_collage'].map(view=>({...image(view,'outputs'),view}));
  const context={accountEmail:'aura.atelier.by.nada@gmail.com',activeJob:false,owner:'worker',lockOwner:'worker',enumerationComplete:true,
    designerApprovedFolderId:'designer',piece:folder('piece','designer'),files:[folder('outputs','piece'),image('source','piece'),...images],now:'2026-10-15T18:00:00Z'};
  const approval={status:'approved',approvalId:'approval-1',revision:'1',reviewerIdentity:'designer',runId:'run',sourceManifestSha256:'b'.repeat(64),pieceId:'piece',approvedAt:context.now,images:structuredClone(images)};
  return {context,approval};
}
function finished(){const f=fixture(),plan=planFinalCleanup(f.context,f.approval);for(const file of f.context.files){if(plan.retain.some(x=>x.id===file.id))file.parents=['piece'];else{file.trashed=true;file.version='2';}}
  const receipts=plan.trash.map(x=>({id:x.id,planHash:plan.planHash,readbackVerified:true,verifiedTrashedAt:'2026-10-15T18:01:00Z',fingerprint:{...x.fingerprint,version:'2'}}));
  f.context.now='2026-10-17T18:01:00Z';return {...f,plan,receipts};}
test('plan retains all four exact IDs, trashes only recorded descendants, and never includes the piece',()=>{const f=fixture(),plan=planFinalCleanup(f.context,f.approval);assert.equal(plan.retain.length,4);assert.deepEqual(plan.trash.map(x=>x.id).sort(),['outputs','source']);assert.equal(RECOVERY_MS,172800000);});
for(const [name,change] of [
  ['incomplete enumeration',f=>f.context.enumerationComplete=false],['active generation',f=>f.context.activeJob=true],
  ['wrong account',f=>f.context.accountEmail='other@example.com'],['wrong stage',f=>f.context.piece.parents=['approved']],
  ['missing image',f=>f.context.files.pop()],['changed image',f=>f.context.files.at(-1).version='2'],
  ['revoked approval',f=>f.approval.status='revoked'],['duplicate selection',f=>f.approval.images[3]=f.approval.images[0]],
  ['foreign item',f=>f.context.files.push(image('foreign','elsewhere'))],['protected evidence',f=>f.context.protectedFileIds=['source']],
  ['shared source',f=>f.context.files[1].consumerPieceIds=['piece','other']],['shortcut',f=>f.context.files[1].mimeType='application/vnd.google-apps.shortcut']
])test('blocks '+name,()=>{const f=fixture();change(f);assert.throws(()=>planFinalCleanup(f.context,f.approval));});
test('48 hours begins at verified Trash time, not approval time',()=>{const f=finished();f.context.now='2026-10-17T18:00:59Z';assert.deepEqual(eligibleFinalPurge(f.context,f.approval,f.plan,f.receipts).eligibleIds,[]);f.context.now='2026-10-17T18:01:00Z';assert.equal(eligibleFinalPurge(f.context,f.approval,f.plan,f.receipts).ready,true);});
for(const [name,change] of [
  ['new descendant',f=>f.context.files.push(image('new','outputs'))],['revoked approval',f=>f.approval.status='revoked'],
  ['changed revision',f=>f.approval.revision='2'],['restored asset',f=>f.context.files[1].trashed=false],
  ['changed trashed bytes',f=>f.context.files[1].md5Checksum='c'.repeat(32)],['missing receipt',f=>f.receipts.pop()],
  ['modified plan',f=>f.plan.trash.pop()],['unflattened final',f=>f.context.files.at(-1).parents=['outputs']],
  ['changed retained bytes',f=>f.context.files.at(-1).md5Checksum='d'.repeat(32)]
])test('purge blocks '+name,()=>{const f=finished();change(f);assert.throws(()=>eligibleFinalPurge(f.context,f.approval,f.plan,f.receipts));});
test('metadata-version increment from flattening preserves the approved bytes',()=>{const f=finished();f.context.files.at(-1).version='3';assert.equal(eligibleFinalPurge(f.context,f.approval,f.plan,f.receipts).ready,true);});
