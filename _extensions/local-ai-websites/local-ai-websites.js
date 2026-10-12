// Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
import {validatePayload,createSourceIndex,boundedText,cosine,LIMITS} from './retrieval.js';
import {LocalAIRuntime} from './runtime.js';
import {digestJSON,EMBEDDING_PROFILE} from './manifest.js';

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
  let payload;
  try {payload=validatePayload(JSON.parse(raw.textContent));} catch {return;}
  const sourceIndex=createSourceIndex(payload.sources);
  const form=element('form',undefined,'local-ai-search'),label=element('label','Search selected page sources '),query=element('input');
  query.type='search';query.maxLength=LIMITS.query;query.autocomplete='off';
  label.append(query);
  const submit=button('Search');submit.type='submit';form.append(label,submit);
  const status=element('p','Search uses only the explicitly selected sources on this page.','local-ai-status');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
  const results=element('ol',undefined,'local-ai-results');
  results.setAttribute('aria-label','Selected page source search results');
  const answer=element('section',undefined,'local-ai-proposal');answer.hidden=true;
  let runtime=null,revision=0,matches=[],lastQuery='',busy=false,activeTask=false,runtimeBusy=false,loadedRole=null,chosenRole=null,manifest=null;
  const embeddings=new Map(),controls=element('div',undefined,'local-ai-actions');
  const reviewEmbed=button('Review embedding model files'),reviewGenerate=button('Review language model files');
  const rerank=button('Rerank matches with embeddings'),semanticSearch=button('Search selected sources with embeddings'),generate=button('Draft an unreviewed explanation');
  const cancel=button('Cancel local AI'),release=button('Release local AI and clear proposals');
  const reset=button('Reset local AI session');
  const consent=element('section',undefined,'local-ai-consent');consent.hidden=true;
  consent.setAttribute('aria-label','Local model file confirmation');
  const details=element('p'),consentLabel=element('label',' Load these files for this session. '),confirmed=element('input');
  let detailsId='local-ai-model-files',detailsSuffix=0;
  while(document.getElementById(detailsId)) detailsId=`local-ai-model-files-${++detailsSuffix}`;
  details.id=detailsId;confirmed.setAttribute('aria-describedby',detailsId);
  confirmed.type='checkbox';consentLabel.prepend(confirmed);
  const load=button('Load selected model');consent.append(details,consentLabel,load);
  const announce = message => {if(status.textContent!==message) status.textContent=message;};
  function refresh() {
    busy=activeTask||runtimeBusy;
    const evidence=matches.length>0&&lastQuery===query.value.trim();
    reviewEmbed.disabled=busy;reviewGenerate.disabled=busy;
    load.disabled=busy||!confirmed.checked||!chosenRole;
    rerank.disabled=busy||loadedRole!=='embed'||!evidence;
    semanticSearch.disabled=busy||loadedRole!=='embed'||!query.value.trim()||!payload.sources.length;
    generate.disabled=busy||loadedRole!=='generate'||!evidence;
    cancel.disabled=!busy;release.disabled=!runtime;reset.disabled=!runtime;
  }
  function showResults(items,semantic=false) {
    results.replaceChildren();
    for(const source of items) {
      const item=element('li'),link=element('a',source.label),excerpt=element('p',source.excerpt);
      link.href=source.url;item.append(link,excerpt);
      item.append(element('small',source.exactId?'Exact source identifier match.':semantic||Number.isFinite(source.similarity)?
        'Optional embedding similarity discovery; meaning and support require source review.':`${source.matchedTerms.length} of ${source.totalTerms} query terms matched.`));
      results.append(item);
    }
  }
  function clearProposal() {answer.replaceChildren();answer.hidden=true;}
  function stop(message,dispose=false) {
    revision++;runtime?.[dispose?'release':'cancel']();activeTask=false;runtimeBusy=false;loadedRole=null;embeddings.clear();clearProposal();
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
        cancelled:'Local AI cancelled. Static sources remain available.',released:'Local AI released. Static sources remain available.',reset:'Local AI session reset. No browser storage was used by this extension.',
        failed:'Local AI failed. Static sources remain available.',unsupported:'Local AI is unsupported on this device. Static search remains available.'};
      if(state.status==='loading'&&Number.isSafeInteger(state.loadedBytes)&&Number.isSafeInteger(state.totalBytes))
        announce(`${state.stage==='initialising'?'Initialising the verified model':state.stage==='verifying'?'Verifying the downloaded model':'Loading confirmed model files'}: ${bytes(state.loadedBytes)} of ${bytes(state.totalBytes)}. Cancel remains available.`);
      else if(messages[state.status]) announce(messages[state.status]);
      refresh();
    }});
    return runtime;
  }
  async function review(role) {
    const token=++revision;activeTask=true;clearProposal();confirmed.checked=false;chosenRole=null;consent.hidden=true;refresh();cancel.focus();
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
    try {await getRuntime().load(role);if(token!==revision) return;activeTask=false;loadedRole=role;refresh();if(document.activeElement===cancel) ((role==='embed'?rerank:generate).disabled?query:(role==='embed'?rerank:generate)).focus();}
    catch(error) {if(token===revision) {activeTask=false;runtimeBusy=false;loadedRole=null;refresh();if(document.activeElement===cancel) (role==='embed'?reviewEmbed:reviewGenerate).focus();announce(`Local AI could not load: ${String(error.message).slice(0,240)} Static search remains available.`);}}
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(busy) stop('The previous AI operation was cancelled for a new search.');
    revision++;clearProposal();lastQuery=query.value.trim();
    try {matches=sourceIndex.rank(lastQuery,10);showResults(matches);refresh();
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
  const snapshot = () => snapshotPromise??=digestJSON(payload.sources.map(({id,text,url,label})=>({id,text,label,url:new URL(url,location.href).href})));
  async function rankWithEmbeddings(allSources=false) {
    if((allSources?semanticSearch:rerank).disabled) return;
    const token=++revision,questionText=allSources?query.value.trim():lastQuery;
    clearProposal();activeTask=true;refresh();cancel.focus();
    try {
      const snapshotHash=await snapshot();if(token!==revision) return;
      const question=await getRuntime().embed(questionText,'query',{snapshot:snapshotHash});
      const ranked=[];
      const candidates=allSources?payload.sources.map((source,position)=>({...source,position,score:0,matchedTerms:[],totalTerms:0,excerpt:boundedText(source.text,360)})):matches;
      for(const source of candidates) {
        if(token!==revision) return;
        const sourceText=boundedText(source.text,1600),cacheKey=await digestJSON({snapshot:snapshotHash,sourceId:source.id,text:sourceText,
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
      const evidence=matches.slice(0,4).map(source=>({id:source.id,text:boundedText(source.text,4000),url:new URL(source.url,location.href).href}));
      const snapshotHash=await snapshot();if(token!==revision) return;
      const response=await getRuntime().generate({question:lastQuery,evidence,snapshot:snapshotHash});if(token!==revision) return;
      answer.append(element('p','Unreviewed AI proposal — verify it against the original sources.'),element('p',response.text,'local-ai-proposal-text'));
      const sourceList=element('ul');
      for(const item of evidence) {const line=element('li'),link=element('a',payload.sources.find(source=>source.id===item.id).label);link.href=item.url;line.append(link);sourceList.append(line);}
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
    announce('Local AI session reset: model resources, manifest, source vectors, question and proposals cleared. This extension used no persistent browser storage.');query.focus();
  });
  if(payload.manifest) {
    controls.append(reviewEmbed,reviewGenerate,rerank,semanticSearch,generate,cancel,release,reset);
    slot.append(element('p','Local AI is optional. Review and confirm model/runtime files before any model load. The configured browser runtime receives your question and selected page excerpts; review the author-provided runtime before use.'));
  } else slot.append(element('p','No local AI model manifest is configured. Static search and canonical sources remain available.'));
  slot.append(form,status,results,controls,consent,answer);refresh();slot.hidden=false;
  // A page can return from the back/forward cache and load a fresh model. Every
  // later pagehide must release that replacement as well.
  window.addEventListener('pagehide',()=>stop('Local AI released.',true));
}
function start() {
  for(const panel of document.querySelectorAll('.local-ai')) {
    try {enhance(panel);} catch { /* Canonical content and native links remain usable. */ }
  }
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});else start();
