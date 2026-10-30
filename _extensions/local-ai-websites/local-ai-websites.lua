-- Copyright 2026 Kai Prince. SPDX-License-Identifier: Apache-2.0
-- Explicit page-local public projection; this is not a privacy filter.
local function fail(message) assert(false, 'local-ai-websites: ' .. message) end
local function has(el, name) return el.classes and el.classes:includes(name) end
local function text(value, field, limit)
  value = pandoc.utils.stringify(value)
  if value:match('^%s*$') or #value > limit then fail(field .. ' requires nonblank text within ' .. limit .. ' UTF-8 bytes') end
  return value
end
local function fragment(id)
  return '#' .. id:gsub('([^A-Za-z0-9._~-])', function(char) return string.format('%%%02X', char:byte()) end)
end
local function native_context()
  -- Capture the native UTF-8 input directory and documented project offset.
  -- Some Windows metadata roots use ANSI/replacement bytes; never reinterpret
  -- those bytes or use a pre-move output-file path as the final public page.
  local cwd=pandoc.system.get_working_directory()
  local function usable(value)
    return type(value)=='string' and utf8.len(value)~=nil and not value:find(utf8.char(0xfffd),1,true)
  end
  if not usable(cwd) or not pandoc.path.is_absolute(cwd) then fail('native document directory is unavailable; render within an ordinary document or project directory') end
  local root=pandoc.path.normalize(cwd)
  local offset=quarto.project.offset or '.'
  if type(offset)~='string' or #offset>2048 then fail('native project offset is unavailable') end
  offset=offset:gsub('\\','/')
  local depth=0
  for part in offset:gmatch('[^/]+') do
    if part=='..' then root=pandoc.path.directory(root);depth=depth+1
    elseif part~='.' then fail('native project offset must remain within the rendering context') end
  end
  local output=quarto.doc.output_file
  if not usable(output) then fail('native output path is unavailable; use an ordinary document or project output') end
  if not pandoc.path.is_absolute(output) then output=pandoc.path.join({cwd,output}) end
  local suffix=pandoc.path.make_relative(pandoc.path.normalize(output),root):gsub('\\','/')
  if pandoc.path.is_absolute(suffix) or suffix=='..' or suffix:match('^%.%./') then fail('selected public assets require output within the rendering context') end
  return {cwd=cwd,root=root,prefix=string.rep('../',depth)}
