/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The client-side venue pack tool: the repository's own deterministic compiler (compile.ts) behind a small command line. It is bundled into
// one dependency-free file (scripts/sdk-package/venue-tool.mjs) and shipped in the delivery, so a client turns surveyed venue data into a
// verified pack without this repository.
//   venue-pack compile --spec <pack.spec.json> --input <folder> --out <fresh folder> [--strict]
//   venue-pack verify <pack folder> [--pin <manifest sha-256>]
//   venue-pack app-assets --pack <pack folder> --app <Expo app folder>
// The tool never signs, never deletes, and never writes into an existing folder. The data itself must come from the venue's owner or survey.
import { copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  createSha256, haversineM, PACK_MANIFEST_FILE, parsePackVenueData, validateVenueGraph, verifyPack, edgeCostM, type PackFileSystem,
} from '../../packages/offline-navigation/src/index';
import { compilePack, pinFor, PackCompileError, type PackBuildSpec } from './compile';
import { createNodePackFileSystem } from './nodePackFileSystem';
import { checkBounds, checkCatalogAndGeometry, checkGateCoordinates, checkGraphCoordinates, checkTranslations, emptyFindings, type Findings } from './dataChecks';
import { IntakeError, runImport, runMerge } from './intake/commands';
import { createPackOutput } from './output';

declare const SDK_VERSION: string; // injected when the tool is bundled; the repository build reads the package instead
const sdkVersion = (): string => (typeof SDK_VERSION === 'string' ? SDK_VERSION : JSON.parse(readFileSync(join(__dirname, '../../packages/offline-navigation/package.json'), 'utf8')).version);

export interface Io { out(line: string): void; err(line: string): void }

/** Raised for input the client can fix; `code` is stable, `hint` says how. */
class ToolError extends Error {
  constructor(readonly code: string, message: string, readonly hint?: string) { super(message); }
}

const HINTS: Record<string, string> = {
  'resource-undeclared': 'List the file under "resources" in the spec, or remove it from the input folder.',
  'resource-missing': 'Add the file to the input folder, or remove it from "resources" in the spec.',
  'required-resource-missing': 'A pack needs one resource of each kind: map-archive, routing-graph, place-directory, gate-metadata, localization, provenance.',
  'venue-conflict': 'Every data file must carry the same "venueId" as the spec.',
  'pack-id-mismatch': 'packId must be "<venueId>@<packVersion>".',
  'resource-path-unsafe': 'Use relative paths with "/" separators and no "..", drive letters or hidden segments.',
  'symlink-refused': 'Replace the link with a real copy of the file.',
  'resource-duplicate': 'Each path and each kind may appear once in "resources".',
};

const fail = (code: string, message: string, hint?: string): never => { throw new ToolError(code, message, hint ?? HINTS[code]); };

const REQUIRED_SPEC: Array<[keyof PackBuildSpec, string]> = [
  ['packId', 'string'], ['venueId', 'string'], ['packVersion', 'string'], ['sdkCompatibility', 'string'], ['routingPolicyVersion', 'string'],
  ['createdAt', 'string'], ['minimumPlatformCapabilities', 'array'], ['bounds', 'object'], ['languages', 'array'], ['resources', 'array'],
  ['attributions', 'array'], ['provenance', 'object'],
];

