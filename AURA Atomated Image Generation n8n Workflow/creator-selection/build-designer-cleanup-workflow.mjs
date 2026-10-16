import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildEssentialWorkflow} from './build-essential-workflow.mjs';
export function buildDesignerCleanupWorkflow(){
 const w=buildEssentialWorkflow();
 const stripped=name=>readFileSync(new URL(name,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
 const library="const {createHash}=require('crypto');\n"+['essential-runtime.mjs','final-cleanup-plan.mjs','designer-cleanup-runtime.mjs'].map(stripped).join('\n');
 const keep=['Receive One Explicit Stage Job','AURA Configuration','Advance Essential Stage','Route Native Transport','Restore Native Response Packet','Return Stage Result','IO drive_json','IO drive_json With Body','IO drive_json Has Body?','IO table_get','IO table_upsert','IO table_update','Reject Unknown Transport'];
 w.nodes=w.nodes.filter(n=>keep.includes(n.name));w.connections={};w.name='DEV - 11 Designer Approval and 48-Hour Cleanup — TEST FIRST';
 w.nodes.find(n=>n.name==='AURA Configuration').parameters.jsCode=library+`\nconst config={enabled:false,cleanupEnabled:false,purgeEnabled:false};
const inputs=$input.all();if(inputs.length!==1)throw new Error('Exactly one Designer job is required.');
return [{json:{state:startDesignerCleanup(inputs[0].json,config,String($execution.id))}}];`;
 w.nodes.find(n=>n.name==='Advance Essential Stage').parameters.jsCode=library+`\nconst input=$input.first().json;
const state=input.event===undefined?input.state:await advanceDesignerCleanup(input.state,input.event);
return [{json:{state,command:state.command}}];`;
 w.nodes.find(n=>n.name==='Return Stage Result').parameters.jsCode=`const state=$input.first().json.state;
return [{json:{response:state.result,requestIsWebhook:state.webhook===true}}];`;
 const route=w.nodes.find(n=>n.name==='Route Native Transport');
 const kinds=['drive_json','table_get','table_upsert','table_update','drive_delete','done'];
 const deleteRule=structuredClone(route.parameters.rules.values.find(r=>r.outputKey==='drive_json'));deleteRule.outputKey='drive_delete';deleteRule.conditions.conditions[0].rightValue='drive_delete';
 route.parameters.rules.values=route.parameters.rules.values.filter(r=>kinds.includes(r.outputKey)&&r.outputKey!=='done').concat([deleteRule,route.parameters.rules.values.find(r=>r.outputKey==='done')]);
 const deleteNode=structuredClone(w.nodes.find(n=>n.name==='IO drive_json'));deleteNode.id='aura-cleanup-exact-delete';deleteNode.name='IO drive_delete';
 deleteNode.parameters.method='DELETE';deleteNode.parameters.sendBody=false;delete deleteNode.parameters.specifyBody;delete deleteNode.parameters.jsonBody;
 deleteNode.parameters.options.response={response:{responseFormat:'text',fullResponse:true,neverError:false}};w.nodes.push(deleteNode);
 const edge=node=>({node,type:'main',index:0});const connect=(a,b)=>{w.connections[a]={main:[[edge(b)]]};};
 connect('Receive One Explicit Stage Job','AURA Configuration');connect('AURA Configuration','Advance Essential Stage');connect('Advance Essential Stage','Route Native Transport');
 w.connections['Route Native Transport']={main:[...kinds.map(k=>[edge(k==='done'?'Return Stage Result':k==='drive_json'?'IO drive_json Has Body?':'IO '+k)]),[edge('Reject Unknown Transport')]]};
 w.connections['IO drive_json Has Body?']={main:[[edge('IO drive_json With Body')],[edge('IO drive_json')]]};
 connect('IO drive_json With Body','Restore Native Response Packet');
 for(const k of kinds.filter(k=>k!=='done'))connect('IO '+k,'Restore Native Response Packet');connect('Restore Native Response Packet','Advance Essential Stage');
 let seq=0;const code=(name,pos,jsCode)=>({id:'aura-designer-code-'+(++seq),name,type:'n8n-nodes-base.code',typeVersion:2,position:pos,parameters:{jsCode}});
 for(const [oldName,mode] of [['Get Designer Review Pieces','list'],['Submit Designer Decision','decide']]){
  const copy={id:'aura-new-designer-'+mode,name:oldName,type:'n8n-nodes-base.webhook',typeVersion:2.1,position:[-500,mode==='list'?-200:-400],webhookId:'aura-essential-designer-'+mode,
   parameters:{...(mode==='decide'?{httpMethod:'POST'}:{}),path:mode==='decide'?'designer-review/decision':'designer-review/pieces',authentication:'basicAuth',responseMode:'responseNode',options:{}},
   credentials:{httpBasicAuth:{id:'EmJve8yZ9bmQsjYS',name:'AURA Designer Review Login'}}};w.nodes.push(copy);
  const name='Prepare Authenticated Designer '+mode;
  w.nodes.push(code(name,[-300,mode==='list'?-200:-400],`return [{json:{mode:'${mode}',isWebhook:true,body:$input.first().json.body}}];`));connect(copy.name,name);connect(name,'AURA Configuration');
 }
 w.nodes.push({id:'aura-cleanup-clock',name:'Check 48-Hour Cleanup Every Six Hours',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[-500,-600],parameters:{rule:{interval:[{field:'cronExpression',expression:'0 */6 * * *'}]}}});
 w.nodes.push(code('Prepare Cleanup Tick',[-300,-600],`return [{json:{mode:'cleanup'}}];`));connect('Check 48-Hour Cleanup Every Six Hours','Prepare Cleanup Tick');connect('Prepare Cleanup Tick','AURA Configuration');
 w.nodes.push({id:'aura-designer-webhook-response-if',name:'Request Came From Webhook?',type:'n8n-nodes-base.if',typeVersion:2.3,position:[1800,350],parameters:{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:3},conditions:[{id:'is-webhook',leftValue:'={{ $json.requestIsWebhook }}',rightValue:'',operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}}});
 w.nodes.push({id:'aura-designer-webhook-response',name:'Return Authenticated Designer Response',type:'n8n-nodes-base.respondToWebhook',typeVersion:1.5,position:[2050,300],parameters:{respondWith:'json',responseBody:'={{ $json.response }}',options:{responseCode:200}}});
 w.nodes.push(code('Return Cleanup Result',[2050,500],`return [{json:$input.first().json.response}];`));
 connect('Return Stage Result','Request Came From Webhook?');w.connections['Request Came From Webhook?']={main:[[edge('Return Authenticated Designer Response')],[edge('Return Cleanup Result')]]};
 w.active=false;return w;
}
if(process.argv[1]===fileURLToPath(import.meta.url))process.stdout.write(JSON.stringify(buildDesignerCleanupWorkflow(),null,2)+'\n');
