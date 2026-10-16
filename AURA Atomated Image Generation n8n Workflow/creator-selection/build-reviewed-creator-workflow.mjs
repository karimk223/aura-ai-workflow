import {readFileSync} from 'node:fs';
// Transport-only compatibility repair; human selection and journals unchanged.
export function buildReviewedCreatorWorkflow(){
 const w=JSON.parse(readFileSync(new URL('DEV - 04B Creator Candidate Selection and Image Routing.json',import.meta.url),'utf8'));
 const name='Execute Verified Drive Step',original=w.nodes.find(n=>n.name===name);
 if(!original||!w.connections[name])throw Error('Creator transport source is missing.');
 // The canonical export may already contain the reviewed transport split.
 if(w.nodes.some(n=>n.name===name+' Has Body?'))return w;
 const body=structuredClone(original);body.id+='-with-body';body.name+=' With Body';body.position=[original.position[0],original.position[1]-180];
 Object.assign(original.parameters,{sendBody:false});delete original.parameters.jsonBody;delete original.parameters.specifyBody;
 Object.assign(body.parameters,{sendBody:true,contentType:'json',specifyBody:'json',jsonBody:'={{ JSON.stringify($json.command.body) }}'});
 const gate={id:'aura-creator-body-gate',name:name+' Has Body?',type:'n8n-nodes-base.if',typeVersion:2.2,position:[original.position[0]-220,original.position[1]],parameters:{conditions:{options:{caseSensitive:true,typeValidation:'strict',version:2},conditions:[{leftValue:'={{ $json.command.body !== undefined && $json.command.body !== null && !["GET","HEAD"].includes(String($json.command.method).toUpperCase()) }}',rightValue:'',operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}}};
 for(const connection of Object.values(w.connections))for(const edges of connection.main)for(const edge of edges)if(edge.node===name)edge.node=gate.name;
 w.connections[body.name]=structuredClone(w.connections[name]);w.connections[gate.name]={main:[[{node:body.name,type:'main',index:0}],[{node:name,type:'main',index:0}]]};w.nodes.push(body,gate);
 for(const n of w.nodes){if(n.type.endsWith('.httpRequest'))n.retryOnFail=false;
  if(n.credentials?.googleDriveOAuth2Api)n.credentials.googleDriveOAuth2Api={id:'DxuMVynJiqHaTJ6T',name:'Aura Google Drive'};
 }
 w.active=false;w.pinData={};w.settings={...w.settings,timezone:'Asia/Beirut'};return w;
}
