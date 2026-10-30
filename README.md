# Local AI Websites

An experimental Quarto extension for source search and optional browser-local assistance. Authored public excerpts remain readable and searchable without a model. The selected model defaults are **EmbeddingGemma 2**, with text-only 768-dimensional retrieval, and **Gemma 4 E2B** for generated proposals.

Version **0.0.13** is experimental source requiring **Quarto 1.11.5 or later**. Development uses the Windows pre-release. The repository publishes source; it does not establish a supported release or production deployment. No model weights, SDK bundle or WASM binaries are included. A previous bounded actual EmbeddingGemma 2 smoke test passed in one Codex in-app browser with AMD RDNA-3 WebGPU over secure loopback HTTP: semantic discovery on three synthetic sources, loading, cancellation/recovery, release/reset and ordinary source search. This does not establish independent retrieval quality, memory/latency support, network-egress assurance, citation support, mathematical fidelity, accessibility conformance or production deployment acceptance.

Version 0.0.13 is development source distributed from the experimental `main` branch. The GitHub and local-source instructions below provide alternative installation routes. Install matching companion versions; neither route establishes a supported release.

## Start with source search

The runnable [example.qmd](example.qmd) is the tutorial: render it, try lexical
search, edit one display label and compare distinct meanings of "action". It
needs only Quarto, QMD and YAML. This README covers the configuration and optional
integrations to use after that first page works.

Search and the current source count appear first. Open **Sources and search
coverage** to browse the full selected catalogue, source identifiers and coverage
details. Incomplete or bounded graph warnings stay visible beside search.
**Optional local AI** groups model controls in a native disclosure. Reviewing
files still requires separate, visible confirmation before loading; the consent
panel and active Cancel control remain outside that disclosure. A companion's
explicit focus action opens the model controls before focusing them and does
not load a model. Without JavaScript, the native selected-source list remains.

## Install from GitHub

Install in a separate consumer folder, copy [example.qmd](example.qmd) there,
then render and follow the instructions in its output:

```sh
quarto add kai-prince-sfhea/local-ai-websites --no-prompt
quarto list extensions
quarto render example.qmd
quarto preview example.qmd
```

