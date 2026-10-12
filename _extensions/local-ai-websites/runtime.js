// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kai Prince
import {sameOriginURL, validateManifest, validateGenerationRequest, validateEmbeddingRequest, validateEmbedding,
  embeddingIdentity, generationIdentity, digestJSON} from './manifest.js';

const OWNER = Symbol.for('quarto.local-ai-websites.page-owner');
const LOCK = 'quarto-local-ai-websites-runtime-v1';
const MAX_MANIFEST_BYTES = 262144;
const error = message => new Error(message);
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(error(typeof signal.reason === 'string' ? signal.reason : 'Local AI was cancelled.'));
    if (signal.aborted) {aborted();return;}
    signal.addEventListener('abort', aborted, {once: true});
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

async function manifestJSON(response, signal) {
  if (!response?.ok || !response.body) throw error('The local AI manifest could not be read.');
  const reader = response.body.getReader(), parts = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await abortable(reader.read(), signal); if (done) break;
      if (!(value instanceof Uint8Array)) throw error('The local AI manifest stream is invalid.');
      size += value.byteLength; if (size > MAX_MANIFEST_BYTES) throw error('The local AI manifest exceeds its size limit.');
      parts.push(value);
    }
  } catch (failure) { void reader.cancel().catch(() => {}); throw failure; }
  finally { reader.releaseLock(); }
  const joined = new Uint8Array(size); let position = 0;
  for (const part of parts) { joined.set(part, position); position += part.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(joined)); }
  catch { throw error('The local AI manifest is not valid UTF-8 JSON.'); }
}

