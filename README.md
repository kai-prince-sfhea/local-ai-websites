# Local AI Websites

An experimental Quarto extension for source search and optional browser-local assistance. Reviewed page content remains readable and searchable without a model. The selected model defaults are **EmbeddingGemma 2**, with text-only 768-dimensional retrieval, and **Gemma 4 E2B** for generated proposals.

Version **0.0.3** is experimental source requiring **Quarto 1.11.5 or later**. Development uses the Windows pre-release. The repository publishes source; it does not establish a supported release or production deployment. No model weights, SDK bundle or WASM binaries are included. A bounded actual EmbeddingGemma 2 smoke test passed in one Codex in-app browser with AMD RDNA-3 WebGPU over secure loopback HTTP: semantic discovery on three synthetic sources, loading, cancellation/recovery, release/reset and ordinary source search. This does not establish independent retrieval quality, memory/latency support, network-egress assurance, citation support, mathematical fidelity, accessibility conformance or production deployment acceptance.

## Install from GitHub

Copy [example.qmd](example.qmd) into a separate consumer folder, then run there:

```sh
quarto add kai-prince-sfhea/local-ai-websites --no-prompt
quarto list extensions
quarto render example.qmd
```

The example selects `kai-prince-sfhea/local-ai-websites`, matching the GitHub installation namespace. This workflow requires Quarto only. Node.js and npm are needed only if you choose to prepare the optional model assets below. The default installation follows the experimental `main` branch; no supported tagged release is promised.

In the current Windows Quarto 1.11.5/Pandoc 3.10 environment, optional manifest publication requires an ASCII project-root filesystem path; spaces are allowed. Upstream path APIs misreport accented roots, and CJK consumer paths can fail Quarto's absolute extension-path loading before extension code starts. Unicode page content and source IDs are supported separately.

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

Local installation uses a different namespace. Change the copied example and the filter configuration below to:

```yaml
filters:
  - local-ai-websites
```

For the local installation, the optional preparation tool is `_extensions/local-ai-websites/prepare-assets.mjs`. Update with `quarto update extension ../local-ai-websites --no-prompt`; after removing the local filter selector, remove with `quarto remove local-ai-websites --no-prompt`. The remaining examples use the GitHub installation paths.

### Versions and migration

The `0.0.x` series is experimental and does not promise a stable configuration or runtime API. Changes to authoring, manifest versions, runtime profiles and required migrations belong in the versioned changelog. Incompatible manifest versions and unsupported fields fail validation rather than being silently converted. Review the changelog before updating; update the installed extension, re-render the consumer and reload the page to begin a fresh session.

Version 0.0.3 introduces no authoring or manifest-version migration from 0.0.2. If a later update changes the SDK, model or embedding profile, prepare a new asset directory from the required pinned inputs and update the manifest and exact resource list together. Re-encode affected vectors; do not rename or relabel an old model space. Keep the earlier usable asset pack until the replacement has been checked. This extension does not provide persistent-reader-state migration because its state is session-only.

### Compatibility

| Target | Current boundary |
|---|---|
| Windows, Quarto 1.11.5 pre-release, HTML | Local extension lifecycle, rendering, project/nested-page resource delivery and visibility boundaries exercised |
| Same environment, DOCX | Native canonical source content and static source list exercised |
| Local preview | HTTP output and a QMD update exercised; browser live-reload/WebSocket behaviour unverified |
| Optional manifest filesystem paths | ASCII project roots, including spaces; accented-root APIs and CJK extension-path loading encounter upstream Windows failures |
| Optional models | Actual pinned embedding execution and lifecycle exercised on one AMD RDNA-3 browser setup; generation bytes not acquired. Quality and broader device support remain unverified |
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

Search supports exact source IDs, including `#math-group-action`, and lexical matches. A bounded in-memory word index is built once per page and reused for subsequent searches; it is not persisted. It keeps differently scoped concepts distinct. Optional embedding search can discover selected sources without a lexical match; similarity is a navigation aid and does not verify meaning or truth. The extension searches the explicitly selected sources on this page; it does not index an entire website or private project files.

Disable the extension without loading its configuration or models:

```yaml
local-ai:
  enabled: false
```

When enabled, `local-ai` accepts only `enabled` and `manifest`; unknown options fail the render. Omit `manifest` for source search without models.

