import assert from 'node:assert/strict';
import {test} from 'node:test';
import {indexCandidatePool,STAGES} from './selection-core.mjs';
import {VIEWS} from '../../content creator website/app/creator-selection.ts';
import {newCleanupSession,resumeCleanupSession,cleanupRequest} from './cleanup-engine.mjs';
import {nextRoutingCommand,acceptRoutingResponse,routingJournal} from './routing-engine.mjs';
import {buildCleanup} from './build-cleanup.mjs';
const folder=(id,name,parent)=>({id,name,parents:[parent],mimeType:'application/vnd.google-apps.folder',trashed:false});
function fixture(){
  const piece=folder('piece','Dress',STAGES.queue),files=[folder('outputs','04_PRODUCT_IMAGE_OUTPUTS','piece'),folder('run','_run','outputs'),folder('candidates','candidates','run')];
  const referenceAssets=[];
  for(const [index,name] of ['01_MATERIAL_CLOSEUPS_4K','02_WHOLE_FRONT_BACK_SIDE','03_SIZE_FIT_MODEL_MANNEQUIN'].entries()){
    const root=folder(`ref-root-${index}`,name,'piece'),file={id:`ref-${index}`,name:`evidence-${index}.png`,mimeType:'image/png',md5Checksum:`reference-checksum-${index}`,parents:[root.id]};files.push(root,file);
    referenceAssets.push({...file,parentId:root.id,ancestorChain:[{id:root.id,name:root.name,parentId:'piece'}]});
  }
  for(const view of VIEWS){files.push(folder(`view-${view}`,view,'candidates'));files.push({id:`image-${view}`,name:`${view}.png`,mimeType:'image/png',md5Checksum:`checksum-${view}`,parents:[`view-${view}`]});}
  const intakeArchives=['original_transfer_zip','extracted_frames_zip'].map((role,index)=>({id:`zip-${index}`,name:`archive-${index}.zip`,mimeType:'application/zip',parents:['piece'],parentId:'piece',md5Checksum:`zip-checksum-${index}`,
    role,sourcePieceId:'piece',extractionVerified:true,consumerPieceIds:['piece'],completedConsumerIds:['piece']}));
  files.push(...intakeArchives);
  return {request:{pieceFolderId:'piece',runId:'generation-1'},completion:{sourcePieceId:'piece',runId:'generation-1',pipelineStatus:'completed',generatorStatus:'completed',reviewerStatus:'completed',extractionVerified:true,intakeArchives,referenceAssets},
    snapshot:indexCandidatePool(piece,files),drive:new Map([piece,...files].map(file=>[file.id,structuredClone(file)]))};
}
function run(session,drive,{timeoutFirstDelete=false}={}){
  let deleted=0;
  for(let index=0;index<160&&!session.finished;index++){
    session=nextRoutingCommand(session);const command=session.command,id=command.url.split('/').at(-1);
    let response;
    if(command.method==='GET')response=drive.has(id)?{statusCode:200,body:structuredClone(drive.get(id))}:{statusCode:404,body:{}};
    else {assert.equal(command.method,'DELETE');assert.ok(id==='zip-0'||id==='zip-1');assert.equal(drive.get(id).mimeType,'application/zip');drive.delete(id);deleted++;
      response=timeoutFirstDelete&&deleted===1?{error:'timeout after delete'}:{statusCode:204,body:''};}
    session=acceptRoutingResponse(session,response);
  }
  return session;
}
test('removes exactly the two ZIP files only after both stages complete; retains every image and folder',()=>{
  const f=fixture(),before=f.drive.size,session=run(newCleanupSession(f.request,f.completion,f.snapshot,'owner'),f.drive);
  assert.equal(session.status,'committed');assert.equal(session.response.body.protocol,'aura-archive-cleanup/v1');assert.equal(f.drive.size,before-2);
  for(const view of VIEWS)assert.ok(f.drive.has(`image-${view}`));for(const asset of f.completion.referenceAssets)assert.ok(f.drive.has(asset.id));assert.ok(f.drive.has('piece'));
});
test('missing completion, a pending reviewer, a folder disguised as an archive, and shared pending consumers are blocked',()=>{
  for(const field of ['generatorStatus','reviewerStatus','pipelineStatus']){const f=fixture();f.completion[field]='running';assert.throws(()=>newCleanupSession(f.request,f.completion,f.snapshot,'owner'));}
  const disguised=fixture();disguised.completion.intakeArchives[0].mimeType='application/vnd.google-apps.folder';assert.throws(()=>newCleanupSession(disguised.request,disguised.completion,disguised.snapshot,'owner'));
  const shared=fixture();shared.completion.intakeArchives[0].consumerPieceIds.push('other-piece');assert.throws(()=>newCleanupSession(shared.request,shared.completion,shared.snapshot,'owner'));
  assert.throws(()=>cleanupRequest({pieceFolderId:'piece',runId:'../foreign'}));
});
test('a missing retained image or changed ZIP checksum stops before either deletion',()=>{
  for(const broken of ['reference','zip']){const f=fixture();if(broken==='reference')f.drive.delete('ref-1');else f.drive.get('zip-1').md5Checksum='changed';
    const session=run(newCleanupSession(f.request,f.completion,f.snapshot,'owner'),f.drive);assert.equal(session.status,'failed');assert.ok(f.drive.has('zip-0'));assert.ok(f.drive.has('zip-1'));}
});
test('timeout after permanent deletion resumes by checking the recorded ID, without deleting anything else',()=>{
  const f=fixture();let session=run(newCleanupSession(f.request,f.completion,f.snapshot,'owner'),f.drive,{timeoutFirstDelete:true});assert.equal(session.status,'failed');
  session=resumeCleanupSession(f.request,routingJournal(session),'owner-next');session=run(session,f.drive);assert.equal(session.status,'committed');assert.ok(!f.drive.has('zip-0'));assert.ok(!f.drive.has('zip-1'));
});
test('cleanup export is inactive, internal-only, and uses the durable state table',()=>{
  const workflow=buildCleanup();assert.equal(workflow.active,false);assert.ok(!workflow.nodes.some(node=>node.type==='n8n-nodes-base.webhook'||node.type==='n8n-nodes-base.respondToWebhook'));
  assert.ok(workflow.nodes.some(node=>node.type==='n8n-nodes-base.executeWorkflowTrigger'));
  const names=new Set(workflow.nodes.map(node=>node.name));for(const outputs of Object.values(workflow.connections))for(const edges of outputs.main)for(const edge of edges)assert.ok(names.has(edge.node),edge.node);
  for(const node of workflow.nodes)if(node.type==='n8n-nodes-base.code')assert.doesNotThrow(()=>new Function('$input','$','$runIndex','$execution','require',node.parameters.jsCode),node.name);
});
