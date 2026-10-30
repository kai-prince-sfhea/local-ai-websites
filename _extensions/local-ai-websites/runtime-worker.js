// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kai Prince
import {validateManifest, validateEmbeddingRequest, validateGenerationRequest, validateEmbedding, EMBEDDING_PROFILE,
  embeddingIdentity, generationIdentity, digestJSON, GENERATION_PROFILE, generationPrompt} from './manifest.js';
import {loadVerifiedModel,clearStoredModels,validateStorageState,MODEL_CACHE} from './model-store.js';

export {MODEL_CACHE,clearStoredModels,validateStorageState};
// Compatibility APIs retain their Blob/boolean return values. Detailed callers
// can inspect the separately typed storage receipts without inferring success.
export async function clearModelCache(cacheStorage = globalThis.caches, options = {}) {
  return (await clearStoredModels({...options,cacheStorage})).status === 'cleared';
}
export async function fetchVerifiedModel(model, budget, options = {}) {
  return (await loadVerifiedModel(model,budget,options)).blob;
}

export function modelProvenance(manifest, model, details = {}) {
  return {status: 'unreviewed', capability: model.capability,
    runtime: {name: manifest.runtime.name, version: manifest.runtime.version, revision: manifest.runtime.revision},
    model: {id: model.id, revision: model.revision, sha256: model.sha256, ...(model.dimensions ? {dimensions: model.dimensions} : {})}, ...details};
}

export async function loadPinnedWasm(manifest, sdk, scope = globalThis) {
  if (typeof sdk.loadLiteRtLm !== 'function') throw new Error('The configured SDK has no LiteRT-LM loader.');
  const previous = Object.getOwnPropertyDescriptor(scope, 'Module');
  if (previous && (!Object.hasOwn(previous, 'value') || previous.value !== undefined))
    throw new Error('Another runtime already configured this worker WASM module.');
  // Pinned @litert-lm/core 0.18.0 omits wasm-utils' fileLocator argument. Its
  // supported Emscripten Module configuration therefore supplies the binary URL;
  // otherwise a classic worker resolves it beside the bootstrap, not the loader.
  const configuration = {locateFile(file) {
    if (typeof file !== 'string' || !/^litertlm_wasm_(?:compat_)?(?:asyncify_)?internal\.wasm$/u.test(file))
      throw new Error('The SDK requested an undeclared WASM asset.');
    const url = new URL(file, manifest.runtime.wasmURL).href;
    if (!url.startsWith(manifest.runtime.wasmURL) || !manifest.runtime.inventory.some(record => record.url === url))
      throw new Error('The SDK requested a WASM binary absent from its reviewed inventory.');
    return url;
  }};
  try {
    Object.defineProperty(scope, 'Module', {configurable: true, writable: true, value: configuration});
    // The explicit path prevents the SDK's implicit external CDN default.
    await sdk.loadLiteRtLm(manifest.runtime.wasmURL, {threads: false});
  } finally {
    if (previous) Object.defineProperty(scope, 'Module', previous);
    else delete scope.Module;
  }
}

