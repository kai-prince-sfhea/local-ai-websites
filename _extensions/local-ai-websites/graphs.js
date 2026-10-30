// Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
// Read only the producer's already-public projections. Graph labels/summaries
// aid discovery; they are not automatically admitted as reviewed AI evidence.
import {LIMITS,boundedText} from './retrieval.js';
const safeURL=(value,base)=>{
  if(typeof value!=='string'||value.length>2048||/[\\\u0000-\u001f]/u.test(value)) throw Error('Invalid public graph URL.');
  const url=new URL(value,base),origin=new URL(base).origin;
  if(url.origin!==origin||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search) throw Error('Public graph URLs must remain on this website.');
  return url.href;
};
async function json(url,maximum,fetchImpl,signal){
  const response=await fetchImpl(url,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal});
  if(!response.ok||!response.body) throw Error('Public graph index is unavailable.');
  const reader=response.body.getReader(),chunks=[];let count=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>maximum)throw Error('Public graph index exceeds its budget.');chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const bytes=new Uint8Array(count);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function loadGraphSources(registryURL,selection='all',{baseURL=globalThis.location?.href,fetchImpl=globalThis.fetch?.bind(globalThis),signal,localSources=[]}={}){
  const registry=safeURL(registryURL,baseURL),document=await json(registry,262144,fetchImpl,signal);
  if(document.registryVersion!==1||!Array.isArray(document.graphs)||document.graphs.length>32)throw Error('Unsupported public graph registry.');
  // The registry lives in knowledge-graph/, and destinations are output-root relative.
  const outputRoot=new URL('../',registry),sources=[...localSources],graphs=[];let total=sources.reduce((sum,item)=>sum+item.text.length,0),bounded=false;
  const seen=new Set(),ids=new Set();
  for(const graph of document.graphs){
    if(typeof graph.id!=='string'||!/^[a-z][a-z0-9-]{0,63}$/u.test(graph.id)||ids.has(graph.id))throw Error('Invalid public graph identity.');
    ids.add(graph.id);
    if(graph.search===false||(selection!=='all'&&!selection.includes(graph.id)))continue;
    if(!['complete','incomplete'].includes(graph.status))throw Error('Unsupported public graph status.');
    const index=await json(safeURL(graph.index,registry),1048576,fetchImpl,signal);
    if(index.contractVersion!==0||index.snapshotId!==graph.snapshotId||index.status!==graph.status||!Array.isArray(index.objects)||index.objects.length>10000)throw Error('Public graph snapshot does not match its registry.');
    graphs.push({id:graph.id,label:typeof graph.label==='string'?graph.label:graph.id,snapshotId:graph.snapshotId,status:graph.status});
    for(const item of index.objects){
      if(typeof item.id!=='string'||!item.labels||!Array.isArray(item.destinations))continue;
      const label=item.labels.en??Object.values(item.labels).find(value=>typeof value==='string');
      if(typeof label!=='string'||!label.trim()||typeof item.destinations[0]!=='string')continue;
      const url=safeURL(item.destinations[0],outputRoot),aliases=Object.values(item.aliases??{}).flat().filter(value=>typeof value==='string').join(' ');
      const identity=`${graph.id}\n${item.id}`;
      if(seen.has(identity))throw Error('A public graph index repeats a semantic identity.');
      seen.add(identity);
      const body=boundedText([label,typeof item.summary==='string'?item.summary:'',aliases].filter(Boolean).join('\n'),LIMITS.text);
      if(sources.length>=LIMITS.sources||total+body.length>LIMITS.total){bounded=true;continue;}
      const id=`graph:${graph.id}:${item.id}`;if(id.length>256)continue;
      sources.push({id,label:boundedText(label,LIMITS.label),text:body,url,graphId:graph.id,snapshotId:graph.snapshotId,discoveryOnly:true});
      total+=body.length;
    }
  }
  return {sources,graphs,bounded};
}
