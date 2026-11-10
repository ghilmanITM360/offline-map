// Artifact identity that does not depend on the compressor: the SHA-256 of the .tgz itself, of the UNCOMPRESSED tar, and of every member with
// the metadata that could differ between machines (mode, owner, mtime, type). Two toolchains that agree on the tar hash and every member hash
// built the same package; if only the .tgz hash differs, the compressor (the zlib inside Node, or npm's gzip) is the whole difference.
//   node scripts/sdk-package/identity.mjs <file.tgz> [--recompress]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const file = process.argv[2];
if (!file) { console.error('usage: identity.mjs <file.tgz> [--recompress]'); process.exit(2); }
const tgz = readFileSync(file);
const tar = gunzipSync(tgz);
const members = [];
for (let p = 0; p + 512 <= tar.length;) {
  const h = tar.subarray(p, p + 512);
  if (h.every((b) => b === 0)) break;
  const text = (a, n) => h.toString('utf8', a, a + n).replace(/\0.*$/s, '');
  const size = parseInt(text(124, 12).trim() || '0', 8);
  const name = (text(345, 155) ? `${text(345, 155)}/` : '') + text(0, 100);
  members.push({ name, type: text(156, 1) || '0', mode: text(100, 8).trim(), uid: text(108, 8).trim(), gid: text(116, 8).trim(), mtime: parseInt(text(136, 12).trim() || '0', 8), uname: text(265, 32), size, sha256: sha(tar.subarray(p + 512, p + 512 + size)) });
  p += 512 + Math.ceil(size / 512) * 512;
}
const out = {
  file, toolchain: { node: process.version, zlib: process.versions.zlib, npm: spawnSync('npm', ['-v'], { encoding: 'utf8' }).stdout.trim() },
  tgzSha256: sha(tgz), tgzBytes: tgz.length, gzipHeader: [...tgz.subarray(0, 10)].map((b) => b.toString(16).padStart(2, '0')).join(''),
  tarSha256: sha(tar), tarBytes: tar.length, memberCount: members.length,
  memberMtimes: [...new Set(members.map((m) => m.mtime))], memberOwners: [...new Set(members.map((m) => `${m.uid}:${m.gid}:${m.uname}`))], memberModes: [...new Set(members.map((m) => m.mode))],
  appleDouble: members.filter((m) => /(^|\/)\._|__MACOSX|\.DS_Store/.test(m.name)).map((m) => m.name),
  membersSha256: sha(members.map((m) => `${m.name}\0${m.type}\0${m.mode}\0${m.size}\0${m.sha256}`).join('\n')),
};
if (process.argv.includes('--recompress')) {
  const viaNode = gzipSync(tar, { level: 9 });
  const viaGzip = spawnSync('gzip', ['-9', '-n', '-c'], { input: tar, maxBuffer: 1 << 28 }).stdout;
  out.recompress = {
    nodeLevel9: { tgzSha256: sha(viaNode), tarSha256: sha(gunzipSync(viaNode)) },
    systemGzip9: { tgzSha256: sha(viaGzip), tarSha256: sha(gunzipSync(viaGzip)) },
    sameTarDifferentCompressedBytes: sha(viaNode) !== sha(viaGzip) && sha(gunzipSync(viaNode)) === sha(gunzipSync(viaGzip)),
  };
}
console.log(JSON.stringify(out, null, 1));
if (process.argv.includes('--members')) for (const m of members) console.log(`${m.sha256}  ${m.name}`);
