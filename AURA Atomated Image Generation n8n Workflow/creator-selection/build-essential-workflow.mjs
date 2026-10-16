import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export function buildEssentialWorkflow(){
 const library="const {createHash}=require('crypto');\n"+readFileSync(new URL('essential-runtime.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
 const materializer=readFileSync(new URL('essential_materializer.py',import.meta.url)).toString('base64');
 let n=0;const versions={code:2,httpRequest:4.2,dataTable:1.1,executeWorkflowTrigger:1.1,scheduleTrigger:1.2,manualTrigger:1,executeWorkflow:1.3,switch:3.2,compression:1.1,stickyNote:1,if:2.2};
 const node=(name,type,pos,parameters,extra={})=>({id:'aura-essential-'+(++n),name,type:'n8n-nodes-base.'+type,typeVersion:versions[type],position:pos,parameters,...extra});
 const code=(name,pos,jsCode,full=false)=>node(name,'code',pos,{mode:'runOnceForAllItems',jsCode:(full?library+'\n':'')+jsCode});
 const nodes=[
  node('Receive One Explicit Stage Job','executeWorkflowTrigger',[0,0],{inputSource:'passthrough'}),
  node('Manual One-Piece Test','manualTrigger',[0,180],{}),
  code('Choose Manual Test Piece',[230,180],`// Set ONE real piece ID before a funded test. Never use the whole batch as the first test.
const stage='extractor';
const pieceFolderId='1uQnNhz3hGTTByNHNekaeH-AYpqWOAxp6';
if(pieceFolderId==='SET_ONE_REAL_PIECE_ID_FOR_TEST')throw new Error('Choose one disposable prepared test piece first.');
return [{json:{stage,...(stage==='auditor'?{}:{pieceFolderId})}}];`),
  code('AURA Configuration',[550,0],`// This is the only enable switch. Keep unpublished until an authorized funded test.
const config={enabled:false,paidEnabled:false,reasoningModel:'gpt-5.4-mini',maxOutputTokens:8000,
 maxResponsesPerRole:20,maxGeneratorResponses:64,maxResponsesPerJob:120,maxSourceBytes:200*1024*1024,
 materializerBase64:'${materializer}'};
const inputs=$input.all();if(inputs.length!==1)throw new Error('Exactly one stage job is required.');
const state=startEssential(inputs[0].json,config,String($execution.id));
return [{json:{state},binary:{}}];`,true),
  code('Advance Essential Stage',[800,0],`const item=$input.first(),state=item.json.state;
let binary={...(item.binary||{})};const pending=new Map();
const ctx={get:key=>pending.has(key)?Promise.resolve(pending.get(key)):this.helpers.getBinaryDataBuffer(0,key),put:async(key,bytes,name,mime)=>{pending.set(key,bytes);binary[key]=await this.helpers.prepareBinaryData(bytes,name,mime);},
 keys:()=>Object.keys(binary),meta:key=>binary[key],clear:()=>{binary={};pending.clear();}};
const next=item.json.event===undefined?state:await advanceEssential(state,item.json.event,ctx);
return [{json:{state:next,command:next.command},binary}];`,true),
  node('Route Native Transport','switch',[1050,0],{rules:{values:[]},options:{fallbackOutput:'extra'}}),
  code('Restore Native Response Packet',[1550,0],`const prior=$('Advance Essential Stage').first(0,$runIndex),command=prior.json.command;
const inputs=$input.all();const binary={...(prior.binary||{})};
let event;
if(command.kind.startsWith('table_'))event=inputs.map(i=>i.json).filter(r=>r.id!==undefined);
else if(command.kind==='unzip'){
 for(const item of inputs)for(const [key,value] of Object.entries(item.binary||{}))if(key.startsWith('extracted_'))binary[key]=value;
 event={extracted:true};
}else{event=inputs[0]?.json||{};if(inputs[0]?.binary?.data)binary.download=inputs[0].binary.data;}
return [{json:{state:prior.json.state,event},binary}];`),
  code('Return Stage Result',[1550,350],`const state=$input.first().json.state;
return [{json:state.result||{status:'disabled'},binary:$input.first().binary||{}}];`)
 ];
 const kinds=['drive_json','drive_binary','drive_upload','openai_json','openai_binary','openai_upload','table_get','table_upsert','table_update','extractor','unzip','done'];
 nodes.find(n=>n.name==='Route Native Transport').parameters.rules.values=kinds.map(kind=>({conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{leftValue:'={{ $json.command.kind }}',rightValue:kind,operator:{type:'string',operation:'equals'}}],combinator:'and'},renameOutput:true,outputKey:kind}));
 const credentials={drive:{googleDriveOAuth2Api:{id:'DxuMVynJiqHaTJ6T',name:'Aura Google Drive'}},openai:{openAiApi:{id:'h6wssUNUoREt3Wzo',name:'AURA OpenAI Execution'}}};
 const transportNames={};
 for(let index=0;index<6;index++){
  const kind=kinds[index],drive=kind.startsWith('drive'),binary=kind.endsWith('_binary'),upload=kind.endsWith('_upload');
  const parameters={method:'={{ $json.command.method }}',url:'={{ $json.command.url }}',authentication:'predefinedCredentialType',nodeCredentialType:drive?'googleDriveOAuth2Api':'openAiApi',
   options:{timeout:600000,redirect:{redirect:{followRedirects:false}},response:{response:{responseFormat:binary?'file':'json',...(binary?{outputPropertyName:'data'}:{}),neverError:false,fullResponse:false}}}};
  if(upload&&drive)Object.assign(parameters,{sendHeaders:true,headerParameters:{parameters:[{name:'Content-Type',value:'={{ $json.command.contentType }}'}]},sendBody:true,contentType:'binaryData',inputDataFieldName:'upload'});
  else if(upload)Object.assign(parameters,{sendBody:true,contentType:'multipart-form-data',bodyParameters:{parameters:[{parameterType:'formBinaryData',name:'file',inputDataFieldName:'upload'}]}});
  else if(!binary)Object.assign(parameters,{sendBody:false});
  const name='IO '+kind;transportNames[kind]=name;nodes.push(node(name,'httpRequest',[1300,(index-3)*160],parameters,{credentials:drive?credentials.drive:credentials.openai,retryOnFail:false,onError:'stopWorkflow'}));
 }
 // n8n's Send Body switch does not accept expressions. Keep native booleans
 // and route JSON requests through separate body/bodyless nodes.
 for(const kind of ['drive_json','openai_json']){
  const original=nodes.find(n=>n.name==='IO '+kind),withBody=structuredClone(original);
  withBody.id+='-with-body';withBody.name+=' With Body';withBody.position=[1500,original.position[1]-60];
  Object.assign(withBody.parameters,{sendBody:true,contentType:'json',specifyBody:'json',jsonBody:'={{ JSON.stringify($json.command.body) }}'});
  nodes.push(withBody,node('IO '+kind+' Has Body?','if',[1150,original.position[1]],{
   conditions:{options:{caseSensitive:true,typeValidation:'strict',version:2},conditions:[{leftValue:'={{ $json.command.body !== undefined && $json.command.body !== null && !["GET","HEAD"].includes(String($json.command.method).toUpperCase()) }}',rightValue:'',operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}}));
  transportNames[kind]='IO '+kind+' Has Body?';
 }
 for(const kind of ['table_get','table_upsert','table_update']){
  const fields=kind==='table_update'?['status','owner','jobJson']:['sourcePieceId','status','owner','jobId','jobJson'];
  const value=Object.fromEntries(fields.map(k=>[k,`={{ $json.command.body.${k} === undefined ? $json.state.mutexJobJson || '{}' : $json.command.body.${k} }}`]));
  const parameters={resource:'row',operation:kind.slice(6),dataTableId:{__rl:true,value:'0jVQUhHbb9ApVzSH',mode:'id'},matchType:'allConditions',
   // Keep the fixedCollection as a real array. A string expression here imports
   // as one malformed UI condition per character. Only leaf fields are dynamic.
   filters:{conditions:kind==='table_upsert'?[{keyName:'sourcePieceId',condition:'eq',keyValue:'={{ $json.command.body.sourcePieceId }}'}]:kind==='table_get'?
    [{keyName:'sourcePieceId',condition:'={{ $json.command.filters.length ? "eq" : "isNotEmpty" }}',keyValue:'={{ $json.command.filters[0]?.keyValue ?? "" }}'}]:
    [0,1].map(i=>({keyName:`={{ $json.command.filters[${i}].keyName }}`,condition:'eq',keyValue:`={{ $json.command.filters[${i}].keyValue }}`}))},
   ...(kind==='table_get'?{returnAll:true}:{columns:{mappingMode:'defineBelow',value,schema:fields.map(id=>({id,displayName:id,type:'string',display:true,required:false,defaultMatch:false,canBeUsedToMatch:true}))}}),options:{}};
  const name='IO '+kind;transportNames[kind]=name;nodes.push(node(name,'dataTable',[1300,(kinds.indexOf(kind)-3)*160],parameters,{alwaysOutputData:true,onError:'stopWorkflow'}));
 }
 transportNames.extractor='Call Existing CloudConvert Extractor';nodes.push(node(transportNames.extractor,'executeWorkflow',[1300,1000],{
  source:'database',workflowId:{__rl:true,value:'D8QQZzhw903FrcuO',mode:'id'},workflowInputs:{mappingMode:'defineBelow',value:{pieceFolderId:'={{ $json.command.body.pieceFolderId }}',sourceFileIds:'={{ $json.command.body.sourceFileIds }}'},matchingColumns:[],schema:[{id:'pieceFolderId',displayName:'pieceFolderId',type:'string',required:false},{id:'sourceFileIds',displayName:'sourceFileIds',type:'array',required:false}],attemptToConvertTypes:false,convertFieldsToString:false},options:{waitForSubWorkflow:true}}));
 transportNames.unzip='Extract Verified Combined ZIP';nodes.push(node(transportNames.unzip,'compression',[1300,1160],{operation:'decompress',binaryPropertyName:'upload',outputPrefix:'extracted_'}));
 transportNames.done='Return Stage Result';
 const edge=name=>({node:name,type:'main',index:0}),connections={};
 const connect=(a,b)=>{connections[a]={main:[[edge(b)]]};};
 connect('Receive One Explicit Stage Job','AURA Configuration');connect('Manual One-Piece Test','Choose Manual Test Piece');connect('Choose Manual Test Piece','AURA Configuration');connect('AURA Configuration','Advance Essential Stage');connect('Advance Essential Stage','Route Native Transport');
 connections['Route Native Transport']={main:kinds.map(k=>[edge(transportNames[k])]).concat([[edge('Reject Unknown Transport')]])};
 nodes.push(code('Reject Unknown Transport',[1550,500],`throw new Error('Unknown transport. Nothing dispatched.');`));
 for(const name of Object.values(transportNames).filter(n=>n!=='Return Stage Result'&&!n.endsWith(' Has Body?')))connect(name,'Restore Native Response Packet');connect('Restore Native Response Packet','Advance Essential Stage');
 for(const kind of ['drive_json','openai_json']){
  connections['IO '+kind+' Has Body?']={main:[[edge('IO '+kind+' With Body')],[edge('IO '+kind)]]};
  connect('IO '+kind,'Restore Native Response Packet');connect('IO '+kind+' With Body','Restore Native Response Packet');
 }
 const schedules=[['11:00 Extractor',11,0,'extractor'],['12:00 Categorizer',12,0,'categorizer'],['16:00 Consolidated Auditor',16,0,'auditor'],['00:05 Generator and Independent Reviewer',0,5,'generator']];
 schedules.forEach(([name,hour,minute,stage],i)=>{
  nodes.push(node(name,'scheduleTrigger',[-400,(i+1)*-160],{rule:{interval:[{field:'cronExpression',expression:minute+' '+hour+' * * *'}]}}));
  nodes.push(code('Prepare '+stage+' Schedule',[-160,(i+1)*-160],`return [{json:{stage:'${stage}'}}];`));connect(name,'Prepare '+stage+' Schedule');connect('Prepare '+stage+' Schedule','AURA Configuration');
 });
 nodes.push(node('KEEP UNPUBLISHED — FUNDED TEST REQUIRED','stickyNote',[-400,400],{width:1000,height:300,content:'# AURA essential IO runner\nNo paid calls during import. AURA Configuration: enabled=false and paidEnabled=false. Manual test requires one selected piece. Seed __aura_pipeline_mutex__ once in AURA Routing State. Uses the four uploaded version-1 skills, actual authenticated source bytes, GPT Image 2.5 only, and independent reviewer contexts. All actual image attempts go to the Creator candidate gallery. No AI stage approval or deletion. Existing 09:00 intake, 14:00 human-preparation handoff, 18:30 manual approval routing and Creator selection stay separate. A failed paid job deliberately keeps its lock: inspect/reconcile it, never blindly reset and pay again.'}));
 return {name:'DEV - 10 AURA Essential Scheduled Skills — TEST FIRST',active:false,nodes,connections,settings:{executionOrder:'v1',binaryMode:'separate',timezone:'Asia/Beirut'},pinData:{},tags:[]};
}
if(process.argv[1]===fileURLToPath(import.meta.url))process.stdout.write(JSON.stringify(buildEssentialWorkflow(),null,2)+'\n');
