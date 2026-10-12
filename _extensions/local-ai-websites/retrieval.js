// Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
// Page-local lexical discovery. Scores do not establish semantic identity or truth.
export const LIMITS = Object.freeze({sources:100,text:12000,total:120000,label:256,query:1500});
const fail = message => { throw new Error(`local-ai-websites: ${message}`); };
const mapping = value => value && typeof value === 'object' && !Array.isArray(value);
const fragment = value => '#' + encodeURIComponent(value).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
const keys = (value,allowed,name) => {
  if(!mapping(value)) fail(`${name} must be an object`);
  if(Object.keys(value).some(key=>!allowed.includes(key))) fail(`${name} contains an unsupported field`);
};
const bounded = (value,limit,name) => {
  if(typeof value!=='string'||!value.trim()||value.length>limit) fail(`${name} must be nonblank text within ${limit} characters`);
  return value;
};
export function validateManifestURL(value) {
  if(value===null) return null;
  bounded(value,2048,'manifest');
  // A site-relative file, including an ordinary root-relative path; no remote URL,
  // encoded components, credentials, query, fragment or platform-specific path.
  if(value!==value.trim()||value.includes('\\')||/[:?#<>"'\s\u0000-\u001f\u007f]/u.test(value)||value.startsWith('//')||/%/u.test(value)) fail('manifest must be a local URL path');
  // Quarto emits a relative URL from a nested output page to an author-validated
  // project resource. Only a bounded leading parent prefix is valid here; the
  // runtime independently confines the final resolved URL to this site origin.
  let rest=value,parents=0;
  while(rest.startsWith('../')) {parents++;rest=rest.slice(3);}
  if(parents>32||(parents&&rest.startsWith('/'))||rest.split('/').some((part,index)=>part==='.'||part==='..'||(!part&&index!==0))) fail('manifest path has invalid traversal or empty components');
  if(!/\.json$/i.test(value)) fail('manifest path must end in .json');
  return value;
}
export function validatePayload(value) {
  keys(value,['version','sources','manifest'],'payload');
  if(value.version!==0||!Array.isArray(value.sources)||value.sources.length>LIMITS.sources) fail('payload needs version 0 and at most 100 sources');
  const manifest=validateManifestURL(value.manifest),seen=new Set();let total=0;
  const sources=value.sources.map(raw=>{
    keys(raw,['id','text','label','url'],'source');
    const id=bounded(raw.id,256,'source id');
    if(/[\s"'<>#\u0000-\u001f\u007f]/u.test(id)||seen.has(id)) fail('source anchors must be unique and contain no whitespace or unsafe delimiters');
    seen.add(id);
    const text=bounded(raw.text,LIMITS.text,'source text'),label=bounded(raw.label,LIMITS.label,'source label');
    if(raw.url!==fragment(id)) fail('source URL must identify its canonical page anchor');
    total+=text.length;if(total>LIMITS.total) fail('source text exceeds the 120000-character page budget');
    return Object.freeze({id,text,label,url:raw.url});
  });
  return Object.freeze({version:0,sources:Object.freeze(sources),manifest});
}
function words(value) {
  return value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)??[];
}
export function boundedText(value,limit) {
  let end=Math.min(value.length,limit);
  if(end<value.length&&end>0&&/[\ud800-\udbff]/u.test(value[end-1])&&/[\udc00-\udfff]/u.test(value[end])) end--;
  return value.slice(0,end);
}
function validateRankingRequest(query,limit) {
  if(typeof query!=='string'||query.length>LIMITS.query) fail('query must be text within 1500 characters');
  if(!Number.isInteger(limit)||limit<1||limit>100) fail('result limit must be 1 to 100');
}
// The returned sources are defensive, frozen copies. Token sets and postings
// remain private so repeated queries can reuse them without mutable public state.
export function createSourceIndex(sources) {
  const data=validatePayload({version:0,sources,manifest:null}),identities=new Map(),postings=new Map();
  const entries=data.sources.map((source,position)=>{
    const titleWords=words(source.label),textWords=words(source.text),title=new Set(titleWords),body=new Set(textWords);
    identities.set(source.id,position);
    for(const term of new Set([...title,...body])) {
      const positions=postings.get(term)??[];positions.push(position);postings.set(term,positions);
    }
    return {source,position,title,body,titlePhrase:' '+titleWords.join(' ')+' ',bodyPhrase:' '+textWords.join(' ')+' ',
      excerpt:boundedText(source.text,360)};
  });
  return Object.freeze({sources:data.sources,rank(query,limit=10) {
    validateRankingRequest(query,limit);
    const queryWords=words(query),terms=[...new Set(queryWords)];
    // Source identity is an exact, case-sensitive lookup, distinct from word ranking.
    const requestedId=query.trim().replace(/^#/u,''),identified=identities.get(requestedId);
    if(identified!==undefined) {
      const entry=entries[identified];
      return [{...entry.source,score:1000,matchedTerms:[],totalTerms:terms.length,exact:true,exactId:true,
        position:entry.position,excerpt:entry.excerpt}];
    }
    if(!terms.length) return [];
    const phrase=' '+queryWords.join(' ')+' ',candidates=new Set();
    for(const term of terms) for(const position of postings.get(term)??[]) candidates.add(position);
    const matches=[...candidates].map(position=>{
      const entry=entries[position],matched=terms.filter(term=>entry.title.has(term)||entry.body.has(term));
      const exact=entry.titlePhrase.includes(phrase)||entry.bodyPhrase.includes(phrase);
      const titleHits=matched.filter(term=>entry.title.has(term)).length;
      const score=(matched.length===terms.length?100:0)+matched.length/terms.length*20+(exact?10:0)+titleHits*2;
      return {...entry.source,score,matchedTerms:matched,totalTerms:terms.length,exact,position,excerpt:entry.excerpt};
    });
    matches.sort((a,b)=>b.score-a.score||a.position-b.position);
    return matches.slice(0,limit);
  }});
}
export function rankSources(sources,query,limit=10) {
  // Preserve the original request-before-source error precedence for callers.
  validateRankingRequest(query,limit);
  return createSourceIndex(sources).rank(query,limit);
}
export function cosine(left,right) {
  if(!Array.isArray(left)||!Array.isArray(right)||left.length!==right.length||!left.length||left.length>768||
    [...left,...right].some(value=>typeof value!=='number'||!Number.isFinite(value))) fail('embedding vectors must have matching finite dimensions');
  const a=Math.hypot(...left),b=Math.hypot(...right);
  if(!Number.isFinite(a)||!Number.isFinite(b)||a<=0||b<=0) fail('embedding vectors require finite nonzero norms');
  return left.reduce((sum,value,index)=>sum+(value/a)*(right[index]/b),0);
}