export class LocalAIRuntime {
  constructor({manifestURL, baseURL = globalThis.location?.href, onState = () => {},
    fetchImpl = globalThis.fetch?.bind(globalThis), workerFactory = url => new Worker(url),
    navigatorObject = globalThis.navigator, pageScope = globalThis, requestTimeoutMs = 180000} = {}) {
    this.manifestURL = sameOriginURL(manifestURL, baseURL, 'manifest URL');
    if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 1800000) throw error('Invalid local AI request timeout.');
    this.onState = onState; this.fetch = fetchImpl; this.workerFactory = workerFactory;
    this.navigator = navigatorObject; this.pageScope = pageScope; this.timeoutMs = requestTimeoutMs;
    this.epoch = 0; this.sequence = 0; this.pending = null; this.worker = null; this.model = null;
    this.busy = false; this.manifest = null; this.inspecting = null; this.releaseLock = null; this.owner = null;
    this.state('not-loaded');
  }

  state(status, details = {}) {
    this.status = status;
    try { this.onState({status, capability: this.model?.capability ?? null, modelId: this.model?.id ?? null, ...details}); }
    catch { /* A presentation callback cannot interrupt resource cleanup. */ }
  }

  async inspectManifest() {
    if (this.manifest) return structuredClone(this.manifest);
    if (this.inspecting) return structuredClone(await this.inspecting);
    const version = this.epoch; this.state('inspecting');
    const controller = new AbortController(); this.inspectController = controller;
    const timer = setTimeout(() => controller.abort('Reading the local AI manifest exceeded the time limit.'), this.timeoutMs);
    const inspection = (async () => {
      const response = await abortable(this.fetch(this.manifestURL, {credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal, redirect: 'error'}), controller.signal);
      const result = validateManifest(await manifestJSON(response, controller.signal), this.manifestURL);
      this.check(version); this.manifest = result; this.state('not-loaded'); return result;
    })();
    this.inspecting = inspection;
    try { return structuredClone(await inspection); }
    catch (failure) { if (version === this.epoch) this.state('failed', {message: failure.message}); throw failure; }
    finally { clearTimeout(timer); if (this.inspecting === inspection) { this.inspecting = null; this.inspectController = null; } }
  }

  check(version) { if (version !== this.epoch) throw error('Local AI was cancelled.'); }

  async acquire(version, signal) {
    if (this.pageScope[OWNER] && this.pageScope[OWNER] !== this) throw error('Another local AI control owns this page. Release it before loading another model.');
    this.pageScope[OWNER] = this; this.owner = this;
    const locks = this.navigator?.locks;
    if (!locks?.request) throw Object.assign(error('Web Locks are required to coordinate this experimental runtime.'), {unsupported: true});
    const granted = await abortable(new Promise((resolve, reject) => {
      locks.request(LOCK, {ifAvailable: true}, async lock => {
        if (!lock) { resolve(false); return; }
        if (version !== this.epoch || signal.aborted) { resolve(false); return; }
        const held = new Promise(done => { this.releaseLock = done; }); resolve(true); await held;
      }).catch(reject);
    }), signal);
    this.check(version);
    if (!granted) throw error('Local AI is busy in another tab. Release that model before retrying.');
  }

  async load(capability) {
    if (!['embed', 'generate'].includes(capability)) throw error('Unknown local AI capability.');
    if (this.busy) throw error('Local AI is already busy.');
    if (this.worker && this.model?.capability === capability && this.status === 'ready') return;
    if (this.worker) this.release();
    this.busy = true; const version = this.epoch;
    const controller = new AbortController(); this.loadController = controller;
    const timer = setTimeout(() => controller.abort('Loading local AI exceeded the time limit.'), this.timeoutMs);
    try {
      const manifest = await abortable(this.inspectManifest(), controller.signal); this.check(version);
      const model = manifest.models.find(record => record.capability === capability);
      if (!model) throw error('This site has not configured the requested model.');
      if (model.bytes > manifest.limits.maxModelBytes) throw error('This model exceeds the author-declared download/hash budget. Ask the author to configure a suitable budget.');
      if (!this.navigator?.gpu?.requestAdapter) throw Object.assign(error('This device does not expose WebGPU. Source search remains available.'), {unsupported: true});
      const adapter = await abortable(this.navigator.gpu.requestAdapter(), controller.signal); this.check(version);
      if (!adapter) throw Object.assign(error('No compatible WebGPU adapter is available. Source search remains available.'), {unsupported: true});
      await this.acquire(version, controller.signal); this.check(version); this.model = model;
      this.state('loading', {totalBytes: model.bytes, loadedBytes: 0});
      const worker = this.workerFactory(new URL('./runtime-worker-bootstrap.js', import.meta.url));
      this.worker = worker;
      worker.onmessage = event => {
        if (version === this.epoch && this.worker === worker) this.receive(event.data, version);
      };
      worker.onerror = () => {
        if (version === this.epoch && this.worker === worker)
          this.workerFailure('The local AI worker failed. Source search remains available.');
      };
      worker.onmessageerror = worker.onerror;
      const result = await abortable(this.request('load', {manifest, capability}), controller.signal);
      if (result?.ready !== true || Object.keys(result).some(key => key !== 'ready')) throw error('The local AI worker did not confirm model readiness.');
      this.check(version); this.state('ready');
    } catch (failure) {
      if (version === this.epoch) { this.dispose(); this.state(failure.unsupported ? 'unsupported' : 'failed', {message: failure.message}); }
      throw failure;
    } finally { clearTimeout(timer); if (this.loadController === controller) this.loadController = null; if (version === this.epoch) this.busy = false; }
  }

  request(type, payload) {
    if (!this.worker || this.pending) return Promise.reject(error('The local AI worker is not available.'));
    const id = ++this.sequence, version = this.epoch;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.workerFailure('Local AI exceeded the request time limit.'), this.timeoutMs);
      this.pending = {id, version, resolve, reject, timer, type};
      try { this.worker.postMessage({id, type, payload}); }
      catch { this.pending = null; clearTimeout(timer); reject(error('The local AI request could not be sent to its worker.')); }
    });
  }

  receive(message, version) {
    if (version !== this.epoch) return;
    if (!this.pending || !message || typeof message !== 'object' || Array.isArray(message) ||
        !Number.isSafeInteger(message.id) || message.id !== this.pending.id) {
      this.workerFailure('The local AI worker returned an invalid request identity.'); return;
    }
    if (message.type === 'progress') {
      if (this.pending.type !== 'load' || !Number.isSafeInteger(message.loadedBytes) || message.loadedBytes < (this.loadedBytes ?? 0) ||
          message.loadedBytes > this.model.bytes || !['downloading', 'verifying', 'initialising'].includes(message.stage) ||
          Object.keys(message).some(key => !['id', 'type', 'stage', 'loadedBytes'].includes(key))) {
        this.workerFailure('The local AI worker returned invalid download progress.'); return;
      }
      this.loadedBytes = message.loadedBytes;
      this.state('loading', {stage: message.stage, loadedBytes: message.loadedBytes, totalBytes: this.model.bytes});
      return;
    }
    if (!['error', 'result'].includes(message.type) || Object.keys(message).some(key => !['id', 'type', message.type === 'error' ? 'message' : 'result'].includes(key))) {
      this.workerFailure('The local AI worker returned an invalid response.'); return;
    }
    const pending = this.pending; this.pending = null; clearTimeout(pending.timer);
    if (message.type === 'error') pending.reject(error(typeof message.message === 'string' && message.message.trim() ? message.message.slice(0, 300) : 'Local AI failed.'));
    else if (message.type === 'result') pending.resolve(message.result);
    else pending.reject(error('The local AI worker returned an invalid response.'));
  }

  workerFailure(message) {
    const pending = this.pending; this.pending = null;
    if (pending) { clearTimeout(pending.timer); pending.reject(error(message)); }
    this.dispose(); this.state('failed', {message});
  }

  async operation(capability, type, payload, identify, validate) {
    if (this.busy) throw error('Local AI is already busy.');
    if (!this.worker || this.model?.capability !== capability || this.status !== 'ready') throw error('Explicitly load the matching local model first.');
    this.busy = true; const version = this.epoch; this.state(type === 'embed' ? 'embedding' : 'generating');
    try {
      const identity = await identify(payload); this.check(version);
      const result = await validate(await this.request(type, payload), identity); this.check(version); this.state('ready'); return result;
    }
    catch (failure) { if (version === this.epoch) { this.dispose(); this.state('failed', {message: failure.message}); } throw failure; }
    finally { if (version === this.epoch) this.busy = false; }
  }

  embed(input, kind = 'query', context = {}) {
    const payload = validateEmbeddingRequest(input, kind, context);
    return this.operation('embed', 'embed', payload, embeddingIdentity, async (result, identity) => {
      if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).some(key => !['embedding', 'provenance'].includes(key))) throw error('Invalid embedding response shape.');
      validateEmbedding(result?.embedding); this.validateProvenance(result.provenance, 'embed');
      if (Object.entries(identity).some(([key, value]) => result.provenance[key] !== value) ||
          result.provenance.vectorSha256 !== await digestJSON(result.embedding)) throw error('The embedding content or encoding identity does not match the request.');
      return result;
    });
  }

  generate(input) {
    const payload = validateGenerationRequest(input, this.manifest?.limits);
    return this.operation('generate', 'generate', payload, generationIdentity, (result, identity) => {
      if (!result || Array.isArray(result) || Object.keys(result).some(key => !['text', 'provenance'].includes(key)) ||
          typeof result.text !== 'string' || !result.text.trim() || result.text.length > this.manifest.limits.maxOutputCharacters)
        throw error('Invalid or oversized local AI proposal.');
      this.validateProvenance(result.provenance, 'generate');
      if (Object.entries(identity).some(([key, value]) => JSON.stringify(result.provenance[key]) !== JSON.stringify(value)))
        throw error('The proposal source content or request identity does not match the request.');
      return result;
    });
  }

  validateProvenance(value, capability) {
    if (!value || value.status !== 'unreviewed' || value.capability !== capability ||
        value.model?.id !== this.model.id || value.model?.revision !== this.model.revision || value.model?.sha256 !== this.model.sha256 ||
        value.runtime?.name !== this.manifest.runtime.name || value.runtime?.version !== this.manifest.runtime.version ||
        value.runtime?.revision !== this.manifest.runtime.revision || (capability === 'embed' && value.model.dimensions !== 768))
      throw error('The local AI response provenance does not match the loaded model.');
  }

  dispose() {
    const pending = this.pending; this.pending = null;
    if (pending) {clearTimeout(pending.timer);pending.reject(error('Local AI resources were released.'));}
    this.worker?.terminate(); this.worker = null; this.model = null;
    this.loadedBytes = 0;
    this.releaseLock?.(); this.releaseLock = null;
    if (this.owner && this.pageScope[OWNER] === this) delete this.pageScope[OWNER]; this.owner = null;
  }

  cancel() {
    this.epoch++; this.inspectController?.abort(); this.inspecting = null; this.inspectController = null;
    this.loadController?.abort(); this.loadController = null;
    const pending = this.pending; this.pending = null;
    if (pending) { clearTimeout(pending.timer); pending.reject(error('Local AI was cancelled.')); }
    this.dispose(); this.busy = false; this.state('cancelled');
  }

  release() { this.cancel(); this.state('released'); }
  reset() { this.cancel(); this.manifest = null; this.state('reset'); }
}
