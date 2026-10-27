// Dependency and licence inventory of an npm lockfile (v2/v3), for the delivery bundle. It reads only the lockfile, so it is exact for what
// `npm ci` installs and says nothing about native libraries that CocoaPods or Gradle add when the app is built (see the notes it prints).
//   import { inventoryFromLock, renderInventory } from './inventory.mjs'
const SPDX_RESTRICTIVE = /\b(AGPL|GPL|LGPL|SSPL|EUPL|CPAL|OSL)\b/i;

export const inventoryFromLock = (lock) => {
  assertLock(lock);
  const rows = [];
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path === '') continue;
    const name = entry.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const resolved = entry.resolved ?? '';
    rows.push({
      name, version: entry.version ?? '', path,
      license: typeof entry.license === 'string' ? entry.license : entry.license?.type ?? null,
      dev: entry.dev === true,
      optional: entry.optional === true || entry.devOptional === true,
      link: entry.link === true,
      source: resolved.startsWith('file:') ? 'local tarball' : resolved.startsWith('https://registry.npmjs.org/') ? 'npm registry' : resolved === '' ? 'workspace/link' : 'other',
      integrity: typeof entry.integrity === 'string' && entry.integrity.length > 0,
    });
  }
  rows.sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name)));
  return rows;
};

function assertLock(lock) {
  if (!lock || typeof lock !== 'object' || !lock.packages || typeof lock.packages !== 'object') throw new Error('a lockfileVersion 2/3 package-lock.json is required');
}

export const renderInventory = (rows, { title, tarballSha256, lockSha256 }) => {
  const production = rows.filter((r) => !r.dev);
  const dev = rows.length - production.length;
  const unknown = production.filter((r) => r.license === null);
  const restrictive = production.filter((r) => r.license !== null && SPDX_RESTRICTIVE.test(r.license));
  const lines = [
    `# ${title}`,
    '',
    'Generated from the delivered `package-lock.json` by `scripts/sdk-package/inventory.mjs`; do not edit by hand.',
    '',
    `- Lockfile SHA-256: \`${lockSha256}\``,
    `- SDK tarball SHA-256: \`${tarballSha256}\``,
    `- Packages that are part of the app (not build-only): ${production.length}; build/development-only packages recorded in the lockfile: ${dev}`,
    `- Production packages with no licence field in the lockfile: ${unknown.length}${unknown.length ? ` (${unknown.map((r) => `${r.name}@${r.version}`).join(', ')})` : ''}`,
    `- Production packages whose licence expression mentions a copyleft licence: ${restrictive.length}${restrictive.length ? ` (${restrictive.map((r) => `${r.name}@${r.version} ${r.license}`).join('; ')})` : ''}`,
    '',
    '## What this inventory does and does not cover',
    '',
    '- It is the JavaScript package graph exactly as `npm ci` installs it. A licence identifier here is what each package declares; the full text of each licence is in that package\'s own `LICENSE` file after installation.',
    '- It does **not** include native code that the iOS (CocoaPods) and Android (Gradle) builds add, the Hermes engine, the React Native runtime, fonts, icons or map data. Produce those from the host app\'s `Podfile.lock`, the Gradle dependency report and the pack manifests when the host app is built; the Karachi basemap and venue data carry OpenStreetMap attribution and ODbL terms in each pack manifest.',
    '- Redistribution rights for the surveyed venue data are an owner decision and are not settled by any licence listed here.',
    '- A dual-licence expression such as `(BSD-3-Clause OR GPL-2.0)` lets the recipient choose; this document records the expression, not a legal conclusion.',
    '',
    '## Production packages',
    '',
    '| Package | Version | Declared licence | Source | Integrity recorded |',
    '| --- | --- | --- | --- | --- |',
    ...production.map((r) => `| ${r.name} | ${r.version} | ${r.license ?? '**not declared**'} | ${r.source} | ${r.integrity ? 'yes' : 'no'} |`),
    '',
  ];
  return lines.join('\n');
};
