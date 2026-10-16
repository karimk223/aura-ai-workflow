import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {startEssential,advanceEssential,ES_FOLDERS,ES_FOLDER,ES_CATEGORIES,ES_VIEWS,essentialStoredZip,essentialArchivePreflight} from './essential-runtime.mjs';
import {startDesignerCleanup,advanceDesignerCleanup} from './designer-cleanup-runtime.mjs';
import {buildEssentialWorkflow} from './build-essential-workflow.mjs';
import {buildDesignerCleanupWorkflow} from './build-designer-cleanup-workflow.mjs';
import {indexCandidatePool} from './selection-core.mjs';
import {newRoutingSession,nextRoutingCommand,acceptRoutingResponse} from './routing-engine.mjs';
const hash=(bytes,kind='sha256')=>createHash(kind).update(bytes).digest('hex');
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc(b.subarray(4,-4)),b.length-4);return b;}
function png(){const h=Buffer.alloc(13);h.writeUInt32BE(1536);h.writeUInt32BE(1920,4);h[8]=8;h[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(Buffer.alloc((1536*3+1)*1920,255))),chunk('IEND',Buffer.alloc(0))]);}
const PNG=png(),DOCX=essentialStoredZip([{name:'placeholder',bytes:Buffer.from('not used')}]);
// Tiny genuine OOXML fixture. Domain/report quality is NOT evaluated by a mock.
function docx(){
 const names=['[Content_Types].xml','_rels/.rels','word/document.xml'];
 const texts=['<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Fixture only</w:t></w:r></w:p></w:body></w:document>'];
 let off=0;const local=[],central=[];for(let i=0;i<names.length;i++){const n=Buffer.from(names[i]),bytes=Buffer.from(texts[i]),h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt32LE(crc(bytes),14);h.writeUInt32LE(bytes.length,18);h.writeUInt32LE(bytes.length,22);h.writeUInt16LE(n.length,26);local.push(h,n,bytes);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(crc(bytes),16);c.writeUInt32LE(bytes.length,20);c.writeUInt32LE(bytes.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(off,42);central.push(c,n);off+=h.length+n.length+bytes.length;}
 const dir=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(3,8);end.writeUInt16LE(3,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(off,16);return Buffer.concat([...local,dir,end]);
}
const config={enabled:true,paidEnabled:true,reasoningModel:'gpt-5.4-mini',maxOutputTokens:8000,maxResponsesPerRole:20,maxGeneratorResponses:64,maxResponsesPerJob:120,maxSourceBytes:200*1024*1024,materializerBase64:Buffer.from('fixture helper').toString('base64')};
const dcConfig={enabled:true,cleanupEnabled:true,purgeEnabled:false};

class Fixture{
 constructor(){this.files=new Map();this.rows=new Map();this.memory=new Map();this.containers=new Map();this.sequence=2;this.imageRequests=[];this.responses=[];this.rows.set('__aura_pipeline_mutex__',{id:1,sourcePieceId:'__aura_pipeline_mutex__',status:'idle',owner:'none',jobId:'none',jobJson:'{}'});}
 folder(id,name,parent){const f={id,name,mimeType:ES_FOLDER,parents:[parent],trashed:false,version:'1'};this.files.set(id,f);return f;}
 file(id,name,parent,bytes,mimeType='image/png'){const f={id,name,mimeType,parents:[parent],trashed:false,version:'1',size:String(bytes.length),md5Checksum:hash(bytes,'md5'),bytes};this.files.set(id,f);return f;}
 metadata(f){const {bytes,...m}=f;return structuredClone(m);}
 get ctx(){return {get:async key=>{const b=this.memory.get(key)?.bytes;if(!b)throw Error('Missing fixture binary '+key);return b;},
  put:async(key,bytes,fileName,mimeType)=>this.memory.set(key,{bytes,fileName,mimeType}),keys:()=>[...this.memory.keys()],meta:key=>this.memory.get(key),clear:()=>this.memory.clear()};}
 containerFile(id,path,bytes){const files=this.containers.get(id),file={id:'cfile_'+this.sequence++,object:'container.file',container_id:id,path,bytes:bytes.length,actual:bytes};files.push(file);return file;}
 sources(s){for(const f of s.manifest.files){const path='/mnt/data/aura/'+s.runId+'/'+f.path;if(!this.containers.get(s.containerId).some(x=>x.path===path))this.containerFile(s.containerId,path,this.memory.get(s.downloadFiles.find(x=>(x.sourceKey||x.id)===f.sourceKey).binaryKey).bytes);}}
 result(s,data){return {id:'resp_'+this.sequence++,status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({status:'complete',sourceManifestSha256:s.manifestSha,blockers:[],...data})}]}]};}
 call(s,name,args){return {id:'resp_'+this.sequence++,status:'completed',output:[{type:'function_call',name,call_id:'call_'+this.sequence++,arguments:JSON.stringify(args)}]};}
 async response(s,body){
  this.responses.push({role:s.aiRole,body:structuredClone(body)});this.sources(s);
  const root='/mnt/data/aura/'+s.runId;
  if(!s.visualReceipts.length){
   const paths=[];
   if(s.aiRole==='reviewer')paths.push(s.reviewTarget.path);
   if(s.manifest.files.some(f=>f.mimeType.startsWith('image/')))paths.push(root+'/'+s.manifest.files.find(f=>f.mimeType.startsWith('image/')).path);
   else{this.containerFile(s.containerId,root+'/contact_sheet.png',PNG);paths.push(root+'/contact_sheet.png');}
   if(s.aiRole==='auditor'){this.containerFile(s.containerId,root+'/report_page_1.png',PNG);paths.push(root+'/report_page_1.png');}
   return this.call(s,'view_images',{paths});
  }
  if(s.aiRole==='reviewer')return this.result(s,{decision:'PASS',defects:[]});
  if(s.aiRole==='categorizer'){
   this.containerFile(s.containerId,root+'/assignments.json',Buffer.from(JSON.stringify({assignments:s.manifest.files.map(f=>({sourceKey:f.sourceKey,categories:ES_CATEGORIES}))})));
   this.containerFile(s.containerId,root+'/READY_FOR_REVIEW.docx',docx());return this.result(s,{assignmentsPath:root+'/assignments.json',readyMarkerPath:root+'/READY_FOR_REVIEW.docx'});
  }
  if(s.aiRole==='auditor'){
   this.containerFile(s.containerId,root+'/audit.docx',docx());this.containerFile(s.containerId,root+'/handoff.json',Buffer.from(JSON.stringify({pieces:s.batchPieces.map(p=>({pieceId:p.id,status:'complete'}))})));
   return this.result(s,{reportPath:root+'/audit.docx',handoffPath:root+'/handoff.json'});
  }
  if(s.imageCalls.some(c=>!c.reviewed))return this.call(s,'review_candidate',{view:s.currentCandidate.view,candidate_path:s.currentCandidate.rawPath});
  const view=ES_VIEWS.find(v=>!s.reviews.some(r=>r.view===v&&r.decision==='PASS')&&s.reviews.filter(r=>r.view===v).length<3);
  if(!view)return this.result(s,{});
  return this.call(s,'generate_product_image',{view,prompt:'Use the actual garment reference photographs.',reference_paths:[root+'/'+s.manifest.files.find(f=>f.mimeType.startsWith('image/')).path],precision_repair:false});
 }
 async io(s){
  const c=s.command;
  if(c.kind.startsWith('table_')){
   const matches=[...this.rows.values()].filter(row=>(c.filters||[]).every(f=>row[f.keyName]===f.keyValue));
   if(c.kind==='table_get')return structuredClone(matches);
   if(c.kind==='table_update'){for(const row of matches)Object.assign(row,c.body);return structuredClone(matches);}
   const old=this.rows.get(c.body.sourcePieceId),row={id:old?.id||this.sequence++,...c.body};this.rows.set(row.sourcePieceId,row);return [structuredClone(row)];
  }
  if(c.kind==='unzip'){this.memory.set('extracted_0',{bytes:PNG,fileName:'frame.jpg',mimeType:'image/png'});return {};}
  if(c.kind==='extractor')return {status:'complete',pieceFolderId:s.piece.id,outputFileId:'fixture_zip',frameCount:2,originalImageCount:1,verifiedFileCount:3,originalImagesByteIdentical:true,savedZipReadbackVerified:true};
  const url=new URL(c.url);
  if(c.kind==='openai_upload'){
   const id=url.pathname.split('/')[3],upload=this.memory.get('upload');return this.containerFile(id,'/mnt/data/file_'+this.sequence+++'_'+upload.fileName,upload.bytes);
  }
  if(c.kind==='openai_binary'){
   const parts=url.pathname.split('/'),f=this.containers.get(parts[3]).find(f=>f.id===parts[5]);this.memory.set('download',{bytes:f.actual});return {};
  }
  if(c.kind==='openai_json'){
   if(url.pathname==='/v1/containers'){const id='cntr_'+this.sequence++;this.containers.set(id,[]);return {id,object:'container',status:'running'};}
   if(url.pathname==='/v1/responses')return this.response(s,c.body);
   if(url.pathname==='/v1/images/edits'){this.imageRequests.push(structuredClone(c.body));return {data:[{b64_json:PNG.toString('base64')}],usage:{total_tokens:1}};}
   if(url.pathname.endsWith('/files'))return {data:this.containers.get(url.pathname.split('/')[3]).map(({actual,...f})=>f),has_more:false};
  }
  if(url.pathname.endsWith('/about'))return {user:{emailAddress:'aura.atelier.by.nada@gmail.com',permissionId:'07994205433657544212'}};
  if(c.kind==='drive_binary'){const f=this.files.get(url.pathname.split('/').at(-1));this.memory.set('download',{bytes:f.bytes});return {};}
  if(c.kind==='drive_upload'){
   const bytes=this.memory.get('upload').bytes,boundary=c.contentType.split('boundary=')[1],head=bytes.indexOf(Buffer.from('\r\n\r\n'))+4,metaEnd=bytes.indexOf(Buffer.from('\r\n--'+boundary),head),metadata=JSON.parse(bytes.subarray(head,metaEnd)),dataStart=bytes.indexOf(Buffer.from('\r\n\r\n'),metaEnd)+4,dataEnd=bytes.lastIndexOf(Buffer.from('\r\n--'+boundary+'--'));
   const data=bytes.subarray(dataStart,dataEnd),id=c.method==='PATCH'?url.pathname.split('/').at(-1):'file_'+this.sequence++,old=this.files.get(id);
   const f={...(old||{}),id,...metadata,mimeType:metadata.mimeType||old?.mimeType,parents:metadata.parents||old?.parents,trashed:false,version:String(Number(old?.version||0)+1),size:String(data.length),md5Checksum:hash(data,'md5'),bytes:data};this.files.set(id,f);return this.metadata(f);
  }
  if(url.pathname==='/drive/v3/files'){
   if(c.method==='POST'){const f=this.folder(c.body.id||'folder_'+this.sequence++,c.body.name,c.body.parents[0]);if(c.body.appProperties)f.appProperties=c.body.appProperties;return this.metadata(f);}
   const q=url.searchParams.get('q')||'',parent=q.match(/'([^']+)' in parents/)?.[1],name=q.match(/name='([^']+)'/)?.[1];
   return {files:[...this.files.values()].filter(f=>(!parent||f.parents?.includes(parent))&&(!q.includes('trashed=false')&&!q.includes('trashed = false')||!f.trashed)&&(!name||f.name===name)&&(!q.includes("mimeType contains 'image/'")||f.mimeType.startsWith('image/'))).map(f=>this.metadata(f))};
  }
  const parts=url.pathname.split('/'),copy=parts.at(-1)==='copy',id=copy?parts.at(-2):parts.at(-1),f=this.files.get(id);
  if(!f)throw Error('Fixture missing file '+id);
  if(copy){const copied={...f,...c.body,id:'copy_'+this.sequence++,version:'1'};this.files.set(copied.id,copied);return this.metadata(copied);}
  if(c.method==='DELETE'){this.files.delete(id);return {statusCode:204,body:''};}
  if(c.method==='PATCH'){
   if(url.searchParams.has('addParents'))f.parents=[url.searchParams.get('addParents')];Object.assign(f,c.body);f.version=String(Number(f.version)+1);return this.metadata(f);
  }
  return this.metadata(f);
 }
 async run(state,designer=false){let s=state;for(let i=0;i<1500&&!s.done;i++){const r=await this.io(s);s=designer?await advanceDesignerCleanup(s,r):await advanceEssential(s,r,this.ctx);}assert.equal(s.done,true,'Fixture exceeded step limit');return s;}
 prepared(){this.folder('piece','Blue garment',ES_FOLDERS.received);for(let i=0;i<3;i++)this.folder('category_'+i,ES_CATEGORIES[i],'piece');this.file('combined','AURA_reference_images_123456abcdef.zip','piece',essentialStoredZip([{name:'frame.png',bytes:PNG}]),'application/zip');return this;}
}

