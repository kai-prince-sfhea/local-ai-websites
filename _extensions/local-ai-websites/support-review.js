// Copyright 2026 Kai Prince; SPDX-License-Identifier: Apache-2.0
import {validateProposalOutput} from './proposal.js';
import {mapCorpusProposal,verifyEvidenceSelection} from './evidence-windows.js';
import {corpusCanonical,corpusDigest,corpusFreeze} from './corpus.js';

export const SUPPORT_REVIEW_LIMITS=Object.freeze({claims:8,noteCharacters:320,receiptBytes:65536,depth:16,nodes:4096});
export const SUPPORT_REVIEW_QUALIFICATION='These are unauthenticated reader-reported judgments about exact selected claims and quotations. Exact quotation is not entailment; these reports do not verify source truth, model quality, author review or publication approval.';
const fail=code=>{const error=Error(code);error.code=code;throw error;};
const reports=new WeakSet();
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const scalar=value=>{for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const d=value.charCodeAt(++i);if(!(d>=0xdc00&&d<=0xdfff))return false;}else if(c>=0xdc00&&c<=0xdfff)return false;}return true;};
function fields(value,required,optional=[]){
 if(!plain(value))fail('support-review-data');const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
 if(keys.some(key=>typeof key!=='string'||![...required,...optional].includes(key)||!Object.hasOwn(descriptors[key],'value'))||required.some(key=>!Object.hasOwn(descriptors,key)))fail('support-review-data');return value;
}
function array(value,max){
 if(!Array.isArray(value)||value.length>max)fail('support-review-data');const ds=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(ds).length!==value.length+1)fail('support-review-data');const result=[];
 for(let i=0;i<value.length;i++){if(!Object.hasOwn(ds[i]??{},'value'))fail('support-review-data');result.push(ds[i].value);}return result;
}
const optionsFor=value=>{fields(value,[],['cryptoImpl','signal','isCurrent']);if(value.isCurrent!==undefined&&typeof value.isCurrent!=='function')fail('support-review-data');return {...value};};
function current({signal,isCurrent}){if(signal?.aborted)fail('support-review-cancelled');if(isCurrent&&isCurrent()!==true)fail('support-review-stale');}
function judgmentsFor(value){
 const seen=new Set();return array(value,SUPPORT_REVIEW_LIMITS.claims).map(item=>{
  fields(item,['claimIndex','decision'],['note']);if(!Number.isSafeInteger(item.claimIndex)||item.claimIndex<0||item.claimIndex>=SUPPORT_REVIEW_LIMITS.claims||seen.has(item.claimIndex)||!['supported','uncertain','unsupported'].includes(item.decision))fail('support-review-judgment');seen.add(item.claimIndex);
  let note;if(Object.hasOwn(item,'note')){note=item.note;if(typeof note!=='string'||!note.length||note.trim()!==note||note.length>SUPPORT_REVIEW_LIMITS.noteCharacters||!scalar(note)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(note))fail('support-review-judgment');}
  return {claimIndex:item.claimIndex,decision:item.decision,...(note===undefined?{}:{note})};
 }).sort((a,b)=>a.claimIndex-b.claimIndex);
}
function textBudget(raw){if(typeof raw!=='string'||raw.length>SUPPORT_REVIEW_LIMITS.receiptBytes||!scalar(raw)||new TextEncoder().encode(raw).byteLength>SUPPORT_REVIEW_LIMITS.receiptBytes)fail('support-review-budget');return raw;}
// Strict bounded JSON keeps duplicate keys visible. This parser does not execute
// code, use revivers, or assign imported keys to ordinary object prototypes.
function parseReceipt(raw){
 textBudget(raw);let at=0,nodes=0;const ws=()=>{while(/[\t\r\n ]/u.test(raw[at]??'!'))at++;};
 const string=()=>{if(raw[at]!=='"')fail('support-review-json');const start=at++;let escaped=false;while(at<raw.length){const c=raw[at++];if(c==='"'&&!escaped){let value;try{value=JSON.parse(raw.slice(start,at));}catch{fail('support-review-json');}if(!scalar(value))fail('support-review-json');return value;}escaped=c==='\\'&&!escaped;}fail('support-review-json');};
 const value=depth=>{if(depth>SUPPORT_REVIEW_LIMITS.depth||++nodes>SUPPORT_REVIEW_LIMITS.nodes)fail('support-review-budget');ws();const c=raw[at];
  if(c==='"')return string();
  if(c==='{'){at++;const out=Object.create(null),seen=new Set();ws();if(raw[at]==='}'){at++;return out;}for(;;){ws();const key=string();if(seen.has(key))fail('support-review-json');seen.add(key);ws();if(raw[at++]!==':')fail('support-review-json');out[key]=value(depth+1);ws();const end=raw[at++];if(end==='}')return out;if(end!==',')fail('support-review-json');}}
  if(c==='['){at++;const out=[];ws();if(raw[at]===']'){at++;return out;}for(;;){out.push(value(depth+1));ws();const end=raw[at++];if(end===']')return out;if(end!==',')fail('support-review-json');}}
  for(const [token,result]of [['true',true],['false',false],['null',null]])if(raw.startsWith(token,at)){at+=token.length;return result;}
  const number=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(raw.slice(at));if(number){at+=number[0].length;const n=Number(number[0]);if(!Number.isFinite(n))fail('support-review-json');return n;}fail('support-review-json');
 };const result=value(0);ws();if(at!==raw.length)fail('support-review-json');return result;
}
const receiptFields=['version','kind','authority','bindings','claims','judgments','coverage','qualification','receiptSha256'];
const boundCurrent=value=>{fields(value,['rawProposal','selection']);return {rawProposal:value.rawProposal,selection:value.selection};};