end
local function root_url(path,context) return context.prefix..path:sub(2) end
local function corpus_pages(value)
  if value==false then return nil end
  local kind=pandoc.utils.type(value)
  if kind~='table' and kind~='MetaMap' then fail('corpus must be false or a mapping with pages') end
  for key,_ in pairs(value) do if key~='pages' then fail('corpus has an unknown option; use pages only') end end
  local pages=value.pages
  local pages_kind=pages and pandoc.utils.type(pages)
  if pages_kind~='List' and pages_kind~='MetaList' then fail('corpus.pages requires a list of published local HTML URLs') end
  if #pages<1 or #pages>64 then fail('corpus.pages requires one to 64 explicitly selected published pages; use corpus: false to disable') end
  local result,seen={},{}
  for _,item in ipairs(pages) do
    local path=text(item,'corpus.pages URL',2048)
    if path:find('[\\:?#%%<>"\'%s]') or path:find('%c') or path:sub(1,2)=='//' or not path:lower():match('%.html$') or seen[path] then fail('corpus.pages requires unique local published .html URLs without query or fragment; use the actual output name') end
    seen[path]=true;result[#result+1]=path
  end
  return result
end
local function disabled(input)
  return input==false or (type(input)=='table' and input.enabled==false)
end
local function effective_options(meta, selected)
  local input=meta['local-ai']
  if disabled(input) or not selected then return input end
  -- Quarto's post-render per-file metadata can expose only the page's partial
  -- custom namespace, even though native inspection has the complete resolved
  -- document metadata. Let Quarto resolve profiles/directory/format/metadata
  -- files; do not read or reimplement the project's YAML configuration.
  local args={'inspect',quarto.doc.input_file}
  local profiles=quarto.project.profile or quarto.project.profiles
  if type(profiles)=='table' and #profiles>0 then
    local names={}
    for _,profile in ipairs(profiles) do names[#names+1]=pandoc.utils.stringify(profile) end
    args[#args+1]='--profile';args[#args+1]=table.concat(names,',')
  end
  local ok,bytes=pcall(pandoc.pipe,quarto.config.cli_path(),args,'')
  if not ok or type(bytes)~='string' or #bytes>16777216 then fail('native resolved document metadata is unavailable or exceeds its budget; check quarto inspect for this document') end
  local decoded,inspection=pcall(quarto.json.decode,bytes)
  if not decoded or type(inspection)~='table' or type(inspection.formats)~='table' then fail('native resolved document metadata is invalid') end
  if type(quarto.format)~='table' or type(quarto.format.format_identifier)~='function' then fail('native output-format identification is unavailable; use the required Quarto version') end
  local identifier=quarto.format.format_identifier()
  if type(identifier)~='table' or type(identifier['target-format'])~='string' or type(identifier['base-format'])~='string' then fail('native output-format identity is invalid') end
  local matches={}
  for name,format in pairs(inspection.formats) do
    local same=type(format)=='table' and type(format.identifier)=='table'
    for _,key in ipairs({'target-format','base-format','extension'}) do
      if same and format.identifier[key]~=identifier[key] then same=false end
    end
    if same then matches[#matches+1]={name=name,value=format} end
  end
  local format
  if #matches==1 then format=matches[1].value
  end
  local base
  if type(format)=='table' and type(format.metadata)=='table' then base=format.metadata['local-ai']
  elseif #matches==0 then
    -- An explicit --to may select a format absent from the source's configured
    -- formats. Do not borrow another format's settings; retain native project
    -- defaults and the actual render's effective page/filter overrides.
    local project=inspection.project
    if type(project)=='table' and type(project.config)=='table' then base=project.config['local-ai'] end
  else fail('native resolved metadata does not identify this output format unambiguously') end
  if base==nil then return input end
  local encoded=quarto.json.encode({['local-ai']=base})
  if #encoded>262144 then fail('resolved local-ai options exceed 262144 bytes') end
  -- Use Pandoc's own metadata conversion so [] and {} retain their native
  -- sequence/mapping distinction; no raw inspected configuration is published.
  local converted=pandoc.read('---\n'..encoded..'\n---\n','markdown').meta['local-ai']
  if input==nil then return converted end
  local kind=pandoc.utils.type(input)
  if kind~='table' and kind~='MetaMap' then return input end
  if disabled(converted) then
    if input.enabled~=true then return false end
    converted={}
  end
  if type(converted)~='table' then fail('resolved local-ai options must be a mapping or false') end
  -- Page/filter overrides win per key. Lists and corpus mappings are replaced
  -- atomically, preserving explicit false and never accumulating source stores.
  local merged={}
  for key,value in pairs(converted) do merged[key]=value end
  for key,value in pairs(input) do merged[key]=value end
  return merged
end
local function config(meta, selected)
  local result = {enabled=true, manifest=nil, graphs=false, publish_assets=false, source_pages={}, proposal_format='cited-json'}
  -- Composition is discovery-only: no model or source-content acquisition.
  local kg=meta['knowledge-graph'];local kg_kind=kg and pandoc.utils.type(kg)
  if (kg_kind=='table' or kg_kind=='MetaMap') and kg.enabled ~= false then result.graphs='all' end
  local input = effective_options(meta,selected)
  if input == nil then return result end
  if input == false then return {enabled=false} end
  local kind = pandoc.utils.type(input)
  if kind ~= 'table' and kind ~= 'MetaMap' then fail('local-ai options must be a mapping') end
  -- Explicit deactivation is a complete no-op, including stale configuration.
  if input.enabled == false then return {enabled=false} end
  for key, value in pairs(input) do
    if key == 'enabled' then
      if type(value) ~= 'boolean' then fail('enabled must be a boolean') end
      result.enabled = value
    elseif key == 'manifest' then
      if value==false then result.manifest=nil else
      local value_kind = pandoc.utils.type(value)
      if value_kind ~= 'string' and value_kind ~= 'Inlines' and value_kind ~= 'MetaString' and value_kind ~= 'MetaInlines' then fail('manifest must be a local URL path') end
      local path = text(value, 'manifest', 2048)
      if path:find('[\\:?#%%<>"\']') or path:find('%c') or path:match('^//') or not path:lower():match('%.json$') then fail('manifest must be a local .json URL path without query, fragment or encoded components') end
      if path:find('%s') or path:find('//', 1, true) then fail('manifest cannot contain whitespace or empty path components') end
      for part in path:gmatch('[^/]+') do if part == '.' or part == '..' then fail('manifest path cannot traverse directories') end end
      result.manifest = path
      end
    elseif key == 'publish-assets' then
      if type(value) ~= 'boolean' then fail('publish-assets must be a boolean') end
      result.publish_assets=value
    elseif key == 'proposal-format' then
      local selected=pandoc.utils.stringify(value)
      if selected~='cited-json' and selected~='plain-text' then fail('proposal-format must be cited-json or plain-text') end
      result.proposal_format=selected
    elseif key == 'source-pages' then
      local kind=pandoc.utils.type(value)
      if kind~='List' and kind~='MetaList' then fail('source-pages requires a list of published local HTML URLs') end
      if #value>8 then fail('source-pages supports at most eight explicitly selected pages') end
      local seen={}
      for _,item in ipairs(value) do
        local path=text(item,'source-pages URL',2048)
        if path:find('[\\:?#%%<>"\'%s]') or path:find('%c') or path:sub(1,2)=='//' or not path:lower():match('%.html$') or seen[path] then fail('source-pages requires unique local published .html URLs without query or fragment; use the actual output name') end
        seen[path]=true;result.source_pages[#result.source_pages+1]=path
      end
    elseif key == 'corpus' then
      result.corpus_pages=corpus_pages(value)
    elseif key == 'graphs' then
      local value_kind=pandoc.utils.type(value)
      if value==false then result.graphs=false
      elseif (value_kind=='string' or value_kind=='Inlines' or value_kind=='MetaString' or value_kind=='MetaInlines') and pandoc.utils.stringify(value)=='all' then result.graphs='all'
      elseif value_kind=='List' or value_kind=='MetaList' then
        if #value<1 or #value>32 then fail('graphs requires 1 to 32 graph IDs') end
        result.graphs={};local seen={}
        for _,item in ipairs(value) do local id=pandoc.utils.stringify(item);if not id:match('^[a-z][a-z0-9%-]*$') or #id>64 or seen[id] then fail('graphs requires unique lowercase graph IDs') end;seen[id]=true;result.graphs[#result.graphs+1]=id end
      else fail('graphs must be false, all or a list of graph IDs') end
    else fail('local-ai has an unknown option; use the documented local-ai options') end
  end
  return result
end
local function publish_manifest(path, publish_assets, context)
  -- The browser URL is relative to the rendered page, not the installed filter.
  -- Register this selected public file. The separate publish-assets opt-in
  -- admits only its prepared receipt inventory, never a recursive directory.
  local root, relative
  if path:sub(1,1) == '/' then
    root=context.root
    relative=path:sub(2)
  else
    root=context.cwd
    relative=path
  end
  local boundary=context.root
  local absolute=pandoc.path.normalize(pandoc.path.join({root,relative}))
  local admitted=pandoc.path.make_relative(absolute,boundary)
  if pandoc.path.is_absolute(admitted) then fail('manifest must remain within the document or project directory') end
  -- Reject links in the admitted path rather than following a public-looking
  -- file into an unrelated/private directory. Native files remain unchanged.
  local function is_link(value)
    local ok,result=pcall(pandoc.path.exists,value,'symlink')
    if not ok then fail('manifest must name an existing public JSON file; its ordinary directory/file path could not be verified') end
    return result
  end
  local cursor=boundary
  if is_link(cursor) then fail('manifest publication requires ordinary directories and files, not symbolic links') end
  for _,part in ipairs(pandoc.path.split(admitted)) do
    if part=='..' then fail('manifest must remain within the document or project directory') end
    cursor=pandoc.path.join({cursor,part})
    if is_link(cursor) then fail('manifest publication requires ordinary directories and files, not symbolic links') end
  end
  local file=io.open(absolute,'rb')
  if not file then fail('manifest must name an existing public JSON file beside the document or within the project') end
  local bytes=file:read(262145)
  file:close()
  if not bytes or #bytes>262144 then fail('manifest exceeds 262144 bytes; publish a bounded runtime inventory') end
  local ok, value=pcall(quarto.json.decode,bytes)
  if not ok or type(value)~='table' or not bytes:match('^%s*{') then fail('manifest must contain a JSON object; validate it with the asset preparation command') end
  quarto.doc.add_resource(absolute)
  if publish_assets then
    -- Explicitly selected prepared-pack publication replaces a hand-maintained
    -- project.resources list. Follow only its bounded receipt, never a directory.
    local asset_root=pandoc.path.directory(absolute)
    local receipt_path=pandoc.path.join({asset_root,'asset-receipt.json'})
    if is_link(receipt_path) then fail('prepared assets must be ordinary files') end
    local receipt_file=io.open(receipt_path,'rb')
    if not receipt_file then fail('publish-assets requires asset-receipt.json from the installed preparation command') end
    local receipt_bytes=receipt_file:read(262145);receipt_file:close()
    if not receipt_bytes or #receipt_bytes>262144 then fail('prepared asset receipt exceeds its size limit') end
    local decoded,receipt=pcall(quarto.json.decode,receipt_bytes)
    if not decoded or type(receipt)~='table' or receipt.version~=1 or receipt.operation~='explicit-local-preparation' or type(receipt.resourceFiles)~='table' or #receipt.resourceFiles<1 or #receipt.resourceFiles>256 then fail('prepared asset receipt is invalid; repeat explicit preparation') end
    local expected={}
    if type(value.runtime)~='table' or type(value.runtime.inventory)~='table' or type(value.models)~='table' then fail('prepared manifest requires runtime and model inventories') end
    for _,record in ipairs(value.runtime.inventory) do if type(record)=='table' and type(record.url)=='string' then expected[record.url:gsub('^%./','')]=record.bytes end end
    for _,record in ipairs(value.models) do if type(record)=='table' and type(record.url)=='string' then expected[record.url:gsub('^%./','')]=record.bytes end end
    local seen={}
    for _,name in ipairs(receipt.resourceFiles) do
      if type(name)~='string' or #name>2048 or name:find('[\\:?#%%<>"\'%s]') or name:find('%c') or name:sub(1,1)=='/' or name:find('//',1,true) then fail('prepared receipt contains an unsafe resource path') end
      local cursor=asset_root
      for part in name:gmatch('[^/]+') do
        if part=='.' or part=='..' or part:sub(1,1)=='.' then fail('prepared receipt cannot traverse or publish hidden paths') end
        cursor=pandoc.path.join({cursor,part});if is_link(cursor) then fail('prepared assets must be ordinary directories and files') end
      end
      if seen[name] then fail('prepared receipt has duplicate resources') end;seen[name]=true
      local resource=io.open(cursor,'rb');if not resource then fail('a prepared resource is absent; repeat explicit preparation') end
      local size=resource:seek('end');resource:close()
      if expected[name] then
        if type(expected[name])~='number' or size~=expected[name] then fail('prepared runtime/model size differs from its manifest') end
      elseif size>262144 then fail('prepared metadata/notice exceeds its size limit') end
      quarto.doc.add_resource(cursor)
    end
    for name,_ in pairs(expected) do if not seen[name] then fail('prepared receipt omits a runtime/model resource') end end
  end
  if path:sub(1,1)=='/' then
    -- Quarto preserves the input's project-relative directory in its output;
    -- output-file is a filename, and may be moved only after this filter runs.
    -- The native offset therefore works before/after that move and on subpaths.
    return root_url(path,context)
  end
  return path
end
local function process(doc)
  local selected=false
  doc:walk({Div=function(el)if has(el,'local-ai') or has(el,'local-ai-source') then selected=true end end})
  local options=config(doc.meta,selected)
  if not options.enabled then return doc end
  local anchors, sources, panels, total = {}, {}, {}, 0
  local function visit(el)
    local id=el.identifier
    if id and id ~= '' then anchors[id]=(anchors[id] or 0)+1 end
    if el.t ~= 'Div' then return end
    if has(el,'local-ai') then panels[#panels+1]=el end
    if not has(el,'local-ai-source') then return end
    if has(el,'local-ai') then fail('a panel cannot also be a source') end
    local source_role=el.attributes['data-learning-role'] or el.attributes['learning-role']
    if el.attributes.hidden~=nil or el.attributes['aria-hidden']=='true' or has(el,'generative-solution') or has(el,'generative-answer') or source_role=='solution' or source_role=='answer' or source_role=='feedback' then fail('a selected source must be public explanatory content outside hidden or answer material') end
    if not id or id=='' or #id>256 or id:find('[%s"\'<>#]') or id:find('%c') then fail('each source requires a bounded native anchor without whitespace or unsafe delimiters') end
    -- Native block boundaries must not join a heading's last word to prose.
    local inadmissible=false
    el.content:walk({Div=function(child)
      local role=child.attributes['data-learning-role'] or child.attributes['learning-role']
      if child.attributes.hidden~=nil or child.attributes['aria-hidden']=='true' or has(child,'generative-solution') or has(child,'generative-answer') or role=='solution' or role=='answer' or role=='feedback' then inadmissible=true end
    end,Span=function(child)if child.attributes.hidden~=nil or child.attributes['aria-hidden']=='true' then inadmissible=true end end,
    RawBlock=function()inadmissible=true end,RawInline=function()inadmissible=true end})
    if inadmissible then fail('a selected source contains hidden, answer, solution, feedback or raw HTML material; mark separate public explanatory Divs instead') end
    local body=text(pandoc.utils.blocks_to_inlines(el.content,{pandoc.Space()}),'source occurrence ' .. (#sources+1) .. '.text',12000):match('^%s*(.-)%s*$')
    local label=el.attributes['data-source-label'] and text(el.attributes['data-source-label'],'source label',256) or id
    total=total+#body
    if #sources>=100 or total>120000 then fail('page source budget exceeded: at most 100 sources and 120000 UTF-8 bytes') end
    local review=el.attributes['data-source-review'] or 'declared'
    if review~='declared' and review~='author-reviewed' then fail('data-source-review must be declared or author-reviewed; model output cannot grant review') end
    local graph=el.attributes['data-source-graph']
    if graph and (not graph:match('^[a-z][a-z0-9%-]*$') or #graph>64) then fail('data-source-graph requires a safe named graph identity') end
    sources[#sources+1]={id=id,text=body,label=label,url=fragment(id),review=review,graphId=graph}
  end
  doc:walk({Div=visit,Span=visit,Header=visit,Code=visit,CodeBlock=visit,Link=visit,Image=visit,Table=visit,Figure=visit})
  if #panels>1 then fail('at most one .local-ai panel is supported per document') end
  if #panels==1 and panels[1].attributes['data-proposal-format'] then
    local selected=panels[1].attributes['data-proposal-format']
    if selected~='cited-json' and selected~='plain-text' then fail('data-proposal-format must be cited-json or plain-text') end
    options.proposal_format=selected
  end
  for index,source in ipairs(sources) do if anchors[source.id]~=1 then fail('source occurrence ' .. index .. '.id is duplicated in native content; assign a unique native ID') end end
  local html=quarto.doc.is_format('html:js')
  local function escaped_json(value)
    return value:gsub('<','\\u003c'):gsub('>','\\u003e'):gsub('&','\\u0026'):gsub(utf8.char(0x2028),'\\u2028'):gsub(utf8.char(0x2029),'\\u2029')
  end
  -- An explicit source is ordinary public native content. Export only that
  -- bounded projection after Quarto's visibility processing, even without a
  -- search panel. No page scraping, filesystem sidecar or post-render hook.
  if html and #sources>0 then
    local encoded={}
    for _,source in ipairs(sources) do encoded[#encoded+1]=quarto.json.encode(source) end
    local lang=doc.meta.lang and pandoc.utils.stringify(doc.meta.lang) or 'en'
    if #lang>64 or not lang:match('^[A-Za-z][A-Za-z0-9%-]*$') then fail('public excerpt language requires a bounded language tag') end
    doc.blocks:insert(pandoc.RawBlock('html','<script type="application/json" class="local-ai-public-data">'..escaped_json('{"version":1,"lang":'..quarto.json.encode(lang)..',"sources":['..table.concat(encoded,',')..']}')..'</script>'))
  end
  if #panels==0 then return doc end
  local items={}
  for _,source in ipairs(sources) do items[#items+1]={pandoc.Plain({pandoc.Link({pandoc.Str(source.label)},source.url)})} end
  local native=pandoc.List({pandoc.Para({pandoc.Str('Selected page sources')})})
  if #items>0 then native:insert(pandoc.BulletList(items))
  else native:insert(pandoc.Para({pandoc.Str('No sources have been selected for this page.')})) end
  local needs_context=options.manifest~=nil or (options.graphs~=false and quarto.project.output_directory~=nil)
  for _,path in ipairs(options.source_pages) do if path:sub(1,1)=='/' then needs_context=true end end
  for _,path in ipairs(options.corpus_pages or {}) do if path:sub(1,1)=='/' then needs_context=true end end
  local context=html and needs_context and native_context() or nil
  if html and options.manifest then options.manifest=publish_manifest(options.manifest,options.publish_assets,context) end
  local registry=nil
  if html and options.graphs~=false and quarto.project.output_directory then
    registry=root_url('/knowledge-graph/registry.json',context)
  end
  local records={}
  for _,source in ipairs(sources) do records[#records+1]=quarto.json.encode({id=source.id,text=source.text,label=source.label,url=source.url}) end
  local selection='false'
  if options.graphs=='all' then selection='"all"' elseif type(options.graphs)=='table' then local ids={};for _,id in ipairs(options.graphs) do ids[#ids+1]=quarto.json.encode(id) end;selection='['..table.concat(ids,',')..']' end
  local page_urls={}
  for _,path in ipairs(options.source_pages) do
    if html and path:sub(1,1)=='/' then
      path=root_url(path,context)
    end
    page_urls[#page_urls+1]=quarto.json.encode(path)
  end
  local corpus_payload=''
  if options.corpus_pages then
    local corpus_urls={}
    for _,path in ipairs(options.corpus_pages) do
      if html and path:sub(1,1)=='/' then path=root_url(path,context) end
      corpus_urls[#corpus_urls+1]=quarto.json.encode(path)
    end
    corpus_payload=',"corpusPages":['..table.concat(corpus_urls,',')..']'
  end
  local payload='{"version":0,"sources":[' .. table.concat(records,',') .. '],"manifest":' .. (options.manifest and quarto.json.encode(options.manifest) or 'null') .. ',"graphRegistry":' .. (registry and quarto.json.encode(registry) or 'null') .. ',"graphs":' .. selection .. ',"sourcePages":['..table.concat(page_urls,',')..']'..corpus_payload..',"proposalFormat":'..quarto.json.encode(options.proposal_format)..'}'
  payload=payload:gsub('<','\\u003c'):gsub('>','\\u003e'):gsub('&','\\u0026')
    :gsub(utf8.char(0x2028),'\\u2028'):gsub(utf8.char(0x2029),'\\u2029')
  doc.blocks=doc.blocks:walk({Div=function(el)
    if not has(el,'local-ai') then return end
    el.content:insert(pandoc.Div(native,pandoc.Attr('',{'local-ai-sources'})))
    if html then el.content:insert(pandoc.RawBlock('html','<div class="local-ai-enhancement" hidden></div><script type="application/json" class="local-ai-data">' .. payload .. '</script>')) end
    return el
  end})
  if html then
    quarto.doc.add_html_dependency({name='local-ai-websites',version='0.0.12',
      scripts={{path='local-ai-websites.js',attribs={type='module'}}},stylesheets={'local-ai-websites.css'},
      resources={'corpus.js','evidence-windows.js','support-review.js','support-review-controls.js','retrieval.js','graphs.js','query-provider.js','query-delivery.js','excerpt-catalogue.js','proposal.js','companion-ui.js','runtime.js','runtime-worker.js','runtime-worker-bootstrap.js','model-store.js','manifest.js'}})
  end
  return doc
end
return {Pandoc=process}
