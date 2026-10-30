// Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
import {validatePayload,createSourceIndex,boundedText,cosine,LIMITS} from './retrieval.js';
import {LocalAIRuntime} from './runtime.js';
import {digestJSON,EMBEDDING_PROFILE} from './manifest.js';
import {loadGraphSources} from './graphs.js';
import {clearStoredModels,validateClearStorageResult} from './model-store.js';
import {mountCompanionControls} from './companion-ui.js';
import {selectEvidenceWindow,buildEvidenceSelection,mapCorpusProposal} from './evidence-windows.js';
import {mountSupportReviewControls} from './support-review-controls.js';
import {buildProposalRequest,QUOTE_PROPOSAL_FORMAT} from './proposal.js';

// Only actual widgets below can register their private consented engine. Public
// exports expose data/status and a ready-only action, never registration, runtime
// construction, load, token/model settings or another panel's prompt history.
export const GENERATION_PROVIDER_VERSION=1;
const generationProviders=new Map();let generationSequence=0;
const generationError=code=>Object.assign(Error(code),{code});
function providerFor(id){
  if(typeof id!=='string'||!/^local-ai-generation-[1-9][0-9]*$/u.test(id))throw generationError('local-ai-generation-provider-unavailable');
  const entry=generationProviders.get(id);
  if(!entry||!entry.connected()){entry?.dispose();generationProviders.delete(id);throw generationError('local-ai-generation-provider-unavailable');}
  return entry;
}
export function getLocalGenerationProviders(){
  const result=[];for(const [id,entry]of generationProviders){if(!entry.connected()){entry.dispose();generationProviders.delete(id);continue;}result.push(Object.freeze({version:1,id,status:entry.status(),format:QUOTE_PROPOSAL_FORMAT}));}
  return Object.freeze(result);
}
export function focusLocalGenerationProvider(id){const entry=providerFor(id);entry.focus();return true;}
function companionOptions(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw generationError('local-ai-generation-invalid-options');
  for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!['signal','isCurrent'].includes(key)||!d.enumerable||!Object.hasOwn(d,'value'))throw generationError('local-ai-generation-invalid-options');}
  if(value.signal!==undefined&&!(value.signal instanceof AbortSignal)||value.isCurrent!==undefined&&typeof value.isCurrent!=='function')throw generationError('local-ai-generation-invalid-options');
  return{signal:value.signal,isCurrent:value.isCurrent??(()=>true)};
}
function companionCurrent(options){if(options.signal?.aborted)throw generationError('local-ai-generation-cancelled');let current=false;try{current=options.isCurrent()===true;}catch{}if(!current)throw generationError('local-ai-generation-stale');}
/** An explicit companion action may borrow only an already-confirmed, ready
 * language-model widget on this document. The original runtime builds and checks
 * the request and output; callers must still validate their own source snapshot. */
export async function generateWithLocalProvider(id,input,options={}){
  const checked=companionOptions(options);companionCurrent(checked);const entry=providerFor(id);
  if(entry.status()!=='ready')throw generationError('local-ai-generation-provider-not-ready');
  const packet=await buildProposalRequest(input,{format:QUOTE_PROPOSAL_FORMAT});companionCurrent(checked);
  const origin=new URL(location.href).origin;for(const source of packet.evidence)if(new URL(source.url).origin!==origin)throw generationError('local-ai-generation-source-origin-mismatch');
  if(providerFor(id)!==entry)throw generationError('local-ai-generation-provider-unavailable');
  return entry.generate(packet,checked);
}

function element(tag,content,className) {
  const item=document.createElement(tag);
  if(content!==undefined) item.textContent=content;
  if(className) item.className=className;
  return item;
}
const button = label => {const value=element('button',label);value.type='button';return value;};
const bytes = value => `${new Intl.NumberFormat().format(value)} bytes`;