/** No persistence, requests or inference. The caller must retain the exact raw
 * model JSON and the current branded corpus selection, not reconstructed JSON. */
export async function createSupportReview(input,options={}){
 options=optionsFor(options);fields(input,['rawProposal','selection','judgments']);const rawProposal=input.rawProposal,selection=input.selection,judgments=judgmentsFor(input.judgments);current(options);
 await verifyEvidenceSelection(selection,options);current(options);
 const proposal=await validateProposalOutput(rawProposal,selection.request,{cryptoObject:options.cryptoImpl});current(options);
 const alignment=await mapCorpusProposal(selection,proposal,options);current(options);
 if(judgments.some(item=>item.claimIndex>=proposal.claims.length))fail('support-review-judgment');
 const claims=[];
 for(let claimIndex=0;claimIndex<proposal.claims.length;claimIndex++){
  const claim=proposal.claims[claimIndex],claimSha256=await corpusDigest(corpusCanonical(claim),options.cryptoImpl);current(options);
  claims.push({claimIndex,claimSha256,text:claim.text,citations:claim.citations});
 }
 const bindings={corpusSnapshot:selection.corpusSnapshot,snapshot:selection.snapshot,evidenceReceiptSha256:selection.receiptSha256,
  proposalRequestSha256:proposal.provenance.requestSha256,proposalOutputSha256:proposal.provenance.outputSha256,
  proposalSha256:await corpusDigest(corpusCanonical(proposal),options.cryptoImpl),citationAlignmentSha256:await corpusDigest(corpusCanonical(alignment),options.cryptoImpl)};current(options);
 const packet={version:1,kind:'local-ai-reader-support-review',authority:'unauthenticated-reader-report',bindings,claims,
  judgments:judgments.map(item=>({...item,claimSha256:claims[item.claimIndex].claimSha256})),
  coverage:{claims:claims.length,judged:judgments.length,unreviewed:claims.length-judgments.length,fullyJudged:claims.length>0&&judgments.length===claims.length},qualification:SUPPORT_REVIEW_QUALIFICATION};
 const receiptSha256=await corpusDigest(corpusCanonical(packet),options.cryptoImpl);current(options);
 const result=corpusFreeze({...packet,receiptSha256});textBudget(JSON.stringify(result));reports.add(result);return result;
}

/** Imported reports are replayed only against the exact current raw proposal
 * and observed selection. A self-consistent hash does not authenticate a person. */
export async function importSupportReview(raw,currentInput,options={}){
 options=optionsFor(options);const input=boundCurrent(currentInput),parsed=parseReceipt(raw);fields(parsed,receiptFields);const judgments=array(parsed.judgments,SUPPORT_REVIEW_LIMITS.claims).map(item=>{fields(item,['claimIndex','claimSha256','decision'],['note']);return {claimIndex:item.claimIndex,decision:item.decision,...(Object.hasOwn(item,'note')?{note:item.note}:{})};});current(options);
 const rebuilt=await createSupportReview({...input,judgments},options);current(options);
 if(corpusCanonical(parsed)!==corpusCanonical(rebuilt))fail('support-review-binding-mismatch');return rebuilt;
}

/** Export is explicit and revalidates the full current binding before returning
 * text. It does not initiate a download, grant permissions or persist anything. */
export async function exportSupportReview(receipt,currentInput,options={}){
 if(!reports.has(receipt))fail('support-review-not-observed');const raw=textBudget(JSON.stringify(receipt));const verified=await importSupportReview(raw,currentInput,options);return textBudget(JSON.stringify(verified,null,2)+'\n');
}

/** One optional in-memory report. Failed replacements preserve the previous
 * report; clear invalidates pending work and never touches browser storage. */
export function createSupportReviewSession(){
 let value=null,epoch=0;
 const guarded=(token,options)=>({...options,isCurrent:()=>epoch===token&&(!options.isCurrent||options.isCurrent()===true)});
 return Object.freeze({get:()=>value,clear(){epoch++;value=null;return Object.freeze({version:1,status:'cleared'});},
  async set(input,options={}){options=optionsFor(options);const token=++epoch,report=await createSupportReview(input,guarded(token,options));current(guarded(token,options));value=report;return report;},
  async import(raw,currentInput,options={}){options=optionsFor(options);const token=++epoch,report=await importSupportReview(raw,currentInput,guarded(token,options));current(guarded(token,options));value=report;return report;},
  async export(currentInput,options={}){options=optionsFor(options);if(value===null)fail('support-review-empty');const token=epoch;return exportSupportReview(value,currentInput,guarded(token,options));}
 });
}
