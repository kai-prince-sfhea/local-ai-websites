// Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
// Original consent-only model transport. Checkpoints are provisional bytes;
// only the manifest's complete SHA-256 authorises a Blob for the existing SDK.
export const MODEL_CACHE = 'quarto-local-ai-models-v1';
export const MODEL_STORE_CONTROL = 'quarto-local-ai-model-control-v2';
export const MODEL_STORE_CACHE_PREFIX = 'quarto-local-ai-models-v2-';
export const MODEL_STORE_LOCK = 'quarto-local-ai-model-store-v2';
export const MODEL_CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_MODEL_BYTES = 3221225472, MAX_CHUNKS = 1024, MAX_METADATA_BYTES = 262144;
const HEX = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CODES = new Set(['storage-unavailable','quota','locks-unavailable','store-busy',
  'checkpoint-invalid','range-invalid','download-incomplete','download-size',
  'download-failed','digest-mismatch','cancelled','allocation-failed']);
const MESSAGES = Object.freeze({
  'storage-unavailable':'Browser model storage is unavailable.',quota:'Browser model storage quota was refused.',
  'locks-unavailable':'Coordinated browser model storage is unavailable.',
  'store-busy':'Saved model downloads are busy in another operation. Cancel it or retry later.',
  'checkpoint-invalid':'The saved model checkpoint is invalid. Clear saved downloads and retry.',
  'range-invalid':'The server did not provide the exact requested model range. Clear saved downloads and retry.',
  'download-incomplete':'The model download is incomplete.',
  'download-size':'The model download exceeds its declared size.',
  'download-failed':'The author-provided model could not be downloaded.',
  'digest-mismatch':'The model digest does not match the reviewed manifest.',
  cancelled:'The model download was cancelled.',
  'allocation-failed':'This device could not allocate the declared model download/hash buffer.'
});
const failure = (code,storage) => Object.assign(new Error(MESSAGES[code] ?? MESSAGES['storage-unavailable']),
  {code,...(storage?{storage:validateStorageState(storage)}:{})});