Your editor's Render/Preview controls can perform the same routine work. Use
the HTTP preview; opening the HTML directly as `file://` is unsupported. Use the
[local source alternative](#local-source-alternative) for a checkout or extracted
source and matching companion extensions.

Explicitly selected authored excerpts are available for drafting; graph labels and summaries support
discovery. A generated proposal stays labelled as unreviewed and never changes
your authored page. Node.js and npm are needed only for optional model asset
preparation. The default GitHub installation follows experimental `main`; no
supported tagged release is promised.

### Update, disable or remove

To update an existing GitHub installation, run:

```sh
quarto update extension kai-prince-sfhea/local-ai-websites --no-prompt
quarto list extensions
```

Remove `kai-prince-sfhea/local-ai-websites` from the page/project `filters` list before removing the installed extension:

```sh
quarto remove kai-prince-sfhea/local-ai-websites --no-prompt
```

To keep it installed but inactive, use `local-ai.enabled: false` as shown below.

### Local source alternative

Keep a local checkout of this repository next to the consumer folder. Install from the consumer:

```sh
quarto add ../local-ai-websites --no-prompt
```

Copy [example.qmd](example.qmd) into the consumer folder. Local installation uses
a different namespace; change that copied example and the filter configuration
below to:

```yaml
filters:
  - local-ai-websites
```

Render `example.qmd` and follow its tutorial. Use the same unqualified selector
in the copied QMD as in your installed local extension.

For the local installation, the optional preparation command is `quarto run _extensions/local-ai-websites/prepare-assets.ts`. Update with `quarto update extension ../local-ai-websites --no-prompt`; after removing the local filter selector, remove with `quarto remove local-ai-websites --no-prompt`. The remaining examples use the GitHub installation paths.

### Versions and migration

The `0.0.x` series is experimental and does not promise a stable configuration or runtime API. Changes to authoring, manifest versions, runtime profiles and required migrations belong in the versioned changelog. Incompatible manifest versions and unsupported fields fail validation rather than being silently converted. Review the changelog before updating; update the installed extension, re-render the consumer and reload the page to begin a fresh session.

Version 0.0.5 adds public-graph discovery, optional verified model-download storage, an installed Quarto preparation action and exact asset-pack publication. Existing version-1 manifests and manually declared resources remain supported. No embedding identity changes. If a later update changes the SDK/model profile, prepare a new asset directory, update the manifest and re-encode affected vectors. Do not rename an old model space. Saved model downloads are digest-addressed; questions, proposals and vectors remain session-only.

Version 0.0.6 adds explicit loading of marked excerpts from other published
pages, exact questions through compatible KG query providers, and cited JSON
proposals. The panel now defaults to `proposal-format: cited-json`; choose
`plain-text` explicitly to retain its earlier free-text presentation. Existing
model files, manifests, preparation commands and download consent are unchanged.
The stricter proposal format can refuse a model's response instead of showing
partly validated claims. Older plain-text model evidence does not validate the
new structured prompt or citation behaviour.

### Compatibility

| Target | Current boundary |
|---|---|
| Windows, Quarto 1.11.5 pre-release, HTML | Local extension lifecycle, rendering, project/nested-page resource delivery and visibility boundaries exercised |
| Same environment, DOCX | Native canonical source content and static source list exercised |
| Local preview | HTTP output and a QMD update exercised; browser live-reload/WebSocket behaviour unverified |
| Optional manifest filesystem paths | Tested ASCII and Latin-1 consumer roots with spaces, nested Latin-1 input names, custom output directories and explicit HTML output filenames; arbitrary Unicode/CJK extension-path support is not established |
| Optional models | Bounded real generation, embedding and lifecycle controls exercised on one browser/device; the current strict network-health checks fail as described below. Quality and broader device support remain separate acceptance gates |
| Other Quarto versions, operating systems and formats | Unverified; the `>=1.11.5` installation constraint is not a future compatibility guarantee |

HTML uses external module/worker assets. `file://` viewing and `embed-resources: true` are unsupported. Use a served HTML website with its dependency files.

## Author sources and a search panel

Enable the filter in a page or project:

```yaml
filters:
  - kai-prince-sfhea/local-ai-websites
```

Mark already-public source blocks with unique native IDs and insert one panel:

```markdown
::: {#math-group-action .local-ai-source data-source-label="Group action"}
A group action assigns transformations to group elements, respecting identity and composition.
:::

::: {.local-ai}
Search the selected sources on this page. Read each source before relying on a suggestion.
:::
```

Use IDs that do not duplicate headings or other native anchors. There can be one panel and at most 100 selected sources per document. Source text is limited to 12,000 UTF-8 bytes per source and 120,000 bytes in total; IDs and labels are limited to 256 bytes. Canonical blocks remain native Quarto content. The panel keeps a static source list in other output formats and when JavaScript is unavailable.

Source blocks also publish a small inert excerpt catalogue in HTML when the
filter is active, even on a page without a `.local-ai` panel. The filter collects
the final native AST after Quarto's visibility processing; it does not scrape
arbitrary pages, execute embedded HTML or read unmarked private files. A selected
source containing hidden, answer, solution, feedback or raw AST material at
that late projection is refused: put public explanatory prose in a separate
source Div. Quarto can normalise ordinary HTML Div/Span authoring into native
AST nodes; this check does not attest the original authoring syntax. This is an
explicit public projection, not a mechanism for making published content private.

Optional annotations make that declaration more informative:

```markdown
::: {#practice-evidence .local-ai-source data-source-label="Practice evidence" data-source-review="author-reviewed" data-source-graph="website"}
Write the complete public excerpt, including its conditions and qualifications.
:::
```

`data-source-review` defaults to `declared`; use `author-reviewed` only after
your own review. Both are author declarations, with support still labelled
unverified. `data-source-graph` is an optional named-graph context label; it does
not create a graph or change its publication permissions. The catalogue's
language comes from the source page's ordinary `lang` YAML, such as `en-GB`.
It does not translate the excerpt or the English controls. The default search
panel does not require these optional annotations.

Search supports exact source IDs, including `#math-group-action`, and lexical matches. A bounded in-memory word index is reused for subsequent searches and keeps differently scoped concepts distinct. Optional embeddings aid discovery; similarity does not verify meaning or truth. Standalone operation searches the selected page sources. With Knowledge Graph Extraction, public graph catalogue entries can also be searched as described below. Private project files are never indexed by this browser feature.

Disable the extension without loading its configuration or models:

```yaml
local-ai:
  enabled: false
```

When enabled, `local-ai` accepts `enabled`, `manifest`, `publish-assets`, `graphs`, `source-pages`, `corpus` and `proposal-format`; unknown options fail the render without echoing their supplied names. Source diagnostic occurrences are processing ordinals, not source line numbers. Ordinary render logs remain author material. Omit `manifest` for source search without models.

Generated controls, consent text and status messages currently use English.
Authored source labels and panel prose retain their supplied text. Setting a
different document `lang` does not translate this interface or establish that
a model supports that language.

## Customise the page

Project settings remain available when a page overrides only one option. For
example, set the model manifest once in `_quarto.yml` (or a profile), then use
`local-ai: {graphs: false}` on a CV page without repeating that manifest. The
extension asks Quarto for the resolved document settings, including directory,
format, profile and metadata-file options, then applies the effective page/filter
overrides per key. Source lists and `corpus` are replaced as complete values.
Use a `/root-relative` manifest URL for project-wide configuration; ordinary
relative URLs continue to resolve beside the input document.

Use `local-ai: false` or `local-ai: {enabled: false}` for a complete page opt-out.
Use `local-ai: {manifest: false}` to keep source search while clearing an inherited
model manifest. These settings do not download or load a model. Existing visitor
file review, session confirmation and separate storage consent remain required.

### Search a larger selected corpus

The optional `corpus` setting expands the selected-public-source workflow beyond
the existing eight-page `source-pages` list. It requires only QMD/YAML and normal
Quarto Render/Preview:

```yaml
local-ai:
  corpus:
    pages: [definitions.html, research-methods.html]
```

Mark sources on those pages with the existing `.local-ai-source` Divs. List
actual published HTML filenames, including any custom output names. The reader
chooses **Load selected corpus**; rendering and opening the page do not
fetch its contents or load a model. A failed or cancelled replacement retains
the last accepted in-memory corpus. Use the page/loaded-corpus controls to switch
back without downloading it again.

The shared Search control then searches that corpus. Graph, language and review
filters preserve each excerpt's declared context; `data-source-graph` is an
excerpt annotation and does not create KG membership. KG continues to own its
separate graph navigation and website-wide public search. Graph labels alone
are discovery metadata and are never silently admitted as corpus evidence.

**Show matching passages** selects exact complete lexical units without a
model. Long paragraphs can be divided at conservative sentence punctuation.
The view records selected/omitted units and original selected-excerpt UTF-16
ranges. It does not claim semantic completeness, a verified answer or original
QMD coordinates. An oversized unit is omitted or refused rather than silently
clipped; shorten the authored excerpt or inspect its original page.

An optional generated explanation uses up to four query-centred windows with
at most 4,000 characters each and 12,000 in total. Its snapshot binds the
observed corpus, question and exact window receipt. Quote validation maps
window citations back to their original selected-excerpt offsets. It establishes
alignment, not that a quotation supports a claim.

For structured corpus proposals, readers can explicitly mark claims supported,
uncertain or unsupported and add short notes. **Save reader judgments in this
page** retains an unauthenticated report in memory. Export/import is explicit
UTF-8 JSON, limited to 64 KiB and bound to those exact claims and sources. Stale
or invalid imports retain the previous saved report. Clear removes it; changing
the question or sources clears the associated proposal and report. No judgments
are automatically stored or published. Plain-text compatibility proposals do
not receive structured claim-review controls.

Save, eligible Export and Import retain keyboard focus while a reader-judgment action is busy. Clear can invalidate pending work. Moving elsewhere keeps the reader’s current focus; unavailable exports remain disabled.

Limits are 64 explicitly selected same-site HTML pages, 2 MiB per response,
16 MiB cumulative response bytes, 512 admitted excerpts, 1 Mi UTF-16 text units
and 2,048 discovery chunks. Individual excerpt/parser limits remain in force.
Redirects, hidden/private paths and missing eligible payloads refuse the load.
This is an observed set of selected responses, not a shared-build or whole-site
freshness attestation. Reload explicitly after changes. `corpus: false` opts
out; existing native 100-source and `source-pages` limits are unchanged.

Put shared settings under `local-ai` in `_quarto.yml`. A page's `local-ai` mapping
needs only its overrides; 0.0.11 resolves the native document defaults that the
tested Quarto prerelease otherwise omitted from its per-file Lua metadata.
For the panel's response format alone, you can also use `data-proposal-format`
as shown below. `local-ai: false` disables the page; `manifest: false` clears
an inherited model choice while retaining source search.

| Setting or content | Default | How to change it |
|---|---|---|
| `enabled` | `true` | Set `false` to retain native content without this enhancement |
| `graphs` | `all` with active KG metadata; otherwise `false` | Set `false` for page excerpts only, or a list such as `[website, cv]` |
| `source-pages` | `[]` | List at most eight actual local HTML output URLs; readers load their marked excerpts explicitly |
| `corpus` | `false` | Optional `{pages: [...]}` with 1–64 actual local HTML output URLs; explicitly load and search a separate larger public corpus |
| `proposal-format` | `cited-json` | Select `plain-text` for the legacy unreviewed response without per-claim citation validation |
| `manifest` | Omitted; source search only | Set a prepared public manifest path, or `false` to clear an inherited one |
| `publish-assets` | `false` | Set `true` to publish the manifest's exact prepared inventory |
| Source display name | The source's native ID | Add `data-source-label="Readable name"` to its `.local-ai-source` Div |
| Panel introduction | Your `.local-ai` Div content | Write ordinary Markdown, including a heading and instructions |

Keep source IDs stable when editing labels: links and exact-ID queries use those
IDs. Add new public excerpts by copying a source Div and giving it a unique ID.
Do not duplicate prose already projected from reviewed Generative Websites
objects; select `local-ai-sources: false` there only when you want manual source
selection. Project-wide YAML does not insert a panel into every page: add the
`.local-ai` Div where readers should use it.

The panel inherits the page's text, colours and typeface, so start with ordinary
Quarto theme settings. Optional CSS can target `.local-ai-enhancement` (panel),
`.local-ai-results` (results) and `.local-ai-proposal` (unreviewed proposal).
The optional page/query controls use `.local-ai-companions`; exact result output
uses `.local-ai-query-output`.
For example, add `format: {html: {css: styles.css}}` to your existing YAML and
put this in `styles.css`:

```css
.local-ai-enhancement {
  border-radius: .75rem;
  padding: 1.25rem;
}
```

CSS is optional; QMD/YAML are sufficient for the default experience. Keep focus
indicators, consent text and proposal labels visible when styling, and check
your chosen theme in light/dark modes and at narrow widths. Theme customization
does not change the model, source or consent contracts.

### Select excerpts from other pages

List the **published HTML filenames**, including any custom `output-file` names,
in `source-pages`. The extension does not guess a rendered filename from a QMD
path. A reader chooses **Load selected page excerpts** before these pages are
fetched. Only their `.local-ai-source` catalogue is admitted to search and
drafting; ordinary surrounding page text is not gathered. No model loads as part
of this action. A failed load preserves the previous usable source catalogue.

This example extends an existing KG website with its authored `knowledge.yml`.
Install both listed extensions and create the listed QMD inputs first. Omit the
KG filter/settings and set `graphs: false` for standalone excerpt search.
For local installations, use the unqualified filter selectors from the local
source instructions above.

```yaml
project:
  type: website
  render:
    - index.qmd
    - research/definitions.qmd
lang: en-GB
filters:
  - kai-prince-sfhea/knowledge-graph-extraction
  - kai-prince-sfhea/local-ai-websites
knowledge-graph:
  declarations: knowledge.yml
  navigation: true
local-ai:
  enabled: true
  graphs: all
  source-pages:
    - /research/definitions.html
  proposal-format: cited-json
```

Place a `.local-ai` panel on `index.qmd` and mark the intended public source Divs
in `research/definitions.qmd`; that source page needs no panel. Render the project
so its selected outputs exist, then use HTTP preview. `/research/definitions.html`
refers to the Quarto output root and is rebased for nested pages and deployment
below a website subpath. A document-relative URL resolves beside the panel's
rendered output. Redirects, other origins, queries, fragments and unsafe traversal
are refused.

Loading is bounded to eight selected pages, **2 MiB per HTML response**, one
explicit catalogue per page, **100 sources** and **120,000 text characters and
UTF-8 bytes** across the loaded catalogue. The combined panel also admits at
most 100 records and 120,000 characters; page excerpts take priority over graph
discovery entries. These are selected-excerpt coverage limits, not claims to have
searched the whole page or website. Each loaded source retains its native anchor,
language, review declaration, page/text hashes and optional graph context.

### Choose a proposal format

The structured formats accept bare JSON or one complete lowercase `json` code
fence. A fence has exactly three backticks, `json`, then LF or CRLF; its closing
three backticks follow LF or CRLF on their own line. Outside it, only JSON
whitespace (space, tab, carriage return and line feed) is permitted. The complete
response, including its envelope, counts against the existing output limits.
Prose, other fence languages, multiple or partial fences and malformed JSON are
refused. The JSON payload is an unchanged substring: no syntax, fields, source
IDs, quotations or offsets are repaired. Prompts still request bare JSON.

The original `rawProposal` and its `outputSha256` are retained. Validated
provenance additionally records `outputEnvelope` (`bare-json` or
`json-code-fence`) and `payloadSha256` for that exact substring. The declared
policy is part of each proposal profile and request hash; earlier request packets
must be rebuilt. Matching companion extensions use the original raw response and
repeat the same validation; this permission does not confer review or approval.

Version 0.0.11 correctly refused a complete JSON-fenced response in a bounded
actual visitor test because its declared protocol accepted bare JSON only. That
failed observation is retained. Bounded 0.0.12 visitor checks have since accepted
the declared whole lowercase `json` fence with exact raw-response and unchanged
payload identities. A separate malformed 0.0.12 response remained refused; it
was not repaired or retried. The functional observations and failed network-health
checks are distinguished in [Verification and evidence availability](#verification-and-evidence-availability).
They do not establish meaning, entailment, general model quality or human approval.

The default `cited-json` format accepts one complete JSON response with either
unreviewed claims and exact quotations or an `insufficient-evidence` result.
Every claim needs a known selected source and a matching quotation. The model
supplies only `sourceId` and `quote` for each citation; the extension derives
coordinates only when that literal quote occurs exactly once in that source.
Absent or ambiguous quotes, model-supplied offsets and invented
source IDs/URL fields, duplicate JSON keys, extra fields, broken quote ranges,
split Unicode surrogate pairs, non-JSON text and partial responses are
refused as a whole. Citation links come from the selected sources, rather than
model-provided destinations. Model responses can fail these checks; source
search and authored content remain available.

Derived offsets count JavaScript **UTF-16 code units**, with zero-based starts and
exclusive ends, in the exact selected, trimmed excerpt supplied for this request.
They are not byte positions, QMD source coordinates or proof-source mappings.
Schema validation and exact quotation **do not establish entailment**, relevance,
completeness, mathematical correctness or review. Read the original source and
its qualifications before relying on a proposal.

To retain the earlier presentation:

```yaml
local-ai:
  proposal-format: plain-text
```

For a page using a shared model profile, leave its `local-ai` YAML mapping out
and override only the panel presentation:

```markdown
::: {.local-ai data-proposal-format="plain-text"}
Search the public sources and review each unreviewed suggestion.
:::
```

The attribute accepts only `plain-text` or `cited-json` and overrides that
panel's configured format. For example, a model profile can contain the complete
configuration below; render with `quarto render --profile models`:

```yaml
# _quarto-models.yml, after preparing this actual asset directory
local-ai:
  manifest: local-ai-assets/models.json
  publish-assets: true
  graphs: false
  proposal-format: cited-json
```

Plain-text mode remains explicitly unreviewed and has no per-claim quote checks.
Neither setting downloads or enables a model. Authors using the JavaScript API
can use `LocalAIRuntime.generateProposal(request)` for the quote-only structured
result. `buildProposalRequest(request)` retains the earlier strict offset-wire
default `source-bound-proposal-v1`; runtime callers can request it explicitly
with `generateProposal(request, {format: 'source-bound-proposal-v1'})`. Both
formats reject contradictory or malformed citations rather than repairing them.
`generate(request)` without `outputFormat` retains its legacy free-text contract.
Ordinary QMD/YAML authors do not need either API.

## Use alongside the other extensions

Install and activate Knowledge Graph Extraction separately. When active `knowledge-graph` metadata is present, the panel automatically reads its current public `knowledge-graph/registry.json` and search-eligible graph indexes. The separate Interactive CV graph is included in discovery without merging its navigator into the website graph. Results preserve graph identity, snapshot and canonical source links. No duplicated graph catalogue is required.

Merge this minimal composition into an existing project's YAML, preserving its other settings. Install both named extensions first; for local installations omit the owner prefix as explained above.

```yaml
filters:
  - kai-prince-sfhea/local-ai-websites
  - kai-prince-sfhea/knowledge-graph-extraction
knowledge-graph:
  navigation: true
```

Add a `.local-ai` panel in QMD. No model manifest is needed for lexical graph discovery. Adding Interactive CV using its own instructions makes its public, search-eligible `cv` graph available to this search automatically; CV navigation stays separate. To change discovery scope:

```yaml
local-ai:
  graphs: all
```

Use `graphs: [website]` or `graphs: [cv]` to select graphs, or `graphs: false` for page sources only. A graph with `search: false` is excluded. This panel uses a bounded subset of at most 100 combined source/catalogue records and 120,000 characters. When Quarto website search is enabled, Knowledge Graph Extraction augments it with all eligible public graphs. Incomplete snapshots remain labelled by their producer; missing/incompatible indexes preserve page-source search.

Public graph labels and summaries support **discovery**, not automatic admission as reviewed generation evidence. A question matching only graph catalogue records does not enable **Draft an unreviewed explanation**. Drafting uses author-selected `.local-ai-source` excerpts on this page and explicitly loaded source pages, including reviewed learning objects projected by Generative Websites. Review those sources before exposing them; a class name or review annotation is not evidence of independent review. Read the canonical links for full conditions and qualifications.

Registry version 1 and index contract version 0 are required for graph discovery.
Exact questions additionally require a compatible version-1 `queryProvider`
descriptor from Knowledge Graph Extraction. Older or missing optional extensions
retain standalone functionality; their presence alone does not establish
compatible integration.

### Ask exact graph questions without a model

Select **Choose exact graph questions**, choose a public graph, then select a
question and supply its exact object/page IDs. The built-in questions cover
declared objects, neighbours, definitions, prerequisites, page indexes and paths.
Author-defined KG query profiles add hierarchy, evidence and date-window
questions. Distinct IDs and selected graphs keep differently scoped meanings
apart; the system does not turn a word such as "action" into an asserted identity.

Choosing providers reads their public registry data. **Run exact graph question**
then loads the selected immutable query module and graph and executes the
producer's finite algorithm. When the producer advertises topic delivery, this
consumer verifies its manifest, complete index and every required topic part
before running any exact question. A missing or inconsistent advertised part
refuses the question; it does not fall back to an unverified whole graph.
Descriptors without topic delivery retain the whole-graph interface.
This action does not load a language/embedding
model. Each result preserves its graph, snapshot, coverage status and exhaustive
flag where supplied. Expand **Inspect exact result and provenance** or choose
**Download exact graph result** for the full finite result. Incomplete/unknown
coverage stays explicit; no missing record is silently turned into a false claim.
Graphs remain separate unless you explicitly select a published federation.

To publish topic parts, add this to the existing project's `knowledge-graph`
mapping, preserving its other settings:

```yaml
knowledge-graph:
  delivery:
    mode: topics
    max-shard-bytes: 262144
    max-records-per-shard: 128
```

No Local AI script or additional switch is needed. Render Project, open Preview,
then run an exact graph question. Its progress reports verified detail parts;
**Cancel page-source or graph request** stops the action. Earlier complete,
digest-verified parts remain in this tab for a retry; partially received or
changed parts are never reused. Repeated questions reuse the accepted graph in
memory. Closing the tab releases this data; it is not persistent browser storage.

Downloaded result provenance includes the exact manifest/index/part URLs,
byte counts and hashes, reconstructed graph identity and separate verified
transfer/reused byte totals for that action. Failed/interrupted response bytes
are not included in verified transfer totals. All advertised details are loaded
before negative answers, counts or paths; partial source coverage still remains
incomplete/unknown according to the producer. This is coherent incremental
delivery, not a claim that every exact question transfers fewer bytes or runs
faster than `graph.json`, or that the website is available offline.

The consumer checks transferred query-module bytes against the producer's
descriptor before importing its URL. This is **transferred-byte verification,
not execution attestation**: website code, its host and any intervening service
worker remain trusted, and could change a later response. Query results express
declared graph relations; they do not verify a theorem, a CV claim or source
support. A compatible exact-query context can be hash-bound to a subsequent
cited proposal, but the proposal still uses its separately selected excerpts.

Generative Websites can coexist on the same page: its authored route/views remain authoritative. This extension does not silently generate or replace learning views, CV claims, mathematical statements or graph records. It shares no incompatible build-time embedding vectors with Knowledge Graph Extraction. Each installed extension remains independently removable.

### Let another installed control use a ready language model

Compatible controls, such as Interactive CV's professional narrative workflow,
can request a source-bound quote proposal from this page's **already loaded**
language model. Install and activate both matching extensions. Configure the
optional model pack below, and put an ordinary panel on that same QMD page:

```markdown
::: {.local-ai}
### Optional assistance
Review and load the language model here before requesting a proposal from
another compatible control on this page.
:::
```

The reader first chooses **Review language model files**, confirms its sizes and
licences, then chooses **Load confirmed language model**. In the companion
control they choose the ready provider and explicitly request a proposal. If no
ready provider exists, the control can focus the existing model-review button;
it cannot load a model or reuse consent from another page or tab. No author
JavaScript is needed. An older companion without this interface keeps its
existing deterministic extracts and manual proposal workflow.

Only one widget action uses the engine at a time. **Cancel local AI**, release,
reset, page departure or a changed requesting context invalidates the request.
The companion receives the original runtime's validated proposal, raw model
response, exact request and model provenance; it must revalidate its own current
selection and source qualifications. Quotation alignment does not establish
support, professional suitability, publication approval or career truth. The
Local AI panel does not copy the companion's prompt into its search box or
display a second copy of its proposal.

For advanced integration, the delivered main ES module exposes read-only
version-1 provider discovery and the ready-only `generateWithLocalProvider`
action. Registration stays private to actual configured widgets. The fixed
protocol is `source-bound-quote-proposal-v1`; remote source origins, alternate
model settings, API tokens, engine factories and arbitrary execution options
are not accepted. The consumer and other same-origin page scripts remain
author-trusted website code; this interface is not a sandbox or an attestation
that the supplied source content was approved.

Author-side Knowledge Graph Extraction may separately use a local AI service or an explicitly selected API. Its environment variables and optional `.env` setup do not configure this browser runtime. Keep author API tokens out of page YAML, model manifests and deployed resources; visiting readers do not need a local inference service or an API token for browser-local models.

| Combination | Current behaviour |
|---|---|
| Local AI alone | Page-source search and explicitly loaded marked excerpts; optional visitor-confirmed embedding/generation runtime |
| With Knowledge Graph Extraction | Public named-graph discovery and compatible exact producer questions, preserving identity and coverage |
| With Interactive CV and Knowledge Graph Extraction | Discovery includes the public CV graph while its navigator stays separate |
| With Generative Websites before Local AI | Reviewed learning objects become source excerpts automatically; generated proposals remain separate |
| Automatic learning-view/CV rewriting or Sandbox verification | Not provided; these require separate, reviewed domain integrations |

There is no automatic model acquisition, cloud inference, telemetry, persistent chat history, service worker or project-wide private-source indexing. Optional model loading requires an author-supplied same-origin asset manifest and an explicit reader action. Models, the SDK bundle and WASM are separate licensed deployment inputs. Browser-local execution does not establish institutional permission for restricted data.

Quarto `--quiet` can suppress diagnostic text while retaining a nonzero failure status. Re-run with `--log-level error` to see the extension's safe contract message; ordinary render logs remain author material.

## Prepare optional local model assets

This is an explicit author operation, separate from rendering. Ordinary rendering never downloads packages or models and never runs inference. Readers must review file sizes and licences and confirm a model load before model/runtime transfers begin. Reviewing the manifest reads only that small JSON file.

The adapter requires **LiteRT-LM 0.18.0**, **wasm-utils 2.0.0**, a secure HTTP(S) context, WebGPU and Web Locks. Unsupported devices keep source search. Only one model is loaded at a time; another tab holding the runtime must release it first. Serve the rendered website over HTTP(S), rather than opening an HTML file directly.

1. Install **Node.js 24 or later** for the optional preparation command. Create a sibling `local-ai-tools` directory outside your consumer project, then explicitly acquire the exact build dependencies:

   ```sh
   npm --prefix ../local-ai-tools install --ignore-scripts --save-exact @litert-lm/core@0.18.0 @litertjs/wasm-utils@2.0.0 esbuild@0.25.10
   ```

   Keep its `package-lock.json` version 3. The preparation tool uses those installed files and lock records; it does not run npm, install packages or contact a registry. Keep these author tools outside the deployed website.

2. Separately acquire and review the [pinned EmbeddingGemma 2 text artifact](https://huggingface.co/litert-community/embeddinggemma-2-text-270m-litert-lm/tree/9be6e8b90982095dc05c2bd162e4b954ee4dbac7). It must be exactly `embeddinggemma-2-text-270m.litertlm`, **164,626,432 bytes**, SHA256 `2d079ee2f6f066b1f368e8d7c819f55214eaef1d0513b312321901f30ab286fb`. The pinned metadata declares Apache-2.0; review the upstream terms and notices before redistribution. Store the acquired file outside the website until preparation succeeds.

3. From the consumer project, prepare a **new** asset directory. Substitute your existing local model path:

   ```sh
   quarto run _extensions/kai-prince-sfhea/local-ai-websites/prepare-assets.ts --packages ../local-ai-tools --embedding C:/Models/embeddinggemma-2-text-270m.litertlm --output ./local-ai-assets
   ```

   This installed command uses Quarto's bundled Deno and the explicitly installed Node.js; authors do not write or maintain a JavaScript build script. It refuses existing output directories, linked paths, wrong models, altered WASM bytes and incompatible package identities. It bundles the SDK, preserves notices, copies the feature-selected WASM files, verifies model bytes and writes `models.json` last. It cleans only its own incomplete output. Add `--help` for supported arguments. The underlying `node .../prepare-assets.mjs` action remains available for existing automation.

4. Select the prepared manifest and explicitly allow publication of its exact asset inventory in `_quarto.yml`:

   ```yaml
   local-ai:
     manifest: /local-ai-assets/models.json
     publish-assets: true
   ```

   The extension registers only the receipt's named resources, including SDK/WASM/model files and notices. It checks file sizes and ordinary confined paths, without recursively publishing a folder. `publish-assets` is false by default; existing authors can retain an explicit `project.resources` list instead. Keep the prepared directory and `asset-receipt.json` together. Rendering performs no package/model download or inference. Publish the complete rendered output to a static host.

5. Use ordinary `quarto preview`, or `quarto render` followed by static HTTP(S) hosting. With whole-site KG discovery, start with Render Project; see KG's README for the tested Windows prerelease's direct-HTML cache defect and supported YAML static-preview workaround. `--render all` alone does not avoid that defect. No custom model server or local inference service is needed. A visitor reviews and confirms model loading; execution uses that visitor's browser WASM/WebGPU. Visitors can separately choose to keep verified model downloads in browser storage for later visits. Hosting still needs to support these large files; this is not a PWA offline guarantee.

Manifest and asset URL paths must use ordinary ASCII names without spaces, percent escapes, backslashes, query strings or fragments. Unicode page content and canonical source IDs are supported separately. A relative manifest path resolves beside its input document. In a Quarto project, `/local-ai-assets/models.json` refers to the project root and is rewritten for nested output pages and deployment below a site subpath. All SDK/WASM/model URLs must remain on the website's origin.

The default individual model budget is 256 MiB. Hashing, Blob creation, WASM and GPU allocation can use substantially more memory. Cancel terminates the worker and releases its lock; release clears proposals and session vectors. Reset also clears the reviewed manifest, question and results. Questions, vectors and proposals are never persisted.

### Keep or resume a model download

No extra YAML is needed. On the model confirmation panel, readers can optionally
check **Reuse and keep** before loading. It starts unchecked on each new review.
Unchecked loads do not open the extension's saved-model stores or acquire their
storage lock; their model bytes are session-only. The runtime's separate lock
still coordinates actual model execution across tabs.

With permission, the browser can retain bounded model-byte checkpoints and
reuse them on a later confirmed load. An interrupted download can resume when
the current host and stored state permit it. Range responses remain provisional:
all reconstructed bytes must match the manifest's complete byte count and
SHA256 before the SDK receives a model. A strong ETag can additionally bind a
resume request; without one, the reviewed whole-model SHA256 remains the final
gate. An ignored or invalid range cannot admit a partial or changed model.

The panel distinguishes session-only, partial, saved and unavailable storage,
including the last reported checkpoint and reused byte counts. These are the
last load's observations, not a live inventory or a future persistence promise.
Private mode, quota, eviction, missing browser storage/lock APIs and another
tab's operation can prevent saving. A failed save does not turn an otherwise
verified session model into a saved one. Download progress counts processed
model bytes, including reused bytes; it is not a network-transfer measurement.

**Delete saved model downloads** first releases this panel's model, then asks
the coordinated store to delete this extension's model checkpoints, completed
stores and legacy model cache. Its result distinguishes cleared, busy,
unavailable and cancelled; a refusal or partial deletion is never reported as
complete success. Browser-managed HTTP caches and unrelated site data are
outside this action. A tiny invalidation marker remains so a delayed old worker
cannot restore a deleted checkpoint; it contains no model bytes or questions.
Reset and Release do not delete separately saved bytes.
This storage feature alone does not make a website or SDK available offline;
it is separate from Generative Websites' optional bounded offline publication.

For programmatic integrations, `loadVerifiedModel()` in `model-store.js` returns
`{blob, storage}` and accepts an `onStorage` callback. `fetchVerifiedModel()` in
`runtime-worker.js` retains its Blob return value. `clearStoredModels()` returns
a typed deletion result; the older `clearModelCache()` remains a boolean wrapper.
These helpers do not load a model automatically or bypass reader consent.

Queries are limited to 1,500 characters. Embedding search encodes up to the first 1,600 characters of each selected source using the recorded 512-token profile; token overflow fails rather than silently truncating the model input. The adapter accepts only SDK results reporting a positive input length, exactly one chunk and no truncation. At most ten results are shown. These bounded excerpts are a discovery aid; read the full canonical source for its conditions and context.

### Optional generation profile

Generation targets the pinned [Gemma 4 E2B web artifact](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/tree/b3ca0d2f076785a8f4b2219ddbd2bdb99954eae1), `gemma-4-E2B-it-web.litertlm`, **2,008,432,640 bytes**, SHA256 `3a08e8d94e23b814ae5414469c370c503813949acb8ceaa17e4ebf8a35af35b5`. The adapter now uses the pinned SDK's streaming generation backend default rather than incorrectly forcing its embedding backend. Source correctness, useful response quality and broader device support require separate evaluation.

Supply `--generation C:/Models/gemma-4-E2B-it-web.litertlm` to the same preparation command, alone or with `--embedding`. Explicitly raise the byte budget, for example `--max-model-bytes 2100000000`, and use a new output directory. `publish-assets: true` includes its exact generated inventory automatically. This permits a transfer; it is not a device memory or inference support guarantee.

Drafting uses the current question and up to four selected source excerpts, at
most 4,000 characters per excerpt and **12,000 in total**. Model context limits
can still reject a long request. Output is limited to 512 tokens and 8,000
characters. The default cited JSON mode accepts at most eight claims, eight
citations per claim and 24 citations overall. Insufficient evidence is an empty
claim result. Malformed or incomplete structured output is refused, preserving
source search; no valid-looking prefix is shown as an accepted proposal.

Accepted claims and quotations are displayed as literal text, labelled
unreviewed, with source-built links and provenance binding the model, runtime,
actual selected prompt, schema/profile, question, exact excerpts, optional graph
query context and snapshot. Plain-text compatibility mode retains its explicit
warning that individual references were not validated. Source references or
matching quotes do not establish support for an assertion. No generated text
changes the authored page or public knowledge graph.

## Model identity and safety

Models are hash-checked before engine use. The configured SDK bundle and its executable dependencies remain author-trusted website code; an inventory or model checksum does not verify the entire executable graph. The classic worker bootstrap supports the pinned SDK without patching its source. A temporary, collision-checked standard `Module.locateFile` configuration resolves requested WASM binaries against the declared local inventory, then restores the worker's prior configuration. The loader receives the explicit local WASM directory, avoiding its default CDN route.

Embedding results are session-only and tied to model/artifact identity, task prefixes, dimensions, normalization, exact source content and snapshot. The LiteRT profile differs from the Sentence Transformers profile used by Knowledge Graph Extraction. Equal family names and 768 dimensions do not make vectors interchangeable; original 300M vectors cannot be relabelled as EmbeddingGemma 2 vectors. Re-encode when the model or encoding profile changes.

Legacy runtime request hashes use SHA256 over UTF-8 `JSON.stringify(value)`,
including JSON quotes for a string. Its generation source hashes encode
`{id, url, text}` in that order. Structured proposal identities additionally bind
the versioned schema, format/profile, exact question, optional query/provider
context, selected excerpt content and raw output. Their structured-prompt and
excerpt-text hashes cover the exact UTF-8 strings; source-record hashes cover
`{id, text, url}`. The worker's provenance separately binds its actual combined
prompt and pinned model/runtime. These distinct hashes describe their named
representations; they are not interchangeable or signatures. They identify
selected excerpts and requests, rather than the raw QMD file or an assertion's
truth. Model-file hashes separately cover raw model bytes.

There is no cloud inference endpoint, telemetry, automatic model acquisition, persistent chat history, service worker or private-source index. The `.local-ai-source` class opts text into the page's search/evidence projection; it does not hide other content or certify publication permission. Browser-local execution does not establish permission to process restricted data. Use public or synthetic evaluation content and review applicable institutional rules.

## Rights, security and AI transparency

Original extension code is distributed under **Apache License 2.0**; see [LICENSE](LICENSE) and [COPYRIGHT](COPYRIGHT). Consumer content, models, SDKs and WASM retain their own rights. Optional asset preparation distributes upstream code and notices into your chosen deployment directory; review those licences and your content rights before publication. No Argumentation Sandbox code has been copied; its architecture informed the design, while its code-reuse rights remain unresolved.

**Material AI assistance:** Kai Prince directed development. OpenAI Codex assisted with research, architecture, implementation, tests, expected results and documentation. Automated checks do not establish independent human review, originality of every contribution, accessibility conformance, mathematical correctness or University of Manchester approval. Authors remain responsible for rights, publication scope, source review and applicable institutional rules.

### Verification and evidence availability

On **29 October 2026**, a bounded local **0.0.12** browser continuation passed
eight functional checks (`workflow-86228365`). It attempted only a previously
uncalled Unicode source query and returned one unreviewed claim with exact
source/quotation, raw-response and payload binding. Separate checks exercised
explicit release/reconsent and exact saved-model reuse without another text
generation, embedding discovery with both an exact source-ID label and an
ordinary similarity label, reset/saved-model deletion with source-search
fallback, and independent source/runtime/rendered-site closure. The earlier
malformed response (`workflow-b4b356d8`) remains a failed observation.

The continuation's strict network-health check **failed**: native MathJax and
polyfill CDN requests were blocked, and a model-loading request aborted without
an attributed cancellation cause. The eight functional passes do not turn that
run into a clean browser/network-health pass. No meaning, entailment, human
approval, professional suitability or general model-quality pass is claimed.

With Interactive CV, five current file/source/validator workflow checks passed,
including their observed health check (`workflow-de9737bf`). A separate real
ready-model workflow passed four functional checks and returned two unreviewed
claims with exact quotations and preserved original sources
(`workflow-5dc59a38`); its strict health check failed on an unexplained
model-loading abort. These bounded observations replace the earlier unverified
status of that rendered companion path, without establishing semantic support
or writing quality. Receipt identifiers refer to private development evidence,
not files bundled in this source distribution.

The preceding local **0.0.10** runtime passes its complete source-bound regression,
including thirteen native integration commands, forty-three compatibility
commands and three Preview groups (retained receipt
`roadmap-la-full-20261027-DilE3z`). The affected combined-project render also
passes (`roadmap-local-ai-20261027-sqVILt`); it does not certify the complete
website. Actual reader controls reconstructed two topic parts using 15,502
transferred bytes, then reused those bytes on the repeat query. The producer's
incomplete coverage stayed unknown, and browser diagnostics were empty
(`roadmap-browser-20261028/local-ai-topic-reuse.json`). Screenshot capture
failed, so these observations do not establish visual acceptance.

Earlier ready-model service checks exercised the actual widget and original
runtime with a synthetic worker. Those protocol checks are distinct from the
bounded real-model observations above; generation quality, source support,
human accessibility and deployment acceptance remain separate.

For the earlier local 0.0.8 candidate, full regression, 17 focused native corpus
commands, three literal tutorial commands and a four-page combined-project
render passed. Its actual browser checks covered nine reader workflows and eight separate
module/support-control groups, including cancellation, retained usable state,
exact passage mapping and bounded review import. The latter use explicitly
synthetic response JSON. No new model inference, relevance/support quality,
human accessibility, deployment or institutional acceptance is inferred.

The 0.0.3 development checks passed 43 synthetic unit/protocol/UI groups, nine packaging groups, 56 native Quarto commands, three preview checks and 11 observable checks using the actual pinned embedding pipeline on one browser/device. Codex assisted these checks and their expected results; they are not independent human acceptance. Native and browser checks establish their stated behavior and tested bytes, not general model quality or support.

For the local 0.0.6 candidate, 16 focused pure structured-proposal groups check
both formats' identities, schema/quote bounds, unique literal mapping,
invalid-response refusal and Unicode offsets. Thirteen actual-adapter/runtime
groups use synthetic SDK streams and controlled workers to check prompts,
provenance, atomic refusal, engine ownership and cancellation.
Separate pure excerpt/provider checks and synthetic UI integration exercise
their stated interfaces. These are component checks; fresh native website,
actual browser and actual model evidence for this candidate are separate
acceptance work. In particular, a synthetic valid JSON response does not show
that Gemma will reliably emit the required format or that its claims are useful
or supported.

Developer tests, fixtures, benchmarks, raw receipts and planning documents are intentionally kept outside this lean source distribution. They are not included or publicly available in this folder, so this checkout alone cannot reproduce the full internal suite or its benchmark measurements. The local installation and `example.qmd` workflow above can be reproduced using the distributed files; optional inference additionally requires the separately acquired, licensed runtime/model assets. The full developer workspace and retained evidence require separate availability before an external reviewer can reproduce those internal checks.

Use public or synthetic evaluation content. Treat page scripts and configured runtime assets as trusted code. Report reproducible, non-sensitive problems through [GitHub Issues](https://github.com/kai-prince-sfhea/local-ai-websites/issues). Do not post confidential data, prompts, credentials or unmitigated vulnerability details in public issues. No dedicated confidential security-reporting channel is currently advertised.

Official references: [Quarto extension creation](https://quarto.org/docs/extensions/creating.html), [LiteRT-LM JavaScript](https://developers.google.com/edge/litert-lm/js), [embedding runtime](https://developers.google.com/edge/litert-lm/embedding_models), [EmbeddingGemma 2](https://huggingface.co/google/embeddinggemma-2).