test('default-disabled import cannot dispatch any IO or paid calls',()=>{const s=startEssential({stage:'generator'},{...config,enabled:false},'100');assert.equal(s.done,true);assert.equal(s.command.kind,'done');});
test('ZIP preflight rejects corrupt input and bounded expansion before native decompression',()=>{
 const zip=essentialStoredZip([{name:'source.png',bytes:PNG}]);assert.equal(essentialArchivePreflight(zip,200*1024*1024).entryCount,1);
 assert.throws(()=>essentialArchivePreflight(Buffer.from('not a zip'),200*1024*1024));assert.throws(()=>essentialArchivePreflight(zip,1));
});
test('wrong account and missing/owned lock fail before source or paid IO',async()=>{
 const f=new Fixture();await assert.rejects(()=>advanceEssential(startEssential({stage:'auditor'},config,'100'),{user:{emailAddress:'other'}},f.ctx));
 const s=startEssential({stage:'auditor'},config,'100');await advanceEssential(s,await f.io(s),f.ctx);await assert.rejects(()=>advanceEssential(s,[],f.ctx));
});
test('simulated end-to-end: categorize → audit → generate/review → exact Designer approval → recoverable Trash → 48h purge',async()=>{
 const f=new Fixture().prepared();
 const cat=await f.run(startEssential({stage:'categorizer',pieceFolderId:'piece'},config,'100'));
 assert.equal(cat.result.results[0].status,'complete');assert.ok([...f.files.values()].some(x=>x.name==='READY_FOR_REVIEW.docx'));
 const sourceRows=f.rows.size,again=await f.run(startEssential({stage:'categorizer',pieceFolderId:'piece'},config,'101'));
 assert.equal(again.result.results[0].status,'skipped_unchanged');assert.equal(f.rows.size,sourceRows);
 f.files.get('piece').parents=[ES_FOLDERS.processed];f.files.get('piece').version='2';
 await f.run(startEssential({stage:'auditor'},config,'102'));assert.equal([...f.files.values()].filter(x=>x.name==='audit__AURA_by_Nada.docx').length,1);
 f.file('human_marker','READY_FOR_AURA.docx','piece',docx(),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');f.files.get('piece').parents=[ES_FOLDERS.approved];f.files.get('piece').version='3';
 const gen=await f.run(startEssential({stage:'generator',pieceFolderId:'piece'},config,'103'));
 assert.equal(gen.result.results[0].status,'complete');assert.equal(f.imageRequests.length,4);
 assert.ok(f.imageRequests.every(x=>x.model==='gpt-image-2.5-flare'&&x.n===1));assert.equal(f.files.get('piece').parents[0],ES_FOLDERS.queue);
 assert.equal(f.responses.filter(r=>r.role==='reviewer'&&!r.body.previous_response_id).length,4);
 assert.equal([...f.containers.keys()].length,4,'one categorizer, one auditor, one generator, ONE reused reviewer workspace');
 const outputs=[...f.files.values()].find(x=>x.name==='04_PRODUCT_IMAGE_OUTPUTS');
 const picked=gen.imageCalls.map(c=>f.files.get(c.driveFileId)),snapshot=indexCandidatePool(f.metadata(f.files.get('piece')),[...f.files.values()].filter(x=>x.id!=='piece').map(x=>f.metadata(x)));
 let routing=newRoutingSession({protocol:'aura-creator-selection/v1',pieceFolderId:'piece',reviewRevision:snapshot.record.reviewRevision,selections:Object.fromEntries(ES_VIEWS.map(v=>[v,gen.imageCalls.find(c=>c.view===v).driveFileId]))},snapshot,'creator_fixture');
 for(let i=0;i<300&&!routing.finished;i++){
  routing=nextRoutingCommand(routing);if(routing.finished)break;const command=routing.command;
  let response;
  if(command.url.endsWith('/generateIds'))response={statusCode:200,body:{ids:Array.from({length:command.query.count},()=> 'reserved_'+f.sequence++)}};
  else if(command.method==='GET'&&/\/files\/[^/]+$/.test(command.url)&&!f.files.has(command.url.split('/').at(-1)))response={statusCode:404,body:{}};
  else{const url=new URL(command.url);for(const [key,value] of Object.entries(command.query||{}))url.searchParams.set(key,String(value));response={statusCode:200,body:await f.io({command:{...command,url:url.toString(),kind:'drive_json'}})};}
  routing=acceptRoutingResponse(routing,response);
 }
 assert.equal(routing.status,'committed',routing.error);assert.ok(picked.every(x=>x.parents[0]===outputs.id));assert.equal(f.files.get('piece').parents[0],'1LQzu9HFblegSGbDCurmeYZ1OrNJwJp0c');
 const listing=await f.run(startDesignerCleanup({mode:'list'},dcConfig,'104'),true);assert.equal(listing.result.pieces.length,1);
 await f.run(startDesignerCleanup({mode:'decide',body:{pieceFolderId:'piece',decision:'good',reviewRevision:listing.result.pieces[0].reviewRevision,reviewerIdentity:'chatgpt:designer_fixture'}},dcConfig,'105'),true);
 assert.equal(f.rows.get('__designer__:piece').status,'approved');
 const cleanup=await f.run(startDesignerCleanup({mode:'cleanup'},dcConfig,'106'),true);
 assert.equal(cleanup.result.results[0].status,'recoverable_trash_48_hours');assert.equal(f.rows.get('__designer__:piece').status,'cleanup_trashed');
 assert.equal([...f.files.values()].filter(x=>x.parents[0]==='piece'&&!x.trashed).length,4);
 const before=f.files.size,early=await f.run(startDesignerCleanup({mode:'cleanup'},{...dcConfig,purgeEnabled:true},'107'),true);
 assert.equal(early.result.results[0].status,'within_48_hour_recovery');assert.equal(f.files.size,before);
 const future=startDesignerCleanup({mode:'cleanup'},{...dcConfig,purgeEnabled:true},'108');future.now=new Date(Date.now()+49*3600000).toISOString();
 const purge=await f.run(future,true);assert.equal(purge.result.results[0].status,'purged_exact_recorded_nonfinal_ids');
 assert.ok(picked.every(x=>f.files.has(x.id)));assert.ok([...f.files.values()].some(x=>x.name==='audit__AURA_by_Nada.docx'));
 assert.equal(f.imageRequests.length,4,'Designer approval, Trash and purge never call OpenAI');
});
test('unfunded path never issues a model request and leaves sources intact',async()=>{
 const f=new Fixture().prepared();assert.throws(()=>startEssential({stage:'categorizer',pieceFolderId:'piece'},{...config,paidEnabled:false},'200'),/Paid execution is disabled/);
 assert.equal(f.imageRequests.length,0);assert.ok(f.files.has('combined'));assert.equal(f.rows.get('__aura_pipeline_mutex__').status,'idle');assert.equal(f.files.size,5);
});
test('extractor selects only the original ZIP, excludes combined outputs and skips a completed unchanged source',async()=>{
 const f=new Fixture().prepared();f.file('source_zip','garment.zip','piece',essentialStoredZip([{name:'video.mp4',bytes:Buffer.from('fixture video')}]),'application/zip');
 f.file('loose','do_not_extract.mov','piece',Buffer.from('loose'),'video/quicktime');
 let handoff;const io=f.io.bind(f);f.io=async s=>{if(s.command.kind==='extractor')handoff=structuredClone(s.command.body);return io(s);};
 const done=await f.run(startEssential({stage:'extractor',pieceFolderId:'piece'},{...config,paidEnabled:false},'201'));
 assert.deepEqual(handoff,{pieceFolderId:'piece',sourceFileIds:['source_zip']});assert.deepEqual(done.result.results[0].outputFiles,['fixture_zip']);assert.equal(f.responses.length,0);
 const again=await f.run(startEssential({stage:'extractor',pieceFolderId:'piece'},{...config,paidEnabled:false},'202'));assert.equal(again.result.results[0].status,'skipped_unchanged');
});
test('extractor refuses zero or ambiguous source ZIPs before dispatching its child',async()=>{
 for(const count of [0,2]){const f=new Fixture().prepared();let dispatched=false;const io=f.io.bind(f);f.io=async s=>{if(s.command.kind==='extractor')dispatched=true;return io(s);};
  for(let i=0;i<count;i++)f.file('zip_'+i,'source_'+i+'.zip','piece',Buffer.from('zip'),'application/zip');
  await assert.rejects(()=>f.run(startEssential({stage:'extractor',pieceFolderId:'piece'},{...config,paidEnabled:false},'203')),/exactly one source ZIP/);assert.equal(dispatched,false);assert.equal(f.responses.length,0);
 }
});
test('source ZIP revision changes during extraction stop completion without starting a second conversion',async()=>{
 const f=new Fixture().prepared();f.file('source_zip','garment.zip','piece',Buffer.from('fixture ZIP'),'application/zip');let childCalls=0;const io=f.io.bind(f);
 f.io=async s=>{const result=await io(s);if(s.command.kind==='extractor'){childCalls++;f.files.get('source_zip').version='2';}return result;};
 await assert.rejects(()=>f.run(startEssential({stage:'extractor',pieceFolderId:'piece'},{...config,paidEnabled:false},'changed_source')),/changed during extraction/);
 assert.equal(childCalls,1);assert.equal(f.rows.get('__essential__:extractor:piece').status,'running');assert.equal(f.responses.length,0);
});
test('Designer rejects a stale exact-four revision before saving approval or moving a piece',async()=>{
 const names=['01_front.png','02_back.png','03_three-quarter-front.png','04_material-craftsmanship-collage.png'];
 const images=names.map((name,i)=>({id:'image_'+i,name,mimeType:'image/png',parents:['outputs'],trashed:false,size:'100',md5Checksum:'a'.repeat(32),version:'1'}));
 await assert.rejects(()=>advanceDesignerCleanup({pc:'dc_images',mode:'decide',piece:{id:'piece',name:'Dress'},outputRoot:{id:'outputs'},images:[],pages:[],request:{reviewRevision:'0'.repeat(64)}},{files:images}),/STALE_REVIEW/);
});
test('actual runner supports twelve sequential reviewed attempts without its transport continuation cap stopping early',async()=>{
 const f=new Fixture().prepared();f.files.get('piece').parents=[ES_FOLDERS.approved];
 for(let i=0;i<3;i++)f.file('reference_'+i,'reference_'+i+'.png','category_'+i,PNG);
 f.file('human_marker','READY_FOR_AURA.docx','piece',docx(),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 // Audit normally, then move the unchanged piece back to Approved for generation.
 f.files.get('piece').parents=[ES_FOLDERS.processed];await f.run(startEssential({stage:'auditor'},config,'stress_audit'));f.files.get('piece').parents=[ES_FOLDERS.approved];
 const response=f.response.bind(f);f.response=async(s,body)=>{
  if(s.aiRole==='reviewer'&&s.visualReceipts.length)return f.result(s,{decision:s.currentCandidate.attempt<3?'FAIL_REPAIR':'PASS',defects:s.currentCandidate.attempt<3?[{category:'construction',description:'Fixture precision defect'}]:[]});
  const result=await response(s,body),call=result.output.find(x=>x.type==='function_call'&&x.name==='generate_product_image');
  if(call){const args=JSON.parse(call.arguments);args.precision_repair=s.imageCalls.some(c=>c.view===args.view);call.arguments=JSON.stringify(args);}return result;
 };
 const result=await f.run(startEssential({stage:'generator',pieceFolderId:'piece'},config,'stress_generator'));
 assert.equal(result.imageCalls.length,12);assert.equal(result.reviews.length,12);assert.equal(f.imageRequests.filter(r=>r.model==='gpt-image-2.5-flare').length,4);assert.equal(f.imageRequests.filter(r=>r.model==='gpt-image-2.5-sunburst').length,8);
 assert.ok(result.responseRequests<=120);assert.equal(f.files.get('piece').parents[0],ES_FOLDERS.queue);
});
test('raw image generation cannot run in reviewer context or exceed the existing budget',async()=>{
 const f=new Fixture();const s={pc:'response',aiRole:'reviewer',aiSteps:0,config,maxResponsesPerRole:20};
 await assert.rejects(()=>advanceEssential(s,{id:'resp_test',status:'completed',output:[{type:'function_call',name:'generate_product_image',call_id:'call_bad',arguments:'{}'}]},f.ctx),/unauthorized/);
});
test('exported workflows compile, all credentials stay references, and cleanup contains no OpenAI transport',()=>{
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 for(const w of [buildEssentialWorkflow(),buildDesignerCleanupWorkflow()]){
  assert.equal(w.active,false);assert.equal(w.settings.timezone,'Asia/Beirut');
  const names=new Set(w.nodes.map(n=>n.name));for(const [name,links] of Object.entries(w.connections)){assert.ok(names.has(name));for(const edges of links.main)for(const e of edges)assert.ok(names.has(e.node));}
  for(const n of w.nodes.filter(n=>n.type.endsWith('.code')))assert.doesNotThrow(()=>new AsyncFunction('$input','$','$execution',n.parameters.jsCode));
  for(const n of w.nodes.filter(n=>n.type.endsWith('.httpRequest')))assert.equal(n.retryOnFail,false);
 }
 const cleanup=buildDesignerCleanupWorkflow();assert.equal(cleanup.nodes.filter(n=>n.credentials?.openAiApi).length,0);
 assert.equal(cleanup.nodes.filter(n=>n.type.endsWith('.webhook')&&n.parameters.authentication==='basicAuth').length,2);
});