const own = (value,allowed) => {
  if (!value || typeof value!=='object' || Array.isArray(value) ||
      ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw failure('checkpoint-invalid');
  for (const key of Reflect.ownKeys(value)) {
    const field=Object.getOwnPropertyDescriptor(value,key);
    if (typeof key!=='string' || !allowed.includes(key) || !field.enumerable || !Object.hasOwn(field,'value'))
      throw failure('checkpoint-invalid');
  }
  return value;
};
const integer = (value,min,max) => Number.isSafeInteger(value) && value>=min && value<=max;
const freeze = value => {if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;};
const check = signal => {if(signal?.aborted)throw failure('cancelled');};
function abortable(promise,signal) {
  check(signal);if(!signal)return Promise.resolve(promise);
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(failure('cancelled'));signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}
const storageCode = error => error?.name==='QuotaExceededError' || error?.code===22 || error?.code===1014 ? 'quota' : 'storage-unavailable';
const notify = (callback,value) => {try{callback(value);}catch{/* Presentation cannot interrupt verification/cleanup. */}};
const digest = async (value,cryptoObject,signal) => {
  check(signal);const result=await abortable(cryptoObject.subtle.digest('SHA-256',value),signal);check(signal);
  return [...new Uint8Array(result)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
};
function ordinaryURL(value,baseURL) {
  if(typeof value!=='string'||value.length>2048||/[\\%\0-\x20]/u.test(value))throw failure('checkpoint-invalid');
  let url,base;try{url=new URL(value);base=baseURL?new URL(baseURL):url;}catch{throw failure('checkpoint-invalid');}
  if(!['https:','http:'].includes(url.protocol)||url.origin!==base.origin||
      globalThis.location?.origin&&url.origin!==globalThis.location.origin||
      url.username||url.password||url.search||url.hash||url.pathname.includes('%'))throw failure('checkpoint-invalid');
  return url.href;
}
function validateModel(value,budget,baseURL) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw failure('checkpoint-invalid');
  for(const field of ['url','bytes','sha256'])if(!Object.hasOwn(Object.getOwnPropertyDescriptor(value,field)??{},'value'))throw failure('checkpoint-invalid');
  if(!integer(budget,1,MAX_MODEL_BYTES)||!integer(value.bytes,1,budget))throw new Error('Model exceeds the declared download/hash budget.');
  if(typeof value.sha256!=='string'||!HEX.test(value.sha256))throw failure('checkpoint-invalid');
  return {url:ordinaryURL(value.url,baseURL),bytes:value.bytes,sha256:value.sha256};
}
export function validateStorageState(value,expectedTotalBytes) {
  own(value,['version','status','reusedBytes','committedBytes','totalBytes','resumeSupported','resumeAuthority','code']);
  if(value.version!==1||!['session-only','partial','saved','unavailable'].includes(value.status)||
      !integer(value.totalBytes,1,MAX_MODEL_BYTES)||expectedTotalBytes!==undefined&&value.totalBytes!==expectedTotalBytes||
      !integer(value.reusedBytes,0,value.totalBytes)||!integer(value.committedBytes,0,value.totalBytes)||
      typeof value.resumeSupported!=='boolean'||!['none','reviewed-sha256','strong-etag-and-reviewed-sha256'].includes(value.resumeAuthority)||
      value.resumeSupported!==(value.resumeAuthority!=='none')||value.code!==undefined&&!CODES.has(value.code)||
      value.status==='partial'&&value.committedBytes>=value.totalBytes||
      value.status==='saved'&&(value.committedBytes!==value.totalBytes||value.code!==undefined)||
      value.status==='unavailable'&&value.committedBytes>=value.totalBytes||
      value.reusedBytes>value.committedBytes||
      value.status==='session-only'&&(value.committedBytes!==0||value.reusedBytes!==0||value.resumeSupported||
        value.code!==undefined&&!['download-incomplete','download-size','download-failed','digest-mismatch','cancelled','allocation-failed'].includes(value.code)))throw failure('checkpoint-invalid');
  return freeze({...value});
}
export function validateClearStorageResult(value) {
  own(value,['version','status','removedCaches','legacyRemoved','code']);
  if(value.version!==1||!['cleared','busy','unavailable','cancelled'].includes(value.status)||
      !integer(value.removedCaches,0,4096)||typeof value.legacyRemoved!=='boolean'||
      value.code!==undefined&&!['storage-unavailable','quota','locks-unavailable','store-busy','cancelled'].includes(value.code)||
      value.legacyRemoved&&value.removedCaches<1||
      value.status==='cleared'&&value.code!==undefined||
      value.status==='busy'&&(value.removedCaches!==0||value.legacyRemoved||value.code!=='store-busy')||
      value.status==='cancelled'&&value.code!=='cancelled'||
      value.status==='unavailable'&&!['storage-unavailable','quota','locks-unavailable'].includes(value.code))throw failure('checkpoint-invalid');
  return freeze({...value});
}
function uuid(cryptoObject) {
  let value=cryptoObject.randomUUID?.();
  if(!value){const bytes=cryptoObject.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');value=hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);}
  if(!UUID.test(value))throw failure('storage-unavailable');return value;
}
const controlKey = url => new URL('/.quarto-local-ai-model-store/v2/control',url).href;
const strongETag = value => typeof value==='string'&&/^"[\x21\x23-\x7e]{1,200}"$/u.test(value)?value:null;
async function smallJSON(response,signal) {
  if(!response?.ok||!response.body)throw failure('checkpoint-invalid');
  const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const {done,value}=await abortable(reader.read(),signal);if(done)break;if(!(value instanceof Uint8Array)||(size+=value.length)>MAX_METADATA_BYTES)throw failure('checkpoint-invalid');parts.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),value=JSON.parse(text);if(JSON.stringify(value)!==text)throw failure('checkpoint-invalid');return value;}
  catch(error){if(error?.code==='cancelled')throw error;throw failure('checkpoint-invalid');}
}
async function readControl(cache,key,signal) {
  check(signal);const response=await abortable(cache.match(key),signal);if(!response)return null;
  const value=own(await smallJSON(response,signal),['version','generation']);
  if(value.version!==2||!UUID.test(value.generation))throw failure('checkpoint-invalid');return value;
}
const jsonResponse = value => new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
function validateCheckpoint(value,{model,identity,generation,chunkBytes}) {
  own(value,['version','generation','identity','model','chunkBytes','committedBytes','chunks','etag','rangeCapable','complete','verifiedSha256']);
  own(value.model,['url','bytes','sha256']);
  if(value.version!==2||value.generation!==generation||value.identity!==identity||JSON.stringify(value.model)!==JSON.stringify(model)||value.chunkBytes!==chunkBytes||
      !integer(value.committedBytes,0,model.bytes)||!Array.isArray(value.chunks)||value.chunks.length>MAX_CHUNKS||
      typeof value.complete!=='boolean'||typeof value.rangeCapable!=='boolean'||value.etag!==null&&strongETag(value.etag)!==value.etag||
      (value.complete?value.verifiedSha256!==model.sha256||value.committedBytes!==model.bytes:value.verifiedSha256!==undefined||value.committedBytes>=model.bytes))throw failure('checkpoint-invalid');
  if(Reflect.ownKeys(value.chunks).length!==value.chunks.length+1)throw failure('checkpoint-invalid');
  let bytes=0;for(let index=0;index<value.chunks.length;index++){
    const item=own(value.chunks[index],['index','bytes','sha256']),expected=Math.min(chunkBytes,model.bytes-index*chunkBytes);
    if(item.index!==index||item.bytes!==expected||!HEX.test(item.sha256)||!value.complete&&item.bytes!==chunkBytes)throw failure('checkpoint-invalid');bytes+=item.bytes;
  }
  if(bytes!==value.committedBytes||value.complete&&value.chunks.length!==Math.ceil(model.bytes/chunkBytes))throw failure('checkpoint-invalid');return value;
}
async function consume(response,buffer,start,model,{signal,onBytes}) {
  if(!response?.ok||!response.body)throw failure('download-failed');
  const reader=response.body.getReader();let bytes=start;
  try{while(true){check(signal);const {done,value}=await abortable(reader.read(),signal);if(done)break;if(!(value instanceof Uint8Array))throw failure('download-failed');if(bytes+value.length>model.bytes)throw failure('download-size');buffer.set(value,bytes);bytes+=value.length;await onBytes?.(bytes);}}
  catch(error){await reader.cancel().catch(()=>{});if(error?.code)throw error;throw failure('download-failed');}finally{reader.releaseLock();}
  if(bytes!==model.bytes)throw failure('download-incomplete');return bytes;
}