const readSpec = (file: string): PackBuildSpec => {
  let doc: unknown;
  try { doc = JSON.parse(readFileSync(file, 'utf8')); } catch (e) {
    return fail('spec-unreadable', `cannot read the spec ${file}: ${(e as Error).message}`, 'The spec is a JSON file; see pack.spec.json in the example venue.');
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return fail('spec-invalid', 'the spec must be a JSON object');
  const spec = doc as Record<string, unknown>;
  for (const [name, type] of REQUIRED_SPEC) {
    const v = spec[name];
    const ok = type === 'array' ? Array.isArray(v) : type === 'object' ? typeof v === 'object' && v !== null && !Array.isArray(v) : typeof v === 'string' && v.length > 0;
    if (!ok) fail('spec-invalid', `spec field "${name}" is missing or is not a${type === 'array' ? 'n array' : type === 'object' ? 'n object' : ' non-empty string'}`);
  }
  const bounds = spec.bounds as Record<string, unknown>;
  for (const side of ['west', 'south', 'east', 'north']) if (typeof bounds[side] !== 'number') fail('spec-invalid', `spec bounds.${side} must be a number`);
  for (const r of spec.resources as unknown[]) {
    const o = r as Record<string, unknown> | null;
    if (typeof o !== 'object' || o === null || typeof o.path !== 'string' || typeof o.kind !== 'string') fail('spec-invalid', 'every "resources" entry needs a string "path" and "kind"');
  }
  return spec as unknown as PackBuildSpec;
};

/** Real files and directories only. A link is refused before anything is copied, so no outside file can become pack content. */
const listRegularFiles = (root: string, rel = ''): string[] =>
  readdirSync(rel ? join(root, rel) : root, { withFileTypes: true }).flatMap((entry) => {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) return fail('symlink-refused', `symbolic links are never packed: ${path}`);
    if (entry.isDirectory()) return listRegularFiles(root, path);
    if (entry.isFile()) return [path];
    return fail('directory-invalid', `only regular files and directories can be packed: ${path}`);
  });

const readJson = (dir: string, path: string): string => {
  try { return readFileSync(join(dir, path), 'utf8'); } catch { return fail('resource-missing', `declared file is missing: ${path}`); }
};

/** Semantic checks on the venue data itself. `errors` stop the build; `warnings` are real findings that can be intentional. */
export const checkVenueData = (read: (path: string) => string, spec: Pick<PackBuildSpec, 'resources' | 'venueId' | 'languages' | 'bounds'>): Findings => {
  const pathOf = (kind: string): string => spec.resources.find((r) => r.kind === kind)?.path ?? fail('required-resource-missing', `no '${kind}' resource`);
  const parsed = parsePackVenueData(read(pathOf('routing-graph')), read(pathOf('place-directory')), spec.venueId);
  if (!parsed.ok) return { ...emptyFindings(), errors: [`${parsed.error.path ?? 'venue data'}: ${parsed.error.message}`] };
  const { source } = parsed;
  const found = emptyFindings();
  const { errors, warnings } = found;
  errors.push(...validateVenueGraph(source.graph));
  checkBounds(spec.bounds, found);
  checkGraphCoordinates(source, spec.bounds, pathOf('routing-graph'), found);
  checkGateCoordinates(read(pathOf('gate-metadata')), spec.bounds, pathOf('gate-metadata'), found);
  checkTranslations(read(pathOf('localization')), source, spec.languages, pathOf('localization'), found);
  const optional = (kind: 'place-catalog' | 'venue-geometry') => { const r = spec.resources.find((x) => x.kind === kind); return r ? { file: r.path, text: read(r.path) } : null; };
  checkCatalogAndGeometry(optional, source, spec.venueId, spec.bounds, spec.languages, found);
  if (source.placeIds().length === 0) errors.push('the place directory is empty: a venue needs at least one place');

  // Routing quality: the A* heuristic is the straight-line distance, so an edge cheaper than the straight line makes routes suboptimal.
  for (const from of source.graph.nodeIds()) {
    const a = source.graph.getNode(from)!;
    for (const edge of source.graph.edgesFrom(from)) {
      const b = source.graph.getNode(edge.to);
      if (b && edgeCostM(edge) < haversineM(a.coordinate, b.coordinate) * 0.98 - 1) warnings.push(`edge ${from}->${edge.to} is shorter than the straight line between its nodes (${edgeCostM(edge).toFixed(1)} m < ${haversineM(a.coordinate, b.coordinate).toFixed(1)} m)`);
    }
  }
  // Every place should be reachable from every other (pedestrian graphs are usually two-way). Directed reachability from the first place.
  const places = source.placeIds().map((id) => source.getPlace(id)!);
  if (places.length > 1) {
    const seen = new Set<string>(places[0].nodeIds);
    const stack = [...places[0].nodeIds];
    while (stack.length) for (const e of source.graph.edgesFrom(stack.pop()!)) if (!seen.has(e.to)) { seen.add(e.to); stack.push(e.to); }
    for (const p of places) if (!p.nodeIds.some((n) => seen.has(n))) warnings.push(`place '${p.id}' cannot be reached from '${places[0].id}' by any route`);
  }
  // Localization: names must belong to known places and declared languages.
  try {
    const loc = JSON.parse(read(pathOf('localization'))) as { entries?: Array<{ id?: unknown; names?: Record<string, unknown> }> };
    for (const entry of Array.isArray(loc.entries) ? loc.entries : []) {
      if (typeof entry.id !== 'string' || !source.getPlace(entry.id)) warnings.push(`localization entry '${String(entry.id)}' names no place in the directory`);
      for (const lang of Object.keys(entry.names ?? {})) if (!spec.languages.includes(lang)) warnings.push(`localization for '${String(entry.id)}' uses language '${lang}', which the spec does not declare`);
    }
  } catch { /* the compiler already requires this file to be JSON naming the venue */ }
  return found;
};

