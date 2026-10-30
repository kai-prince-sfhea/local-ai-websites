// Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
// Explicitly requested public excerpt payloads, never arbitrary page scraping.
export const EXCERPT_LIMITS=Object.freeze({pages:8,pageBytes:2097152,payloadBytes:1048576,sources:100,text:12000,total:120000,label:256,nativeId:256,url:2048,depth:8,nodes:4096,htmlTags:50000});
const encoder=new TextEncoder(),fail=message=>{throw Error(`local-ai-websites: ${message}`);};
const fragment=id=>'#'+encodeURIComponent(id).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
const scalar=value=>{for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}else if(c>=0xdc00&&c<=0xdfff)return false;}return true;};
const bounded=(value,max,name,{multiline=false}={})=>{if(typeof value!=='string'||!value.trim()||value.length>max||!scalar(value)||(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u:/[\u0000-\u001f\u007f]/u).test(value))fail(`invalid excerpt ${name}`);return value;};
const fields=(value,required,optional=[])=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>![...required,...optional].includes(key))||required.some(key=>!Object.hasOwn(value,key)))fail('invalid public excerpt fields');};
const aborted=signal=>{if(signal?.aborted)throw signal.reason??new DOMException('Aborted','AbortError');};
async function digest(bytes,cryptoImpl){if(!cryptoImpl?.subtle)fail('SHA-256 is unavailable');return [...new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}

export function validateExcerptPageURL(value,baseURL=globalThis.location?.href){
 bounded(value,EXCERPT_LIMITS.url,'page URL');
 if(value!==value.trim()||/[\\\s<>"'\u0000-\u001f\u007f]/u.test(value)||/%(?:2f|5c|25)/iu.test(value))fail('excerpt page must be an ordinary same-origin HTML URL');
 let base,url;try{base=new URL(baseURL);url=new URL(value,base);}catch{fail('invalid excerpt page URL');}
 if(!['http:','https:'].includes(base.protocol)||url.origin!==base.origin||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)fail('excerpt page must remain on this website without a query or fragment');
 // A bounded leading parent prefix supports nested Quarto output pages. No
 // embedded traversal or encoded separator/dot segment can alter that meaning.
 if(value.startsWith('//'))fail('excerpt page must not use a network-path authority');
 let path=value.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/iu,'');let parents=0;
 if(!value.startsWith('/')&&!/^[a-z][a-z0-9+.-]*:/iu.test(value)){while(path.startsWith('../')){parents++;path=path.slice(3);}}
 let decodedInput;try{decodedInput=decodeURIComponent(path);}catch{fail('invalid excerpt page encoding');}
 if(parents>32||decodedInput.split('/').some(part=>part==='.'||part==='..'))fail('invalid excerpt page path');
 let decoded;try{decoded=decodeURIComponent(url.pathname);}catch{fail('invalid excerpt page encoding');}
 if(/[\\\u0000-\u001f\u007f%]/u.test(decoded)||decoded.split('/').some(part=>part==='.'||part==='..')||!decoded.toLowerCase().endsWith('.html'))fail('excerpt page must identify an HTML output file');
 return url.href;
}

// Bounded recursive JSON grammar preserves duplicate-key information, unlike
// JSON.parse of the whole object. No eval, prototype assignment or reviver.
function strictJSON(raw){
 if(encoder.encode(raw).byteLength>EXCERPT_LIMITS.payloadBytes||raw.includes('<'))fail('public excerpt JSON is oversized or has an unescaped delimiter');
 let at=0,nodes=0;const ws=()=>{while(/[\t\n\r ]/u.test(raw[at]??'!'))at++;};
 const string=()=>{const start=at++;let escaped=false;while(at<raw.length){const c=raw[at++];if(c==='"'&&!escaped){let value;try{value=JSON.parse(raw.slice(start,at));}catch{fail('invalid excerpt JSON string');}if(!scalar(value))fail('invalid excerpt JSON Unicode');return value;}if(c==='\\'&&!escaped)escaped=true;else escaped=false;}fail('incomplete excerpt JSON string');};
 const value=depth=>{if(depth>EXCERPT_LIMITS.depth||++nodes>EXCERPT_LIMITS.nodes)fail('public excerpt JSON exceeds its structural budget');ws();const c=raw[at];
  if(c==='"')return string();
  if(c==='{'){at++;const object=Object.create(null),seen=new Set();ws();if(raw[at]==='}'){at++;return object;}while(true){ws();if(raw[at]!=='"')fail('invalid excerpt JSON key');const key=string();if(seen.has(key))fail('duplicate excerpt JSON key');seen.add(key);ws();if(raw[at++]!==':')fail('invalid excerpt JSON object');object[key]=value(depth+1);ws();const next=raw[at++];if(next==='}')return object;if(next!==',')fail('invalid excerpt JSON object');}}
  if(c==='['){at++;const array=[];ws();if(raw[at]===']'){at++;return array;}while(true){array.push(value(depth+1));ws();const next=raw[at++];if(next===']')return array;if(next!==',')fail('invalid excerpt JSON array');}}
  for(const [token,result]of [['true',true],['false',false],['null',null]])if(raw.startsWith(token,at)){at+=token.length;return result;}
  const match=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(raw.slice(at));if(match){at+=match[0].length;const number=Number(match[0]);if(!Number.isFinite(number))fail('nonfinite excerpt JSON number');return number;}fail('invalid excerpt JSON value');
 };const result=value(0);ws();if(at!==raw.length)fail('trailing excerpt JSON content');return result;
}
function entity(value){return value.replace(/&([^;\s]{1,32});/gu,(_,name)=>{const simple={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(Object.hasOwn(simple,name))return simple[name];if(/^#(?:[0-9]+|x[0-9a-f]+)$/iu.test(name)){const number=name[1].toLowerCase()==='x'?parseInt(name.slice(2),16):Number(name.slice(1));if(number>0&&number<=0x10ffff&&!(number>=0xd800&&number<=0xdfff))return String.fromCodePoint(number);}fail('unsupported excerpt anchor entity');});}
function tagAt(html,start){
 let at=start+1,closing=false;if(html[at]==='/'){closing=true;at++;}const name=/^[A-Za-z][A-Za-z0-9:-]*/u.exec(html.slice(at));if(!name)return null;at+=name[0].length;const attrs=Object.create(null);let selfClosing=false;
 while(at<html.length){while(/[\t\n\r\f ]/u.test(html[at]??'!'))at++;if(html[at]==='>')return {name:name[0].toLowerCase(),attrs,end:at+1,closing,selfClosing};if(html[at]==='/'&&html[at+1]==='>'){selfClosing=true;return {name:name[0].toLowerCase(),attrs,end:at+2,closing,selfClosing};}const key=/^[^\s/=>\u0000-\u001f"'<`]+/u.exec(html.slice(at));if(!key)fail('malformed HTML near public excerpt data');at+=key[0].length;const lower=key[0].toLowerCase();if(Object.hasOwn(attrs,lower))fail('duplicate HTML attribute near public excerpt data');while(/[\t\n\r\f ]/u.test(html[at]??'!'))at++;let text='';if(html[at]==='='){at++;while(/[\t\n\r\f ]/u.test(html[at]??'!'))at++;const quote=html[at];if(quote==='"'||quote==="'"){const end=html.indexOf(quote,++at);if(end<0)fail('incomplete HTML attribute near public excerpt data');text=html.slice(at,end);at=end+1;}else{const val=/^[^\s>"'`=<]+/u.exec(html.slice(at));if(!val)fail('invalid HTML attribute near public excerpt data');text=val[0];at+=text.length;}}attrs[lower]=text;
 }fail('incomplete HTML near public excerpt data');
}
function payloadFromHTML(html){
 const ids=new Map(),eligibleIds=new Set(),payloads=[];let at=0,templateDepth=0,tags=0,inSelect=false;
 const rawTags=new Set(['script','style','textarea','title','xmp','iframe','noembed','noframes','noscript']);
 while(at<html.length){const start=html.indexOf('<',at);if(start<0)break;
  if(html.startsWith('<!--',start)){const end=html.indexOf('-->',start+4);if(end<0)fail('incomplete HTML comment');at=end+3;continue;}
  // A foreign-content CDATA section is literal text. Treat it conservatively
  // the same way outside SVG/MathML rather than infer an anchor from its body.
  if(html.startsWith('<![CDATA[',start)){const end=html.indexOf(']]>',start+9);if(end<0)fail('incomplete HTML CDATA');at=end+3;continue;}
  // HTML bogus comments/processing instructions end at the next >. Their
  // interior markup is never an admitted native element.
  if(html.startsWith('<!',start)||html.startsWith('<?',start)){const end=html.indexOf('>',start+2);if(end<0)fail('incomplete HTML declaration');at=end+1;continue;}
  const tag=tagAt(html,start);if(!tag){at=start+1;continue;}if(++tags>EXCERPT_LIMITS.htmlTags)fail('excerpt HTML exceeds its token budget');at=tag.end;
  if(inSelect&&!['option','optgroup','hr','script','template',...(tag.closing?['select']:[])].includes(tag.name))fail('unsupported markup inside an excerpt-page select');
  if(tag.closing){if(tag.name==='template')templateDepth=Math.max(0,templateDepth-1);if(tag.name==='select')inSelect=false;continue;}
  if(tag.name==='select')inSelect=true;
  // Raw/inert elements own real document IDs even though their interior is
  // not excerpt content. Count those IDs for collisions without admitting
  // their bodies (or a template's DocumentFragment) as a content source.
  if(!templateDepth&&Object.hasOwn(tag.attrs,'id')){const id=entity(tag.attrs.id);ids.set(id,(ids.get(id)??0)+1);if(!rawTags.has(tag.name)&&!['template','plaintext'].includes(tag.name))eligibleIds.add(id);}
  if(tag.name==='plaintext')break;
  if(tag.name==='template'){templateDepth++;continue;}
  if(rawTags.has(tag.name)){
   const close=new RegExp('</'+tag.name+'\\s*>','giu');close.lastIndex=at;const match=close.exec(html);if(!match)fail('incomplete raw HTML element');
   const marker=(tag.attrs.class??'').split(/[\t\n\r\f ]+/u).includes('local-ai-public-data');
   if(marker){if(tag.name!=='script'||templateDepth||tag.selfClosing||tag.attrs.type!=='application/json'||tag.attrs.class!=='local-ai-public-data'||Object.keys(tag.attrs).some(key=>!['type','class'].includes(key)))fail('invalid public excerpt script marker');payloads.push(html.slice(at,match.index));}
   at=close.lastIndex;continue;
  }
 }
 if(payloads.length!==1)fail('exactly one native public excerpt payload is required');
 return {payload:strictJSON(payloads[0]),ids,eligibleIds};
}

export async function parseExcerptPage(bytes,pageURL,{baseURL=pageURL,cryptoImpl=globalThis.crypto,signal}={}){
 aborted(signal);const url=validateExcerptPageURL(pageURL,baseURL);if(!(bytes instanceof Uint8Array)||bytes.byteLength>EXCERPT_LIMITS.pageBytes)fail('excerpt page exceeds its byte budget');bytes=bytes.slice();
 let html;try{html=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('excerpt page is not valid UTF-8');}
 const {payload,ids,eligibleIds}=payloadFromHTML(html);fields(payload,['version','lang','sources']);
 if(payload.version!==1||!Array.isArray(payload.sources)||payload.sources.length>EXCERPT_LIMITS.sources)fail('unsupported public excerpt payload');
 const lang=bounded(payload.lang,64,'language');if(!/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/iu.test(lang))fail('invalid excerpt language');
 const pageSha256=await digest(bytes,cryptoImpl),seen=new Set(),sources=[];let textCharacters=0,textBytes=0;
 for(const raw of payload.sources){fields(raw,['id','label','text','url','review'],['graphId']);const nativeId=bounded(raw.id,EXCERPT_LIMITS.nativeId,'native identifier');
  if(/[\s"'<>#\u0000-\u001f\u007f]/u.test(nativeId)||seen.has(nativeId)||ids.get(nativeId)!==1||!eligibleIds.has(nativeId))fail('excerpt identifier must name one unique native anchor');seen.add(nativeId);
  const label=bounded(raw.label,EXCERPT_LIMITS.label,'label'),text=bounded(raw.text,EXCERPT_LIMITS.text,'text',{multiline:true});
  if(raw.url!==fragment(nativeId)||!['declared','author-reviewed'].includes(raw.review))fail('invalid excerpt destination or review');
  if(raw.graphId!==undefined&&(typeof raw.graphId!=='string'||!/^[a-z][a-z0-9-]{0,63}$/u.test(raw.graphId)))fail('invalid excerpt graph identity');
  textCharacters+=text.length;textBytes+=encoder.encode(text).byteLength;if(textCharacters>EXCERPT_LIMITS.total||textBytes>EXCERPT_LIMITS.total)fail('selected excerpt text exceeds its total budget');
  const id='excerpt:'+await digest(encoder.encode(JSON.stringify({pageURL:url,nativeId})),cryptoImpl),textSha256=await digest(encoder.encode(text),cryptoImpl);aborted(signal);
  sources.push(Object.freeze({id,nativeId,pageURL:url,label,text,url:url+fragment(nativeId),lang,review:raw.review,...(raw.graphId===undefined?{}:{graphId:raw.graphId}),textSha256,pageSha256,discoveryOnly:false,publication:'declared-public-excerpt',supportStatus:'not-verified'}));
 }
 aborted(signal);return Object.freeze({version:1,sources:Object.freeze(sources),provenance:Object.freeze({pageURL:url,pageSha256,lang,sourceCount:sources.length,textCharacters,textBytes,format:'local-ai-public-data-v1',publication:'native-declared-public-excerpts',supportStatus:'not-verified'})});
}
async function pageBytes(url,fetchImpl,signal){
 const response=await fetchImpl(url,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal});aborted(signal);
 if(!response?.ok||response.redirected||response.url!==url||!response.body||!/^text\/html(?:\s*;|$)/iu.test(response.headers.get('content-type')??''))fail('selected excerpt page is unavailable or redirected');
 const length=response.headers.get('content-length');if(length!==null&&(!/^[0-9]+$/u.test(length)||Number(length)>EXCERPT_LIMITS.pageBytes))fail('excerpt page exceeds its declared byte budget');
 const reader=response.body.getReader(),chunks=[];let count=0;
 try{while(true){aborted(signal);const {done,value}=await reader.read();if(done)break;if(!(value instanceof Uint8Array))fail('invalid excerpt response bytes');count+=value.byteLength;if(count>EXCERPT_LIMITS.pageBytes)fail('excerpt page exceeds its byte budget');chunks.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 const bytes=new Uint8Array(count);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}return bytes;
}
export async function loadExcerptCatalogue(pageURLs,{baseURL=globalThis.location?.href,fetchImpl=globalThis.fetch?.bind(globalThis),cryptoImpl=globalThis.crypto,signal}={}){
 if(!Array.isArray(pageURLs)||pageURLs.length<1||pageURLs.length>EXCERPT_LIMITS.pages||Object.keys(pageURLs).length!==pageURLs.length||Object.keys(pageURLs).some((key,index)=>key!==String(index))||typeof fetchImpl!=='function')fail('select one to eight excerpt pages');
 const urls=pageURLs.map(url=>validateExcerptPageURL(url,baseURL));if(new Set(urls).size!==urls.length)fail('selected excerpt pages must be unique');
 const sources=[],provenance=[];let textCharacters=0,textBytes=0;
 for(const url of urls){aborted(signal);const page=await parseExcerptPage(await pageBytes(url,fetchImpl,signal),url,{baseURL,cryptoImpl,signal});
  textCharacters+=page.provenance.textCharacters;textBytes+=page.provenance.textBytes;if(sources.length+page.sources.length>EXCERPT_LIMITS.sources||textCharacters>EXCERPT_LIMITS.total||textBytes>EXCERPT_LIMITS.total)fail('selected excerpt catalogue exceeds its total budget');
  sources.push(...page.sources);provenance.push(page.provenance);
 }
 aborted(signal);return Object.freeze({version:1,sources:Object.freeze(sources),provenance:Object.freeze(provenance),coverage:Object.freeze({status:'selected-excerpts-loaded',scope:'explicit-selected-page-excerpts',pagesRequested:urls.length,pagesLoaded:provenance.length,sourceCount:sources.length,textCharacters,textBytes,wholePage:false,wholeWebsite:false,supportStatus:'not-verified'})});
}
