import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {buildEssentialWorkflow} from './build-essential-workflow.mjs';
import {buildDesignerCleanupWorkflow} from './build-designer-cleanup-workflow.mjs';
import {buildReviewedCreatorWorkflow} from './build-reviewed-creator-workflow.mjs';
import {essentialStoredZip} from './essential-runtime.mjs';
const require=createRequire(import.meta.url),AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const extractor=JSON.parse(readFileSync(new URL('../DEV - 07 CloudConvert Frame Extraction.json',import.meta.url),'utf8'));
const runner=buildEssentialWorkflow(),designer=buildDesignerCleanupWorkflow(),creator=buildReviewedCreatorWorkflow();
const find=(w,name)=>{const n=w.nodes.find(n=>n.name===name);assert.ok(n,name);return n;};
const hash=(b,kind='sha256')=>createHash(kind).update(b).digest('hex');
async function code(w,name,items,upstream={}){
 const input={all:()=>items,first:()=>items[0]};const select=name=>({itemMatching:index=>upstream[name][index],first:()=>upstream[name][0]});
 const helpers={getBinaryDataBuffer:async(i,key)=>{assert.ok(items[i].binary?.[key],'Missing n8n INPUT binary '+key);return Buffer.from(items[i].binary[key].data,'base64');},prepareBinaryData:async(bytes,fileName,mimeType)=>({data:bytes.toString('base64'),fileName,mimeType})};
 return new AsyncFunction('$input','$','$execution','$runIndex','require',find(w,name).parameters.jsCode).call({helpers},input,select,{id:'native_test'},0,require);
}
const binary=(name,bytes,mimeType)=>({fileName:name,fileExtension:name.split('.').at(-1),mimeType,data:bytes.toString('base64')});
test('all four exported graphs compile, have fixed HTTP switches, credential references and no active triggers',()=>{
 for(const w of [runner,designer,extractor,creator]){
  assert.equal(w.active,false);assert.equal(w.settings.timezone,'Asia/Beirut');const names=new Set(w.nodes.map(n=>n.name));assert.equal(names.size,w.nodes.length);
  const ids=new Set(w.nodes.map(n=>n.id));assert.equal(ids.size,w.nodes.length);
  for(const [name,links] of Object.entries(w.connections)){assert.ok(names.has(name));for(const edges of links.main)for(const edge of edges)assert.ok(names.has(edge.node),edge.node);}
  for(const n of w.nodes){if(n.parameters.jsCode)assert.doesNotThrow(()=>new AsyncFunction(n.parameters.jsCode),n.name);
   if(n.type.endsWith('.httpRequest')){assert.equal(n.retryOnFail,false,n.name);for(const key of ['sendBody','sendHeaders','sendQuery'])if(key in n.parameters)assert.equal(typeof n.parameters[key],'boolean',n.name+'.'+key);}
  }
 }
 assert.equal(designer.nodes.filter(n=>n.credentials?.openAiApi).length,0);
 assert.equal(extractor.nodes.filter(n=>n.credentials?.openAiApi).length,0);
});
test('JSON body split is wired to both native transports and preserves the whole command body',()=>{
 for(const w of [runner,designer])for(const kind of w===designer?['drive_json']:['drive_json','openai_json']){
  const no=find(w,'IO '+kind),yes=find(w,'IO '+kind+' With Body'),gate=find(w,'IO '+kind+' Has Body?');
  assert.equal(no.parameters.sendBody,false);assert.equal(yes.parameters.sendBody,true);assert.equal(yes.parameters.contentType,'json');assert.equal(yes.parameters.specifyBody,'json');
  const evaluate=command=>new Function('$json','return '+gate.parameters.conditions.conditions[0].leftValue.slice(3,-2))({command});
  assert.equal(evaluate({method:'GET',body:{}}),false);assert.equal(evaluate({method:'HEAD',body:{}}),false);assert.equal(evaluate({method:'POST'}),false);assert.equal(evaluate({method:'PATCH',body:{}}),true);
  const body={images:[{image_url:'data:image/png;base64,fixture'}],model:'gpt-image-2.5-flare',n:1};
  assert.deepEqual(JSON.parse(new Function('$json','return '+yes.parameters.jsonBody.slice(3,-2))({command:{body}})),body);
  assert.equal(w.connections[gate.name].main[0][0].node,yes.name);assert.equal(w.connections[gate.name].main[1][0].node,no.name);
  for(const node of [yes,no])assert.equal(w.connections[node.name].main[0][0].node,'Restore Native Response Packet');
 }
 const child=find(runner,'Call Existing CloudConvert Extractor');assert.equal(child.parameters.workflowInputs.convertFieldsToString,false);assert.equal(child.parameters.options.waitForSubWorkflow,true);
});
test('table filters remain native arrays and evaluate claim/release/full-cleanup census correctly',()=>{
 const evaluate=(x,command)=>typeof x==='string'&&x.startsWith('={{')?new Function('$json','return '+x.slice(3,-2))({command}):x;
 for(const w of [runner,designer]){
  for(const name of ['IO table_get','IO table_update','IO table_upsert'])assert.ok(Array.isArray(find(w,name).parameters.filters.conditions));
  const get=find(w,'IO table_get').parameters.filters.conditions[0];assert.equal(evaluate(get.condition,{filters:[]}), 'isNotEmpty');assert.equal(evaluate(get.keyValue,{filters:[]}), '');
  for(const filters of [[{keyName:'id',keyValue:2},{keyName:'status',keyValue:'idle'}],[{keyName:'id',keyValue:2},{keyName:'owner',keyValue:'test_owner'}]]){
   const actual=find(w,'IO table_update').parameters.filters.conditions.map(f=>Object.fromEntries(Object.entries(f).map(([k,v])=>[k,evaluate(v,{filters})])));
   assert.deepEqual(actual,filters.map(f=>({...f,condition:'eq'})));
  }
 }
});
test('native code wrapper can read bytes it created during the SAME node invocation; old wrapper fails',async()=>{
 const bytes=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
 const state={pc:'container_content',runId:'run_native_test',owner:'native_test',stage:'generator',jobKey:'fixture',fingerprint:'a'.repeat(64),piece:{id:'piece'},packageUpload:{path:'/mnt/data/source.zip'},helperUpload:{path:'/mnt/data/helper.py'},config:{paidEnabled:true,maxResponsesPerJob:120},responseRequests:0,aiRole:'generator',lastResponse:'resp_previous',toolCall:{call_id:'call_test'},visualReceipts:[],pathRead:{paths:['/mnt/data/aura/run_native_test/reference.png'],position:0,file:{bytes:bytes.length},records:[],purpose:'vision'}};
 const input={json:{state,event:{}},binary:{download:binary('source.png',bytes,'image/png')}};
 const result=await code(runner,'Advance Essential Stage',[structuredClone(input)]);assert.equal(result[0].json.command.kind,'table_upsert');assert.equal(result[0].json.state.visualReceipts.length,1);
 const old=structuredClone(runner);find(old,'Advance Essential Stage').parameters.jsCode=find(old,'Advance Essential Stage').parameters.jsCode.replace('pending.has(key)?Promise.resolve(pending.get(key)):','');
 await assert.rejects(()=>code(old,'Advance Essential Stage',[structuredClone(input)]),/Missing n8n INPUT binary artifact_0/);
});
test('extractor accepts exactly one original ZIP and verifies source bytes BEFORE unpack or CloudConvert submission',async()=>{
 const input={json:{pieceFolderId:'piece',sourceFileIds:['source']}};const validated=(await code(extractor,'Validate Piece Input',[input]))[0];assert.deepEqual(validated.json.sourceFileIds,['source']);
 await assert.rejects(()=>code(extractor,'Validate Piece Input',[{json:{pieceFolderId:'piece',sourceFileIds:['a','b']}}]),/Exactly one/);
 const bytes=essentialStoredZip([{name:'video.mp4',bytes:Buffer.from('fixture video')}]);const source={size:String(bytes.length),md5Checksum:hash(bytes,'md5')};
 const item={json:{sourceFileMetadata:source},binary:{sourceZip:binary('source.zip',bytes,'application/zip')}};
 assert.equal((await code(extractor,'Verify Source ZIP Bytes',[item])).length,1);
 await assert.rejects(()=>code(extractor,'Verify Source ZIP Bytes',[{...item,json:{sourceFileMetadata:{...source,md5Checksum:'0'.repeat(32)}}}]),/bytes do not match/);
 assert.equal(extractor.connections['Download Source ZIP'].main[0][0].node,'Verify Source ZIP Bytes');assert.equal(extractor.connections['Confirm Unchanged Source ZIP'].main[0][0].node,'Unpack Source ZIP');
});
test('ZIP inventory sends ONLY videos to ffmpeg, and includes every original photo unchanged in the combined archive',async()=>{
 const videos=['clip.MOV','nested/clip2.mp4'],photos=['a.jpg','b.png','c.webp','d.heic','nested/e.avif'];
 const item={json:{pieceFolderId:'piece',sourceFileCount:1,sourceFileId:'source',sourceFileIds:['source'],framesPerSecond:2,sourceFileMetadata:{id:'source'},cloudConvertCredits:10},binary:{}};
 [...videos,...photos].forEach((name,i)=>item.binary['entry_'+i]=binary(name,Buffer.from('real fixture bytes '+i),i<2?'video/mp4':'image/'+name.split('.').at(-1)));
 item.binary.entry_7=binary('__MACOSX/._a.jpg',Buffer.from('metadata'),'application/octet-stream');
 const inventory=await code(extractor,'Inventory Piece Assets',[item]);assert.equal(inventory[0].json.videoCount,2);assert.equal(inventory[0].json.imageCount,5);assert.equal(inventory[0].json.inventoryNeedsReview,false);
 const built=(await code(extractor,'Build CloudConvert Job',inventory))[0],tasks=built.json.jobPayload.tasks;
 assert.equal(Object.values(tasks).filter(t=>t.operation==='command').length,2);assert.equal(Object.values(tasks).filter(t=>t.operation==='metadata').length,2);
 assert.equal(tasks['archive-assets'].input.length,7);
 for(const photo of built.json.uploadPlan.filter(a=>a.kind!=='video')){assert.ok(tasks['archive-assets'].input.includes(photo.importTask));assert.equal(tasks['extract-'+photo.assetId],undefined);assert.equal(built.binary[photo.binaryField].data,inventory[0].binary[photo.binaryField].data);}
 assert.ok(Object.values(tasks).filter(t=>t.operation==='command').every(t=>t.arguments.includes('fps=2')));
});
test('output verification rejects changed original images and accepts all original photos plus extracted frames',async()=>{
 const photo=Buffer.from('original image bytes'),frame=Buffer.from([255,216,255,1,255,217]),zip=Buffer.from('fixture archive');
 const context={pieceFolderId:'piece',frameCount:1,originalImageCount:1,expectedFiles:[{fileName:'image_0001__a.jpg',kind:'image',bytes:photo.length,sha256:hash(photo)},{fileName:'video_0001_frame_000001.jpg',kind:'frame'}]};
 const original={json:context,binary:{outputZip:binary('result.zip',zip,'application/zip')}};
 const item={json:context,binary:{verified_0:binary(context.expectedFiles[0].fileName,photo,'image/jpeg'),verified_1:binary(context.expectedFiles[1].fileName,frame,'image/jpeg')}};
 const result=await code(extractor,'Verify Combined Reference ZIP',[item],{'Prepare ZIP Validation':[original]});assert.equal(result[0].json.verifiedFileCount,2);assert.equal(result[0].json.originalImagesByteIdentical,true);
 const changed=structuredClone(item);changed.binary.verified_0.data=Buffer.from('altered photo').toString('base64');await assert.rejects(()=>code(extractor,'Verify Combined Reference ZIP',[changed],{'Prepare ZIP Validation':[original]}),/Original image bytes changed/);
});
test('actual DEV 07 final receipt matches DEV 10 handoff contract and requires saved-file readback',async()=>{
 const plan={pieceFolderId:'piece',outputExists:false,outputZipFilename:'AURA_reference_images_123456abcdef.zip',outputZipBytes:123,outputZipMd5:'a'.repeat(32),frameCount:2,originalImageCount:1,verifiedFileCount:3,originalImagesByteIdentical:true};
 const saved=await code(extractor,'Reference ZIP Saved',[{json:{id:'saved_file'}}],{'Resolve Output ZIP':[{json:plan}]});assert.equal(saved[0].json.status,'complete');assert.equal(saved[0].json.outputFileId,'saved_file');
 const metadata={id:'saved_file',name:plan.outputZipFilename,mimeType:'application/zip',trashed:false,parents:['piece'],size:'123',md5Checksum:plan.outputZipMd5};
 const confirmed=await code(extractor,'Confirm Saved Combined ZIP',[{json:metadata}],{'Reference ZIP Saved':saved});assert.equal(confirmed[0].json.savedZipReadbackVerified,true);
 await assert.rejects(()=>code(extractor,'Confirm Saved Combined ZIP',[{json:{...metadata,size:'124'}}],{'Reference ZIP Saved':saved}),/readback/);
});
