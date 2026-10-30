// Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
import {assertPublicCorpus,corpusCanonical,corpusDigest,corpusFreeze,corpusWords} from './corpus.js';
import {buildProposalRequest,QUOTE_PROPOSAL_FORMAT} from './proposal.js';
const fail=code=>{const error=Error(code);error.code=code;throw error;};
const boundary=(text,at)=>!(at>0&&at<text.length&&/[\ud800-\udbff]/.test(text[at-1])&&/[\udc00-\udfff]/.test(text[at]));
const current=({signal,isCurrent})=>{if(signal?.aborted)throw signal.reason??new DOMException('Cancelled','AbortError');if(isCurrent&&isCurrent()!==true)fail('corpus-evidence-stale');};
const trimRange=(text,start,end)=>{while(start<end&&/\s/u.test(text[start]))start++;while(end>start&&/\s/u.test(text[end-1]))end--;return{start,end};};
const terminal=/[.!?。！？]/u,closer=/["'’”»\])}]/u;
/** A deliberately finite boundary rule, not a sentence parser or an assertion
 * that surrounding conditions are semantically complete. A bounded paragraph
 * stays intact. Only oversized paragraphs are split at terminal punctuation;
 * common initials/abbreviations, decimals and ellipses are not split. */
function evidenceUnits(text,maxCharacters){
 const paragraphs=[];let start=0,previous=null;
 const addParagraph=end=>{const range=trimRange(text,start,end);if(range.end>range.start)paragraphs.push(range);};
 for(const match of text.matchAll(/\r\n|\r|\n/gu)){
  if(previous&&/^[\t ]*$/u.test(text.slice(previous.end,match.index))){addParagraph(previous.start);start=match.index+match[0].length;}
  previous={start:match.index,end:match.index+match[0].length};
 }
 addParagraph(text.length);const units=[];
 paragraphs.forEach((paragraph,paragraphIndex)=>{
  if(paragraph.end-paragraph.start<=maxCharacters){units.push({...paragraph,kind:'paragraph',paragraphIndex});return;}
  let from=paragraph.start;
  for(let at=from;at<paragraph.end;at++){
   if(!terminal.test(text[at]))continue;
   if(text[at]==='.'&&(text[at-1]==='.'||text[at+1]==='.'||/[0-9]/u.test(text[at-1]??'')&&/[0-9]/u.test(text[at+1]??'')))continue;
   if(text[at]==='.'){
    const word=/([\p{L}.]+)$/u.exec(text.slice(Math.max(paragraph.start,at-24),at))?.[1]??'';
    if(/^\p{L}$/u.test(word)||/^(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e)$/iu.test(word)||/^(?:\p{L}\.)+\p{L}$/u.test(word))continue;
   }
   let end=at+1;while(end<paragraph.end&&/[!?。！？]/u.test(text[end]))end++;while(end<paragraph.end&&closer.test(text[end]))end++;
   if(end<paragraph.end&&!/\s/u.test(text[end]))continue;
   const range=trimRange(text,from,end);if(range.end>range.start)units.push({...range,kind:'sentence',paragraphIndex});from=end;at=end-1;
  }
  const range=trimRange(text,from,paragraph.end);if(range.end>range.start)units.push({...range,kind:'sentence',paragraphIndex});
 });
 return{paragraphs,units};
}
/** NFKC is used for discovery only. Generation evidence contains complete
 * bounded lexical units and exact original text, never an arbitrary substring
 * that truncates a word or sentence to satisfy the model budget. */
export function selectEvidenceWindow(index,sourceId,question,{maxCharacters=4000}={}){
 const source=index.lookup(sourceId);if(!source||typeof question!=='string'||!question.trim()||question.length>1500||!Number.isInteger(maxCharacters)||maxCharacters<128||maxCharacters>4000)fail('corpus-evidence-window');
 const text=source.text,terms=new Set(corpusWords(question)),hits=index.tokens(sourceId).map(token=>({...token,matched:token.words.filter(word=>terms.has(word))})).filter(token=>token.matched.length),{paragraphs,units}=evidenceUnits(text,maxCharacters);
 let hitAt=0;for(const unit of units){unit.matched=new Map();unit.hitCount=0;while(hitAt<hits.length&&hits[hitAt].start<unit.start)hitAt++;for(;hitAt<hits.length&&hits[hitAt].end<=unit.end;hitAt++){const hit=hits[hitAt];unit.firstHit??=hit.start;unit.lastHit=hit.end;unit.hitCount++;for(const term of hit.matched)unit.matched.set(term,(unit.matched.get(term)??0)+1);}}
 let best=null;
 if(!hits.length){
  if(units[0]&&units[0].end-units[0].start<=maxCharacters){let last=0;while(last+1<units.length&&units[last+1].end-units[0].start<=maxCharacters)last++;best={first:0,last};}
 }else{
  let left=0,count=0,counts=new Map(),activeHits=[],firstActive=0;
  for(let right=0;right<units.length;right++){
   const unit=units[right];if(unit.end-unit.start>maxCharacters){left=right+1;count=0;counts=new Map();activeHits=[];firstActive=0;continue;}
   for(const[term,n]of unit.matched)counts.set(term,(counts.get(term)??0)+n);count+=unit.hitCount;if(unit.hitCount)activeHits.push(right);
   while(unit.end-units[left].start>maxCharacters){const removed=units[left++];count-=removed.hitCount;for(const[term,n]of removed.matched){const next=counts.get(term)-n;if(next)counts.set(term,next);else counts.delete(term);}}
   while(firstActive<activeHits.length&&activeHits[firstActive]<left)firstActive++;
   if(!count)continue;
   const candidate={first:left,last:right,terms:counts.size,count,margin:Math.min(units[activeHits[firstActive]].firstHit-units[left].start,unit.end-units[activeHits.at(-1)].lastHit),width:unit.end-units[left].start};
   if(!best||candidate.terms>best.terms||candidate.terms===best.terms&&(candidate.count>best.count||candidate.count===best.count&&(candidate.margin>best.margin||candidate.margin===best.margin&&candidate.width>best.width)))best=candidate;
  }
 }
 const selectedUnits=best?best.last-best.first+1:0,start=best?units[best.first].start:null,end=best?units[best.last].end:null;
 const unitCoverage={boundaryMethod:'paragraphs-terminal-punctuation-v1',status:best?'complete-selected-units':'no-bounded-complete-unit',paragraphs:paragraphs.length,units:units.length,selectedUnits,omittedUnits:units.length-selectedUnits,oversizedUnits:units.filter(unit=>unit.end-unit.start>maxCharacters).length,omittedMatchingUnits:units.filter((unit,i)=>unit.hitCount&&(!best||i<best.first||i>best.last)).length,sourceCharacters:text.length,selectedCharacters:best?end-start:0,omittedCharacters:text.length-(best?end-start:0),semanticCompleteness:'not-established'};
 if(!best)return corpusFreeze({status:'unavailable',sourceId,reason:hits.length?'query-unit-exceeds-budget':'prefix-unit-exceeds-budget',maxCharacters,unitCoverage,qualification:'No arbitrary character clipping was used. A complete lexical unit exceeds the evidence budget; shorten the explicitly selected source excerpt or select another source.'});
 const reason=text.length<=maxCharacters?'full-selected-excerpt':hits.length?'query-centred-complete-units':question.trim()===sourceId?'exact-identity-complete-prefix':'no-lexical-match-complete-prefix';
 return corpusFreeze({status:'available',sourceId,start,end,text:text.slice(start,end),reason,clippedStart:start>0,clippedEnd:end<text.length,matchedTerms:[...new Set(hits.filter(hit=>hit.start>=start&&hit.end<=end).flatMap(hit=>hit.matched))],unitCoverage,qualification:'Exact complete lexical units from the selected excerpt. Omitted context, semantic completeness and citation support are not established.'});
}
const selections=new WeakMap();
/** Snapshot binds both corpus and exact range mapping, with no worker protocol
 * change. The model sees ordinary existing evidence records and no permissions. */
export async function buildEvidenceSelection(corpus,index,question,sourceIds,{cryptoImpl=globalThis.crypto,context,signal,isCurrent,maxCharacters=4000,format=QUOTE_PROPOSAL_FORMAT}={}){
 assertPublicCorpus(corpus);if(index.snapshot!==corpus.snapshot||!Array.isArray(sourceIds)||!sourceIds.length||sourceIds.length>4||new Set(sourceIds).size!==sourceIds.length)fail('corpus-evidence-selection');current({signal,isCurrent});
 const perWindow=Math.min(maxCharacters,Math.floor(12000/sourceIds.length)),windows=[];
 for(const id of sourceIds){const source=index.lookup(id);if(!source||source.discoveryOnly!==false)fail('corpus-source-not-evidence');const window=selectEvidenceWindow(index,id,question,{maxCharacters:perWindow});if(window.status!=='available'){const error=Error('corpus-evidence-unit-unavailable');error.code='corpus-evidence-unit-unavailable';error.window=window;throw error;}const textSha256=await corpusDigest(window.text,cryptoImpl);current({signal,isCurrent});
  const identity={version:1,sourceId:id,sourceTextSha256:source.textSha256,start:window.start,end:window.end,textSha256};const windowId='window:'+await corpusDigest(corpusCanonical(identity),cryptoImpl);current({signal,isCurrent});
  windows.push({...window,id:windowId,sourceTextSha256:source.textSha256,pageSha256:source.pageSha256,textSha256,url:source.url,pageURL:source.pageURL,nativeId:source.nativeId,review:source.review,language:source.lang,graphId:source.graphId??null});
 }
 const querySha256=await corpusDigest(question,cryptoImpl),receipt={version:1,kind:'local-ai-corpus-evidence-windows',coordinateSpace:'selected-public-excerpt',coordinateUnits:'utf16-code-units',corpusSnapshot:corpus.snapshot,querySha256,windows,coverage:{unitStatus:'complete-selected-units',selectedUnits:windows.reduce((n,w)=>n+w.unitCoverage.selectedUnits,0),omittedUnits:windows.reduce((n,w)=>n+w.unitCoverage.omittedUnits,0),oversizedUnits:windows.reduce((n,w)=>n+w.unitCoverage.oversizedUnits,0),omittedMatchingUnits:windows.reduce((n,w)=>n+w.unitCoverage.omittedMatchingUnits,0),selectedCharacters:windows.reduce((n,w)=>n+w.text.length,0),omittedCharacters:windows.reduce((n,w)=>n+w.unitCoverage.omittedCharacters,0),semanticCompleteness:'not-established'},claimSupport:'not-established',reviewStatus:'unreviewed'};
 const receiptSha256=await corpusDigest(corpusCanonical(receipt),cryptoImpl),snapshot=await corpusDigest(corpusCanonical({version:1,kind:'local-ai-corpus-request-snapshot',corpusSnapshot:corpus.snapshot,querySha256,evidenceReceiptSha256:receiptSha256}),cryptoImpl);current({signal,isCurrent});
 const request=await buildProposalRequest({question,evidence:windows.map(window=>({id:window.id,text:window.text,url:window.url})),snapshot,...(context?{context}:{})},{format,cryptoObject:cryptoImpl});current({signal,isCurrent});
 const result=corpusFreeze({version:1,kind:'local-ai-corpus-evidence-selection',corpusSnapshot:corpus.snapshot,snapshot,receipt,receiptSha256,request});selections.set(result,{corpus,index});return result;
}
export async function verifyEvidenceSelection(selection,{corpus,index,cryptoImpl=globalThis.crypto,signal,isCurrent}={}){
 const state=selections.get(selection);if(!state||corpus&&state.corpus!==corpus||index&&state.index!==index)fail('corpus-evidence-selection');assertPublicCorpus(state.corpus);current({signal,isCurrent});
 if(state.index.snapshot!==state.corpus.snapshot||selection.corpusSnapshot!==state.corpus.snapshot||await corpusDigest(corpusCanonical(selection.receipt),cryptoImpl)!==selection.receiptSha256)fail('corpus-evidence-receipt');current({signal,isCurrent});
 for(const window of selection.receipt.windows){const source=state.index.lookup(window.sourceId);if(!source||source.textSha256!==window.sourceTextSha256||source.pageSha256!==window.pageSha256||source.text.slice(window.start,window.end)!==window.text||await corpusDigest(window.text,cryptoImpl)!==window.textSha256)fail('corpus-evidence-source');current({signal,isCurrent});}
 const snapshot=await corpusDigest(corpusCanonical({version:1,kind:'local-ai-corpus-request-snapshot',corpusSnapshot:selection.corpusSnapshot,querySha256:selection.receipt.querySha256,evidenceReceiptSha256:selection.receiptSha256}),cryptoImpl);current({signal,isCurrent});
 if(snapshot!==selection.snapshot||selection.request.hashes.snapshot!==snapshot)fail('corpus-evidence-snapshot');return selection;
}
/** The result is an additional alignment receipt; it does not rewrite the
 * validated proposal and does not turn an exact quote into supporting evidence.
 * Only the current in-memory selection is accepted, not imported approvals. */
export async function mapCorpusProposal(selection,proposal,{cryptoImpl=globalThis.crypto,signal,isCurrent}={}){
 const state=selections.get(selection);if(!state||!proposal||proposal.version!==1||proposal.reviewStatus!=='unreviewed'||!['proposal','insufficient-evidence'].includes(proposal.status)||!Array.isArray(proposal.claims)||proposal.claims.length>8||proposal.status==='proposal'&&!proposal.claims.length||proposal.status==='insufficient-evidence'&&proposal.claims.length||!/^[a-f0-9]{64}$/.test(proposal.provenance?.outputSha256??''))fail('corpus-proposal-selection');await verifyEvidenceSelection(selection,{cryptoImpl,signal,isCurrent});
 const provenance=proposal.provenance,expected=selection.request.hashes;
 for(const key of ['snapshot','requestSha256','questionSha256','generationSha256','schemaSha256','profileSha256','contextSha256'])if(provenance?.[key]!==expected[key])fail('corpus-proposal-snapshot');
 const windows=new Map(selection.receipt.windows.map(window=>[window.id,window])),hashes=new Map(expected.sources.map(source=>[source.id,source.sha256])),alignments=[];
 proposal.claims.forEach((claim,claimIndex)=>{if(!claim||typeof claim.text!=='string'||claim.text.length>1200||!Array.isArray(claim.citations)||!claim.citations.length||claim.citations.length>8)fail('corpus-proposal-citation');claim.citations.forEach((citation,citationIndex)=>{if(alignments.length>=24)fail('corpus-proposal-citation');
  const window=windows.get(citation.sourceId),source=window&&state.index.lookup(window.sourceId);if(!window||!source||source.textSha256!==window.sourceTextSha256||source.text.slice(window.start,window.end)!==window.text||!Number.isSafeInteger(citation.start)||!Number.isSafeInteger(citation.end)||citation.start<0||citation.end<=citation.start||citation.end>window.text.length||!boundary(window.text,citation.start)||!boundary(window.text,citation.end)||window.text.slice(citation.start,citation.end)!==citation.quote||citation.url!==window.url||citation.sourceSha256!==hashes.get(window.id))fail('corpus-proposal-citation');
  alignments.push({claimIndex,citationIndex,windowId:window.id,windowStart:citation.start,windowEnd:citation.end,sourceId:source.id,sourceStart:window.start+citation.start,sourceEnd:window.start+citation.end,sourceTextSha256:source.textSha256,pageSha256:source.pageSha256,url:source.url,quote:citation.quote});
 });});
 current({signal,isCurrent});return corpusFreeze({version:1,kind:'local-ai-corpus-citation-alignment',snapshot:selection.snapshot,corpusSnapshot:selection.corpusSnapshot,evidenceReceiptSha256:selection.receiptSha256,proposalRequestSha256:expected.requestSha256,proposalOutputSha256:provenance.outputSha256,coordinateSpace:'selected-public-excerpt',coordinateUnits:'utf16-code-units',alignments,qualification:'Exact citation alignment only. Model execution, claim support, source truth and human review are not established.'});
}