/** Explicit download only. Storage is touched only with separately confirmed
 * remember:true. A Range response is provisional until the complete model hash
 * matches, even when an HTTP strong validator is available. */
export async function loadVerifiedModel(value,budget,{
  remember=false,fetchImpl=globalThis.fetch?.bind(globalThis),cryptoObject=globalThis.crypto,
  cacheStorage=globalThis.caches,locksObject=globalThis.navigator?.locks,signal,
  onProgress=()=>{},onVerifying=()=>{},onStorage=()=>{},chunkBytes=MODEL_CHUNK_BYTES,
  baseURL=globalThis.location?.href
}={}) {
  const model=validateModel(value,budget,baseURL);
  if(typeof remember!=='boolean'||typeof fetchImpl!=='function'||!cryptoObject?.subtle?.digest||
      !integer(chunkBytes,1024,MODEL_CHUNK_BYTES)||Math.ceil(model.bytes/chunkBytes)>MAX_CHUNKS||
      [onProgress,onVerifying,onStorage].some(callback=>typeof callback!=='function'))throw failure('checkpoint-invalid');
  check(signal);
  let state=validateStorageState({version:1,status:'session-only',reusedBytes:0,committedBytes:0,totalBytes:model.bytes,resumeSupported:false,resumeAuthority:'none'});
  const update=fields=>{state=validateStorageState({...state,...fields},model.bytes);notify(onStorage,state);};
  const errorState=error=>{const code=CODES.has(error?.code)?error.code:'download-failed';return failure(code,{...state,code});};
  let progress=0;
  const advance=bytes=>{if(bytes>progress&&(bytes===model.bytes||bytes-progress>=1048576)){progress=bytes;notify(onProgress,bytes);}};
  async function allocate(){try{return new Uint8Array(model.bytes);}catch{throw failure('allocation-failed');}}
  async function verify(buffer){check(signal);notify(onVerifying,model.bytes);if(await digest(buffer,cryptoObject,signal)!==model.sha256)throw failure('digest-mismatch');check(signal);return new Blob([buffer],{type:'application/octet-stream'});}
  async function session(code){if(code)update({status:'unavailable',code});else notify(onStorage,state);const buffer=await allocate();let response;try{response=await abortable(fetchImpl(model.url,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store',...(signal?{signal}:{})}),signal);}catch(error){check(signal);if(error?.code==='cancelled')throw error;throw failure('download-failed');}if(response?.status!==200||response.url&&response.url!==model.url)throw failure('download-failed');await consume(response,buffer,0,model,{signal,onBytes:advance});const blob=await verify(buffer);return {blob,storage:state};}
  async function stored(){
    let control,cache,generation,key,identity,metaURL,chunkURL,metadata,writable=true;
    const keyURL=controlKey(model.url);
    try{
      control=await abortable(cacheStorage.open(MODEL_STORE_CONTROL),signal);let pointer=await readControl(control,keyURL,signal);
      if(!pointer){pointer={version:2,generation:uuid(cryptoObject)};await abortable(control.put(keyURL,jsonResponse(pointer)),signal);}
      generation=pointer.generation;cache=await abortable(cacheStorage.open(MODEL_STORE_CACHE_PREFIX+generation),signal);
      identity=await digest(new TextEncoder().encode(JSON.stringify(model)),cryptoObject,signal);
      key=new URL('/.quarto-local-ai-model-store/v2/'+identity+'/',model.url).href;
      metaURL=key+'metadata';chunkURL=index=>key+'chunk-'+index;
    }catch(error){if(error?.code==='cancelled'||error?.code==='checkpoint-invalid')throw error;return session(storageCode(error));}
    const current=async()=>{check(signal);if((await readControl(control,keyURL,signal))?.generation!==generation){update({status:'unavailable',committedBytes:0,reusedBytes:0,resumeSupported:false,resumeAuthority:'none',code:'cancelled'});throw failure('cancelled');}check(signal);};
    const drop=async()=>{await cache.delete(metaURL).catch(()=>{});for(let index=0;index<Math.ceil(model.bytes/chunkBytes);index++)await cache.delete(chunkURL(index)).catch(()=>{});};
    const buffer=await allocate();
    // Preserve verified v1 reuse without automatically duplicating a full old
    // multi-gigabyte response into the chunk store.
    let legacy,legacyResponse;try{legacy=await abortable(cacheStorage.open(MODEL_CACHE),signal);legacyResponse=await abortable(legacy.match(new URL(`./.local-ai-model-cache/${model.sha256}`,model.url).href),signal);}catch(error){if(error?.code==='cancelled')throw error;}
    if(legacyResponse){try{await consume(legacyResponse,buffer,0,model,{signal,onBytes:advance});const blob=await verify(buffer);await current();update({status:'saved',reusedBytes:model.bytes,committedBytes:model.bytes});return{blob,storage:state};}catch(error){if(error?.code!=='cancelled'){await legacy.delete(new URL(`./.local-ai-model-cache/${model.sha256}`,model.url).href).catch(()=>{});update({status:'unavailable',code:CODES.has(error?.code)?error.code:'checkpoint-invalid'});}throw error;}}
    const empty=()=>({version:2,generation,identity,model,chunkBytes,committedBytes:0,chunks:[],etag:null,rangeCapable:false,complete:false});
    try{
      const response=await abortable(cache.match(metaURL),signal);metadata=response?validateCheckpoint(await smallJSON(response,signal),{model,identity,generation,chunkBytes}):empty();
      for(const item of metadata.chunks){
        const response=await abortable(cache.match(chunkURL(item.index)),signal);if(!response?.ok)throw failure('checkpoint-invalid');
        const start=item.index*chunkBytes,target=buffer.subarray(start,start+item.bytes);
        await consume(response,target,0,{bytes:item.bytes},{signal});if(await digest(target,cryptoObject,signal)!==item.sha256)throw failure('checkpoint-invalid');
      }
    }catch(error){if(error?.code==='cancelled')throw error;await drop();update({status:'unavailable',code:'checkpoint-invalid'});throw failure('checkpoint-invalid');}
    const savedAuthority=metadata.rangeCapable?(metadata.etag?'strong-etag-and-reviewed-sha256':'reviewed-sha256'):'none';
    if(metadata.complete){try{advance(model.bytes);const blob=await verify(buffer);await current();update({status:'saved',reusedBytes:model.bytes,committedBytes:model.bytes,resumeSupported:metadata.rangeCapable,resumeAuthority:savedAuthority});return{blob,storage:state};}catch(error){if(error?.code!=='cancelled'){await drop();update({status:'unavailable',committedBytes:0,reusedBytes:0,resumeSupported:false,resumeAuthority:'none',code:error.code??'digest-mismatch'});}throw error;}}
    update({status:'partial',committedBytes:metadata.committedBytes,resumeSupported:metadata.rangeCapable,resumeAuthority:savedAuthority});
    let start=metadata.rangeCapable?metadata.committedBytes:0,response;
    try{response=await abortable(fetchImpl(model.url,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store',
      ...(start?{headers:{Range:`bytes=${start}-`,...(metadata.etag?{'If-Range':metadata.etag}:{})}}:{}),...(signal?{signal}:{})}),signal);}
    catch(error){check(signal);if(error?.code==='cancelled')throw error;throw failure('download-failed');}
    if(!response?.ok||!response.body||response.url&&response.url!==model.url)throw failure(start?'range-invalid':'download-failed');
    if(start&&response.status===206){
      const encoding=response.headers.get('Content-Encoding'),length=response.headers.get('Content-Length');
      if(response.headers.get('Content-Range')!==`bytes ${start}-${model.bytes-1}/${model.bytes}`||
          encoding&&encoding.toLowerCase()!=='identity'||length!==null&&(!/^\d+$/u.test(length)||Number(length)!==model.bytes-start)||
          metadata.etag&&response.headers.get('ETag')!==metadata.etag){await response.body.cancel().catch(()=>{});throw failure('range-invalid');}
      update({reusedBytes:start});advance(start);
    }else if(response.status===200){
      if(metadata.committedBytes){await current();await drop();metadata=empty();start=0;update({committedBytes:0,reusedBytes:0,resumeSupported:false,resumeAuthority:'none'});}
    }else{await response.body.cancel().catch(()=>{});throw failure('range-invalid');}
    const encoding=response.headers.get('Content-Encoding'),rangeCapable=!encoding||encoding.toLowerCase()==='identity';
    metadata={...metadata,etag:strongETag(response.headers.get('ETag')),rangeCapable};
    const authority=rangeCapable?(metadata.etag?'strong-etag-and-reviewed-sha256':'reviewed-sha256'):'none';
    update({resumeSupported:rangeCapable,resumeAuthority:authority});
    async function persistChunk(index,bytes,complete=false){
      const part=buffer.subarray(index*chunkBytes,index*chunkBytes+bytes),record={index,bytes,sha256:await digest(part,cryptoObject,signal)};
      await current();await abortable(cache.put(chunkURL(index),new Response(part,{headers:{'Content-Type':'application/octet-stream'}})),signal);await current();
      const next={...metadata,chunks:[...metadata.chunks,record],committedBytes:metadata.committedBytes+bytes,...(complete?{complete:true,verifiedSha256:model.sha256}:{})};
      await abortable(cache.put(metaURL,jsonResponse(next)),signal);await current();metadata=next;
      update({status:complete?'saved':'partial',committedBytes:metadata.committedBytes});
    }
    const refuseStorage=error=>{writable=false;update({status:'unavailable',code:storageCode(error)});};
    try{
      await consume(response,buffer,start,model,{signal,onBytes:async bytes=>{
        advance(bytes);
        while(writable&&rangeCapable&&(metadata.chunks.length+1)*chunkBytes<=bytes&&(metadata.chunks.length+1)*chunkBytes<model.bytes){
          try{await persistChunk(metadata.chunks.length,chunkBytes);}catch(error){if(error?.code==='cancelled')throw error;refuseStorage(error);}
        }
      }});
      const blob=await verify(buffer);await current();
      if(writable){
        try{
          // An encoded full response has no range-offset authority. Save it only
          // after full verification, so an interrupted encoded stream cannot be
          // advertised as a resumable byte-range checkpoint.
          while(metadata.chunks.length<Math.ceil(model.bytes/chunkBytes)){
            const index=metadata.chunks.length,bytes=Math.min(chunkBytes,model.bytes-index*chunkBytes),last=index===Math.ceil(model.bytes/chunkBytes)-1;
            if(!rangeCapable&&!last){const part=buffer.subarray(index*chunkBytes,index*chunkBytes+bytes),record={index,bytes,sha256:await digest(part,cryptoObject,signal)};await current();await abortable(cache.put(chunkURL(index),new Response(part)),signal);await current();metadata={...metadata,chunks:[...metadata.chunks,record],committedBytes:metadata.committedBytes+bytes};}
            else await persistChunk(index,bytes,last);
          }
        }catch(error){if(error?.code==='cancelled')throw error;refuseStorage(error);}
      }
      check(signal);return{blob,storage:state};
    }catch(error){
      if(error?.code==='digest-mismatch'){await drop();update({status:'unavailable',committedBytes:0,reusedBytes:0,resumeSupported:false,resumeAuthority:'none',code:'digest-mismatch'});}
      throw error;
    }
  }
  try{
    if(!remember)return await session();
    if(!locksObject?.request)return await session('locks-unavailable');
    if(!cacheStorage?.open)return await session('storage-unavailable');
    let began=false;
    try{return await locksObject.request(MODEL_STORE_LOCK,{ifAvailable:true},async lock=>{check(signal);if(!lock){update({status:'unavailable',code:'store-busy'});throw failure('store-busy');}began=true;return stored();});}
    catch(error){if(began||CODES.has(error?.code))throw error;return await session('locks-unavailable');}
  }catch(error){throw errorState(error);}
}

/** Delete only this extension's registered model caches. A tiny fresh generation
 * pointer is retained to invalidate delayed writes from a cancelled worker. */
export async function clearStoredModels({cacheStorage=globalThis.caches,locksObject=globalThis.navigator?.locks,
  cryptoObject=globalThis.crypto,signal,baseURL=globalThis.location?.href}={}) {
  const result=(status,code,removedCaches=0,legacyRemoved=false)=>validateClearStorageResult({version:1,status,removedCaches,legacyRemoved,...(code?{code}:{})});
  if(signal?.aborted)return result('cancelled','cancelled');
  if(!locksObject?.request)return result('unavailable','locks-unavailable');
  if(!cacheStorage?.open||!cacheStorage?.keys||!cacheStorage?.delete)return result('unavailable','storage-unavailable');
  let removed=0,legacyRemoved=false;
  try{return await locksObject.request(MODEL_STORE_LOCK,{ifAvailable:true},async lock=>{
    if(!lock)return result('busy','store-busy');check(signal);
    let key;try{const base=new URL(baseURL);if(!['http:','https:'].includes(base.protocol)||base.username||base.password||globalThis.location?.origin&&base.origin!==globalThis.location.origin)throw failure('storage-unavailable');key=controlKey(base.origin+'/');}catch{return result('unavailable','storage-unavailable');}
    const names=await abortable(cacheStorage.keys(),signal);if(!Array.isArray(names)||names.length>4096||names.some(name=>typeof name!=='string'))return result('unavailable','storage-unavailable');
    const control=await abortable(cacheStorage.open(MODEL_STORE_CONTROL),signal);
    await abortable(control.put(key,jsonResponse({version:2,generation:uuid(cryptoObject)})),signal);check(signal);
    for(const name of names){if(name===MODEL_CACHE||name.startsWith(MODEL_STORE_CACHE_PREFIX)&&UUID.test(name.slice(MODEL_STORE_CACHE_PREFIX.length))){check(signal);const deleted=await abortable(cacheStorage.delete(name),signal);if(deleted){removed++;if(name===MODEL_CACHE)legacyRemoved=true;}}}
    check(signal);return result('cleared',undefined,removed,legacyRemoved);
  });}catch(error){return result(error?.code==='cancelled'?'cancelled':'unavailable',error?.code==='cancelled'?'cancelled':storageCode(error),removed,legacyRemoved);}
}
