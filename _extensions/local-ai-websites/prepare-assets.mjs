// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kai Prince
// Explicit author operation. This tool never installs packages or downloads assets.
import {createReadStream} from 'node:fs';
import {lstat, realpath, readFile, open, mkdir, readdir, unlink, rmdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname, basename, resolve, relative, isAbsolute, sep, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {DEFAULT_MODEL_PREFERENCES, DEFAULT_LIMITS, validateManifest} from './manifest.js';

export const PACKAGE_PINS = Object.freeze({
  '@litert-lm/core': Object.freeze({version: '0.18.0', licence: 'Apache-2.0',
    integrity: 'sha512-8v+/xk3NUss4GgDuDU/XT+PqtAZhInS3+6mzla2IVm98t7/KfLSnavY3MbPcYTHHZ8Tk8aiYaFKa40H+PPdy3w=='}),
  '@litertjs/wasm-utils': Object.freeze({version: '2.0.0', licence: 'Apache-2.0',
    integrity: 'sha512-TimssmDKn2zL2qSuJbgjrUIgB6oEXhneQjQyy1W6Hlyw15+dtMfLch5yZ40/MLn5TnE80hY46x3hnjXFF3UKsA=='}),
  esbuild: Object.freeze({version: '0.25.10', licence: 'MIT',
    integrity: 'sha512-9RiGKvCwaqxO2owP61uQ4BgNborAQskMR6QusfWzQqv7AZOg5oGehdY2pRJMTKuwxd1IDBP4rSbI5lHzU7SMsQ=='})
});
// Immutable jsDelivr package metadata, independently matching the npm payload.
// All feature-selected loader pairs are needed; one pair is not browser portable.
const WASM_PINS = Object.freeze([
  ['litertlm_wasm_asyncify_internal.js', 303787, 'u9lcfheMNpuVYWD0GxQwwN766dBabNfIEIBuT0ZMlBs='],
  ['litertlm_wasm_asyncify_internal.wasm', 34417794, 'kbHnexcTmJPVulrd23VYcCRLpYnlXVvPiuGRvRwLH28='],
  ['litertlm_wasm_compat_asyncify_internal.js', 303998, 'SpnIfIekMiz3QxnUr5V1opQYtYrm/nf1kpdS0gY+uIE='],
  ['litertlm_wasm_compat_asyncify_internal.wasm', 34235088, 'bqrObfDtU7A8iTKsl0UrykGhKXkhvQjERirXt7p2OiE='],
  ['litertlm_wasm_compat_internal.js', 296458, 'Ntm4Pbd74VATJ8PPB1q34hOtMpYA1F+87EhlRSUoV4E='],
  ['litertlm_wasm_compat_internal.wasm', 21730274, 'H4Lp+P1gCJm+EdrieT1FGYqfwO2sWHZc8ZIaNXFBYTc='],
  ['litertlm_wasm_internal.js', 296218, 'GV71pSnfcYvBMg4pK0xNdQBZNQ0WLsmWVOJQq4oU76c='],
  ['litertlm_wasm_internal.wasm', 21912708, 'g+ivbk3uz7O7JLZgKFHcuKDFZWVH2Y7vxfvVZAzkmrU=']
]);
const HELP = `Prepare an optional Local AI Websites runtime using existing local assets.

Node.js >=24 is required. Run this explicitly, never as a render hook.
  node prepare-assets.mjs --packages <npm-project> --embedding <model.litertlm> --output <new-directory>
  node prepare-assets.mjs --packages <npm-project> --generation <model.litertlm> --max-model-bytes 2100000000 --output <new-directory>

--embedding and --generation may be combined. At least one is required.
The npm project must contain package-lock.json v3 and these exact installed packages:
  @litert-lm/core@0.18.0 @litertjs/wasm-utils@2.0.0 esbuild@0.25.10
The output parent must exist; the output must not exist. Nothing is overwritten.
No network fetch, npm installation, inference or persistent browser caching occurs.
`;
const within = (root, candidate) => {
  const part = relative(root, candidate);
  return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`));
};
async function ordinary(path, directory = false) {
  const full = resolve(path); let current = full;
  while (true) {
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error(`Linked paths are not admitted: ${current}`);
    if (current === full && !(directory ? info.isDirectory() : info.isFile())) throw new Error(`Not an ordinary ${directory ? 'directory' : 'file'}: ${full}`);
    const parent = dirname(current); if (parent === current) break; current = parent;
  }
  return realpath(full);
}
async function digest(path, maximum = 134217728) {
  const info = await lstat(path), hash = createHash('sha256'); let bytes = 0;
  if (!info.isFile() || info.size > maximum) throw new Error('An input exceeds its declared size bound.');
  for await (const chunk of createReadStream(path)) { bytes += chunk.length; if (bytes > maximum) throw new Error('An input changed beyond its declared size bound.'); hash.update(chunk); }
  if (bytes !== info.size) throw new Error('An input changed while it was being read.');
  return {bytes, sha256: hash.digest('hex')};
}
async function json(path, limit = 2 * 1024 * 1024) {
  if ((await lstat(path)).size > limit) throw new Error(`Metadata is too large: ${path}`);
  return JSON.parse(await readFile(path, 'utf8'));
}
export function parseArguments(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return {help: true};
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!['--packages', '--embedding', '--generation', '--output', '--max-model-bytes'].includes(key) || !value || value.startsWith('--') || Object.hasOwn(options, key)) throw new Error('Unknown, missing or repeated argument. Use --help.');
    options[key] = value;
  }
  if (!options['--packages'] || !options['--output'] || (!options['--embedding'] && !options['--generation'])) throw new Error('Provide packages, a local model and a new output directory. Use --help.');
  const maxModelBytes = options['--max-model-bytes'] === undefined ? DEFAULT_LIMITS.maxModelBytes : Number(options['--max-model-bytes']);
  if (!Number.isSafeInteger(maxModelBytes) || maxModelBytes < 1 || maxModelBytes > 3221225472) throw new Error('Invalid max-model-bytes.');
  return {packages: options['--packages'], embedding: options['--embedding'], generation: options['--generation'], output: options['--output'], maxModelBytes};
}

export async function prepareAssets(options) {
  const packages = await ordinary(options.packages, true), output = resolve(options.output);
  const parent = await ordinary(dirname(output), true);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(basename(output)) || dirname(output) !== parent) throw new Error('Use a simple new output directory name inside an ordinary existing parent.');
  try { await lstat(output); throw new Error('The output directory already exists; choose a new directory.'); }
  catch (failure) { if (failure.code !== 'ENOENT') throw failure; }
  const lock = await json(await ordinary(join(packages, 'package-lock.json')));
  if (lock.lockfileVersion !== 3 || !lock.packages) throw new Error('A retained npm package-lock.json v3 is required.');
  const projectRequire = createRequire(join(packages, 'package.json')), installed = {};
  for (const [name, pin] of Object.entries(PACKAGE_PINS)) {
    const packagePath = await ordinary(projectRequire.resolve(`${name}/package.json`));
    const expectedRoot = resolve(packages, 'node_modules', ...name.split('/'));
    if (dirname(packagePath) !== expectedRoot) throw new Error(`Use a direct locked installation of ${name}.`);
    const metadata = await json(packagePath), record = lock.packages[`node_modules/${name}`];
    if (metadata.name !== name || metadata.version !== pin.version || metadata.license !== pin.licence || record?.version !== pin.version || record.integrity !== pin.integrity || record.link) throw new Error(`Installed or locked package identity does not match ${name}@${pin.version}.`);
    installed[name] = {root: expectedRoot, metadata};
  }
  const core = installed['@litert-lm/core'], utils = installed['@litertjs/wasm-utils'];
  if (Object.keys(core.metadata.dependencies ?? {}).join() !== '@litertjs/wasm-utils' || Object.keys(utils.metadata.dependencies ?? {}).length) throw new Error('The inspected SDK dependency graph has changed.');
  const coreRequire = createRequire(join(core.root, 'package.json'));
  if (await ordinary(coreRequire.resolve('@litertjs/wasm-utils/package.json')) !== join(utils.root, 'package.json')) throw new Error('The SDK resolves a different wasm-utils installation.');
  const models = [];
  for (const [capability, supplied] of [['embed', options.embedding], ['generate', options.generation]]) {
    if (!supplied) continue;
    const profile = DEFAULT_MODEL_PREFERENCES[capability], path = await ordinary(supplied), actual = await digest(path, profile.bytes);
    if (actual.bytes !== profile.bytes || actual.sha256 !== profile.sha256) throw new Error(`The ${capability} model bytes do not match the pinned ${profile.id} artifact.`);
    if (actual.bytes > options.maxModelBytes) throw new Error('The model exceeds max-model-bytes; increase that budget explicitly only after reviewing device and hosting costs.');
    models.push({capability, path, profile, actual});
  }
  if (!models.length) throw new Error('At least one pinned local model is required.');
  const wasm = [];
  for (const [name, bytes, base64] of WASM_PINS) {
    const path = await ordinary(join(core.root, 'wasm', name)), actual = await digest(path);
    if (actual.bytes !== bytes || actual.sha256 !== Buffer.from(base64, 'base64').toString('hex')) throw new Error(`WASM package bytes do not match the pinned SDK: ${name}`);
    wasm.push({path, name, actual});
  }
  const esbuild = await import(pathToFileURL(projectRequire.resolve('esbuild')).href);
  if (esbuild.version !== PACKAGE_PINS.esbuild.version) throw new Error('The loaded bundler does not match its package version.');
  const built = await esbuild.build({absWorkingDir: packages,
    entryPoints: [join(core.root, 'dist', 'index.js')], bundle: true, format: 'esm', platform: 'browser',
    target: 'es2022', minify: false, legalComments: 'inline', sourcemap: false,
    write: false, metafile: true, outfile: 'sdk.js', logLevel: 'silent',
    plugins: [{name: 'retain-upstream-notices', setup(build) {
      // esbuild serializes filters to Go RE2; its protocol rejects JS /u flags.
      build.onLoad({filter: /\.js$/}, async ({path}) => {
        const source = await ordinary(path);
        if (![core.root, utils.root].some(root => within(root, source))) throw new Error('The bundle imported code outside the pinned SDK dependency graph.');
        const contents = (await readFile(source, 'utf8')).replace(/\/\*\*[\s\S]*?\*\//gu,
          comment => /Copyright|Licensed under|SPDX|@license|@preserve/iu.test(comment) ? `/*!${comment.slice(3)}` : comment);
        return {contents, loader: 'js', resolveDir: dirname(source)};
      });
    }}]});
  if (built.outputFiles?.length !== 1 || Object.values(built.metafile.outputs).some(record => record.imports.length)) throw new Error('The bundle contains unresolved external executable imports.');
  const inputFiles = [];
  for (const path of Object.keys(built.metafile.inputs).sort()) {
    const source = await ordinary(resolve(packages, path));
    if (![core.root, utils.root].some(root => within(root, source))) throw new Error('The bundle imported code outside the pinned SDK dependency graph.');
    inputFiles.push({path: relative(packages, source).split(sep).join('/'), ...await digest(source)});
  }
  const sdkBytes = built.outputFiles[0].contents;
  const bundleHash = createHash('sha256').update(sdkBytes).digest('hex');
  const runtime = {name: '@litert-lm/core', version: '0.18.0', revision: `bundle-sha256-${bundleHash}`,
    licence: 'Apache-2.0', module: './sdk.js', wasm: './wasm/',
    inventory: [{url: './sdk.js', bytes: sdkBytes.length, sha256: bundleHash},
      ...wasm.map(record => ({url: `./wasm/${record.name}`, ...record.actual}))]};
  const manifest = {version: 1, runtime,
    models: models.map(({capability, profile}) => ({id: profile.id, capability,
      url: `./models/${profile.file}`, sha256: profile.sha256, bytes: profile.bytes,
      revision: profile.revision, licence: profile.licence, ...(capability === 'embed' ? {dimensions: 768} : {})})),
    limits: {...DEFAULT_LIMITS, maxModelBytes: options.maxModelBytes}};
  validateManifest(manifest, 'https://local-ai.invalid/models.json');
  const files = [], directories = [];
  async function directory(path) { await mkdir(path); directories.push(path); }
  async function put(name, data) {
    const path = join(output, name), handle = await open(path, 'wx'); files.push(path);
    try { await handle.writeFile(data); } finally { await handle.close(); }
  }
  async function copy(name, from, expected) {
    const path = join(output, name), handle = await open(path, 'wx'); files.push(path);
    await pipeline(createReadStream(from), handle.createWriteStream());
    const actual = await digest(path, expected.bytes);
    if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) throw new Error('An input changed while copying; no usable manifest has been published.');
  }
  try {
    await directory(output); await directory(join(output, 'wasm')); await directory(join(output, 'models')); await directory(join(output, 'licences'));
    await put('sdk.js', sdkBytes);
    for (const record of wasm) await copy(`wasm/${record.name}`, record.path, record.actual);
    for (const record of models) await copy(`models/${record.profile.file}`, record.path, record.actual);
    // The upstream npm packages do not ship a LICENSE file. Retain their source
    // copyright notices and provide the unmodified generic Apache-2.0 text.
    const apache = await readFile(new URL('./LICENSE', import.meta.url));
    await put('licences/Apache-2.0.txt', apache);
    const notices = [];
    for (const [name, {root}] of Object.entries(installed)) {
      if (name === 'esbuild') continue; // build-only; its code is not distributed.
      for (const entry of (await readdir(root)).filter(name => /^(?:notice|licen[cs]e)(?:\.[A-Za-z0-9.-]+)?$/iu.test(name)).sort()) {
        const source = await ordinary(join(root, entry));
        const target = `${name.replace(/[@/]/gu, '_')}-${entry}`;
        await put(`licences/${target}`, await readFile(source)); notices.push(`licences/${target}`);
      }
    }
    await put('licences/ATTRIBUTION.txt', 'LiteRT-LM and wasm-utils: Copyright Google LLC. Apache-2.0.\nOriginal source notices are retained in sdk.js and the copied WASM loaders.\nThe bundle was produced by esbuild 0.25.10 (MIT), a build-only tool.\nModel identity and upstream Apache-2.0 metadata are recorded in models.json; authors must review model terms and notices before redistribution.\n');
    const resourceFiles = ['sdk.js', ...wasm.map(record => `wasm/${record.name}`),
      ...models.map(record => `models/${record.profile.file}`), 'licences/Apache-2.0.txt',
      ...notices, 'licences/ATTRIBUTION.txt', 'asset-receipt.json', 'models.json'];
    const receipt = {version: 1, operation: 'explicit-local-preparation', packages: PACKAGE_PINS,
      build: {platform: 'browser', target: 'es2022', format: 'esm', bundle: true, minify: false,
        legalComments: 'inline', sourceMap: false, inputFiles, outputSHA256: bundleHash},
      runtimeInventory: runtime.inventory, models: manifest.models, resourceFiles,
      integrityBoundary: 'npm lock integrity records identify acquired packages; installed JavaScript remains author-trusted. Pinned WASM and model bytes were independently checked. No complete transitive executable integrity or inference acceptance is claimed.'};
    await put('asset-receipt.json', `${JSON.stringify(receipt, null, 2)}\n`);
    // Manifest last: incomplete preparation cannot appear ready to the reader.
    await put('models.json', `${JSON.stringify(manifest, null, 2)}\n`);
    return {output, manifest: join(output, 'models.json'), resourceFiles, modelBytes: models.reduce((sum, record) => sum + record.actual.bytes, 0)};
  } catch (failure) {
    // Delete only paths created by this invocation, never an existing user tree.
    for (const path of files.reverse()) if (within(output, path)) await unlink(path).catch(() => {});
    for (const path of directories.reverse()) if (within(parent, path)) await rmdir(path).catch(() => {});
    throw failure;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js >=24 is required.');
    const options = parseArguments(process.argv.slice(2));
    if (options.help) process.stdout.write(HELP);
    else process.stdout.write(`${JSON.stringify(await prepareAssets(options), null, 2)}\n`);
  } catch (failure) { process.stderr.write(`Local AI asset preparation failed: ${failure.message}\n`); process.exitCode = 1; }
}
