// Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
// Original consumer of KG's version-1 data-only query-provider contract.
// Discovery performs no executable import. An explicit execute action verifies
// transferred module bytes, then imports the same immutable author-trusted URL.
// This is transferred-byte verification, NOT execution attestation: a trusted
// origin/service worker/server could change a later module response.
// Advertised topics are verified and reconstructed in full before exact queries.
// Older descriptors without delivery retain bounded whole-graph JSON loading.
// The timeout cancels awaited work and discards stale results. It cannot preempt
// a synchronous producer query; producer traversal budgets remain necessary.
import {createQueryDelivery} from './query-delivery.js';
export const QUERY_PROVIDER_LIMITS=Object.freeze({registryBytes:262144,moduleBytes:1024*1024,
  graphBytes:16*1024*1024,deliveryBytes:8*1024*1024,graphs:32,profiles:16,
  objects:100000,relations:200000,occurrences:200000,requestBytes:131072,resultBytes:16*1024*1024});
const HASH=/^[a-f0-9]{64}$/,ID=/^[a-z][a-z0-9-]{0,63}$/;
const hex=value=>typeof value==='string'&&HASH.test(value);
const fail=()=>{throw new Error('local-ai-websites: incompatible, unavailable or unsafe exact graph query');};
const text=(value,max=8192)=>typeof value==='string'&&value.length>0&&value.length<=max&&value===value.trim()&&!/[\u0000-\u001f\u007f]/.test(value);
const graphId=value=>text(value,64)&&ID.test(value)&&!['constructor','prototype'].includes(value);
function fields(value,allowed,required=allowed){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();
  for(const key of Reflect.ownKeys(value)){const property=Object.getOwnPropertyDescriptor(value,key);
    if(typeof key!=='string'||!allowed.includes(key)||!property.enumerable||!Object.hasOwn(property,'value'))fail();}
  if(required.some(key=>!Object.hasOwn(value,key)))fail();
}
function array(value,minimum,maximum){
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length<minimum||value.length>maximum)fail();
  const keys=Reflect.ownKeys(value).filter(key=>key!=='length');if(keys.length!==value.length)fail();
  for(let index=0;index<value.length;index++){
    if(keys[index]!==String(index))fail();const property=Object.getOwnPropertyDescriptor(value,String(index));
    if(!property.enumerable||!Object.hasOwn(property,'value'))fail();
  }
}
function canonical(value,depth=0,budget={nodes:0}){
  if(depth>64||++budget.nodes>1000000)fail();
  if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value)){array(value,0,1000000);return '['+value.map(item=>canonical(item,depth+1,budget)).join(',')+']';}
  fields(value,Object.keys(value));return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key],depth+1,budget)).join(',')+'}';
}
const clone=value=>JSON.parse(canonical(value));
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const item of Object.values(value))freeze(item);}return value;}
async function hashBytes(bytes){if(!globalThis.crypto?.subtle)fail();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
const hashJSON=value=>hashBytes(new TextEncoder().encode(canonical(value)));
function local(value,expected){if(value!==expected||!text(value,4096)||/[\\%?#:\s]/.test(value)||value.startsWith('/')||value.split('/').some(part=>!part||part==='.'||part==='..'))fail();return value;}
export function validateQueryProfiles(profiles=[]){
  array(profiles,0,QUERY_PROVIDER_LIMITS.profiles);const seen=new Set();
  return profiles.map(input=>{
    fields(input,['id','label','operation','relations','direction','types','fields','match'],['id','label','operation']);
    if(!text(input.id,48)||!/^[a-z][a-z0-9-]{0,47}$/.test(input.id)||seen.has(input.id)||!text(input.label,128)||!['hierarchy','evidence','time-filter'].includes(input.operation))fail();
    seen.add(input.id);const allowed=['id','label','operation',...(input.operation==='hierarchy'?['relations','direction']:input.operation==='evidence'?['relations','types']:['fields','types','match'])];
    if(Object.keys(input).some(key=>!allowed.includes(key)))fail();
    const result={id:input.id,label:input.label,operation:input.operation};
    if(input.operation!=='time-filter'){
      array(input.relations,1,32);const types=new Set(),directions=input.operation==='hierarchy'?['child-to-parent','parent-to-child']:['target-to-evidence','evidence-to-target'];
      result.relations=input.relations.map(item=>{fields(item,['type','direction']);if(!text(item.type,128)||types.has(item.type)||!directions.includes(item.direction))fail();types.add(item.type);return {...item};}).sort((a,b)=>a.type<b.type?-1:a.type>b.type?1:0);
    }
    if(input.operation==='hierarchy'){if(input.direction!==undefined&&!['ancestors','descendants'].includes(input.direction))fail();result.direction=input.direction??'ancestors';}
    if(input.types!==undefined){array(input.types,1,32);if(input.types.some(type=>!text(type,128))||new Set(input.types).size!==input.types.length)fail();result.types=[...input.types].sort();}
    if(input.operation==='time-filter'){
      fields(input.fields,['instant','start','end'],[]);const names=Object.keys(input.fields);
      if(!(names.length===1&&text(input.fields.instant,128)||names.length===2&&text(input.fields.start,128)&&text(input.fields.end,128)))fail();
      result.fields=input.fields.instant!==undefined?{instant:input.fields.instant}:{start:input.fields.start,end:input.fields.end};
      if(input.match!==undefined&&!['overlaps','contained','starts-within'].includes(input.match))fail();result.match=input.match??'overlaps';
    }
    return result;
  });
}
export function validateQueryDescriptor(value,expected={}){
  fields(expected,['graphId','snapshotId','status'],[]);
  fields(value,['version','graphId','snapshotId','status','module','graph','delivery','profiles'],['version','graphId','snapshotId','status','module','graph','profiles']);
  if(value.version!==1||!graphId(value.graphId)||!hex(value.snapshotId)||!['complete','incomplete'].includes(value.status)||Object.keys(expected).some(key=>value[key]!==expected[key]))fail();
  const generation=`generations/${value.snapshotId}/`,base=generation+(value.graphId==='website'?'':`graphs/${value.graphId}/`);
  fields(value.module,['url','sha256','bytes','apiVersion']);fields(value.graph,['url','snapshotId','status']);
  if(local(value.module.url,generation+'query.js')!==value.module.url||!hex(value.module.sha256)||!Number.isSafeInteger(value.module.bytes)||value.module.bytes<1||value.module.bytes>QUERY_PROVIDER_LIMITS.moduleBytes||value.module.apiVersion!==1)fail();
  local(value.graph.url,base+'graph.json');if(value.graph.snapshotId!==value.snapshotId||value.graph.status!==value.status)fail();
  let delivery;
  if(value.delivery!==undefined){fields(value.delivery,['deliveryVersion','manifest','sha256','bytes']);local(value.delivery.manifest,base+'delivery.json');
    if(value.delivery.deliveryVersion!==1||!hex(value.delivery.sha256)||!Number.isSafeInteger(value.delivery.bytes)||value.delivery.bytes<1||value.delivery.bytes>QUERY_PROVIDER_LIMITS.deliveryBytes)fail();delivery={...value.delivery};}
  return {version:1,graphId:value.graphId,snapshotId:value.snapshotId,status:value.status,module:{...value.module},graph:{...value.graph},...(delivery?{delivery}:{}),profiles:validateQueryProfiles(value.profiles)};
}
function siteURL(value,base){
  if(!text(value,8192)||/[\\\u0000-\u0020\u007f]/.test(value))fail();
  let url,origin;try{url=new URL(value,base);origin=new URL(base).origin;}catch{fail();}
  if(url.origin!==origin||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)fail();return url;
}
async function read(url,maximum,fetchImpl,signal,expected){
  if(signal?.aborted)throw new Error('local-ai-websites: exact graph query cancelled');
  const response=await awaitAbort(fetchImpl(url.href,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal}),signal);
  if(!response.ok||response.redirected||response.url&&response.url!==url.href)fail();
  const length=response.headers?.get('content-length');if(length!==null&&length!==undefined&&(!/^\d+$/.test(length)||Number(length)>maximum))fail();
  let bytes;
  if(!response.body?.getReader){bytes=new Uint8Array(await awaitAbort(response.arrayBuffer(),signal));if(bytes.byteLength>maximum)fail();}
  else{const reader=response.body.getReader(),chunks=[];let count=0;
    try{while(true){if(signal?.aborted)throw new Error('local-ai-websites: exact graph query cancelled');const {done,value}=await awaitAbort(reader.read(),signal);if(done)break;if(!(value instanceof Uint8Array))fail();count+=value.byteLength;if(count>maximum||expected&&count>expected.bytes)fail();chunks.push(value);}}
    finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
    bytes=new Uint8Array(count);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
  }
  const sha256=await awaitAbort(hashBytes(bytes),signal);if(expected&&(bytes.byteLength!==expected.bytes||sha256!==expected.sha256))fail();
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail();}
  return {text,sha256,bytes:bytes.byteLength};
}
const common=['scope','snapshotId','requiredSources'];
const route=['direction','relationTypes','known','earlier','edgeWeights','difficultyWeights','difficultyMultiplier','defaultEdgeWeight','prerequisiteRelations','maxStates','maxSteps'];
const operations=Object.freeze({lookup:['id','scope'],neighbours:['id','scope'],definitions:['id','scope'],
  search:[...common,'text','limit','types'],traverse:[...common,'start','direction','relationTypes','maxDepth','maxNodes'],
  prerequisites:[...common,'target','known','earlier','prerequisiteRelations','maxNodes'],shortestPath:[...common,'start','goal',...route],
  hierarchyClosure:[...common,'start','relations','direction','includeSelf','maxDepth','maxNodes','maxEdges'],
  evidenceLookup:[...common,'target','relations','types','limit','maxEdges'],scopedCounts:[...common,'types','relationTypes','maxRecords'],
  filterByTime:[...common,'fields','window','match','types','maxRecords'],pageIndex:[...common,'types','maxRecords'],
  shortestPagePath:[...common,'startPage','goalPage','startRecord','goalRecord',...route,'maxPairs','maxRecords']});
function dispatch(operation,input,profiles){
  const params=clone(input);if(new TextEncoder().encode(canonical(params)).byteLength>QUERY_PROVIDER_LIMITS.requestBytes)fail();
  if(operation==='profile'){
    fields(params,['profileId',...common,'start','target','window','includeSelf','maxDepth','maxNodes','maxEdges','limit','maxRecords'],['profileId']);
    const profile=profiles.find(item=>item.id===params.profileId);if(!profile)fail();delete params.profileId;
    if(profile.operation==='hierarchy'){operation='hierarchyClosure';fields(params,[...common,'start','includeSelf','maxDepth','maxNodes','maxEdges'],['start']);Object.assign(params,{relations:profile.relations,direction:profile.direction});}
    else if(profile.operation==='evidence'){operation='evidenceLookup';fields(params,[...common,'target','limit','maxEdges'],['target']);Object.assign(params,{relations:profile.relations,...(profile.types?{types:profile.types}:{})});}
    else{operation='filterByTime';fields(params,[...common,'window','maxRecords'],['window']);Object.assign(params,{fields:profile.fields,match:profile.match,...(profile.types?{types:profile.types}:{})});}
  }
  if(!Object.hasOwn(operations,operation))fail();fields(params,operations[operation],[]);
  if(params.scope!==undefined&&params.scope!==null&&!(text(params.scope)||Array.isArray(params.scope)&&params.scope.length<=64&&params.scope.every(item=>text(item))))fail();
  if(params.snapshotId!==undefined&&!hex(params.snapshotId))fail();
  if(params.requiredSources!==undefined&&(!Array.isArray(params.requiredSources)||params.requiredSources.length>1000||params.requiredSources.some(item=>!text(item))))fail();
  for(const name of ['id','start','goal','target','startPage','goalPage','startRecord','goalRecord'])if(params[name]!==undefined&&!text(params[name]))fail();
  const required=operation==='lookup'||operation==='neighbours'||operation==='definitions'?['id']:operation==='traverse'||operation==='hierarchyClosure'?['start']:operation==='prerequisites'||operation==='evidenceLookup'?['target']:operation==='shortestPath'?['start','goal']:operation==='shortestPagePath'?['startPage','goalPage']:[];
  if(required.some(name=>!Object.hasOwn(params,name)))fail();return {operation,params};
}
function checkGraph(value,descriptor){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.contractVersion!==0||value.snapshotId!==descriptor.snapshotId||value.status!==descriptor.status||
    value.graphId!==undefined&&value.graphId!==descriptor.graphId)fail();
  for(const [name,maximum] of [['objects',QUERY_PROVIDER_LIMITS.objects],['relations',QUERY_PROVIDER_LIMITS.relations],['occurrences',QUERY_PROVIDER_LIMITS.occurrences]])array(value[name],0,maximum);
  // Bound arbitrary public property nesting before caching or passing the graph.
  if(new TextEncoder().encode(canonical(value)).byteLength>QUERY_PROVIDER_LIMITS.graphBytes)fail();return value;
}
function awaitAbort(promise,signal){
  if(!signal)return Promise.resolve(promise);
  if(signal.aborted)return Promise.reject(new Error('local-ai-websites: exact graph query cancelled'));
  return new Promise((resolve,reject)=>{const abort=()=>reject(new Error('local-ai-websites: exact graph query cancelled'));
    signal.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
/** Construction validates literal data only. A client retains no reader state
 * and caches verified immutable topic parts and one graph/module until disposed.
 * No partial detail set is passed to exact queries, including negative/count
 * questions. Cancellation can retain earlier verified parts for a later action. */
export function openQueryProvider(value,{registryURL,baseURL=globalThis.location?.href,expectedGraphId,expectedSnapshotId,expectedStatus,
  fetchImpl=globalThis.fetch?.bind(globalThis),importModule=url=>import(url),timeoutMs=30000}={}){
  const expected={...(expectedGraphId===undefined?{}:{graphId:expectedGraphId}),...(expectedSnapshotId===undefined?{}:{snapshotId:expectedSnapshotId}),...(expectedStatus===undefined?{}:{status:expectedStatus})};
  const descriptor=freeze(validateQueryDescriptor(value,expected)),registry=siteURL(registryURL,baseURL),moduleURL=siteURL(descriptor.module.url,registry),graphURL=siteURL(descriptor.graph.url,registry);
  if(typeof fetchImpl!=='function'||typeof importModule!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120000)fail();
  let disposed=false,active=null,cached=null,moduleBytes=null,delivery=null;
  return Object.freeze({get descriptor(){return clone(descriptor);},get profiles(){return clone(descriptor.profiles);},
    async execute(operation,params={}, {signal,isCurrent=()=>true,onProgress=()=>{}}={}){
      const request=dispatch(operation,params,descriptor.profiles);if(disposed)fail();if(active)throw new Error('local-ai-websites: exact graph query is busy');
      if(typeof isCurrent!=='function'||typeof onProgress!=='function')fail();const controller=new AbortController(),owner={controller};active=owner;
      const timer=setTimeout(()=>controller.abort(),timeoutMs);
      const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
      const current=()=>{if(disposed||controller.signal.aborted||active!==owner)throw new Error('local-ai-websites: exact graph query cancelled');if(!isCurrent())throw new Error('local-ai-websites: exact graph query is stale');};
      const report=value=>{current();try{onProgress(Object.freeze(value));}catch{}current();};
      try{
        current();let loaded=cached,deliveryReceipt=null;
        if(!loaded){
          report({mode:descriptor.delivery?'topics':'whole-graph',status:'module',loadedParts:0,requiredParts:null});
          if(!moduleBytes){const received=await read(moduleURL,QUERY_PROVIDER_LIMITS.moduleBytes,fetchImpl,controller.signal,descriptor.module);current();moduleBytes=received;}
          let graph,graphIdentity;
          if(descriptor.delivery){
            delivery??=createQueryDelivery({descriptor,manifestURL:siteURL(descriptor.delivery.manifest,registry),checkGraph,
              readResource:(url,maximum,signal,expected)=>read(url,maximum,fetchImpl,signal,expected)});
            const assembled=await delivery.loadAll({signal:controller.signal,current,onProgress:report});current();graph=assembled.graph;deliveryReceipt=assembled.delivery;
            const encoded=canonical(graph);graphIdentity={graphURL:graphURL.href,graphReconstructedSha256:await hashBytes(new TextEncoder().encode(encoded)),graphReconstructedBytes:new TextEncoder().encode(encoded).byteLength};current();
          }else{
            report({mode:'whole-graph',status:'graph',loadedParts:0,requiredParts:null});
            const received=await read(graphURL,QUERY_PROVIDER_LIMITS.graphBytes,fetchImpl,controller.signal);current();
            try{graph=checkGraph(JSON.parse(received.text),descriptor);}catch{fail();}
            graphIdentity={graphURL:graphURL.href,graphTransferredSha256:received.sha256,graphBytes:received.bytes};
          }
          // No import occurs during discovery, descriptor validation or transfer.
          const module=await awaitAbort(importModule(moduleURL.href),controller.signal);current();
          if(module?.QUERY_VERSION!==1||typeof module.query!=='function'||Object.keys(operations).some(name=>!['lookup','neighbours','definitions'].includes(name)&&typeof module[name]!=='function'))fail();
          module.query(graph,'lookup',graph.objects[0]?.id??'urn:local-ai:empty');current();
          loaded={module,graph:freeze(graph),identity:{descriptorSha256:await hashJSON(descriptor),moduleURL:moduleURL.href,moduleTransferredSha256:moduleBytes.sha256,moduleBytes:moduleBytes.bytes,
            ...graphIdentity,executionAttestation:'not-provided'}};current();cached=loaded;
        }else if(descriptor.delivery){
          const reused=await delivery.loadAll({signal:controller.signal,current,onProgress:report});current();deliveryReceipt=reused.delivery;
        }
        report({mode:descriptor.delivery?'topics':'whole-graph',status:'querying',loadedParts:deliveryReceipt?.coverage.loadedParts??null,requiredParts:deliveryReceipt?.coverage.requiredParts??null});
        const raw=['lookup','neighbours','definitions'].includes(request.operation)?loaded.module.query(loaded.graph,request.operation,request.params.id,request.params.scope):loaded.module[request.operation](loaded.graph,request.params);
        const result=clone(raw);current();if(!['complete','incomplete','unknown'].includes(result.status)||result.snapshotId!==descriptor.snapshotId||new TextEncoder().encode(canonical(result)).byteLength>QUERY_PROVIDER_LIMITS.resultBytes)fail();
        const requestSha256=await hashJSON({graphId:descriptor.graphId,snapshotId:descriptor.snapshotId,...request}),resultSha256=await hashJSON(result);current();
        return {result,provenance:{version:1,kind:'exact-public-graph-query',graphId:descriptor.graphId,snapshotId:descriptor.snapshotId,graphStatus:descriptor.status,
          ...loaded.identity,...(deliveryReceipt?{delivery:deliveryReceipt}:{}),operation:request.operation,requestSha256,resultSha256,status:result.status,exhaustive:typeof result.exhaustive==='boolean'?result.exhaustive:null,
          modelUsed:false,qualification:'producer named-query result; no inferred mathematical truth or citation support'}};
      }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(active===owner)active=null;}
    },dispose(){disposed=true;cached=null;moduleBytes=null;delivery=null;active?.controller.abort();}});
}
/** Registry JSON discovery only: no graph/index/module imports or model calls.
 * Federation is available only when explicitly selected by its graph ID. */
export async function loadQueryProviders(registryURL,selection='all',{baseURL=globalThis.location?.href,fetchImpl=globalThis.fetch?.bind(globalThis),signal,importModule}={}){
  if(selection!=='all'){array(selection,1,QUERY_PROVIDER_LIMITS.graphs);if(selection.some(id=>!graphId(id))||new Set(selection).size!==selection.length)fail();}
  const registry=siteURL(registryURL,baseURL),bytes=await read(registry,QUERY_PROVIDER_LIMITS.registryBytes,fetchImpl,signal);let data;try{data=JSON.parse(bytes.text);}catch{fail();}
  if(data.registryVersion!==1)fail();array(data.graphs,0,QUERY_PROVIDER_LIMITS.graphs);
  const seen=new Set(),graphs=[],unavailable=[],entries=[...data.graphs];
  if(data.federation!==undefined&&selection!=='all'&&selection.includes(data.federation.id))entries.push(data.federation);
  for(const entry of entries){
    if(!entry||!graphId(entry.id)||seen.has(entry.id))fail();seen.add(entry.id);
    if(entry.search===false||selection!=='all'&&!selection.includes(entry.id))continue;
    if(!hex(entry.snapshotId)||!['complete','incomplete'].includes(entry.status))fail();
    if(!entry.queryProvider){unavailable.push(entry.id);continue;}
    const client=openQueryProvider(entry.queryProvider,{registryURL:registry.href,baseURL:baseURL??registry.href,expectedGraphId:entry.id,expectedSnapshotId:entry.snapshotId,expectedStatus:entry.status,fetchImpl,...(importModule?{importModule}:{})});
    graphs.push({id:entry.id,label:text(entry.label,256)?entry.label:entry.id,status:entry.status,snapshotId:entry.snapshotId,descriptor:client.descriptor,client});
  }
  if(selection!=='all')for(const id of selection)if(!seen.has(id)||!graphs.some(graph=>graph.id===id)&&!unavailable.includes(id))unavailable.push(id);
  return {version:1,graphs,unavailable,registry:{url:registry.href,sha256:bytes.sha256,bytes:bytes.bytes},modelUsed:false};
}