There is no automatic model acquisition, cloud inference, telemetry, persistent chat history, service worker or project-wide private-source indexing. Optional model loading requires an author-supplied same-origin asset manifest and an explicit reader action. Models, the SDK bundle and WASM are separate licensed deployment inputs. Browser-local execution does not establish institutional permission for restricted data.

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
   node _extensions/kai-prince-sfhea/local-ai-websites/prepare-assets.mjs --packages ../local-ai-tools --embedding C:/Models/embeddinggemma-2-text-270m.litertlm --output ./local-ai-assets
   ```

   The installed path above matches the GitHub `quarto add` workflow. The command refuses an existing output directory, linked paths, wrong models, altered WASM bytes and incompatible package identities. It bundles the SDK, preserves source notices, copies all eight feature-selected WASM files, verifies copied model bytes and writes `models.json` last. On failure it removes only its own partial output. It does not overwrite an earlier usable deployment. Run `node _extensions/kai-prince-sfhea/local-ai-websites/prepare-assets.mjs --help` for the supported arguments.

4. Configure the manifest and explicitly publish the generated runtime files in `_quarto.yml`. Merge this website example into your existing project configuration, preserving its project type and other settings. This complete file list applies to the embedding-only command above:

   ```yaml
   project:
     type: website
     resources:
       - local-ai-assets/sdk.js
       - local-ai-assets/wasm/litertlm_wasm_asyncify_internal.js
       - local-ai-assets/wasm/litertlm_wasm_asyncify_internal.wasm
       - local-ai-assets/wasm/litertlm_wasm_compat_asyncify_internal.js
       - local-ai-assets/wasm/litertlm_wasm_compat_asyncify_internal.wasm
       - local-ai-assets/wasm/litertlm_wasm_compat_internal.js
       - local-ai-assets/wasm/litertlm_wasm_compat_internal.wasm
       - local-ai-assets/wasm/litertlm_wasm_internal.js
       - local-ai-assets/wasm/litertlm_wasm_internal.wasm
       - local-ai-assets/models/embeddinggemma-2-text-270m.litertlm
       - local-ai-assets/licences/Apache-2.0.txt
       - local-ai-assets/licences/ATTRIBUTION.txt
       - local-ai-assets/asset-receipt.json
       - local-ai-assets/models.json

   local-ai:
     manifest: /local-ai-assets/models.json
   ```

   The command output and `asset-receipt.json` contain the exact `resourceFiles` list; include any additional upstream notices recorded there. Resources belong under `project.resources`. The project-root manifest path also works for nested pages. The filter automatically registers only the selected manifest for HTML panels. It does not recursively publish a directory or infer permission to publish SDK/model files. Preserve your other project resources when adding this list.

5. Render and serve the website. Review the embedding model files in the panel, explicitly confirm loading, then choose embedding search or reranking. A complete local asset pack is not a persistent browser installation or a PWA offline guarantee.

Manifest and asset URL paths must use ordinary ASCII names without spaces, percent escapes, backslashes, query strings or fragments. Unicode page content and canonical source IDs are supported separately. A relative manifest path resolves beside its input document. In a Quarto project, `/local-ai-assets/models.json` refers to the project root and is rewritten for nested output pages and deployment below a site subpath. All SDK/WASM/model URLs must remain on the website's origin.

The default individual model budget is 256 MiB. Runtime files are additional transfers, and hashing, Blob creation, WASM and GPU allocation can use substantially more memory than model file size. Download progress is coalesced at cumulative 1 MiB steps plus exact completion. Loading is optional. Cancel terminates the worker and releases its lock; release also clears proposals and session vectors. Reset additionally clears the reviewed manifest, question and results. Reset does not clear browser-managed HTTP caches; this extension creates no persistent model store or chat history.

Queries are limited to 1,500 characters. Embedding search encodes up to the first 1,600 characters of each selected source using the recorded 512-token profile; token overflow fails rather than silently truncating the model input. The adapter accepts only SDK results reporting a positive input length, exactly one chunk and no truncation. At most ten results are shown. These bounded excerpts are a discovery aid; read the full canonical source for its conditions and context.

### Optional generation profile

Generation targets the pinned [Gemma 4 E2B web artifact](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/tree/b3ca0d2f076785a8f4b2219ddbd2bdb99954eae1), `gemma-4-E2B-it-web.litertlm`, **2,008,432,640 bytes**, SHA256 `3a08e8d94e23b814ae5414469c370c503813949acb8ceaa17e4ebf8a35af35b5`. This is a distinct experimental capability; its model has not been acquired or evaluated in this development pass.

After separately reviewing and acquiring that exact artifact, you can supply `--generation C:/Models/gemma-4-E2B-it-web.litertlm` to the preparation command. It may be combined with `--embedding` or used alone. You must explicitly raise the byte budget, for example `--max-model-bytes 2100000000`, and use a new output directory. Update the exact resources list from the resulting receipt, including the generation model file. This budget permits a transfer; it is not a device memory or inference support guarantee.

Drafting uses the current question and up to four selected source excerpts, at most 4,000 characters per excerpt and 16,000 in total. Model context limits can still reject a long request. Output is limited to 512 tokens and 8,000 characters, displayed as plain text and labelled as an unreviewed proposal, with sources and provenance binding the model, runtime, prompt, question, source content and snapshot. Source references alone do not establish support for a generated assertion. No generated text changes the authored page or public knowledge graph.

## Model identity and safety

Models are hash-checked before engine use. The configured SDK bundle and its executable dependencies remain author-trusted website code; an inventory or model checksum does not verify the entire executable graph. The classic worker bootstrap supports the pinned SDK without patching its source. A temporary, collision-checked standard `Module.locateFile` configuration resolves requested WASM binaries against the declared local inventory, then restores the worker's prior configuration. The loader receives the explicit local WASM directory, avoiding its default CDN route.

Embedding results are session-only and tied to model/artifact identity, task prefixes, dimensions, normalization, exact source content and snapshot. The LiteRT profile differs from the Sentence Transformers profile used by Knowledge Graph Extraction. Equal family names and 768 dimensions do not make vectors interchangeable; original 300M vectors cannot be relabelled as EmbeddingGemma 2 vectors. Re-encode when the model or encoding profile changes.

Request provenance hashes use SHA256 over UTF-8 `JSON.stringify(value)`, including JSON quotes for a string. Generation source hashes encode `{id, url, text}` in that order; the page snapshot encodes the ordered source records `{id, text, label, url}` with resolved canonical URLs. These identify the exact selected content and request, rather than the raw QMD file. Model-file hashes separately cover raw model bytes.

There is no cloud inference endpoint, telemetry, automatic model acquisition, persistent chat history, service worker or private-source index. The `.local-ai-source` class opts text into the page's search/evidence projection; it does not hide other content or certify publication permission. Browser-local execution does not establish permission to process restricted data. Use public or synthetic evaluation content and review applicable institutional rules.

## Rights, security and AI transparency

Original extension code is distributed under **Apache License 2.0**; see [LICENSE](LICENSE) and [COPYRIGHT](COPYRIGHT). Consumer content, models, SDKs and WASM retain their own rights. Optional asset preparation distributes upstream code and notices into your chosen deployment directory; review those licences and your content rights before publication. No Argumentation Sandbox code has been copied; its architecture informed the design, while its code-reuse rights remain unresolved.

**Material AI assistance:** Kai Prince directed development. OpenAI Codex assisted with research, architecture, implementation, tests, expected results and documentation. Automated checks do not establish independent human review, originality of every contribution, accessibility conformance, mathematical correctness or University of Manchester approval. Authors remain responsible for rights, publication scope, source review and applicable institutional rules.

### Verification and evidence availability

The 0.0.3 development checks passed 43 synthetic unit/protocol/UI groups, nine packaging groups, 56 native Quarto commands, three preview checks and 11 observable checks using the actual pinned embedding pipeline on one browser/device. Codex assisted these checks and their expected results; they are not independent human acceptance. Native and browser checks establish their stated behavior and tested bytes, not general model quality or support.

Developer tests, fixtures, benchmarks, raw receipts and planning documents are intentionally kept outside this lean source distribution. They are not included or publicly available in this folder, so this checkout alone cannot reproduce the full internal suite or its benchmark measurements. The local installation and `example.qmd` workflow above can be reproduced using the distributed files; optional inference additionally requires the separately acquired, licensed runtime/model assets. The full developer workspace and retained evidence require separate availability before an external reviewer can reproduce those internal checks.

Use public or synthetic evaluation content. Treat page scripts and configured runtime assets as trusted code. Report reproducible, non-sensitive problems through [GitHub Issues](https://github.com/kai-prince-sfhea/local-ai-websites/issues). Do not post confidential data, prompts, credentials or unmitigated vulnerability details in public issues. No dedicated confidential security-reporting channel is currently advertised.

Official references: [Quarto extension creation](https://quarto.org/docs/extensions/creating.html), [LiteRT-LM JavaScript](https://developers.google.com/edge/litert-lm/js), [embedding runtime](https://developers.google.com/edge/litert-lm/embedding_models), [EmbeddingGemma 2](https://huggingface.co/google/embeddinggemma-2).