const flagValue = (args: string[], name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function compile(args: string[], io: Io): Promise<void> {
  const specFile = flagValue(args, '--spec'), input = flagValue(args, '--input'), out = flagValue(args, '--out');
  if (!specFile || !input || !out) throw new ToolError('usage', 'compile needs --spec, --input and --out');
  const spec = readSpec(specFile);
  const inDir = lstatSync(input, { throwIfNoEntry: false });
  if (!inDir || inDir.isSymbolicLink() || !inDir.isDirectory()) fail('directory-invalid', `--input must be an existing real folder: ${input}`);

  // Everything that can be judged from the input alone is judged before an output folder is claimed.
  const files = listRegularFiles(input);
  const declared = new Set(spec.resources.map((r) => r.path));
  for (const f of files) if (!declared.has(f)) fail('resource-undeclared', `file is not declared in the spec: ${f}`);
  for (const r of spec.resources) if (!files.includes(r.path)) fail('resource-missing', `declared file is missing: ${r.path}`);
  const checked = checkVenueData((p) => readJson(input, p), spec);
  const strict = args.includes('--strict');
  for (const w of checked.warnings) io.err(`warning: ${w}`);
  for (const r of checked.review) io.err(`review: ${r}`);
  if (checked.errors.length || (strict && checked.warnings.length)) {
    for (const e of checked.errors) io.err(`error: venue-data-invalid: ${e}`);
    throw new ToolError('venue-data-invalid', `${checked.errors.length + (strict ? checked.warnings.length : 0)} problem(s) in the venue data; nothing was written`, 'Fix the listed items in routing-graph.json / place-directory.json.');
  }

  const root = createPackOutput(out, null); // a fresh folder: never replaces, never deletes
  const packDir = join(root, 'pack');
  for (const f of files) {
    mkdirSync(dirname(join(packDir, f)), { recursive: true });
    copyFileSync(join(input, f), join(packDir, f));
  }
  const pack = await compilePack(packDir, spec, { write: true, sdkVersion: sdkVersion() });
  const sums = [PACK_MANIFEST_FILE, ...pack.manifest.resources.map((r) => r.path)].sort();
  const sha: Record<string, string> = { [PACK_MANIFEST_FILE]: pack.manifestSha256 };
  for (const r of pack.manifest.resources) sha[r.path] = r.sha256;
  writeFileSync(join(root, 'SHA256SUMS.txt'), `${sums.map((p) => `${sha[p]}  pack/${p}`).join('\n')}\n`);
  writeFileSync(join(root, 'pack.pin.json'), `${JSON.stringify(pinFor(pack), null, 1)}\n`);
  io.out(`ok: ${pack.manifest.packId}, ${pack.manifest.fileCount} files, ${pack.manifest.totalBytes} bytes`);
  io.out(`manifest sha-256 (the pin your app ships): ${pack.manifestSha256}`);
  io.out(`pack folder: ${packDir}`);
  io.out(`also written: ${join(root, 'pack.pin.json')}, ${join(root, 'SHA256SUMS.txt')}`);
}

async function verify(args: string[], io: Io): Promise<void> {
  const dir = args.find((a) => !a.startsWith('--') && a !== flagValue(args, '--pin'));
  if (!dir) throw new ToolError('usage', 'verify needs the pack folder');
  const root = lstatSync(dir, { throwIfNoEntry: false });
  if (!root || root.isSymbolicLink() || !root.isDirectory()) fail('directory-invalid', `not a real folder: ${dir}`);
  const fs: PackFileSystem = createNodePackFileSystem(dir);
  const manifestText = await fs.readText(PACK_MANIFEST_FILE);
  if (manifestText === null) return fail('manifest-missing', `${PACK_MANIFEST_FILE} not found in ${dir}`);
  const hash = async (path: string) => {
    const h = createSha256();
    let bytes = 0;
    for await (const chunk of fs.readChunks(path, 64 * 1024)) { h.update(chunk); bytes += chunk.length; }
    return { bytes, sha256: h.digestHex() };
  };
  const result = await verifyPack(manifestText, { reader: { stat: hash, list: async () => (await fs.listFilesRecursive('.')).filter((p) => p !== PACK_MANIFEST_FILE) } });
  if (!result.ok) return fail(result.error.code, result.error.message + (result.error.path ? `: ${result.error.path}` : ''));
  const digest = createSha256();
  digest.update(new TextEncoder().encode(manifestText));
  const manifestSha = digest.digestHex();
  const pin = flagValue(args, '--pin');
  if (pin !== undefined && pin.toLowerCase() !== manifestSha) fail('pin-mismatch', `manifest sha-256 is ${manifestSha}, not the pin ${pin}`);
  const checked = checkVenueData((p) => readFileSync(join(dir, p), 'utf8'), result.manifest);
  for (const w of checked.warnings) io.err(`warning: ${w}`);
  for (const r of checked.review) io.err(`review: ${r}`);
  if (checked.errors.length) fail('venue-data-invalid', checked.errors.join('; '));
  io.out(`ok: ${result.manifest.packId} verifies (${result.manifest.fileCount} files, manifest sha-256 ${manifestSha})`);
}

/** Copies a verified pack into an Expo app's assets as Metro `.packfile` assets and prints the bundledPackTable.ts entry to add. Never overwrites. */
async function appAssets(args: string[], io: Io): Promise<void> {
  const packDir = flagValue(args, '--pack'), app = flagValue(args, '--app');
  if (!packDir || !app) throw new ToolError('usage', 'app-assets needs --pack and --app');
  await verify([packDir], { out: () => undefined, err: io.err }); // only a pack that verifies is copied into an app
  const manifest = JSON.parse(readFileSync(join(packDir, PACK_MANIFEST_FILE), 'utf8')) as { packId: string; resources: Array<{ path: string }> };
  const appStat = lstatSync(join(app, 'package.json'), { throwIfNoEntry: false });
  if (!appStat?.isFile()) fail('directory-invalid', `--app must be an Expo app folder (no package.json in ${app})`);
  const id = manifest.packId.replace('@', '-');
  const dest = join(app, 'assets/packs', id);
  const files = [PACK_MANIFEST_FILE, ...manifest.resources.map((r) => r.path)];
  const asset = (path: string): string => `${path.replaceAll('/', '__')}.packfile`;
  for (const f of files) if (lstatSync(join(dest, asset(f)), { throwIfNoEntry: false })) fail('output-exists', `${join(dest, asset(f))} already exists; nothing was overwritten`, 'Remove the old copy yourself if you mean to replace it.');
  mkdirSync(dest, { recursive: true });
  for (const f of files) copyFileSync(join(packDir, f), join(dest, asset(f)));
  const manifestSha = createSha256();
  manifestSha.update(new TextEncoder().encode(readFileSync(join(packDir, PACK_MANIFEST_FILE), 'utf8')));
  io.out(`copied ${files.length} files to ${dest}`);
  io.out('add this entry to the PACKS list in bundledPackTable.ts (metro.config.js must register "packfile" assets; withOfflineNavigation does):');
  io.out(`  {\n    id: '${id}',\n    packId: '${manifest.packId}',\n    manifestSha256: '${manifestSha.digestHex()}',\n    assets: {\n${files.map((f) => `      '${f}': require('./assets/packs/${id}/${asset(f)}'),`).join('\n')}\n    },\n  },`);
}

const USAGE = `usage:
  venue-pack compile --spec <pack.spec.json> --input <folder> --out <new folder> [--strict]
  venue-pack verify <pack folder> [--pin <manifest sha-256>]
  venue-pack app-assets --pack <pack folder> --app <Expo app folder>
  venue-pack import --workbook <.xlsx | folder of .csv> --base <current pack folder> --out <new folder> [--geojson <folder>]
  venue-pack merge --candidate <import folder> --base <current pack folder> --pack-version <x.y.z> --out <new folder> [--approval <approval.json>]
The output folder must not exist yet; the tool never deletes or overwrites anything.`;

/** Returns the process exit code: 0 ok, 1 the input is not acceptable, 2 wrong usage. */
export async function main(argv: string[], io: Io): Promise<number> {
  try {
    const [command, ...rest] = argv;
    if (command === 'compile') await compile(rest, io);
    else if (command === 'verify') await verify(rest, io);
    else if (command === 'app-assets') await appAssets(rest, io);
    else if (command === 'import') {
      const need = (n: string) => flagValue(rest, n) ?? fail('usage', `import needs ${n}`);
      const c = runImport({ workbook: need('--workbook'), base: need('--base'), out: need('--out'), geojson: flagValue(rest, '--geojson') }, io);
      return c.outcome === 'REJECT' ? 1 : 0;
    } else if (command === 'merge') {
      const need = (n: string) => flagValue(rest, n) ?? fail('usage', `merge needs ${n}`);
      runMerge({ candidate: need('--candidate'), base: need('--base'), out: need('--out'), packVersion: need('--pack-version'), approval: flagValue(rest, '--approval') }, io);
    }
    else { io.err(USAGE); return command === undefined || command === '--help' || command === 'help' ? 0 : 2; }
    return 0;
  } catch (e) {
    if (e instanceof ToolError) {
      io.err(`error: ${e.code}: ${e.message}`);
      if (e.hint) io.err(`hint: ${e.hint}`);
      if (e.code === 'usage') io.err(USAGE);
      return e.code === 'usage' ? 2 : 1;
    }
    if (e instanceof IntakeError) {
      io.err(`error: ${e.code}: ${e.message}`);
      if (e.hint) io.err(`hint: ${e.hint}`);
      return 1;
    }
    if (e instanceof PackCompileError) {
      io.err(`error: ${e.code}: ${e.message}`);
      if (HINTS[e.code]) io.err(`hint: ${HINTS[e.code]}`);
      return 1;
    }
    io.err(`error: ${(e as Error).message}`);
    return 1;
  }
}

if (require.main === module) {
  main(process.argv.slice(2), { out: (l) => console.log(l), err: (l) => console.error(l) }).then((code) => { process.exitCode = code; });
}
