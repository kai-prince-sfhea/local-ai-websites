// Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
// Independent data-only consumer of KG delivery-v1. Exact questions load every
// advertised part before invoking the existing producer algorithm. No storage,
// model, discovery import or selective-coverage inference belongs here.
export const QUERY_DELIVERY_LIMITS=Object.freeze({manifestBytes:8*1024*1024,indexBytes:16*1024*1024,
  partBytes:1024*1024,parts:4096,records:100000,totalBytes:128*1024*1024,depth:64,nodes:1000000});
const kinds=['objects','relations','occurrences'],hash=/^[a-f0-9]{64}$/u;
const fail=()=>{throw Error('local-ai-websites: advertised graph topics are unavailable, inconsistent or exceed their bounds; no exact result was accepted');};
function fields(value,allowed,required=allowed){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();
  for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!allowed.includes(key)||!d.enumerable||!Object.hasOwn(d,'value'))fail();}
  if(required.some(key=>!Object.hasOwn(value,key)))fail();
}
function array(value,max){if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>max||Reflect.ownKeys(value).length!==value.length+1)fail();for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();}}
function text(value,max=8192){if(typeof value!=='string'||!value||value!==value.trim()||value.length>max||/[\u0000-\u001f\u007f]/u.test(value))fail();return value;}
function integer(value,max,min=0){if(!Number.isSafeInteger(value)||value<min||value>max)fail();return value;}
function canonical(value,depth=0,budget={nodes:0}){
  if(depth>QUERY_DELIVERY_LIMITS.depth||++budget.nodes>QUERY_DELIVERY_LIMITS.nodes)fail();
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value)){array(value,QUERY_DELIVERY_LIMITS.nodes);return '['+value.map(item=>canonical(item,depth+1,budget)).join(',')+']';}
  fields(value,Object.keys(value));return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key],depth+1,budget)).join(',')+'}';
}
const copy=value=>JSON.parse(canonical(value));
function freeze(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
function parse(resource){let value;try{value=JSON.parse(resource.text);}catch{fail();}canonical(value);return value;}
function artifact(value,maximum){fields(value,['url','bytes','sha256']);text(value.url,4096);integer(value.bytes,maximum,1);if(typeof value.sha256!=='string'||!hash.test(value.sha256))fail();}
function local(value,base){text(value,4096);if(/[\\%?#:\s]/u.test(value)||value.startsWith('/')||value.split('/').some(part=>!part||part==='.'||part==='..'))fail();const url=new URL(value,base);if(url.origin!==base.origin||!url.pathname.startsWith(new URL('.',base).pathname))fail();return url;}
function projection(object,destinations,part){return {id:object.id,type:object.type,scope:object.scope,labels:object.labels,...(object.aliases?{aliases:object.aliases}:{}),...(object.properties?.aliases?{properties:{aliases:object.properties.aliases}}:{}),destinations,part};}

/** Callers supply a confined, bounded, digest-checking reader. Construction does
 * no I/O. Only verified literal parts survive an interrupted action in memory. */
export function createQueryDelivery({descriptor,manifestURL,readResource,checkGraph}={}){
  if(!descriptor?.delivery||!(manifestURL instanceof URL)||typeof readResource!=='function'||typeof checkGraph!=='function')fail();
  const expected=copy(descriptor),url=new URL(manifestURL.href),parts=new Map();let manifest=null,index=null,manifestResource=null,indexResource=null,assembled=null;
  return Object.freeze({
    async loadAll({signal,current,onProgress=()=>{}}={}){
      if(typeof current!=='function'||typeof onProgress!=='function')fail();current();
      let verifiedTransferBytes=0,reusedBytes=0;
      const progress=status=>{current();const requiredBytes=manifest?manifestResource.bytes+manifest.index.bytes+manifest.parts.reduce((total,part)=>total+part.bytes,0):expected.delivery.bytes;
        // A presentation callback cannot accept data or alter resource ownership.
        try{onProgress(Object.freeze({mode:'topics',status,loadedParts:parts.size,requiredParts:manifest?.parts.length??null,
          verifiedTransferBytes,reusedBytes,requiredBytes,graphStatus:expected.status,detailsComplete:!!assembled}));}catch{}current();};
      async function resource(target,maximum,identity){current();const result=await readResource(target,maximum,signal,identity);current();verifiedTransferBytes+=result.bytes;return result;}
      progress('manifest');
      if(!manifest){
        const received=await resource(url,QUERY_DELIVERY_LIMITS.manifestBytes,expected.delivery),value=parse(received);
        fields(value,['deliveryVersion','snapshotId','graphId','status','graph','counts','index','parts']);
        if(value.deliveryVersion!==1||value.snapshotId!==expected.snapshotId||value.graphId!==expected.graphId||value.status!==expected.status)fail();
        fields(value.graph,Object.keys(value.graph));
        if(value.graph.contractVersion!==0||value.graph.snapshotId!==value.snapshotId||value.graph.status!==value.status||
          (value.graph.graph?.id??'website')!==value.graphId||value.graph.graphId!==undefined&&value.graph.graphId!==value.graphId||kinds.some(kind=>Object.hasOwn(value.graph,kind)))fail();
        fields(value.counts,kinds);let recordCount=0;for(const kind of kinds)recordCount+=integer(value.counts[kind],QUERY_DELIVERY_LIMITS.records);
        if(recordCount>QUERY_DELIVERY_LIMITS.records)fail();artifact(value.index,QUERY_DELIVERY_LIMITS.indexBytes);if(value.index.url!=='delivery-index.json')fail();
        array(value.parts,QUERY_DELIVERY_LIMITS.parts);const names=new Set();let byteCount=received.bytes+value.index.bytes,totalRecords=0;
        for(const part of value.parts){fields(part,['url','sha256','bytes','topic','scope','records']);artifact({url:part.url,bytes:part.bytes,sha256:part.sha256},QUERY_DELIVERY_LIMITS.partBytes);
          if(part.url!==`topics/${part.sha256}.json`||names.has(part.url)||typeof part.topic!=='string'||!hash.test(part.topic))fail();names.add(part.url);text(part.scope);
          totalRecords+=integer(part.records,QUERY_DELIVERY_LIMITS.records,1);byteCount+=part.bytes;}
        if(totalRecords!==recordCount||byteCount>QUERY_DELIVERY_LIMITS.totalBytes)fail();
        current();manifest=freeze(value);manifestResource=Object.freeze({url:url.href,sha256:received.sha256,bytes:received.bytes});
      }else reusedBytes+=manifestResource.bytes;
      progress('index');
      if(!index){
        const received=await resource(local(manifest.index.url,url),QUERY_DELIVERY_LIMITS.indexBytes,manifest.index),value=parse(received);
        fields(value,['deliveryVersion','snapshotId','graphId','status','objects','scopeDependencies'],['deliveryVersion','snapshotId','graphId','status','objects']);
        if(value.deliveryVersion!==1||value.snapshotId!==expected.snapshotId||value.graphId!==expected.graphId||value.status!==expected.status)fail();array(value.objects,QUERY_DELIVERY_LIMITS.records);
        if(value.objects.length!==manifest.counts.objects)fail();const ids=new Set(),partURLs=new Set(manifest.parts.map(part=>part.url));
        for(const row of value.objects){fields(row,['id','type','scope','labels','aliases','properties','destinations','part'],['id','type','scope','labels','destinations','part']);
          text(row.id);text(row.type);text(row.scope);fields(row.labels,Object.keys(row.labels));if(!Object.keys(row.labels).length||Object.values(row.labels).some(label=>typeof label!=='string'))fail();
          array(row.destinations,QUERY_DELIVERY_LIMITS.records);for(const destination of row.destinations)text(destination);
          if(ids.has(row.id)||!partURLs.has(row.part))fail();ids.add(row.id);
        }
        if(value.scopeDependencies!==undefined){const scopes=new Set(manifest.parts.map(part=>part.scope));fields(value.scopeDependencies,[...scopes]);if(Object.keys(value.scopeDependencies).length!==scopes.size)fail();
          for(const [scope,dependencies]of Object.entries(value.scopeDependencies)){array(dependencies,QUERY_DELIVERY_LIMITS.parts);if(!dependencies.includes(scope)||new Set(dependencies).size!==dependencies.length||dependencies.some(name=>typeof name!=='string'||!scopes.has(name)))fail();}}
        current();index=freeze(value);indexResource=Object.freeze({url:local(manifest.index.url,url).href,bytes:received.bytes,sha256:received.sha256});
      }else reusedBytes+=indexResource.bytes;
      const byId=new Map(index.objects.map((row,position)=>[row.id,{row,position}]));
      for(const part of manifest.parts){
        current();progress('topics');if(parts.has(part.url)){reusedBytes+=part.bytes;continue;}
        const received=await resource(local(part.url,url),QUERY_DELIVERY_LIMITS.partBytes,part),value=parse(received);
        fields(value,['deliveryVersion','snapshotId','graphId','status','topic','scope','records']);
        if(value.deliveryVersion!==1||value.snapshotId!==expected.snapshotId||value.graphId!==expected.graphId||value.status!==expected.status||value.topic!==part.topic||value.scope!==part.scope)fail();
        array(value.records,QUERY_DELIVERY_LIMITS.records);if(value.records.length!==part.records)fail();const positions=new Set();
        for(const row of value.records){fields(row,['kind','position','value']);if(!kinds.includes(row.kind))fail();integer(row.position,manifest.counts[row.kind]-1);fields(row.value,Object.keys(row.value));
          const position=row.kind+':'+row.position;if(positions.has(position))fail();positions.add(position);
          if((row.kind==='occurrences'?byId.get(row.value.target)?.row.scope:row.value.scope)!==part.scope)fail();
          if(row.kind==='objects'){const entry=byId.get(row.value.id);if(!entry||entry.position!==row.position||entry.row.part!==part.url||canonical(projection(row.value,entry.row.destinations,part.url))!==canonical(entry.row))fail();}}
        current();parts.set(part.url,freeze(value));progress('topics');
      }
      if(!assembled){
        const graph={...copy(manifest.graph),...Object.fromEntries(kinds.map(kind=>[kind,new Array(manifest.counts[kind])]))},seen=new Set();
        for(const part of manifest.parts)for(const row of parts.get(part.url).records){const key=row.kind+':'+row.position;if(seen.has(key))fail();seen.add(key);graph[row.kind][row.position]=copy(row.value);}
        for(const kind of kinds)for(let position=0;position<manifest.counts[kind];position++)if(!Object.hasOwn(graph[kind],position))fail();
        const destinations=new Map();for(const row of graph.occurrences){const list=destinations.get(row.target)??[];list.push(row.destination);destinations.set(row.target,list);}
        for(let position=0;position<index.objects.length;position++){const row=index.objects[position],object=graph.objects[position];if(!object||canonical(projection(object,destinations.get(object.id)??[],row.part))!==canonical(row))fail();}
        current();assembled=freeze(checkGraph(graph,expected));
      }
      progress('ready');current();
      return {graph:assembled,delivery:freeze({version:1,mode:'topics',manifest:manifestResource,index:indexResource,
        parts:manifest.parts.map(part=>({...part,url:local(part.url,url).href})),coverage:{indexComplete:true,detailsComplete:true,loadedParts:parts.size,requiredParts:manifest.parts.length,graphStatus:expected.status},
        verifiedTransferBytes,reusedBytes,requiredBytes:manifestResource.bytes+manifest.index.bytes+manifest.parts.reduce((sum,part)=>sum+part.bytes,0),
        qualification:'All advertised topic records were reconstructed before this exact question. Verified transfer bytes exclude failed or interrupted responses; reuse is this client memory only.'})};
    }
  });
}
