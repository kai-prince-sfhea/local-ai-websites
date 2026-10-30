// Copyright 2026 Kai Prince; SPDX-License-Identifier: Apache-2.0
import {createSupportReview,createSupportReviewSession,SUPPORT_REVIEW_LIMITS,SUPPORT_REVIEW_QUALIFICATION} from './support-review.js';

export function mountSupportReviewControls(parent,{rawProposal,selection,isCurrent=()=>true,announce=()=>{}}={}){
 const doc=parent.ownerDocument??globalThis.document;
 if(!doc?.createElement||typeof isCurrent!=='function'||typeof announce!=='function')throw Error('Invalid support review control context.');
 const node=(tag,text)=>{const item=doc.createElement(tag);if(text!==undefined)item.textContent=text;return item;};
 const button=text=>{const item=node('button',text);item.type='button';return item;};
 const label=(text,input)=>{const item=node('label',text+' ');item.append(input);return item;};
 const section=node('section');section.className='local-ai-support-review';section.setAttribute('aria-label','Reader judgments about source support');
 const status=node('p','Preparing exact claim and quotation bindings.');status.className='local-ai-support-review-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const claims=node('div');claims.className='local-ai-support-review-claims';
 const save=button('Save reader judgments in this page'),download=button('Export saved reader judgments'),importButton=button('Import reader judgments'),clear=button('Clear reader judgments');
 const file=node('input');file.type='file';file.accept='.json,application/json';
 section.append(node('p',SUPPORT_REVIEW_QUALIFICATION),node('p','Choose a judgment for each claim you wish to assess. Save keeps only a report in this page’s memory. Export and import are explicit; no browser storage, model or network request is used.'),claims,save,download,label('Saved judgment JSON file (up to 64 KiB)',file),importButton,clear,status);parent.append(section);
 const session=createSupportReviewSession(),currentInput={rawProposal,selection},rows=[],listeners=[];let epoch=0,disposed=false,readyState=false,busy=false,dirty=false;
 const alive=()=>!disposed&&isCurrent()===true;
 const listen=(target,event,handler)=>{target.addEventListener(event,handler);listeners.push([target,event,handler]);};
 const notify=text=>{if(!alive())return;status.textContent=text;try{announce(text);}catch{/* Presentation callbacks do not alter resource ownership. */}};
 function controls(){save.disabled=!readyState||busy;download.disabled=!readyState||busy||dirty||session.get()===null;importButton.disabled=!readyState||busy;file.disabled=!readyState||busy;for(const row of rows){row.choice.disabled=busy;row.note.disabled=busy;}clear.disabled=!readyState;}
 const markDirty=()=>{dirty=true;controls();notify('Unsaved reader judgments. Save to replace the in-memory report; no source or model claim has changed.');};
 function renderValues(report){const judgments=new Map(report?.judgments.map(item=>[item.claimIndex,item])??[]);for(const row of rows){const saved=judgments.get(row.claimIndex);row.choice.value=saved?.decision??'';row.note.value=saved?.note??'';}dirty=false;}
 async function task(action){
  if(busy||!readyState||!alive())return;const token=++epoch;busy=true;controls();const active=()=>alive()&&token===epoch;
  try{await action({isCurrent:active});}
  catch{if(active())notify('The reader judgment action could not be completed. The previous saved report remains in this page’s memory.');}
  finally{if(token===epoch&&!disposed){busy=false;controls();}}
 }
 listen(save,'click',()=>task(async options=>{
  const judgments=[];for(const row of rows){if(!row.choice.value){if(row.note.value.trim())throw Error('Choose a judgment before saving its note.');continue;}const note=row.note.value.trim();judgments.push({claimIndex:row.claimIndex,decision:row.choice.value,...(note?{note}:{})});}
  const report=await session.set({...currentInput,judgments},options);if(!options.isCurrent())return;dirty=false;notify(`Saved ${report.coverage.judged} of ${report.coverage.claims} reader judgments in this page’s memory. ${report.coverage.unreviewed} remain unreviewed. These are reported decisions, not verified source support.`);
 }));
 listen(download,'click',()=>task(async options=>{
  const raw=await session.export(currentInput,options);if(!options.isCurrent())return;
  const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),link=node('a');link.href=url;link.download='reader-support-review.json';doc.body.append(link);
  try{link.click();notify('Exported the saved reader report. Its identities bind selected claims and quotations; they do not authenticate its judgments.');}finally{link.remove();URL.revokeObjectURL(url);}
 }));
 listen(importButton,'click',()=>task(async options=>{
  const selected=file.files?.[0];if(!selected||!Number.isSafeInteger(selected.size)||selected.size<1||selected.size>SUPPORT_REVIEW_LIMITS.receiptBytes)throw Error('Choose one bounded UTF-8 JSON report.');
  const buffer=await selected.arrayBuffer();if(!options.isCurrent())return;if(!(buffer instanceof ArrayBuffer)||buffer.byteLength!==selected.size||buffer.byteLength>SUPPORT_REVIEW_LIMITS.receiptBytes)throw Error('The selected report changed or exceeds its bound.');
  const raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(buffer),report=await session.import(raw,currentInput,options);if(!options.isCurrent())return;renderValues(report);notify(`Imported ${report.coverage.judged} unauthenticated reader judgments for these exact current claims and quotations. No author approval or source truth was established.`);
 }));
 listen(clear,'click',()=>{if(!alive())return;epoch++;busy=false;session.clear();renderValues(null);file.value='';controls();notify('Cleared reader judgments from this page’s memory. Downloaded files and browser model storage are unchanged.');});
 controls();const ready=(async()=>{
  try{
   const report=await createSupportReview({...currentInput,judgments:[]},{isCurrent:alive});if(!alive())return false;
   for(const claim of report.claims){
    const fieldset=node('fieldset'),legend=node('legend',`Claim ${claim.claimIndex+1}: ${claim.text}`),quoteList=node('ul'),choice=node('select'),note=node('textarea');
    for(const citation of claim.citations){const item=node('li'),quote=node('blockquote',citation.quote),link=node('a','Open the cited selected source');link.href=citation.url;item.append(quote,link);quoteList.append(item);}
    for(const [value,text]of [['','Unreviewed'],['supported','Supported (reader judgment)'],['uncertain','Uncertain'],['unsupported','Unsupported (reader judgment)']]){const item=node('option',text);item.value=value;choice.append(item);}choice.value='';note.maxLength=SUPPORT_REVIEW_LIMITS.noteCharacters;note.rows=3;
    const judgmentLabel=`Your judgment for claim ${claim.claimIndex+1}`,noteLabel=`Optional note for claim ${claim.claimIndex+1} (up to 320 characters)`;
    choice.setAttribute('aria-label',judgmentLabel);note.setAttribute('aria-label',noteLabel);
    fieldset.append(legend,quoteList,label(judgmentLabel,choice),label(noteLabel,note));claims.append(fieldset);rows.push({claimIndex:claim.claimIndex,choice,note});listen(choice,'change',markDirty);listen(note,'input',markDirty);
   }
   readyState=true;controls();notify(report.claims.length?'No reader judgments are saved. Review the exact claims and quotations, then choose Save.':'The model returned no claims to assess. No reader judgments are saved.');return true;
  }catch{if(alive())notify('These exact claim and quotation bindings could not be prepared. Reader judgment controls remain unavailable.');return false;}
 })();
 return Object.freeze({ready,session,get:()=>session.get(),dispose(){if(disposed)return;disposed=true;epoch++;session.clear();for(const [target,event,handler]of listeners)target.removeEventListener(event,handler);section.remove();}});
}
