// Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
import {loadExcerptCatalogue} from './excerpt-catalogue.js';
import {loadQueryProviders} from './query-provider.js';
import {loadPublicCorpus,createCorpusIndex} from './corpus.js';
const node=(tag,text)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;return item;};
const button=text=>{const item=node('button',text);item.type='button';return item;};
const field=(text,input)=>{const label=node('label',text+' ');label.append(input);return label;};
const option=(id,label)=>{const value=node('option',label);value.value=id;return value;};

export function mountCompanionControls({root,payload,isBusy,onBusy,onSources,onContext,announce,onCorpus,onCorpusFilters}) {
  let epoch=0,controller=null,providers=[],disposed=false,busyState=false,corpusState=null,corpusActive=false,finishTask=null,taskOrigin=null;
  const section=node('section');section.className='local-ai-companions';
  section.setAttribute('aria-label','Explicit page sources and exact graph questions');
  const taskButtons=[],inputs=[];
  const abortButton=button('Cancel page-source or graph request');abortButton.disabled=true;abortButton.hidden=true;
  let updateCorpusControls=()=>{},readCorpusFilters=()=>Object.freeze({});
  const setBusy=value=>{busyState=value;for(const item of [...taskButtons,...inputs])item.disabled=value;updateCorpusControls();abortButton.disabled=!controller;abortButton.hidden=!controller;};
  const busy=value=>{setBusy(value);onBusy(value);};
  const restoreFocus=origin=>{if(origin?.isConnected!==false&&typeof origin?.focus==='function')origin.focus();};
  const cancel=()=>{const returnFocus=document.activeElement===abortButton,origin=taskOrigin,finish=finishTask;finishTask=null;epoch++;controller?.abort();controller=null;busy(false);if(!disposed){finish?.('cancelled');if(returnFocus)restoreFocus(origin);}};
  abortButton.addEventListener('click',()=>{cancel();announce('Page-source or graph request cancelled. Existing source search remains available.');});
  async function task(action,onFinished){
    if(disposed||isBusy())return;
    const version=++epoch,owner=new AbortController(),origin=document.activeElement;controller=owner;taskOrigin=origin;finishTask=onFinished??null;const signal=owner.signal;let outcome='completed';
    const timer=setTimeout(()=>owner.abort(),30000);abortButton.disabled=false;abortButton.hidden=false;abortButton.focus();busy(true);
    try{await action({signal,isCurrent:()=>!disposed&&version===epoch&&!signal.aborted});}
    catch(error){outcome=signal.aborted?'cancelled':'failed';if(version===epoch&&!onFinished)announce(`The selected companion action failed: ${String(error.message).slice(0,200)}. Existing source search remains available.`);}
    finally{clearTimeout(timer);if(version===epoch){const returnFocus=document.activeElement===abortButton;finishTask=null;controller=null;abortButton.disabled=true;busy(false);onFinished?.(outcome);if(returnFocus)restoreFocus(origin);}}
  }
  let selectPageSources=()=>{};
  if(payload.corpusPages?.length){
    const advanced=node('details'),summary=node('summary','Search a larger selected public corpus');advanced.append(summary);advanced.className='local-ai-corpus-controls';
    const loadCorpus=button('Load selected corpus'),useCorpus=button('Use loaded corpus'),usePage=button('Use this page’s sources'),mode=node('p','Searching this page’s selected sources.'),progress=node('p');
    progress.className='local-ai-corpus-progress';
    const filters=node('div');filters.className='local-ai-corpus-filters';
    const graphs=node('select'),languages=node('select'),review=node('select');
    graphs.setAttribute('aria-label','Corpus graph context');languages.setAttribute('aria-label','Corpus source language');review.setAttribute('aria-label','Corpus declared review');
    const choices=(input,all,values)=>{input.replaceChildren(option('',all),...values.map(([id,label])=>option(id,label)));input.value='';};
    choices(graphs,'All graph contexts',[]);choices(languages,'All source languages',[]);choices(review,'Any declared review',[['declared','Declared'],['author-reviewed','Author-reviewed declaration']]);
    taskButtons.push(loadCorpus,useCorpus,usePage);inputs.push(graphs,languages,review);
    const linked=typeof onCorpus==='function';
    updateCorpusControls=()=>{loadCorpus.disabled=busyState||!linked;useCorpus.disabled=busyState||!linked||!corpusState||corpusActive;usePage.disabled=busyState||!linked||!corpusActive;for(const input of [graphs,languages,review])input.disabled=busyState||!corpusActive;};
    readCorpusFilters=()=>Object.freeze(!corpusActive?{}:{...(graphs.value?{graphIds:Object.freeze([graphs.value])}:{}),...(languages.value?{languages:Object.freeze([languages.value])}:{}),...(review.value?{review:review.value}:{})});
    const showMode=()=>{mode.textContent=corpusActive?`Searching the loaded corpus: ${corpusState.corpus.sources.length} explicitly selected public records from ${corpusState.corpus.pages.length} pages. These observed responses do not establish a shared website build or source support.`:'Searching this page’s selected sources. The accepted corpus remains in this tab until the page is closed.';updateCorpusControls();};
    selectPageSources=()=>{if(!corpusActive)return;if(disposed||busyState&&!controller)return;onCorpus(null);corpusActive=false;showMode();};
    for(const input of [graphs,languages,review])input.addEventListener('change',()=>{if(disposed||!corpusActive||busyState)return;onCorpusFilters?.();announce('Corpus filters changed. Run Search again; previous results, proposals and support reviews no longer apply.');});
    loadCorpus.addEventListener('click',()=>{if(!linked)return;let committed=false;void task(async({signal,isCurrent})=>{
      progress.textContent=`Loading ${payload.corpusPages.length} explicitly selected published pages…`;
      announce(`${progress.textContent} Cancel is available. Existing selected source search is retained; no model is being loaded.`);
      const corpus=await loadPublicCorpus(payload.corpusPages,{baseURL:location.href,signal,isCurrent,onProgress:value=>{if(isCurrent())progress.textContent=`Loaded ${value.pagesLoaded} of ${value.pagesRequested} pages; ${value.records} public records observed.`;}}),index=createCorpusIndex(corpus);
      if(!isCurrent())return;
      // The callback synchronously commits the complete pair. A thrown callback
      // leaves this module's last accepted pair/mode/filter controls untouched.
      const accepted=Object.freeze({corpus,index});onCorpus(accepted);corpusState=accepted;corpusActive=true;committed=true;
      const graphValues=[...new Set(corpus.sources.map(source=>source.graphId).filter(Boolean))].sort(),languageValues=[...new Map(corpus.sources.map(source=>[source.lang.toLowerCase(),source.lang])).values()].sort((a,b)=>a.localeCompare(b,'en'));
      choices(graphs,'All graph contexts',graphValues.map(id=>[id,id]));choices(languages,'All source languages',languageValues.map(id=>[id,id]));review.value='';showMode();onCorpusFilters?.();
    },outcome=>{
      const retained=corpusState?`Last accepted corpus: ${corpusState.corpus.sources.length} public records from ${corpusState.corpus.pages.length} selected pages.`:'No corpus has been accepted. This page’s selected source search remains available.';
      progress.textContent=outcome==='completed'&&committed?`${retained} Ready for corpus search. Selection and exact observed text hashes do not verify claims. No model was loaded.`:committed?`The corpus was accepted, but an optional interface update ${outcome==='cancelled'?'was cancelled':'failed'}. ${retained}`:`Corpus load ${outcome==='cancelled'?'cancelled':'failed'}; no replacement was accepted. ${retained}`;
      announce(progress.textContent);
    });});
    useCorpus.addEventListener('click',()=>{if(disposed||busyState||!corpusState||corpusActive||!linked)return;onCorpus(corpusState);corpusActive=true;showMode();onCorpusFilters?.();announce('Using the accepted loaded corpus. Run Search again with the selected corpus filters. No pages were fetched and no model was loaded.');});
    usePage.addEventListener('click',()=>{if(disposed||busyState||!corpusActive||!linked)return;selectPageSources();announce('Using this page’s selected sources. The accepted loaded corpus can be selected again without another fetch.');});
    filters.append(field('Graph context',graphs),field('Source language',languages),field('Declared review',review));
    advanced.append(node('p',`${payload.corpusPages.length} published pages are explicitly selected for this optional corpus. Load reads only marked public excerpts. It does not scrape the whole website, verify claims, load models or save the corpus in browser storage.`),loadCorpus,useCorpus,usePage,mode,progress,filters);
    if(!linked)advanced.append(node('p','Corpus search is unavailable with this interface. This page’s source search remains available.'));
    section.append(advanced);updateCorpusControls();
  }
  if(payload.sourcePages.length){
    const excerpts=button('Load selected page excerpts');taskButtons.push(excerpts);
    section.append(node('p',`${payload.sourcePages.length} other published page${payload.sourcePages.length===1?' is':'s are'} explicitly selected. Loading reads only marked public excerpts; it does not load models or make a website-wide coverage claim.`),excerpts);
    excerpts.addEventListener('click',()=>void task(async({signal,isCurrent})=>{
      const catalogue=await loadExcerptCatalogue(payload.sourcePages,{baseURL:location.href,signal});
      if(!isCurrent())return;
      const count=onSources(catalogue);selectPageSources();
      announce(`${count} selected public excerpts are now available for source search. Selection and exact text hashes do not verify their claims. No model was loaded.`);
    }));
  }
  if(payload.graphRegistry&&payload.graphs!==false){
    const discover=button('Choose exact graph questions');taskButtons.push(discover);
    const controls=node('div');controls.hidden=true;controls.className='local-ai-graph-controls';
    const graphs=node('select'),operations=node('select'),start=node('input'),target=node('input'),from=node('input'),to=node('input');
    graphs.setAttribute('aria-label','Public graph for exact questions');operations.setAttribute('aria-label','Exact graph question');
    start.type='text';start.maxLength=4096;target.type='text';target.maxLength=4096;from.type='date';to.type='date';
    inputs.push(graphs,operations,start,target,from,to);
    const run=button('Run exact graph question'),clear=button('Clear graph question');taskButtons.push(run,clear);
    const queryProgress=node('p','Graph details load only when you run a question. No model is loaded.');queryProgress.className='local-ai-query-progress';
    queryProgress.setAttribute('role','status');queryProgress.setAttribute('aria-live','polite');
    const output=node('section');output.hidden=true;output.className='local-ai-query-output';
    output.setAttribute('aria-label','Exact producer result and coverage');
    function choices(){
      operations.replaceChildren(...[
        ['lookup','Find an exact object ID'],['neighbours','Declared neighbours'],['definitions','Declared definitions'],
        ['prerequisites','Declared prerequisites'],['pageIndex','Index of declared pages'],['shortestPagePath','Shortest declared page path']
      ].map(([id,label])=>option(id,label)));
      for(const profile of providers.find(item=>item.id===graphs.value)?.client.profiles??[])operations.append(option('profile:'+profile.id,profile.label));
      output.replaceChildren();output.hidden=true;onContext(null);
    }
    graphs.addEventListener('change',choices);
    operations.addEventListener('change',()=>{output.hidden=true;onContext(null);});
    for(const input of [start,target,from,to])input.addEventListener('input',()=>{output.hidden=true;onContext(null);});
    controls.append(field('Graph',graphs),field('Question',operations),field('Object ID or starting page ID',start),field('Target object or destination page ID',target),field('Window start (for date questions)',from),field('Window end (for date questions)',to),run,clear,queryProgress,output);
    clear.addEventListener('click',()=>{cancel();busy(false);output.replaceChildren();output.hidden=true;onContext(null);queryProgress.textContent='Question cleared. Verified graph details can remain in this tab until it is closed.';announce('Graph question cleared. Source search remains available.');});
    discover.addEventListener('click',()=>void task(async({signal,isCurrent})=>{
      const result=await loadQueryProviders(payload.graphRegistry,payload.graphs,{baseURL:location.href,signal});
      if(!isCurrent()){for(const item of result.graphs)item.client.dispose();return;}
      for(const item of providers)item.client.dispose();providers=result.graphs;
      queryProgress.textContent='Graph details load only when you run a question. No model is loaded.';
      graphs.replaceChildren(...providers.map(item=>option(item.id,`${item.label} (${item.id}; ${item.status})`)));
      choices();controls.hidden=!providers.length;
      announce(`${providers.length} graph question provider${providers.length===1?'':'s'} available.${result.unavailable.length?' Some selected graphs have no compatible provider.':''} This action loaded provider descriptions. Choose Run to execute a question; model loading has separate consent.`);
    }));
    run.addEventListener('click',()=>void task(async({signal,isCurrent})=>{
      const selected=providers.find(item=>item.id===graphs.value);if(!selected)throw Error('Choose a compatible graph first');
      const choice=operations.value;let operation=choice,params;
      if(choice.startsWith('profile:')){
        operation='profile';const profileId=choice.slice(8),profile=selected.client.profiles.find(item=>item.id===profileId);
        if(!profile)throw Error('The selected profile changed');
        params={profileId,...(profile.operation==='time-filter'?{window:{start:from.value,end:to.value}}:profile.operation==='evidence'?{target:target.value.trim()||start.value.trim()}:{start:start.value.trim()})};
      }else if(choice==='pageIndex')params={};
      else if(choice==='shortestPagePath')params={startPage:start.value.trim(),goalPage:target.value.trim()};
      else if(choice==='prerequisites')params={target:target.value.trim()||start.value.trim()};
      else params={id:start.value.trim()};
      queryProgress.textContent='Loading the selected graph for an exact question. Cancel is available; source search is retained.';
      const answer=await selected.client.execute(operation,params,{signal,isCurrent,onProgress:value=>{
        if(!isCurrent())return;
        if(value.status==='querying')queryProgress.textContent='Running the unchanged producer query over the complete loaded graph details.';
        else if(value.mode==='topics'&&typeof value.requiredParts==='number')queryProgress.textContent=`Verified ${value.loadedParts} of ${value.requiredParts} graph detail parts. ${value.verifiedTransferBytes??0} verified bytes received and ${value.reusedBytes??0} bytes reused in this action. All advertised parts are required before an exact answer.`;
        else queryProgress.textContent='Loading the selected graph and its producer. Cancel is available; no model is being loaded.';
      }});if(!isCurrent())return;
      const result=answer.result,provenance=answer.provenance;
      output.replaceChildren(node('p',`Graph ${selected.id}; result ${result.status}; exhaustive coverage ${typeof result.exhaustive==='boolean'?String(result.exhaustive):'not supplied by this producer operation'}. This is a deterministic declared-graph result. No model interpreted it.`));
      const raw=JSON.stringify(result,null,2),details=node('details'),summary=node('summary','Inspect exact result and provenance'),pre=node('pre',raw.length>24000?raw.slice(0,24000)+'\n[Preview truncated; download the full finite result.]':raw);
      details.append(summary,pre,node('pre',JSON.stringify(provenance,null,2)));output.append(details);
      const download=button('Download exact graph result');download.addEventListener('click',()=>{
        const url=URL.createObjectURL(new Blob([JSON.stringify(answer,null,2)+'\n'],{type:'application/json'})),link=node('a');link.href=url;link.download=`${selected.id}-graph-question.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      });output.append(download);output.hidden=false;
      onContext({graphId:provenance.graphId,snapshotId:provenance.snapshotId,querySha256:provenance.requestSha256,providerSha256:provenance.descriptorSha256,resultSha256:provenance.resultSha256});
      queryProgress.textContent=provenance.delivery?`Exact question finished after verifying all ${provenance.delivery.coverage.requiredParts} detail parts. ${provenance.delivery.verifiedTransferBytes} verified bytes received; ${provenance.delivery.reusedBytes} bytes reused from this tab. Source coverage remains ${provenance.graphStatus}.`:'Exact question finished using the whole-graph interface. Source coverage remains '+provenance.graphStatus+'.';
      announce(`Exact graph question completed with status ${result.status}. Read its coverage and declared evidence below.`);
    },outcome=>{if(outcome!=='completed'){queryProgress.textContent=`Graph question ${outcome==='cancelled'?'cancelled':'failed'}; no new exact answer was accepted. Earlier verified detail parts may be reused when you run again. Existing source search remains available.`;announce(queryProgress.textContent);}}));
    section.append(node('p','Use declared graph relations for structural questions. Object IDs distinguish concepts that share a word. Graphs remain separate unless a federation is explicitly selected.'),discover,controls);
  }
  if(section.childNodes.length){section.append(abortButton);root.append(section);}
  return {cancel,setBusy,corpusFilters:()=>readCorpusFilters(),dispose(){disposed=true;cancel();for(const item of providers)item.client.dispose();providers=[];corpusState=null;corpusActive=false;section.remove();}};
}
