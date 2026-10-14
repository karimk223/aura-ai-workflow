import { buildRouting } from './build-routing.mjs';
import { codeBundle } from './code-bundle.mjs';
import { ROUTING_TABLE_ID } from './routing-engine.mjs';
import { fileURLToPath } from 'node:url';

export function buildCleanup() {
  const workflow=buildRouting(), excluded=new Set(['Get Creator Candidates — DRAFT','Start Candidate Queue Read','Queue Response?','Return Creator Selection Draft Result']);
  workflow.name='DEV - 09 Verified ZIP Cleanup After Generation and Review';
  workflow.nodes=workflow.nodes.filter(node=>!excluded.has(node.name));
  for(const name of excluded)delete workflow.connections[name];
  const code=(name,body)=>{workflow.nodes.find(node=>node.name===name).parameters.jsCode=codeBundle(body,['cleanup-engine.mjs']);};
  const trigger=workflow.nodes.find(node=>node.name==='Submit Four Creator Views');trigger.type='n8n-nodes-base.executeWorkflowTrigger';trigger.typeVersion=1.1;trigger.parameters={inputSource:'passthrough'};delete trigger.credentials;
  for(const node of workflow.nodes)if(node.type==='n8n-nodes-base.code'){
    const body=node.parameters.jsCode.split('\n// AURA_NODE_BODY\n')[1];node.parameters.jsCode=codeBundle(body,['cleanup-engine.mjs']);
  }
  code('Parse Four-View Selection',`try{return [{json:{request:cleanupRequest($input.first().json),owner:String($execution.id),valid:true}}];}catch(error){return [{json:{valid:false,response:{status:400,body:{protocol:CLEANUP_PROTOCOL,success:false,committed:false,error:error.message}}}}];}`);
  workflow.nodes.find(node=>node.name==='Read Saved Selection').parameters.filters.conditions[0].keyValue='={{ "cleanup:" + $json.request.pieceFolderId + ":" + $json.request.runId }}';
  code('Resume or Read Fresh Pool',`const context=$('Verify Routing Ownership').first().json,key='cleanup:'+context.request.pieceFolderId+':'+context.request.runId;
const rows=$input.all().map(item=>item.json).filter(row=>row.sourcePieceId===key);
try{if(rows.length>1)throw new Error('Duplicate cleanup journals.');if(!rows.length)return [{json:{...context,needsSnapshot:true}}];
return [{json:{...resumeCleanupSession(context.request,rows[0],context.owner),mutexId:context.mutexId,claimed:true,needsSnapshot:false}}];
}catch(error){return [{json:{...context,needsSnapshot:false,finished:true,response:{status:409,body:{protocol:CLEANUP_PROTOCOL,success:false,committed:false,error:error.message}}}}];}`);
  const table=workflow.nodes.find(node=>node.name==='Read Saved Selection');
  workflow.nodes.push({...table,id:'aura-cleanup-completion',name:'Read Trusted Generation Completion',position:[2640,-180],parameters:{...table.parameters,
    filters:{conditions:[{keyName:'sourcePieceId',condition:'eq',keyValue:'={{ "generation:" + $json.request.pieceFolderId + ":" + $json.request.runId }}'}]}}});
  code('Start Locked Candidate Read',`const context=$('Verify Routing Ownership').first().json,key='generation:'+context.request.pieceFolderId+':'+context.request.runId;
const rows=$input.all().map(item=>item.json).filter(row=>row.sourcePieceId===key);
try{if(rows.length!==1||rows[0].status!=='completed'||rows[0].jobId!==context.request.runId)throw new Error('A trusted completed generation record is required.');
const completion=JSON.parse(rows[0].jobJson);return [{json:{...startTraversal('cleanup',context.request),completion}}];}
catch(error){return [{json:{mode:'cleanup',done:true,error:error.message}}];}`);
  code('Build Queue or Validate Plan',`const state=$input.first().json,context=$('Verify Routing Ownership').first().json;
try{if(state.error)throw new Error(state.error);const piece=state.files.find(file=>file.id===context.request.pieceFolderId&&file.parents.includes(STAGES.queue));
if(!piece)throw new Error('Piece and retained outputs must be in AIApproved before archive cleanup.');
return [{json:{...newCleanupSession(context.request,state.completion,indexCandidatePool(piece,state.files),context.owner),mutexId:context.mutexId,claimed:true}}];}
catch(error){return [{json:{...context,finished:true,response:{status:400,body:{protocol:CLEANUP_PROTOCOL,success:false,committed:false,error:error.message}}}}];}`);
  const http=workflow.nodes.find(node=>node.name==='Execute Verified Drive Step');http.parameters.options.response.response.responseFormat='autodetect';
  const terminal=workflow.nodes.find(node=>node.name==='Return Image Routing Result');terminal.type='n8n-nodes-base.code';terminal.typeVersion=2;terminal.parameters={jsCode:codeBundle('const result=$input.first().json.response; return [{json:{...result,body:{...result.body,protocol:CLEANUP_PROTOCOL}}}];',['cleanup-engine.mjs'])};
  const note=workflow.nodes.find(node=>node.type==='n8n-nodes-base.stickyNote');note.parameters.content='# Permanent ZIP cleanup — keep unpublished\nInternal subworkflow, not a public webhook. Called only after generator and reviewer completion is durably recorded. Reads archive IDs/checksums from the original n8n intake manifest, never from model-selected deletion targets. Verifies all retained reference and four-view candidate files, then deletes exactly the two ZIP FILES and confirms both are gone. Folder targets, incomplete jobs, changed checksums and unfinished shared-ZIP consumers are rejected. No files have been deleted during setup.';
  const edge=node=>({node,type:'main',index:0});
  workflow.connections['Read Fresh Candidate Pool?'].main[0]=[edge('Read Trusted Generation Completion')];
  workflow.connections['Read Trusted Generation Completion']={main:[[edge('Start Locked Candidate Read')]]};
  workflow.connections['Build Queue or Validate Plan']={main:[[edge('Checkpoint Routing Session')]]};
  workflow.settings={executionOrder:'v1'};workflow.active=false;
  return workflow;
}
if(process.argv[1]===fileURLToPath(import.meta.url)&&(process.argv.includes('--print')||process.argv.includes('--stats')||process.argv.includes('--slice'))){
  const exported=JSON.stringify(buildCleanup(),null,2)+'\n';
  if(process.argv.includes('--stats'))process.stdout.write(JSON.stringify({bytes:exported.length,nodes:buildCleanup().nodes.length}));
  else if(process.argv.includes('--slice')){const index=Number(process.argv[process.argv.indexOf('--slice')+1]);process.stdout.write(JSON.stringify(exported.slice(index*35000,(index+1)*35000)));}
  else process.stdout.write(exported);
}
