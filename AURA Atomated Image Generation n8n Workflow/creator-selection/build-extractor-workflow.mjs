import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {essentialArchivePreflight} from './essential-runtime.mjs';

// Preserve the user's exported DEV 07 implementation, IDs and credentials.
// Add deterministic checks only; no new model calls or conversion tasks.
export function buildExtractorWorkflow(base){
 const w=structuredClone(base),byName=name=>w.nodes.find(n=>n.name===name);
 if(w.id!=='D8QQZzhw903FrcuO'||!byName('Reference ZIP Saved'))throw Error('Wrong DEV 07 source export.');
 w.active=false;w.pinData={};w.settings={...w.settings,timezone:'Asia/Beirut'};
 for(const n of w.nodes){if(n.type.endsWith('.httpRequest')||n.type.endsWith('.googleDrive')){n.retryOnFail=false;n.onError='stopWorkflow';}if(n.type.endsWith('.compression'))n.parameters.operation='decompress';}
 Object.assign(byName('Wait Before Job Poll').parameters,{resume:'timeInterval',amount:5,unit:'seconds'});
 byName('Upload Files One at a Time').parameters.batchSize=1;
 byName('Save Combined ZIP to Piece Folder').parameters.operation='upload';
 byName('Validate Piece Input').parameters.jsCode=byName('Validate Piece Input').parameters.jsCode.replace('return [{',`if(sourceFileIds.length!==1)throw new Error('Exactly one source ZIP is required per piece.');\nreturn [{`);
 byName('Validate Source Files').parameters.jsCode=byName('Validate Source Files').parameters.jsCode.replace('const size = Number(file.size);',`if(/^AURA_reference_images_.*\\.zip$/i.test(file.name))throw new Error('A generated reference ZIP cannot be used as a source ZIP.');\n  const size = Number(file.size);\n  if(size>200*1024*1024)throw new Error('Source ZIP exceeds the 200 MiB transfer limit.');`);
 const driveCredential=structuredClone(byName('Get Source File Metadata').credentials);
 const edge=node=>({node,type:'main',index:0});
 const link=(from,to)=>{w.connections[from]={main:[[edge(to)]]};};
 const addCode=(name,id,position,jsCode)=>w.nodes.push({id,name,type:'n8n-nodes-base.code',typeVersion:2,position,parameters:{mode:'runOnceForAllItems',jsCode}});
 const addMetadata=(name,id,position,url)=>{
  w.nodes.push({id,name,type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position,credentials:driveCredential,retryOnFail:false,onError:'stopWorkflow',parameters:{url,authentication:'predefinedCredentialType',nodeCredentialType:'googleDriveOAuth2Api',sendBody:false,sendQuery:true,queryParameters:{parameters:[{name:'fields',value:'id,name,mimeType,parents,trashed,size,md5Checksum,version,capabilities/canDownload'},{name:'supportsAllDrives',value:'true'}]},options:{timeout:300000,redirect:{redirect:{followRedirects:false}},response:{response:{responseFormat:'json'}}}}});
 };
 addCode('Verify Source ZIP Bytes','aura-extractor-source-bytes',[1500,600],`const crypto=require('crypto');\nconst esFail=m=>{throw Error(m);};\n${essentialArchivePreflight.toString()}\nconst items=$input.all();\nfor(let i=0;i<items.length;i++){\n const bytes=await this.helpers.getBinaryDataBuffer(i,'sourceZip'),source=items[i].json.sourceFileMetadata;\n if(bytes.length!==Number(source.size)||crypto.createHash('md5').update(bytes).digest('hex')!==source.md5Checksum)throw Error('Source ZIP bytes do not match Drive metadata.');\n essentialArchivePreflight(bytes,1024*1024*1024,512*1024*1024);\n}\nreturn items;`);
 addMetadata('Recheck Source ZIP Metadata','aura-extractor-source-recheck',[1720,600],"={{ 'https://www.googleapis.com/drive/v3/files/' + $json.sourceFileId }}");
 addCode('Confirm Unchanged Source ZIP','aura-extractor-source-confirm',[1940,600],`const items=$input.all();\nreturn items.map((item,index)=>{const original=$('Verify Source ZIP Bytes').itemMatching(index),a=original.json.sourceFileMetadata,b=item.json;\n if(['id','name','mimeType','size','md5Checksum','version'].some(k=>String(a[k])!==String(b[k]))||JSON.stringify(a.parents)!==JSON.stringify(b.parents)||b.trashed!==false)throw Error('Source ZIP changed during download. No conversion was submitted.');\n return {json:original.json,binary:original.binary,pairedItem:{item:index}};});`);
 link('Download Source ZIP','Verify Source ZIP Bytes');link('Verify Source ZIP Bytes','Recheck Source ZIP Metadata');link('Recheck Source ZIP Metadata','Confirm Unchanged Source ZIP');link('Confirm Unchanged Source ZIP','Unpack Source ZIP');
 // Check bounded central directory before the native output decompressor too.
 byName('Prepare ZIP Validation').parameters.jsCode=byName('Prepare ZIP Validation').parameters.jsCode.replace("const crypto=require('crypto');",`const crypto=require('crypto');\nconst esFail=m=>{throw Error(m);};\n${essentialArchivePreflight.toString()}`).replace("const {outputUrl,...safe}=context;",`essentialArchivePreflight(bytes,200*1024*1024);\nconst {outputUrl,...safe}=context;`);
 addMetadata('Verify Saved ZIP Metadata','aura-extractor-output-readback',[9000,900],"={{ 'https://www.googleapis.com/drive/v3/files/' + $json.outputFileId }}");
 addCode('Confirm Saved Combined ZIP','aura-extractor-output-confirm',[9240,900],`const expected=$('Reference ZIP Saved').itemMatching(0).json,actual=$input.first().json;\nif(actual.id!==expected.outputFileId||actual.name!==expected.outputZipFilename||actual.mimeType!=='application/zip'||actual.trashed!==false||actual.parents?.length!==1||actual.parents[0]!==expected.pieceFolderId||Number(actual.size)!==expected.outputZipBytes||actual.md5Checksum!==expected.outputZipMd5)throw Error('Saved combined ZIP failed Drive readback. Do not rerun conversion.');\nreturn [{json:{...expected,savedZipReadbackVerified:true},pairedItem:{item:0}}];`);
 link('Reference ZIP Saved','Verify Saved ZIP Metadata');link('Verify Saved ZIP Metadata','Confirm Saved Combined ZIP');
 return w;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(!process.argv[2])throw Error('Pass the original DEV 07 JSON export path.');
 process.stdout.write(JSON.stringify(buildExtractorWorkflow(JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2)+'\n');
}