export async function createAdapter(manifest, model, sdk, blob) {
  await loadPinnedWasm(manifest, sdk);
  if (model.capability === 'embed') {
    if (!sdk.EmbeddingEngine?.create || !sdk.Backend || !sdk.InputOverflowStrategy) throw new Error('The configured SDK lacks the declared embedding API.');
    const engine = await sdk.EmbeddingEngine.create({model: blob, backend: sdk.Backend.GPU, maxInputLength: EMBEDDING_PROFILE.tokenMax});
    return {async embed(input) {
      const validated = validateEmbeddingRequest(input.text, input.kind,
        {...(input.snapshot ? {snapshot: input.snapshot} : {}), ...(input.sourceId ? {sourceId: input.sourceId} : {})});
      if (input.prefix !== undefined && input.prefix !== validated.prefix) throw new Error('The embedding task prefix does not match its kind.');
      if (Object.keys(input).some(key => !['text', 'kind', 'prefix', 'snapshot', 'sourceId'].includes(key))) throw new Error('Unknown embedding request field.');
      const identity = await embeddingIdentity(validated);
      const result = await engine.computeEmbedding(validated.prefix + validated.text,
        {normalize: true, outputSize: 768, inputOverflowStrategy: sdk.InputOverflowStrategy.ERROR});
      if (!result || typeof result !== 'object' || Array.isArray(result) ||
          !Number.isSafeInteger(result.inputLength) || result.inputLength < 1 || result.numChunks !== 1 ||
          (result.truncatedLength !== undefined && result.truncatedLength !== 0))
        throw new Error('The embedding result lacks valid single-chunk, no-truncation metadata.');
      const embedding = validateEmbedding(result.embedding);
      return {embedding, provenance: modelProvenance(manifest, model, {...identity, vectorSha256: await digestJSON(embedding)})};
    }, async release() { await engine.delete(); }};
  }
  if (!sdk.Engine?.create) throw new Error('The configured SDK lacks the declared generation API.');
  // The pinned SDK defaults generation to GPU_ARTISAN (its streaming executor).
  // Backend.GPU is the embedding default and fails this web generation artifact.
  const engine = await sdk.Engine.create({model: blob, mainExecutorSettings: {maxNumTokens: 4096}});
  return {async generate(input) {
    const validated = validateGenerationRequest(input, manifest.limits), identity = await generationIdentity(validated); let conversation, reader;
    try {
      conversation = await engine.createConversation({preface: {messages: [{role: 'system', content:
        generationPrompt(validated.outputFormat)}],
        extra_context: {enable_thinking: false}}, sessionConfig: {maxOutputTokens: GENERATION_PROFILE.maxOutputTokens}});
      const message = {role: 'user', content: JSON.stringify({question: validated.question, evidence: validated.evidence})};
      reader = conversation.sendMessageStreaming(message).getReader(); let output = '', total = 0;
      while (true) {
        const {done, value} = await reader.read(); if (done) break;
        if (!value || typeof value !== 'object' || Array.isArray(value) ||
            (value.role !== undefined && typeof value.role !== 'string')) throw new Error('The SDK returned an invalid message chunk.');
        if (value.tool_calls !== undefined && (!Array.isArray(value.tool_calls) || value.tool_calls.length))
          throw new Error('Tool calls are unsupported in a local text proposal.');
        const content = value.content;
        if (typeof content === 'string') { output += content; total += content.length; }
        else if (Array.isArray(content)) {
          for (const part of content) {
            if (!part || part.type !== 'text' || typeof part.text !== 'string') throw new Error('The SDK returned a non-text content part.');
            output += part.text; total += part.text.length;
          }
        } else if (content !== undefined) throw new Error('The SDK returned an invalid text chunk.');
        // Message.content is optional in the pinned API: role-only and channel
        // deltas may precede final text. Channels are bounded but never displayed.
        if (value.channels !== undefined) {
          if (!value.channels || typeof value.channels !== 'object' || Array.isArray(value.channels)) throw new Error('The SDK returned invalid channels.');
          for (const channel of Object.values(value.channels)) {
            if (typeof channel !== 'string') throw new Error('The SDK returned an invalid channel.'); total += channel.length;
          }
        }
        if (output.length > manifest.limits.maxOutputCharacters || total > manifest.limits.maxOutputCharacters * 2)
          throw new Error('The generated proposal exceeds its output budget.');
      }
      if (!output.trim()) throw new Error('The local model returned no proposal.');
      return {text: output, provenance: modelProvenance(manifest, model, identity)};
    } catch (failure) { conversation?.cancel(); await reader?.cancel().catch(() => {}); throw failure; }
    finally { reader?.releaseLock(); await conversation?.delete(); }
  }, async release() { await engine.delete(); }};
}

let adapter, manifest, model, busy = false;
const workerScope = typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof document === 'undefined' ? self : null;
if (workerScope) workerScope.onmessage = async ({data}) => {
  const {id, type, payload} = data ?? {};
  if (!Number.isSafeInteger(id) || id < 1) return;
  if (busy) { workerScope.postMessage({id, type: 'error', message: 'The local AI worker is already busy.'}); return; }
  busy = true; let storage = null;
  try {
    let result;
    if (Object.keys(data).some(key => !['id', 'type', 'payload'].includes(key))) throw new Error('Unknown worker request field.');
    if (type === 'load') {
      if (adapter) throw new Error('Release the existing local model before loading another.');
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => !['manifest', 'capability', 'remember'].includes(key)) || (payload.remember !== undefined && typeof payload.remember !== 'boolean')) throw new Error('Invalid model load request.');
      manifest = validateManifest(payload?.manifest, workerScope.location.href);
      model = manifest.models.find(record => record.capability === payload.capability);
      if (!model) throw new Error('Unknown local model capability.');
      const loaded = await loadVerifiedModel(model, manifest.limits.maxModelBytes,
        {remember: payload.remember === true, onProgress: loadedBytes => workerScope.postMessage({id, type: 'progress', stage: 'downloading', loadedBytes}),
          onVerifying: loadedBytes => workerScope.postMessage({id, type: 'progress', stage: 'verifying', loadedBytes}),
          onStorage: value => {storage=validateStorageState(value,model.bytes);workerScope.postMessage({id,type:'storage',storage});}});
      storage=validateStorageState(loaded.storage,model.bytes);
      // SDK graph and WASM inventory are author-trusted. Their declarations are
      // not transitive integrity enforcement; the model digest has narrower scope.
      workerScope.postMessage({id, type: 'progress', stage: 'initialising', loadedBytes: model.bytes});
      const sdk = await import(manifest.runtime.moduleURL);
      adapter = await createAdapter(manifest, model, sdk, loaded.blob); result = {ready: true,storage};
    } else if (type === 'embed' && model?.capability === 'embed' && adapter) result = await adapter.embed(payload);
    else if (type === 'generate' && model?.capability === 'generate' && adapter) result = await adapter.generate(payload);
    else throw new Error('The requested local capability is not loaded.');
    workerScope.postMessage({id, type: 'result', result});
  } catch (failure) {
    try { await adapter?.release(); } catch { /* Worker termination is the final cleanup boundary. */ }
    adapter = null;
    if(type==='load')try{storage=validateStorageState(failure?.storage??storage,model?.bytes);}catch{storage=null;}
    workerScope.postMessage({id, type: 'error', message: 'Local AI failed to load or complete this bounded request. Source search remains available.',...(type==='load'&&storage?{storage}:{})});
  } finally { busy = false; }
};
