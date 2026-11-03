// Bundle the venue pack tool (scripts/sdk-pack/cli.ts and the SDK pack code it uses) into ONE dependency-free Node file.
//   node scripts/sdk-package/venue-tool.mjs <output file ending in .cjs>
// The same bytes ship in the delivery as tools/venue-pack/venue-pack.cjs. esbuild is already in the repository through tsx.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const buildVenueTool = async (outfile) => {
  const version = JSON.parse(readFileSync(join(root, 'packages/offline-navigation/package.json'), 'utf8')).version;
  await build({
    entryPoints: [join(root, 'scripts/sdk-pack/cli.ts')], outfile, bundle: true, platform: 'node', target: 'node18', format: 'cjs',
    banner: { js: '#!/usr/bin/env node\n// Muslim Ummah venue pack tool. Apache-2.0. Bundled from scripts/sdk-pack/cli.ts; do not edit.' },
    define: { SDK_VERSION: JSON.stringify(version) }, legalComments: 'none', logLevel: 'warning',
  });
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]?.endsWith('.cjs')) { console.error('usage: node scripts/sdk-package/venue-tool.mjs <output>.cjs'); process.exit(2); }
  await buildVenueTool(resolve(process.argv[2]));
  console.log(resolve(process.argv[2]));
}
