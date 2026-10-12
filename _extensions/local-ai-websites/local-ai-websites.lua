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
local function config(meta)
  local result = {enabled=true, manifest=nil}
  local input = meta['local-ai']
  if input == nil then return result end
  local kind = pandoc.utils.type(input)
  if kind ~= 'table' and kind ~= 'MetaMap' then fail('local-ai options must be a mapping') end
  -- Explicit deactivation is a complete no-op, including stale configuration.
  if input.enabled == false then return {enabled=false} end
  for key, value in pairs(input) do
    if key == 'enabled' then
      if type(value) ~= 'boolean' then fail('enabled must be a boolean') end
      result.enabled = value
    elseif key == 'manifest' then
      local value_kind = pandoc.utils.type(value)
      if value_kind ~= 'string' and value_kind ~= 'Inlines' and value_kind ~= 'MetaString' and value_kind ~= 'MetaInlines' then fail('manifest must be a local URL path') end
      local path = text(value, 'manifest', 2048)
      if path:find('[\\:?#%%<>"\']') or path:find('%c') or path:match('^//') or not path:lower():match('%.json$') then fail('manifest must be a local .json URL path without query, fragment or encoded components') end
      if path:find('%s') or path:find('//', 1, true) then fail('manifest cannot contain whitespace or empty path components') end
      for part in path:gmatch('[^/]+') do if part == '.' or part == '..' then fail('manifest path cannot traverse directories') end end
      result.manifest = path
    else fail('unknown option ' .. tostring(key)) end
  end
  return result
end
local function publish_manifest(path)
  -- The browser URL is relative to the rendered page, not the installed filter.
  -- Register exactly this explicitly selected small public file. Do not inspect
  -- its resource graph or recursively publish an author directory/model pack.
  local root, relative
  if path:sub(1,1) == '/' then
    root=quarto.project.directory
    if not root then fail('a root-relative manifest requires a Quarto rendering context; use a document-relative path') end
    relative=path:sub(2)
  else
    root=pandoc.path.directory(quarto.doc.input_file)
    relative=path
  end
  local boundary=quarto.project.directory or root
  -- Quarto 1.11.5 on some Windows locales exposes project paths as ANSI bytes
  -- and an output path with replacement characters. Do not guess an encoding,
  -- follow a different path, or publish using a corrupted path value.
  local function usable_path(value)
    return type(value)=='string' and utf8.len(value)~=nil and not value:find(utf8.char(0xfffd),1,true)
  end
  if not usable_path(root) or not usable_path(boundary) or
    (quarto.project.output_directory and not usable_path(quarto.project.output_directory)) or not usable_path(quarto.doc.output_file) then
    fail('Quarto reported an unusable Unicode project/output path; use an ASCII consumer directory and output directory for manifest publication on this Windows locale, or omit the optional manifest')
  end
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
  if path:sub(1,1)=='/' then
    -- Root-authored paths use the Quarto rendering-context root (the project
    -- root, or input directory for a standalone document), not the origin root.
    -- Use the actual output location so a site deployed below /project/ keeps
    -- the same asset URL, including nested documents and a custom output-dir.
    local outputRoot=quarto.project.output_directory or quarto.project.directory
    local destination=pandoc.path.join({outputRoot,relative})
    return pandoc.path.make_relative(destination,pandoc.path.directory(quarto.doc.output_file),true):gsub('\\','/')
  end
  return path
end
local function process(doc)
  local options=config(doc.meta)
  if not options.enabled then return doc end
  local anchors, sources, panels, total = {}, {}, {}, 0
  local function visit(el)
    local id=el.identifier
    if id and id ~= '' then anchors[id]=(anchors[id] or 0)+1 end
    if el.t ~= 'Div' then return end
    if has(el,'local-ai') then panels[#panels+1]=el end
    if not has(el,'local-ai-source') then return end
    if has(el,'local-ai') then fail('a panel cannot also be a source') end
    if not id or id=='' or #id>256 or id:find('[%s"\'<>#]') or id:find('%c') then fail('each source requires a bounded native anchor without whitespace or unsafe delimiters') end
    -- Native block boundaries must not join a heading's last word to prose.
    local body=text(pandoc.utils.blocks_to_inlines(el.content,{pandoc.Space()}),'source #' .. id,12000)
    local label=el.attributes['data-source-label'] and text(el.attributes['data-source-label'],'source label',256) or id
    total=total+#body
    if #sources>=100 or total>120000 then fail('page source budget exceeded: at most 100 sources and 120000 UTF-8 bytes') end
    sources[#sources+1]={id=id,text=body,label=label,url=fragment(id)}
  end
  doc:walk({Div=visit,Span=visit,Header=visit,Code=visit,CodeBlock=visit,Link=visit,Image=visit,Table=visit,Figure=visit})
  if #panels>1 then fail('at most one .local-ai panel is supported per document') end
  for _,source in ipairs(sources) do if anchors[source.id]~=1 then fail('source anchor #' .. source.id .. ' is duplicated in native content') end end
  if #panels==0 then return doc end
  local items={}
  for _,source in ipairs(sources) do items[#items+1]={pandoc.Plain({pandoc.Link({pandoc.Str(source.label)},source.url)})} end
  local native=pandoc.List({pandoc.Para({pandoc.Str('Selected page sources')})})
  if #items>0 then native:insert(pandoc.BulletList(items))
  else native:insert(pandoc.Para({pandoc.Str('No sources have been selected for this page.')})) end
  local html=quarto.doc.is_format('html:js')
  if html and options.manifest then options.manifest=publish_manifest(options.manifest) end
  local records={}
  for _,source in ipairs(sources) do records[#records+1]=quarto.json.encode(source) end
  local payload='{"version":0,"sources":[' .. table.concat(records,',') .. '],"manifest":' .. (options.manifest and quarto.json.encode(options.manifest) or 'null') .. '}'
  payload=payload:gsub('<','\\u003c'):gsub('>','\\u003e'):gsub('&','\\u0026')
    :gsub(utf8.char(0x2028),'\\u2028'):gsub(utf8.char(0x2029),'\\u2029')
  doc.blocks=doc.blocks:walk({Div=function(el)
    if not has(el,'local-ai') then return end
    el.content:insert(pandoc.Div(native,pandoc.Attr('',{'local-ai-sources'})))
    if html then el.content:insert(pandoc.RawBlock('html','<div class="local-ai-enhancement" hidden></div><script type="application/json" class="local-ai-data">' .. payload .. '</script>')) end
    return el
  end})
  if html then
    quarto.doc.add_html_dependency({name='local-ai-websites',version='0.0.3',
      scripts={{path='local-ai-websites.js',attribs={type='module'}}},stylesheets={'local-ai-websites.css'},
      resources={'retrieval.js','runtime.js','runtime-worker.js','runtime-worker-bootstrap.js','manifest.js'}})
  end
  return doc
end
return {Pandoc=process}
