import { buildDraft } from './build-draft.mjs';
import { codeBundle } from './code-bundle.mjs';
import { ROUTING_TABLE_ID } from './routing-engine.mjs';
import { fileURLToPath } from 'node:url';

export function buildRouting() {
  const workflow = buildDraft();
  const oldLibrary = workflow.nodes.find(node => node.name === 'Start Candidate Queue Read').parameters.jsCode.split("return [{ json: startTraversal('queue') }];")[0];
  for (const node of workflow.nodes) if (node.type === 'n8n-nodes-base.code') node.parameters.jsCode = codeBundle(node.parameters.jsCode.slice(oldLibrary.length));
  workflow.name = 'DEV - 04B Creator Candidate Selection and Image Routing';
  workflow.nodes = workflow.nodes.filter(node => !['Start Selection Validation','DRAFT — NO DRIVE MOVES OR DELETES'].includes(node.name));
  workflow.nodes.find(node => node.name === 'Validate Creator Selection — DRAFT').name = 'Submit Four Creator Views';
  delete workflow.connections['Validate Creator Selection — DRAFT']; delete workflow.connections['Start Selection Validation'];
  let sequence = 200;
  const node = (name, type, typeVersion, position, parameters, extra = {}) => ({ id: `aura-routing-${++sequence}`, name,
    type: `n8n-nodes-base.${type}`, typeVersion, position, parameters, ...extra });
  const code = (name, position, body) => node(name, 'code', 2, position, {jsCode: codeBundle(body)});
  const iff = (name, position, expression) => node(name, 'if', 2.3, position, {conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:3},
    conditions:[{id:`if-${name}`,leftValue:expression,rightValue:'',operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}});
  const filter = (keyName, keyValue) => ({keyName, condition:'eq', keyValue});
  const table = (name, position, operation, conditions, value) => node(name, 'dataTable', 1.1, position,
    {resource:'row',operation,dataTableId:{__rl:true,value:ROUTING_TABLE_ID,mode:'id'},matchType:'allConditions',filters:{conditions},
      ...(operation==='get'?{returnAll:true}:{}), ...(value?{columns:{mappingMode:'defineBelow',value,
        schema:Object.keys(value).map(id=>({id,displayName:id,type:'string',display:true,required:false,defaultMatch:false,canBeUsedToMatch:true}))}}:{}),options:{}}, {alwaysOutputData:true});
  const edge = (node, index=0) => ({node,type:'main',index});
  const connect = (name, yes, no) => { workflow.connections[name]={main:[yes.map(name=>edge(name)), ...(no?[no.map(name=>edge(name))]:[])]}; };
  const ref = name => `$('${name}').first().json`;
  const start = ref('Parse Four-View Selection');
  const claim = ref('Prepare Routing Claim');
  const owned = ref('Verify Routing Ownership');
  const journalFields = Object.fromEntries(['sourcePieceId','status','owner','jobId','jobJson'].map(key=>[key,`={{ $json.journal.${key} }}`]));
  workflow.nodes.push(
    code('Parse Four-View Selection',[240,460],`try { const request = parseSelectionRequest($input.first().json.body); return [{json:{request,owner:String($execution.id),valid:true}}]; }
catch(error) {return [{json:{valid:false,response:{status:400,body:{protocol:SELECTION_PROTOCOL,success:false,committed:false,error:error.message}}}}];}`),
    iff('Valid Four Views?',[460,460],'={{ $json.valid === true }}'),
    table('Read Routing Mutex',[680,400],'get',[filter('sourcePieceId','__creator_mutex__')]),
    code('Prepare Routing Claim',[900,400],`const rows=$input.all().map(item=>item.json).filter(row=>row.sourcePieceId===MUTEX_KEY); const context=${start};
return [{json:rows.length===1?{...context,mutexId:rows[0].id,ready:true}:{...context,ready:false,response:{status:503,body:{protocol:SELECTION_PROTOCOL,success:false,committed:false,error:'Routing state is missing or duplicated.'}}}}];`),
    iff('Mutex Configured?',[1120,400],'={{ $json.ready === true }}'),
    table('Atomically Claim Routing',[1340,320],'update',[filter('id','={{ Number($json.mutexId) }}'),filter('status','idle')],{status:'busy',owner:'={{ $json.owner }}'}),
    table('Read Claimed Mutex',[1560,320],'get',[filter('id',`={{ Number(${claim}.mutexId) }}`)]),
    code('Verify Routing Ownership',[1780,320],`const context=${claim}; const rows=$input.all().map(item=>item.json); const owned=rows.length===1&&rows[0].status==='busy'&&rows[0].owner===context.owner;
return [{json:{...context,claimed:owned,...(!owned?{response:{status:423,body:{protocol:SELECTION_PROTOCOL,success:false,committed:false,error:'Another Drive job is running. Wait for it to finish.'}}}:{})}}];`),
    iff('Routing Lock Owned?',[2000,320],'={{ $json.claimed === true }}'),
    table('Read Saved Selection',[2200,220],'get',[filter('sourcePieceId','={{ $json.request.pieceFolderId }}')]),
    code('Resume or Read Fresh Pool',[2420,220],`const context=${owned}; const rows=$input.all().map(item=>item.json).filter(row=>row.sourcePieceId===context.request.pieceFolderId);
try {if(rows.length>1)throw new Error('Duplicate routing journals.');
 if(!rows.length)return [{json:{...context,needsSnapshot:true}}];
 const session=resumeRoutingSession(context.request,rows[0],context.owner); return [{json:{...session,mutexId:context.mutexId,claimed:true,needsSnapshot:false}}];
}catch(error){return [{json:{...context,needsSnapshot:false,finished:true,response:{status:409,body:{protocol:SELECTION_PROTOCOL,success:false,committed:false,error:error.message}}}}];}`),
    iff('Read Fresh Candidate Pool?',[2640,220],'={{ $json.needsSnapshot === true }}'),
    code('Start Locked Candidate Read',[2640,-20],`const context=$input.first().json; return [{json:startTraversal('plan',context.request)}];`),
    iff('Queue Response?',[950,180],'={{ $json.queueResult === true }}'),
    code('Checkpoint Routing Session',[2860,220],`const session=$input.first().json; return [{json:{...session,hasJob:Boolean(session.job),...(session.job?{journal:routingJournal(session)}:{})}}];`),
    iff('Has Routing Journal?',[3080,220],'={{ $json.hasJob === true }}'),
    table('Save Routing Progress',[3300,100],'upsert',[filter('sourcePieceId','={{ $json.journal.sourcePieceId }}')],journalFields),
    code('Restore Saved Session',[3520,100],`const session=$('Checkpoint Routing Session').first(0,$runIndex).json; const rows=$input.all().map(item=>item.json);
if(rows.length!==1||rows[0].jobId!==session.job.jobId||rows[0].jobJson!==session.journal.jobJson)throw new Error('Routing checkpoint was not durably saved. Lock remains held for recovery.');
return [{json:session}];`),
    iff('Routing Finished?',[3740,100],'={{ $json.finished === true }}'),
    code('Prepare Routing Command',[3960,-30],`const session=$input.first().json; try{return [{json:nextRoutingCommand(session)}];}catch(error){return [{json:routingFailure(session,error.message)}];}`),
    iff('Has Drive Command?',[4180,-30],'={{ !$json.finished && Boolean($json.command) }}'),
    node('Execute Verified Drive Step','httpRequest',4.2,[4400,-130],{method:'={{ $json.command.method }}',url:'={{ $json.command.url }}',
      authentication:'predefinedCredentialType',nodeCredentialType:'googleDriveOAuth2Api',sendQuery:true,specifyQuery:'json',jsonQuery:'={{ JSON.stringify($json.command.query || {}) }}',
      sendBody:'={{ $json.command.body !== undefined }}',specifyBody:'json',jsonBody:'={{ JSON.stringify($json.command.body || {}) }}',
      options:{timeout:30000,response:{response:{responseFormat:'json',fullResponse:true,neverError:true}}}},
      {credentials:{googleDriveOAuth2Api:{name:'Aura Google Drive'}},onError:'continueRegularOutput'}),
    code('Verify and Record Drive Step',[4620,-130],`const session=$('Prepare Routing Command').first(0,$runIndex).json; const next=acceptRoutingResponse(session,$input.first().json); return [{json:{...next,mutexId:session.mutexId,claimed:true}}];`),
    code('Prepare Final Routing Response',[3300,460],`const session=$input.first().json; return [{json:{mutexId:session.mutexId,owner:session.owner,response:session.response||{status:502,body:{protocol:SELECTION_PROTOCOL,success:false,committed:false,error:'Routing result is unconfirmed.'}}}}];`),
    table('Release Owned Routing Mutex',[3520,460],'update',[filter('id','={{ Number($json.mutexId) }}'),filter('owner','={{ $json.owner }}'),filter('status','busy')],{status:'idle',owner:'none'}),
    code('Check Routing Release',[3740,460],`const context=$('Prepare Final Routing Response').first().json; const rows=$input.all().map(item=>item.json);
return [{json:rows.length===1&&rows[0].status==='idle'&&rows[0].id===context.mutexId?context:{response:{status:502,body:{protocol:SELECTION_PROTOCOL,success:false,committed:false,error:'Job recorded; routing lock release needs attention.'}}}}];`),
    node('Return Image Routing Result','respondToWebhook',1.5,[4180,500],{respondWith:'json',responseBody:'={{ $json.response.body }}',options:{responseCode:'={{ $json.response.status }}'}}),
    node('Image Routing — Unpublished','stickyNote',1,[1600,620],{width:1100,height:300,content:'# Creator image routing\nKeep unpublished until the user requests testing. Four selected candidates become the designer root; other candidates move to a separate rejected piece archive. References follow the original piece, which moves last. Root final copies are preserved under _run/final_copies. A conditional data-table mutex serializes writes and durable journals resume the SAME selection. Hard interruption leaves the lock held: terminate/check the original execution before resetting it. ZIP cleanup is a separate post-generator/reviewer workflow.'}),
  );
  const build = workflow.nodes.find(node=>node.name==='Build Queue or Validate Plan');
  build.parameters.jsCode=codeBundle(`const state=$input.first().json;
if(state.mode==='queue') {if(state.error)return [{json:{queueResult:true,status:502,body:{protocol:SELECTION_PROTOCOL,error:state.error}}}];
const pieces=state.files.filter(file=>file.mimeType===DRIVE_FOLDER&&file.parents.includes(STAGES.queue));
return [{json:{queueResult:true,status:200,body:{protocol:SELECTION_PROTOCOL,pieces:pieces.map(piece=>{try{return indexCandidatePool(piece,state.files).record;}catch(error){return {pieceFolderId:piece.id,pieceName:piece.name,reviewRevision:hash([piece.id,piece.modifiedTime||null]),images:[],issues:[error.message]};}})}}}];}
const context=${owned};
try{if(state.error)throw new Error(state.error); const piece=state.files.find(file=>file.id===context.request.pieceFolderId&&file.parents.includes(STAGES.queue));
if(!piece)throw new Error('STALE_SELECTION: piece no longer awaits review.');
return [{json:{...newRoutingSession(context.request,indexCandidatePool(piece,state.files),context.owner),mutexId:context.mutexId,claimed:true}}];
}catch(error){return [{json:{...context,finished:true,response:{status:error.message.startsWith('STALE_SELECTION')?409:400,body:{protocol:SELECTION_PROTOCOL,success:false,committed:false,error:error.message}}}}];}`);
  connect('Submit Four Creator Views',['Parse Four-View Selection']);connect('Parse Four-View Selection',['Valid Four Views?']);
  connect('Valid Four Views?',['Read Routing Mutex'],['Return Image Routing Result']);connect('Read Routing Mutex',['Prepare Routing Claim']);
  connect('Prepare Routing Claim',['Mutex Configured?']);connect('Mutex Configured?',['Atomically Claim Routing'],['Return Image Routing Result']);
  connect('Atomically Claim Routing',['Read Claimed Mutex']);connect('Read Claimed Mutex',['Verify Routing Ownership']);
  connect('Verify Routing Ownership',['Routing Lock Owned?']);connect('Routing Lock Owned?',['Read Saved Selection'],['Return Image Routing Result']);
  connect('Read Saved Selection',['Resume or Read Fresh Pool']);connect('Resume or Read Fresh Pool',['Read Fresh Candidate Pool?']);
  connect('Read Fresh Candidate Pool?',['Start Locked Candidate Read'],['Checkpoint Routing Session']);connect('Start Locked Candidate Read',['More Folder Pages?']);
  connect('Build Queue or Validate Plan',['Queue Response?']);connect('Queue Response?',['Return Creator Selection Draft Result'],['Checkpoint Routing Session']);
  connect('Checkpoint Routing Session',['Has Routing Journal?']);connect('Has Routing Journal?',['Save Routing Progress'],['Prepare Final Routing Response']);
  connect('Save Routing Progress',['Restore Saved Session']);connect('Restore Saved Session',['Routing Finished?']);
  connect('Routing Finished?',['Prepare Final Routing Response'],['Prepare Routing Command']);connect('Prepare Routing Command',['Has Drive Command?']);
  connect('Has Drive Command?',['Execute Verified Drive Step'],['Checkpoint Routing Session']);connect('Execute Verified Drive Step',['Verify and Record Drive Step']);
  connect('Verify and Record Drive Step',['Checkpoint Routing Session']);connect('Prepare Final Routing Response',['Release Owned Routing Mutex']);
  connect('Release Owned Routing Mutex',['Check Routing Release']);connect('Check Routing Release',['Return Image Routing Result']);
  workflow.active=false; return workflow;
}
if(process.argv[1]===fileURLToPath(import.meta.url)&&(process.argv.includes('--print')||process.argv.includes('--stats')||process.argv.includes('--slice'))) {
  const exported=JSON.stringify(buildRouting(),null,2)+'\n';
  if(process.argv.includes('--stats'))process.stdout.write(JSON.stringify({bytes:exported.length,nodes:buildRouting().nodes.length}));
  else if(process.argv.includes('--slice')) {const index=Number(process.argv[process.argv.indexOf('--slice')+1]);process.stdout.write(JSON.stringify(exported.slice(index*35000,(index+1)*35000)));}
  else process.stdout.write(exported);
}
