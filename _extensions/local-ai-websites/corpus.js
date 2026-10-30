// Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
import {parseExcerptPage,validateExcerptPageURL} from './excerpt-catalogue.js';
export const CORPUS_LIMITS=Object.freeze({pages:64,pageBytes:2097152,responseBytes:16777216,records:512,text:1048576,chunks:2048,chunkCharacters:4000,overlap:400,query:1500});
const owned=new WeakSet(),encoder=new TextEncoder();
export const corpusFreeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))corpusFreeze(item);Object.freeze(value);}return value;};
export const corpusCanonical=value=>value!==null&&typeof value==='object'?(Array.isArray(value)?'['+value.map(corpusCanonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+corpusCanonical(value[key])).join(',')+'}'):JSON.stringify(value);
export async function corpusDigest(value,cryptoImpl=globalThis.crypto){if(!cryptoImpl?.subtle)throw Error('corpus-crypto-unavailable');return [...new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',encoder.encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
const fail=code=>{const error=Error(code);error.code=code;throw error;};
const current=(signal,isCurrent)=>{if(signal?.aborted)throw signal.reason??new DOMException('Cancelled','AbortError');if(isCurrent&&isCurrent()!==true)fail('corpus-stale');};
export function assertPublicCorpus(value){if(!owned.has(value))fail('corpus-not-observed');return value;}
function selectedURL(value,baseURL){
 const url=validateExcerptPageURL(value,baseURL),path=decodeURIComponent(new URL(url).pathname);
 if(path.split('/').some(part=>part.startsWith('.')||['_extensions','node_modules','site_libs','local-ai-assets'].includes(part.toLowerCase())))fail('corpus-private-path');return url;
}
async function readPage(url,state,{fetchImpl,signal,isCurrent}){
 current(signal,isCurrent);const response=await fetchImpl(url,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store',signal});current(signal,isCurrent);
 if(!response?.ok||response.redirected||response.url!==url||!response.body||!/^text\/html(?:\s*;|$)/i.test(response.headers.get('content-type')??''))fail('corpus-page-unavailable');
 const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>CORPUS_LIMITS.pageBytes||state.bytes+Number(length)>CORPUS_LIMITS.responseBytes))fail('corpus-response-budget');
 const reader=response.body.getReader(),chunks=[];let count=0;
 try{for(;;){current(signal,isCurrent);const{done,value}=await reader.read();current(signal,isCurrent);if(done)break;if(!(value instanceof Uint8Array))fail('corpus-response-bytes');count+=value.byteLength;state.bytes+=value.byteLength;if(count>CORPUS_LIMITS.pageBytes||state.bytes>CORPUS_LIMITS.responseBytes)fail('corpus-response-budget');chunks.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 const bytes=new Uint8Array(count);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}return bytes;
}
/** Explicit action only. A failed or cancelled replacement returns no partial
 * catalogue. Bytes bind observed responses, not a shared website-build claim. */
export async function loadPublicCorpus(pageURLs,{baseURL=globalThis.location?.href,fetchImpl=globalThis.fetch?.bind(globalThis),cryptoImpl=globalThis.crypto,signal,isCurrent,onProgress}={}){
 if(!Array.isArray(pageURLs)||!pageURLs.length||pageURLs.length>CORPUS_LIMITS.pages||Object.keys(pageURLs).length!==pageURLs.length||typeof fetchImpl!=='function')fail('corpus-page-selection');
 const urls=pageURLs.map(value=>selectedURL(value,baseURL));if(new Set(urls).size!==urls.length)fail('corpus-duplicate-page');
 const pages=[],sources=[],ids=new Set(),state={bytes:0};let textCharacters=0;
 for(const url of urls){
  const bytes=await readPage(url,state,{fetchImpl,signal,isCurrent}),page=await parseExcerptPage(bytes,url,{baseURL,cryptoImpl,signal});current(signal,isCurrent);
  for(const source of page.sources){if(ids.has(source.id))fail('corpus-duplicate-record');ids.add(source.id);sources.push(source);textCharacters+=source.text.length;}
  if(sources.length>CORPUS_LIMITS.records||textCharacters>CORPUS_LIMITS.text)fail('corpus-text-budget');
  pages.push({...page.provenance,bytes:bytes.byteLength});if(onProgress)onProgress(Object.freeze({pagesLoaded:pages.length,pagesRequested:urls.length,records:sources.length,responseBytes:state.bytes}));
 }
 const identity={version:1,kind:'local-ai-public-corpus',pages:pages.map(page=>({url:page.pageURL,sha256:page.pageSha256})),sources:sources.map(source=>({id:source.id,textSha256:source.textSha256,pageSha256:source.pageSha256}))};
 const snapshot=await corpusDigest(corpusCanonical(identity),cryptoImpl);current(signal,isCurrent);
 const result=corpusFreeze({version:1,kind:'local-ai-public-corpus',snapshot,sources:[...sources],pages,coverage:{status:'selected-public-records-loaded',pagesRequested:urls.length,pagesLoaded:pages.length,records:sources.length,textCharacters,responseBytes:state.bytes,wholeWebsite:false,sharedBuild:'not-established',freshness:'observed-responses-only',supportStatus:'not-verified'}});owned.add(result);return result;
}
export function corpusWords(text){return text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)??[];}
const edge=(text,at)=>at>0&&at<text.length&&/[\ud800-\udbff]/.test(text[at-1])&&/[\udc00-\udfff]/.test(text[at]);
const tokens=text=>[...text.matchAll(/[\p{L}\p{N}\p{M}]+(?:['’-][\p{L}\p{N}\p{M}]+)*/gu)].map(match=>({start:match.index,end:match.index+match[0].length,words:corpusWords(match[0])}));
export function createCorpusIndex(corpus){
 assertPublicCorpus(corpus);const records=new Map(),postings=new Map(),chunks=[];
 corpus.sources.forEach((source,position)=>{
  records.set(source.id,{source,position,title:new Set(corpusWords(source.label)),tokens:tokens(source.text)});
  let start=0;for(;;){let end=Math.min(source.text.length,start+CORPUS_LIMITS.chunkCharacters);if(edge(source.text,end))end--;const id='chunk:'+source.id+':'+source.textSha256+':'+start+':'+end;
   const terms=new Set([...corpusWords(source.label),...corpusWords(source.text.slice(start,end))]),chunk={id,sourceId:source.id,start,end,terms};const offset=chunks.length;chunks.push(chunk);for(const term of terms){const list=postings.get(term)??[];list.push(offset);postings.set(term,list);}if(end===source.text.length)break;start=end-CORPUS_LIMITS.overlap;if(edge(source.text,start))start--;
  }
 });
 if(chunks.length>CORPUS_LIMITS.chunks)fail('corpus-chunk-budget');
 const index={snapshot:corpus.snapshot,sources:corpus.sources,chunkCount:chunks.length,lookup(id){return records.get(id)?.source??null;},tokens(id){return records.get(id)?.tokens.map(token=>({...token,words:[...token.words]}))??null;},rank(query,{limit=10,match='any',graphIds,languages,review='any'}={}){
  if(typeof query!=='string'||query.length>CORPUS_LIMITS.query||!Number.isInteger(limit)||limit<1||limit>100||!['all','any'].includes(match)||!['any','declared','author-reviewed'].includes(review))fail('corpus-query');
  const filter=(value,pattern)=>{if(value===undefined)return null;if(!Array.isArray(value)||!value.length||value.length>64||new Set(value).size!==value.length||value.some(item=>typeof item!=='string'||!pattern.test(item)))fail('corpus-filter');return new Set(value.map(item=>item.toLowerCase()));};
  const graphs=filter(graphIds,/^[a-z][a-z0-9-]{0,63}$/),langs=filter(languages,/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/),eligible=source=>(review==='any'||source.review===review)&&(!graphs||graphs.has(source.graphId))&&(!langs||langs.has(source.lang.toLowerCase()));
  const exact=records.get(query.trim());if(exact&&eligible(exact.source))return[corpusFreeze({...exact.source,position:exact.position,score:1000,exactId:true,matchedTerms:[],totalTerms:0})];
  const terms=[...new Set(corpusWords(query))];if(!terms.length)return[];const candidates=new Set();for(const term of terms)for(const chunk of postings.get(term)??[])candidates.add(chunk);
  const best=new Map();for(const offset of candidates){const chunk=chunks[offset],record=records.get(chunk.sourceId);if(!eligible(record.source))continue;const matched=terms.filter(term=>chunk.terms.has(term));if(match==='all'&&matched.length!==terms.length)continue;const title=matched.filter(term=>record.title.has(term)).length,score=matched.length/terms.length*20+(matched.length===terms.length?100:0)+title*2,prior=best.get(record.source.id);
   if(!prior||prior.score<score)best.set(record.source.id,{...record.source,position:record.position,score,exactId:false,matchedTerms:matched,totalTerms:terms.length,chunk:{id:chunk.id,start:chunk.start,end:chunk.end}});
  }
  return [...best.values()].sort((a,b)=>b.score-a.score||a.position-b.position).slice(0,limit).map(corpusFreeze);
 }};return Object.freeze(index);
}
