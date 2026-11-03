// Proof for the delivery archive writer and its raw auditor (tar.mjs): clean, deterministic and strict. Plain Node, no repository state.
//   node scripts/sdk-package/test-tar.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditEntries, buildTar, extractEntries, gzipDeterministic, readTar, readTarGz, sha256Hex, writeTarGz } from './tar.mjs';

const work = mkdtempSync(join(tmpdir(), 'sdk-tar-'));
let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log(`  ok - ${name}`); };
const file = (path, text) => ({ path, data: Buffer.from(text) });

try {
  check('round trip: names, bytes, regular files, normalized mode, no link target', () => {
    const entries = readTar(buildTar([file('d/b.txt', 'bee'), file('d/a/ä.txt', 'umlaut'), file('d/empty', '')]));
    assert.deepEqual(entries.map((e) => e.path), ['d/a/ä.txt', 'd/b.txt', 'd/empty']);
    assert.deepEqual(entries.map((e) => Buffer.from(e.data).toString()), ['umlaut', 'bee', '']);
    for (const e of entries) assert.deepEqual([e.type, e.mode, e.linkname], ['0', 0o644, '']);
    assert.deepEqual(auditEntries(entries, new Set(entries.map((e) => e.path))), []);
  });

  check('deterministic: input order does not matter, and the same files always give the same gzip bytes', () => {
    const files = [file('r/z', 'z'), file('r/a', 'a'), file('r/m/n', 'n')];
    const one = writeTarGz(files, join(work, '1.tgz'));
    const two = writeTarGz([...files].reverse(), join(work, '2.tgz'));
    assert.equal(one, two);
    assert.equal(sha256Hex(readFileSync(join(work, '1.tgz'))), one);
    const gz = readFileSync(join(work, '1.tgz'));
    assert.deepEqual([...gz.subarray(4, 8)], [0, 0, 0, 0], 'gzip header carries no time');
    assert.equal(gz[9], 3, 'gzip header names no build platform');
    assert.deepEqual(gzipDeterministic(buildTar(files)), gz);
  });

  check('long paths use the ustar prefix and survive the host tar too', () => {
    const long = `root/${'directory/'.repeat(12)}file.txt`;
    writeTarGz([file(long, 'x')], join(work, 'long.tgz'));
    assert.equal(readTarGz(join(work, 'long.tgz'))[0].path, long);
    assert.ok(spawnSync('tar', ['-tzf', join(work, 'long.tgz')], { encoding: 'utf8' }).stdout.includes(long));
    assert.throws(() => buildTar([file(`${'x'.repeat(200)}/f`, '')]), /too long/);
  });

  check('the writer refuses metadata, traversal, absolute, backslash, empty-segment and colliding names', () => {
    for (const bad of ['a/._b', '__MACOSX/a', 'a/.DS_Store', '../a', 'a/../b', '/a', 'a\\b', 'a//b', 'C:/a', '', './a']) assert.throws(() => buildTar([file(bad, '')]), /unsafe|metadata/, bad);
    assert.throws(() => buildTar([file('a/B', ''), file('a/b', '')]), /case-colliding/);
    assert.throws(() => buildTar([file('a', ''), file('a', '')]), /case-colliding/);
  });

  check('the auditor reports every kind of unfit entry from the raw headers', () => {
    const e = (path, type = '0', linkname = '') => ({ path, type, linkname, size: 0, mode: 0o644, data: new Uint8Array() });
    const problems = auditEntries([e('r/ok'), e('r/._x'), e('__MACOSX/r'), e('r/link', '2', '/etc/passwd'), e('r/hard', '1', 'r/ok'), e('r/pax', 'x'), e('r/dir/', '5'), e('/abs'), e('r/../up'), e('r/Ok'), e('r/extra')], new Set(['r/ok', 'r/missing']));
    for (const expected of [/\._x: AppleDouble/, /__MACOSX: macOS metadata|__MACOSX\/r: macOS metadata/, /link: entry type '2'/, /link: link target/, /hard: entry type '1'/, /pax: entry type 'x'/, /dir\/: entry type '5'/, /abs: absolute/, /up: path traversal/, /Ok: duplicate or case-colliding/, /extra: not a declared payload path/, /missing: declared but missing/]) {
      assert.ok(problems.some((p) => expected.test(p)), `${expected} not reported in ${JSON.stringify(problems)}`);
    }
  });

  check('the reader rejects a damaged header, a truncated entry and a missing end marker', () => {
    const good = buildTar([file('r/a', 'hello')]);
    const flipped = Buffer.from(good); flipped[0] ^= 0xff;
    assert.throws(() => readTar(flipped), /checksum/);
    assert.throws(() => readTar(good.subarray(0, 600)), /runs past the end|end-of-archive/);
    assert.throws(() => readTar(good.subarray(0, good.length - 1024)), /end-of-archive/);
  });

  check('extraction stays inside its folder and never overwrites', () => {
    const dest = join(work, 'out');
    extractEntries(readTar(buildTar([file('r/a/b.txt', 'one')])), dest);
    assert.equal(readFileSync(join(dest, 'r/a/b.txt'), 'utf8'), 'one');
    assert.throws(() => extractEntries(readTar(buildTar([file('r/a/b.txt', 'two')])), dest), /EEXIST/);
    const evil = [{ path: '../escape', type: '0', linkname: '', size: 0, mode: 0o644, data: new Uint8Array() }];
    assert.throws(() => extractEntries(evil, join(work, 'out2')), /outside the destination/);
    assert.throws(() => extractEntries([{ ...evil[0], path: 'r/l', type: '2' }], join(work, 'out3')), /not a regular file/);
  });

  if (process.platform === 'darwin') {
    check('REPRODUCTION: the host macOS tar leaves metadata entries that `tar -t` does not make obvious; the writer cannot', () => {
      const tree = join(work, 'tree');
      mkdirSync(join(tree, 'pkg'), { recursive: true });
      writeFileSync(join(tree, 'pkg/file.txt'), 'payload');
      assert.equal(spawnSync('xattr', ['-w', 'com.example.sdk-test', 'metadata', join(tree, 'pkg/file.txt')]).status, 0);
      const hostTar = (extraEnv) => {
        const out = join(work, `host-${Object.keys(extraEnv).length}.tgz`);
        const r = spawnSync('tar', ['-czf', out, '-C', tree, 'pkg'], { env: { PATH: process.env.PATH, ...extraEnv } });
        assert.equal(r.status, 0, String(r.stderr));
        return readTarGz(out);
      };
      const withCopyfile = hostTar({});
      const appleDouble = withCopyfile.filter((e) => e.path.split('/').some((p) => p.startsWith('._')));
      const noisy = auditEntries(withCopyfile, new Set(['pkg/file.txt']));
      assert.ok(noisy.length > 0, 'the raw audit must flag what the host tar produced');
      console.log(`    host tar, COPYFILE_DISABLE unset: ${withCopyfile.length} entries, ${appleDouble.length} AppleDouble; audit problems: ${noisy.length}`);
      const withoutCopyfile = hostTar({ COPYFILE_DISABLE: '1' });
      console.log(`    host tar, COPYFILE_DISABLE=1: ${withoutCopyfile.length} entries, types ${[...new Set(withoutCopyfile.map((e) => e.type))].join(',')}; audit problems: ${auditEntries(withoutCopyfile, new Set(['pkg/file.txt'])).length}`);
      // The same tree through the writer: exactly the declared file, nothing else.
      const ours = buildTar(readdirSync(join(tree, 'pkg')).map((name) => file(`pkg/${name}`, readFileSync(join(tree, 'pkg', name), 'utf8'))));
      assert.deepEqual(auditEntries(readTar(ours), new Set(['pkg/file.txt'])), []);
    });
  }
  console.log(`sdk-archive: ${passed} checks passed`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