function enhance(panel) {
  const slot=panel.querySelector(':scope > .local-ai-enhancement'),raw=panel.querySelector(':scope > script.local-ai-data');
  if(!slot||!raw) return;
  const rawIdentity=raw.textContent;
  let payload;
  try {payload=validatePayload(JSON.parse(rawIdentity));} catch {return;}
  const nativeSources=payload.sources;
  let sources=nativeSources,sourceIndex=createSourceIndex(sources),graphSources=[],excerptSources=[],companionControls=null,lastExactContext=null;
  let activeCorpus=null,supportControls=null;
  const form=element('form',undefined,'local-ai-search'),label=element('label','Search selected page sources '),query=element('input');
  query.type='search';query.maxLength=LIMITS.query;query.autocomplete='off';
  label.append(query);
  const submit=button('Search');submit.type='submit';
  const passages=button('Show matching passages');passages.hidden=!payload.corpusPages?.length;
  form.append(label,submit,passages);
  const status=element('p','Search uses only the explicitly selected sources on this page.','local-ai-status');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
  const storageDetails=element('p',undefined,'local-ai-storage');storageDetails.hidden=true;
  const results=element('ol',undefined,'local-ai-results');
  results.setAttribute('aria-label','Selected page source search results');
  const answer=element('section',undefined,'local-ai-proposal');answer.hidden=true;
  let runtime=null,revision=0,matches=[],lastQuery='',busy=false,activeTask=false,runtimeBusy=false,loadedRole=null,chosenRole=null,manifest=null,storageController=null;
  const embeddings=new Map(),controls=element('div',undefined,'local-ai-actions');
  const reviewEmbed=button('Review embedding model files'),reviewGenerate=button('Review language model files');
  const rerank=button('Rerank matches with embeddings'),semanticSearch=button('Search selected sources with embeddings'),generate=button('Draft an unreviewed explanation');
  const cancel=button('Cancel local AI'),release=button('Release local AI and clear proposals');
  const reset=button('Reset local AI session');
  const clearCache=button('Delete saved model downloads');
  const consent=element('section',undefined,'local-ai-consent');consent.hidden=true;
  consent.setAttribute('aria-label','Local model file confirmation');
  const details=element('p'),consentLabel=element('label',' Load these files for this session. '),confirmed=element('input');
  let detailsId='local-ai-model-files',detailsSuffix=0;
  while(document.getElementById(detailsId)) detailsId=`local-ai-model-files-${++detailsSuffix}`;
  details.id=detailsId;confirmed.setAttribute('aria-describedby',detailsId);
  confirmed.type='checkbox';consentLabel.prepend(confirmed);
  const remember=element('input');remember.type='checkbox';
  const rememberLabel=element('label',' Reuse and keep model download checkpoints in this browser, resume an interrupted download when possible, and keep the fully verified model for later visits (optional). ');rememberLabel.prepend(remember);
  const load=button('Load selected model');consent.append(details,consentLabel,rememberLabel,load);
  const announce = message => {if(status.textContent!==message) status.textContent=message;};
  function refresh() {
    busy=activeTask||runtimeBusy;
    const evidence=matches.length>0&&lastQuery===query.value.trim();
    passages.disabled=busy||!activeCorpus||!evidence;
    reviewEmbed.disabled=busy;reviewGenerate.disabled=busy;
    load.disabled=busy||!confirmed.checked||!chosenRole;
    rerank.disabled=busy||loadedRole!=='embed'||!evidence;
    semanticSearch.disabled=busy||loadedRole!=='embed'||!query.value.trim()||!(activeCorpus?.corpus.sources??sources).length;
    generate.disabled=busy||loadedRole!=='generate'||!evidence||!matches.some(item=>!item.discoveryOnly);
    cancel.disabled=!busy;release.disabled=!runtime;reset.disabled=!runtime;
    clearCache.disabled=storageController!==null;
    companionControls?.setBusy(busy);
  }
  function showResults(items,semantic=false) {
    results.replaceChildren();
    for(const source of items) {
      const item=element('li'),link=element('a',source.label),excerpt=element('p',source.excerpt);
      link.href=source.url;item.append(link,excerpt);
      if(source.graphId)item.append(element('small',`Graph: ${source.graphId}.${source.discoveryOnly?' Public catalogue discovery; follow the source to check its meaning.':' Explicit public excerpt; review its original page.'}`));
      if(source.nativeId)item.append(element('small',`Selected excerpt; language ${source.lang}; review ${source.review}; support not verified.`));
      item.append(element('small',source.exactId?'Exact source identifier match.':semantic||Number.isFinite(source.similarity)?
        'Optional embedding similarity discovery; meaning and support require source review.':`${source.matchedTerms.length} of ${source.totalTerms} query terms matched.`));
      results.append(item);
    }
  }
  function clearProposal() {supportControls?.dispose();supportControls=null;answer.replaceChildren();answer.hidden=true;}
  const corpusFilters=()=>companionControls?.corpusFilters?.()??{};
  const searchLabel=text=>{label.textContent=text;label.append(query);};
  const corpusPassage=(source,question,maximum)=>selectEvidenceWindow(activeCorpus.index,source.id,question,{maxCharacters:maximum});
  const describeCorpusMatches=(items,question)=>items.map(source=>({...source,
    excerpt:corpusPassage(source,question,600).text??'No complete passage fits the short preview. Follow the source to inspect its context.'}));
  function selectCorpus(value){
    revision++;runtime?.cancel();embeddings.clear();clearProposal();matches=[];lastQuery='';results.replaceChildren();
    activeCorpus=value;lastExactContext=null;
    searchLabel(value?'Search the loaded public corpus ':'Search selected page sources ');
    refresh();announce(value?`${value.corpus.sources.length} explicitly selected public excerpts loaded. Enter search terms; graph, language and review filters are available below. Loading sources does not load a model.`:'Search now uses the selected page sources. The larger loaded corpus remains optional.');
  }
  function corpusEvidenceIds(context){
    const selected=matches.filter(source=>!source.discoveryOnly);
    const eligible=maximum=>selected.filter(source=>selectEvidenceWindow(context.index,source.id,lastQuery,{maxCharacters:maximum}).status==='available');
    const compact=eligible(3000).slice(0,4);
    return (compact.length===4?compact:eligible(4000).slice(0,3)).map(source=>source.id);
  }
  function showEvidenceSelection(selection,context){
    for(const window of selection.receipt.windows){
      const source=context.index.lookup(window.sourceId),heading=element('h3',source.label),link=element('a','Read the original selected source');link.href=source.url;
      answer.append(heading,element('blockquote',window.text),link,element('p',`Original selected-excerpt UTF-16 range ${window.start}–${window.end}. ${window.unitCoverage.omittedUnits} lexical units omitted; semantic completeness is not established.`));
    }
    const audit=element('details');audit.append(element('summary','Inspect selected passage coverage and identity'),element('pre',JSON.stringify(selection.receipt,null,2)));answer.append(audit);
  }
  passages.addEventListener('click',async()=>{
    if(passages.disabled)return;const token=++revision,context=activeCorpus;clearProposal();activeTask=true;refresh();
    try{
      const selection=await buildEvidenceSelection(context.corpus,context.index,lastQuery,corpusEvidenceIds(context),{isCurrent:()=>token===revision});if(token!==revision)return;
      answer.append(element('h2','Selected matching passages'),element('p','These exact passages were selected algorithmically. No model wrote a summary; the passages do not establish an answer or source support.'));
      showEvidenceSelection(selection,context);answer.hidden=false;announce(`${selection.receipt.windows.length} exact selected passages shown. Inspect omitted context in the original sources.`);
    }catch{if(token===revision)announce('No complete selected passage fits the bounded evidence window. Follow the source, shorten its authored excerpt or choose another source.');}
    finally{if(token===revision){activeTask=false;refresh();}}
  });
  function showStorage(value) {
    const prefix='Last model-load storage observation: ';
    const suffix=' Browser storage can be evicted; every complete model is size- and SHA256-checked before use.';
    if(value.status==='session-only')storageDetails.textContent=prefix+'model bytes are session-only. This load did not access saved model downloads.';
    else if(value.status==='saved')storageDetails.textContent=prefix+`${bytes(value.committedBytes)} saved; ${bytes(value.reusedBytes)} reused for this load.`+suffix;
    else if(value.status==='partial')storageDetails.textContent=prefix+`${bytes(value.committedBytes)} of ${bytes(value.totalBytes)} checkpointed; ${bytes(value.reusedBytes)} reused. Partial bytes are not admitted for inference.`+suffix;
    else storageDetails.textContent=prefix+`saving is unavailable${value.code?` (${value.code})`:''}. ${bytes(value.committedBytes)} of ${bytes(value.totalBytes)} were last reported checkpointed; this does not promise future reuse.`+suffix;
    storageDetails.hidden=false;
  }
  function stop(message,dispose=false) {
    revision++;storageController?.abort();storageController=null;companionControls?.cancel();runtime?.[dispose?'release':'cancel']();activeTask=false;runtimeBusy=false;loadedRole=null;embeddings.clear();clearProposal();
    confirmed.checked=false;consent.hidden=true;chosenRole=null;
    if(matches.length) showResults(matches);
    refresh();announce(message);
  }
  function getRuntime() {
    if(runtime) return runtime;
    runtime=new LocalAIRuntime({manifestURL:payload.manifest,baseURL:location.href,onState:state=>{
      runtimeBusy=['inspecting','loading','embedding','generating'].includes(state.status);
      loadedRole=['ready','embedding','generating'].includes(state.status)?state.capability:null;
      const messages={inspecting:'Reading the local model manifest; no model files are being loaded.',
        loading:'Loading the explicitly confirmed local model files.',ready:'Local AI is ready for this session.',
        embedding:'Computing optional similarities for selected matches.',generating:'Drafting an unreviewed explanation from selected evidence.',
        cancelled:'Local AI cancelled. Static sources remain available.',released:'Local AI released. Static sources remain available.',reset:'Local AI session reset. Saved model downloads are unchanged; use Delete saved model downloads to remove them.',
        failed:'Local AI failed. Static sources remain available.',unsupported:'Local AI is unsupported on this device. Static search remains available.'};
      if(state.storage)showStorage(state.storage);
      else if(state.status==='loading'){storageDetails.hidden=true;storageDetails.textContent='';}
      if(state.status==='loading'&&Number.isSafeInteger(state.loadedBytes)&&Number.isSafeInteger(state.totalBytes))
        announce(`${state.stage==='storage'?'Checking model download storage':state.stage==='initialising'?'Initialising the verified model':state.stage==='verifying'?'Verifying the model':'Loading confirmed model files'}: ${bytes(state.loadedBytes)} of ${bytes(state.totalBytes)} model bytes processed. Cancel remains available.`);
      else if(messages[state.status]) announce(messages[state.status]);
      refresh();
    }});
    return runtime;
  }
  async function review(role) {
    const token=++revision;activeTask=true;clearProposal();confirmed.checked=false;remember.checked=false;chosenRole=null;consent.hidden=true;refresh();cancel.focus();
    try {
      manifest=await getRuntime().inspectManifest();if(token!==revision) return;
      const model=manifest.models.find(item=>item.capability===role);
      if(!model) throw new Error('The author has not configured this model capability.');
      const sdkBytes=manifest.runtime.inventory.reduce((sum,file)=>sum+file.bytes,0);
      details.textContent=`${model.id}: ${bytes(model.bytes)}; model licence: ${model.licence}. Runtime ${manifest.runtime.name} ${manifest.runtime.version}: ${bytes(sdkBytes)}; runtime licence: ${manifest.runtime.licence}. Total declared transfer: ${bytes(model.bytes+sdkBytes)}. Browser memory use can be larger. These are author-provided same-origin files. Loading is optional; results and proposals are not independent verification.`;
      chosenRole=role;load.textContent=role==='embed'?'Load confirmed embedding model':'Load confirmed language model';
      activeTask=false;consent.hidden=false;refresh();if(document.activeElement===cancel) confirmed.focus();
      announce('Review the declared file sizes and licences, then confirm explicitly to load a model.');
    } catch(error) {if(token===revision) {activeTask=false;runtimeBusy=false;refresh();if(document.activeElement===cancel) (role==='embed'?reviewEmbed:reviewGenerate).focus();announce(`Local AI review failed: ${String(error.message).slice(0,240)} Static search remains available.`);}}
  }
  reviewEmbed.addEventListener('click',()=>void review('embed'));
  reviewGenerate.addEventListener('click',()=>void review('generate'));
  confirmed.addEventListener('change',refresh);
  load.addEventListener('click',async()=>{
    if(!confirmed.checked||!chosenRole||busy) return;
    const role=chosenRole,token=++revision;activeTask=true;clearProposal();embeddings.clear();consent.hidden=true;confirmed.checked=false;refresh();cancel.focus();
    try {await getRuntime().load(role,{remember:remember.checked});if(token!==revision) return;activeTask=false;loadedRole=role;refresh();if(document.activeElement===cancel) ((role==='embed'?rerank:generate).disabled?query:(role==='embed'?rerank:generate)).focus();}
    catch(error) {if(token===revision) {activeTask=false;runtimeBusy=false;loadedRole=null;refresh();if(document.activeElement===cancel) (role==='embed'?reviewEmbed:reviewGenerate).focus();announce(`Local AI could not load: ${String(error.message).slice(0,240)} Static search remains available.`);}}
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(busy) stop('The previous AI operation was cancelled for a new search.');
    revision++;clearProposal();lastQuery=query.value.trim();
    try {matches=activeCorpus?describeCorpusMatches(activeCorpus.index.rank(lastQuery,{limit:10,...corpusFilters()}),lastQuery):sourceIndex.rank(lastQuery,10);showResults(matches);refresh();
      announce(matches.length?`${matches.length} selected source${matches.length===1?'':'s'} matched. Matches are lexical discovery, not verified answers.`:
        lastQuery?'No selected source matched. Explore the canonical source list; no answer has been inferred.':'Enter search terms to explore selected page sources.');
    } catch(error) {matches=[];showResults([]);refresh();announce(String(error.message).slice(0,240));}
  });
  query.addEventListener('input',()=>{
    const wasBusy=busy;
    revision++;if(wasBusy) stop('Local AI cancelled because the question changed.');
    clearProposal();matches=[];results.replaceChildren();refresh();
    if(!wasBusy) announce(query.value.trim()?'Question changed. Search selected sources to refresh results.':'Enter search terms to explore selected page sources.');
  });
  let snapshotPromise=null;
  const snapshot = () => activeCorpus?Promise.resolve(activeCorpus.corpus.snapshot):snapshotPromise??=digestJSON(sources.map(({id,text,url,label,graphId,snapshotId})=>({id,text,label,url:new URL(url,location.href).href,...(graphId?{graphId,snapshotId}:{})})));
  async function rankWithEmbeddings(allSources=false) {
    if((allSources?semanticSearch:rerank).disabled) return;
    const token=++revision,questionText=allSources?query.value.trim():lastQuery;
    clearProposal();activeTask=true;refresh();cancel.focus();
    try {
      const snapshotHash=await snapshot();if(token!==revision) return;
      const question=await getRuntime().embed(questionText,'query',{snapshot:snapshotHash});
      const ranked=[];
      const eligible=activeCorpus?activeCorpus.corpus.sources.filter(source=>activeCorpus.index.rank(source.id,{limit:1,...corpusFilters()}).length):sources;
      const candidates=allSources?eligible.map((source,position)=>({...source,position,score:0,matchedTerms:[],totalTerms:0,excerpt:activeCorpus?corpusPassage(source,questionText,600).text??'Follow the original source for the full context.':boundedText(source.text,360)})):matches;
      for(const source of candidates) {
        if(token!==revision) return;
        const sourceText=activeCorpus?corpusPassage(source,questionText,1600).text:boundedText(source.text,1600);
        if(!sourceText){announce('An excerpt without a complete bounded passage was omitted from embedding comparison. Its original source remains available.');continue;}
        const cacheKey=await digestJSON({snapshot:snapshotHash,sourceId:source.id,text:sourceText,
          model:runtime.model,runtime:runtime.manifest.runtime,...EMBEDDING_PROFILE});
        let encoded=embeddings.get(cacheKey);
        if(!encoded) {encoded=await runtime.embed(sourceText,'document',{snapshot:snapshotHash,sourceId:source.id});if(token!==revision) return;embeddings.set(cacheKey,encoded);}
        ranked.push({...source,similarity:cosine(question.embedding,encoded.embedding)});
        announce(`Compared ${ranked.length} of ${candidates.length} explicitly selected sources. Cancel remains available.`);
      }
      if(token!==revision) return;
      ranked.sort((a,b)=>b.similarity-a.similarity||b.score-a.score||a.position-b.position);
      matches=ranked.slice(0,10);lastQuery=questionText;activeTask=false;loadedRole='embed';showResults(matches,true);refresh();
      if(document.activeElement===cancel) (allSources?semanticSearch:rerank).focus();
      announce(allSources?'Up to 10 selected sources ranked by session-only embedding similarity. This is discovery, not a verified answer or exhaustive evidence search.':'Lexical matches reordered using session-only embedding similarities. Similarity does not establish meaning or truth.');
    } catch(error) {if(token===revision) {activeTask=false;runtimeBusy=false;refresh();showResults(matches);if(document.activeElement===cancel) query.focus();announce(`Embedding ranking failed: ${String(error.message).slice(0,240)} Previous source results are retained.`);}}
  }
  rerank.addEventListener('click',()=>rankWithEmbeddings(false));
  semanticSearch.addEventListener('click',()=>rankWithEmbeddings(true));
  generate.addEventListener('click',async()=>{
    if(generate.disabled) return;
    const token=++revision;clearProposal();activeTask=true;refresh();cancel.focus();
    try {
      const context=activeCorpus;let selection=null,evidence,request;
      if(context){
        selection=await buildEvidenceSelection(context.corpus,context.index,lastQuery,corpusEvidenceIds(context),{isCurrent:()=>token===revision});
        evidence=selection.request.evidence;request={question:selection.request.question,evidence,snapshot:selection.snapshot};
      }else{
        let evidenceTotal=0;evidence=matches.filter(source=>!source.discoveryOnly).slice(0,4).map(source=>{
          const text=boundedText(source.text,Math.min(4000,12000-evidenceTotal)).trim();evidenceTotal+=text.length;
          return {id:source.id,text,url:new URL(source.url,location.href).href};
        }).filter(source=>source.text);
        request={question:lastQuery,evidence,snapshot:await snapshot(),...(payload.proposalFormat!=='plain-text'&&lastExactContext?{context:lastExactContext}:{})};
      }
      if(token!==revision)return;
      const response=payload.proposalFormat==='plain-text'?await getRuntime().generate(request):await getRuntime().generateProposal(request,selection?{format:selection.request.format}:{});if(token!==revision) return;
      const alignment=selection&&response.proposal?await mapCorpusProposal(selection,response.proposal,{isCurrent:()=>token===revision}):null;if(token!==revision)return;
      answer.append(element('p','Unreviewed AI proposal — verify it against the original sources.'));
      if(response.proposal){
        const proposal=response.proposal;
        if(proposal.status==='insufficient-evidence')answer.append(element('p',proposal.reason||'The model reports insufficient selected evidence. This remains an unreviewed response.'));
        for(const claim of proposal.claims){
          const paragraph=element('p',claim.text,'local-ai-proposal-text'),references=element('ul');
          for(const citation of claim.citations){const line=element('li'),link=element('a',citation.sourceId);link.href=citation.url;line.append(link,element('blockquote',citation.quote),element('small',`Exact selected-excerpt UTF-16 range ${citation.start}–${citation.end}. Quote alignment does not establish that this source supports the claim.`));references.append(line);}
          answer.append(paragraph,references);
        }
        const audit=element('details'),summary=element('summary','Citation validation and proposal identity');audit.append(summary,element('pre',JSON.stringify(proposal.provenance,null,2)));answer.append(audit);
        if(alignment){const details=element('details');details.append(element('summary','Inspect original selected-excerpt citation coordinates'),element('pre',JSON.stringify(alignment,null,2)));answer.append(details);}
        if(selection&&proposal.claims.length&&typeof response.rawProposal==='string'){
          supportControls=mountSupportReviewControls(answer,{rawProposal:response.rawProposal,selection,isCurrent:()=>token===revision,announce});await supportControls.ready;if(token!==revision)return;
        }
      }else answer.append(element('p',response.text,'local-ai-proposal-text'),element('p','Plain-text compatibility mode: individual claim references and quotations have not been validated.'));
      const sourceList=element('ul');
      for(const item of evidence) {const source=selection?context.index.lookup(selection.receipt.windows.find(window=>window.id===item.id).sourceId):sources.find(source=>source.id===item.id);const line=element('li'),link=element('a',source?.label??item.id);link.href=item.url;line.append(link);sourceList.append(line);}
      const provenance=response.provenance;
      answer.append(element('p',`Model: ${provenance.model.id}; revision: ${provenance.model.revision}. Selected excerpts were supplied as evidence; links do not prove that each generated assertion is supported.`),sourceList);
      const record=element('details'),summary=element('summary','Proposal provenance');record.append(summary,element('pre',JSON.stringify(provenance,null,2)));answer.append(record);
      answer.hidden=false;activeTask=false;loadedRole='generate';refresh();announce('An unreviewed AI proposal is available below with its selected sources.');
      if(document.activeElement===cancel) generate.focus();
    } catch(error) {if(token===revision) {activeTask=false;runtimeBusy=false;refresh();if(document.activeElement===cancel) query.focus();announce(`Local drafting failed: ${String(error.message).slice(0,240)} Canonical sources are unchanged.`);}}
  });
  cancel.addEventListener('click',()=>{stop('Local AI cancelled. Static search and canonical sources remain available.');query.focus();});
  release.addEventListener('click',()=>{stop('Local AI released and proposals cleared. Static search remains available.',true);query.focus();});
  reset.addEventListener('click',()=>{
    stop('Local AI session cleared.',true);runtime?.reset();manifest=null;query.value='';lastQuery='';matches=[];results.replaceChildren();refresh();
    announce('Local AI session reset: model resources, manifest, source vectors, question and proposals cleared. Saved model downloads are unchanged; delete them separately.');query.focus();
  });
  clearCache.addEventListener('click',async()=>{
    stop('Releasing local AI before deleting saved downloads.',true);
    const controller=new AbortController(),token=++revision;storageController=controller;activeTask=true;refresh();
    try {
      const result=validateClearStorageResult(await clearStoredModels({signal:controller.signal}));if(token!==revision)return;
      storageDetails.hidden=true;storageDetails.textContent='';if(runtime)runtime.storage=null;
      if(result.status==='cleared')announce(`This extension's saved model download stores were cleared (${result.removedCaches} removed${result.legacyRemoved?', including the legacy cache':''}). Browser-managed HTTP caches and other websites are unchanged.`);
      else if(result.status==='busy')announce('The saved model download store is busy in another tab. This request deleted nothing. Release that operation and retry.');
      else if(result.status==='cancelled')announce(`Model download deletion was cancelled; ${result.removedCaches} stores were removed before cancellation. Saved bytes may remain.`);
      else announce(`The browser could not confirm complete deletion (${result.code??'storage-unavailable'}; ${result.removedCaches} stores removed). Saved bytes may remain. Use the browser's site-data controls if needed.`);
    }
    catch {if(token===revision)announce('The browser could not confirm deletion of saved model downloads. Saved bytes may remain; use the browser\'s site-data controls.');}
    finally {if(storageController===controller)storageController=null;if(token===revision){activeTask=false;refresh();query.focus();}}
  });
  if(payload.manifest) {
    controls.append(reviewEmbed,reviewGenerate,rerank,semanticSearch,generate,cancel,release,reset,clearCache);
    slot.append(element('p','Local AI is optional. Review and confirm model/runtime files before any model load. The configured browser runtime receives your question and selected page excerpts; review the author-provided runtime before use.'));
  } else slot.append(element('p','No local AI model manifest is configured. Static search and canonical sources remain available.'));
  slot.append(form,status,storageDetails,results,controls,consent,answer);refresh();slot.hidden=false;
  function combinedCatalogue(nextExcerpts,nextGraphs){
    const selected=[...nativeSources,...nextExcerpts];let total=selected.reduce((sum,item)=>sum+item.text.length,0);
    if(selected.length>LIMITS.sources||total>LIMITS.total)throw Error('Combined explicitly selected excerpts exceed this panel\'s source budget; select fewer pages.');
    let omitted=0;
    for(const source of nextGraphs){if(selected.length>=LIMITS.sources||total+source.text.length>LIMITS.total){omitted++;continue;}selected.push(source);total+=source.text.length;}
    return {index:createSourceIndex(selected,{graphSources:true,baseURL:location.href}),omitted};
  }
  companionControls=mountCompanionControls({root:slot,payload,isBusy:()=>busy,onBusy:value=>{activeTask=value;refresh();},announce,
    onCorpus:selectCorpus,onCorpusFilters:()=>{if(activeCorpus){selectCorpus(activeCorpus);announce('Corpus filters changed. Search again to refresh passages and proposals.');}},
    onContext:value=>{if(activeCorpus)return;lastExactContext=value;clearProposal();},onSources:catalogue=>{
      const combined=combinedCatalogue(catalogue.sources,graphSources);
      stop('Selected page excerpts refreshed.');activeCorpus=null;searchLabel('Search selected page sources ');excerptSources=catalogue.sources;sources=combined.index.sources;sourceIndex=combined.index;snapshotPromise=null;lastExactContext=null;
      matches=[];lastQuery='';results.replaceChildren();refresh();return catalogue.sources.length;
    }});
  const graphController=new AbortController();
  if(payload.graphRegistry&&payload.graphs!==false)void loadGraphSources(payload.graphRegistry,payload.graphs,{baseURL:location.href,localSources:[],signal:graphController.signal}).then(result=>{
    if(graphController.signal.aborted)return;
    // Validate the whole replacement before touching the usable local state.
    // A catalogue/native ID collision must not leave sources and index apart.
    const combined=combinedCatalogue(excerptSources,result.sources),combinedIndex=combined.index;
    if(activeCorpus){graphSources=result.sources;sources=combinedIndex.sources;sourceIndex=combinedIndex;snapshotPromise=null;return;}
    stop('Public graph source catalogue refreshed.');graphSources=result.sources;sources=combinedIndex.sources;sourceIndex=combinedIndex;snapshotPromise=null;lastExactContext=null;
    matches=[];lastQuery='';results.replaceChildren();
    const names=result.graphs.map(graph=>graph.label).join(', ');
    announce(`Search includes selected page sources and public graph catalogue entries${names?` from ${names}`:''}.${result.graphs.some(graph=>graph.status!=='complete')?' One or more graph snapshots are incomplete; absence of a result is not evidence of absence.':''}${result.bounded||combined.omitted?' This panel uses a bounded subset; website search covers all eligible public graphs.':''} Graph summaries aid discovery and are not admitted automatically as reviewed AI evidence.`);
    refresh();
  }).catch(()=>{if(!graphController.signal.aborted)announce('Public graph discovery is unavailable. Selected page source search remains available.');});
  const ownerDocument=document,providerId='local-ai-generation-'+(++generationSequence);
  const provider={connected:()=>globalThis.document===ownerDocument&&panel.ownerDocument===ownerDocument&&slot.ownerDocument===ownerDocument&&raw.ownerDocument===ownerDocument&&
      panel.isConnected===true&&slot.isConnected===true&&raw.isConnected===true&&
      panel.querySelector(':scope > .local-ai-enhancement')===slot&&panel.querySelector(':scope > script.local-ai-data')===raw&&raw.textContent===rawIdentity,
    status:()=>busy||runtime?.busy?'busy':runtime?.status==='ready'&&runtime.model?.capability==='generate'&&loadedRole==='generate'?'ready':'not-ready',
    focus:()=>reviewGenerate.focus(),dispose:()=>stop('Local AI released after its panel was removed.',true),
    async generate(packet,options){
      companionCurrent(options);if(!provider.connected()||provider.status()!=='ready')throw generationError('local-ai-generation-provider-not-ready');
      const token=++revision,engine=runtime;activeTask=true;clearProposal();refresh();announce('Drafting an unreviewed proposal for another explicit control on this page. Cancel local AI remains available.');
      let refusal=null;
      const invalidate=code=>{if(token!==revision)return;refusal=code;stop(code==='local-ai-generation-stale'?'Companion source context changed. Local AI was cancelled.':'Companion drafting cancelled. Source search remains available.');};
      const aborted=()=>invalidate('local-ai-generation-cancelled');options.signal?.addEventListener('abort',aborted,{once:true});
      const timer=setInterval(()=>{try{companionCurrent(options);if(!provider.connected()){generationProviders.delete(providerId);throw generationError('local-ai-generation-stale');}}catch(error){invalidate(error.code??'local-ai-generation-stale');}},50);
      try{
        companionCurrent(options);if(token!==revision)throw generationError('local-ai-generation-cancelled');
        const request={question:packet.question,evidence:packet.evidence,snapshot:packet.hashes.snapshot,...(packet.context?{context:packet.context}:{})};
        const response=await engine.generateProposal(request,{format:QUOTE_PROPOSAL_FORMAT});companionCurrent(options);
        if(token!==revision||runtime!==engine||!provider.connected())throw generationError(refusal??'local-ai-generation-cancelled');
        if(response.proposalRequest?.hashes.requestSha256!==packet.hashes.requestSha256)throw generationError('local-ai-generation-request-mismatch');
        announce('An unreviewed companion proposal was returned to its requesting control. Its original source review still applies.');return response;
      }catch(error){if(refusal)throw generationError(refusal);if(token!==revision)throw generationError('local-ai-generation-cancelled');throw error;}
      finally{clearInterval(timer);options.signal?.removeEventListener('abort',aborted);if(token===revision){activeTask=false;refresh();}}
    }};
  const registerProvider=()=>{if(payload.manifest&&provider.connected())generationProviders.set(providerId,provider);};registerProvider();
  // A page can return from the back/forward cache and load a fresh model. Every
  // later pagehide must release that replacement as well.
  window.addEventListener('pagehide',()=>{generationProviders.delete(providerId);graphController.abort();stop('Local AI released.',true);});
  window.addEventListener('pageshow',registerProvider);
}
function start() {
  for(const panel of document.querySelectorAll('.local-ai')) {
    try {enhance(panel);} catch { /* Canonical content and native links remain usable. */ }
  }
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});else start();
