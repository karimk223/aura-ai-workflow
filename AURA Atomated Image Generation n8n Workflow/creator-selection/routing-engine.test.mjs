import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { indexCandidatePool, STAGES } from './selection-core.mjs';
import { VIEWS, SELECTION_PROTOCOL } from '../../content creator website/app/creator-selection.ts';
import { newRoutingSession, nextRoutingCommand, acceptRoutingResponse, routingJournal, resumeRoutingSession } from './routing-engine.mjs';
import { buildRouting } from './build-routing.mjs';
const require = createRequire(import.meta.url);
const folder = (id,name,parent) => ({id,name,parents:[parent],mimeType:'application/vnd.google-apps.folder',trashed:false});
function fixture() {
  const piece=folder('piece','Dress',STAGES.queue), files=[folder('outputs','04_PRODUCT_IMAGE_OUTPUTS','piece'),folder('run','_run','outputs'),folder('pool','candidates','run')];
  for(const name of ['01_MATERIAL_CLOSEUPS_4K','02_WHOLE_FRONT_BACK_SIDE','03_SIZE_FIT_MODEL_MANNEQUIN']) files.push(folder(`ref-${name}`,name,'piece'));
  for(const view of VIEWS){files.push(folder(`folder-${view}`,view,'pool'));
    for(let attempt=1;attempt<=3;attempt++)files.push({id:`${view}-${attempt}`,name:`attempt_${attempt}.png`,parents:[`folder-${view}`],mimeType:'image/png',md5Checksum:`checksum-${view}-${attempt}`,appProperties:{auraAttempt:String(attempt)}});}
  files.push({id:'root-copy',name:'front-final.png',mimeType:'image/png',md5Checksum:'root-checksum',parents:['outputs']});
  const snapshot=indexCandidatePool(piece,files), request={protocol:SELECTION_PROTOCOL,pieceFolderId:'piece',reviewRevision:snapshot.record.reviewRevision,
    selections:Object.fromEntries(VIEWS.map(view=>[view,`${view}-2`]))};
  return {snapshot,request,drive:new Map([piece,...files].map(file=>[file.id,structuredClone(file)]))};
}
function mockDrive(drive, command) {
  assert.ok(command.url.startsWith('https://www.googleapis.com/drive/v3/files'));
  if(command.url.endsWith('/generateIds'))return {statusCode:200,body:{ids:Array.from({length:command.query.count},(_,i)=>`reserved-${i}`)}};
  if(command.url.endsWith('/files')&&command.method==='GET'){
    const parent=command.query.q.match(/^'([^']+)'/)[1];
    return {statusCode:200,body:{files:[...drive.values()].filter(file=>file.parents?.includes(parent)&&file.mimeType.startsWith('image/'))}};
  }
  const id=command.url.split('/').at(-1);
  if(command.method==='GET')return drive.has(id)?{statusCode:200,body:structuredClone(drive.get(id))}:{statusCode:404,body:{}};
  if(command.method==='POST'){assert.equal(command.body.mimeType,'application/vnd.google-apps.folder');assert.ok(!drive.has(command.body.id));drive.set(command.body.id,structuredClone(command.body));return {statusCode:200,body:command.body};}
  assert.equal(command.method,'PATCH'); const file=drive.get(id);assert.ok(file.parents.includes(command.query.removeParents));
  Object.assign(file,command.body);file.parents=[command.query.addParents];return {statusCode:200,body:structuredClone(file)};
}
function finish(session, drive) {
  for(let step=0;step<300&&!session.finished;step++){
    session=nextRoutingCommand(session);
    if(session.finished)break;
    session=acceptRoutingResponse(session,mockDrive(drive,session.command));
    const record=routingJournal({...session,journal:{jobJson:'previous'.repeat(500)}});
    assert.ok(record.jobJson.length<65000,'journal must not recursively grow');
    session=JSON.parse(record.jobJson);
  }
  assert.equal(session.status,'committed');return session;
}
test('moves four selected views, archives eight others, retains references and moves the piece last',()=>{
  const f=fixture(),session=finish(newRoutingSession(f.request,f.snapshot,'owner-1'),f.drive);
  assert.equal(session.response.body.committed,true);
  const root=[...f.drive.values()].filter(file=>file.parents?.includes('outputs')&&file.mimeType.startsWith('image/'));
  assert.equal(root.length,4);assert.ok(root.every(file=>file.id.endsWith('-2')));
  assert.deepEqual(f.drive.get('piece').parents,[STAGES.approved]);
  for(const reference of session.job.references)assert.deepEqual(f.drive.get(reference.id).parents,['piece']);
  for(const rejected of session.job.plan.rejected)assert.notEqual(f.drive.get(rejected.fileId).parents[0],rejected.sourceParentId);
  assert.equal(session.job.operations.at(-1).kind,'piece');assert.ok(f.drive.has('root-copy'));
  assert.equal([...f.drive.values()].filter(file=>file.appProperties?.auraSourcePieceId==='piece'&&file.parents?.includes(STAGES.rejected)).length,1);
});
test('timeout after a successful Drive write resumes without duplicate folders or lost images',()=>{
  const f=fixture();let session=newRoutingSession(f.request,f.snapshot,'owner-1');
  session=acceptRoutingResponse(nextRoutingCommand(session),{statusCode:200,body:{ids:session.job.folders.map((_,i)=>`reserved-${i}`)}});
  session=acceptRoutingResponse(nextRoutingCommand(session),{statusCode:404,body:{}});
  session=nextRoutingCommand(session);mockDrive(f.drive,session.command);
  session=acceptRoutingResponse(session,{error:'network timeout'});assert.equal(session.status,'failed');
  session=resumeRoutingSession(f.request,routingJournal(session),'owner-2');session=finish(session,f.drive);
  assert.equal(session.response.body.approved,4);assert.equal(session.response.body.rejected,8);
});
test('an unexpected file parent fails closed and a competing selection cannot replace the saved job',()=>{
  const f=fixture();let session=newRoutingSession(f.request,f.snapshot,'owner-1');
  const different=structuredClone(f.request);different.selections.front='front-1';
  assert.throws(()=>resumeRoutingSession(different,routingJournal(session),'owner-2'),/different selection/);
  f.drive.get('front-2').parents=['outside-piece'];
  for(let step=0;step<300&&!session.finished;step++){session=nextRoutingCommand(session);session=acceptRoutingResponse(session,mockDrive(f.drive,session.command));}
  assert.equal(session.status,'failed');assert.deepEqual(f.drive.get('piece').parents,[STAGES.queue]);assert.ok(f.drive.has('front-2'));
});
test('compiled workflow has valid code, complete connections and conditional ownership/release',()=>{
  const workflow=buildRouting();assert.equal(workflow.active,false);
  const names=new Set(workflow.nodes.map(node=>node.name));assert.equal(names.size,workflow.nodes.length);
  for(const outputs of Object.values(workflow.connections))for(const edges of outputs.main)for(const edge of edges)assert.ok(names.has(edge.node),edge.node);
  for(const node of workflow.nodes)if(node.type==='n8n-nodes-base.code')assert.doesNotThrow(()=>new Function('$input','$','$runIndex','$execution','require',node.parameters.jsCode),node.name);
  const claim=workflow.nodes.find(node=>node.name==='Atomically Claim Routing');assert.equal(claim.parameters.operation,'update');assert.equal(claim.parameters.matchType,'allConditions');
  assert.ok(claim.parameters.filters.conditions.some(condition=>condition.keyName==='status'&&condition.keyValue==='idle'));
  const release=workflow.nodes.find(node=>node.name==='Release Owned Routing Mutex');assert.ok(release.parameters.filters.conditions.some(condition=>condition.keyName==='owner'));
  const parse=workflow.nodes.find(node=>node.name==='Parse Four-View Selection');
  const f=fixture();const result=new Function('$input','$','$runIndex','$execution','require',parse.parameters.jsCode)({first:()=>({json:{body:f.request}})},()=>{},0,{id:'123'},require);
  assert.equal(result[0].json.valid,true);assert.equal(result[0].json.owner,'123');
});
