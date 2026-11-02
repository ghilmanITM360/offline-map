/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { buildKarachiPack } from '../../scripts/sdk-pack/karachi';
import { buildDemoPack } from '../../scripts/sdk-pack/demo';
import { createPackOutput } from '../../scripts/sdk-pack/output';
import { spawnSync } from 'node:child_process';

let scratch: string;
beforeEach(() => { scratch = mkdtempSync(join(tmpdir(), 'sdk-output-safety-')); });
afterEach(() => { rmSync(scratch, { recursive: true, force: true }); });

describe.each([['Karachi', buildKarachiPack], ['demo', buildDemoPack]] as const)('%s output ownership', (_, build) => {
  it.each([true, false])('preserves unrelated output files (write=%s)', async (write) => {
    const canary = join(scratch, 'unrelated-evidence.txt');
    writeFileSync(canary, 'preserve me');
    // Only this disposable directory is ever passed to the unguarded compiler in the RED run.
    let rejected = false;
    try { await build(scratch, { write }); } catch { rejected = true; }
    expect({ rejected, contents: (() => { try { return readFileSync(canary, 'utf8'); } catch { return null; } })() })
      .toEqual({ rejected: true, contents: 'preserve me' });
  });
});

describe('output path guard (no deletion operations)', () => {
  const repo = resolve(__dirname, '../..');
  it.each(['/', homedir(), repo, dirname(repo), join(repo, 'docs/sdk'), '', '.', '..'])('rejects protected path %s', (path) => {
    expect(() => createPackOutput(path)).toThrow();
  });

  it('preserves an existing empty directory and evidence directory', () => {
    const empty = join(scratch, 'empty');
    const evidence = join(scratch, 'evidence');
    mkdirSync(empty); mkdirSync(evidence);
    writeFileSync(join(evidence, 'record.json'), 'original evidence');
    expect(() => createPackOutput(empty)).toThrow();
    expect(() => createPackOutput(evidence)).toThrow();
    expect(existsSync(empty)).toBe(true);
    expect(readFileSync(join(evidence, 'record.json'), 'utf8')).toBe('original evidence');
  });

  it('rejects symlink destinations, symlink ancestors and dangling symlinks', () => {
    const target = join(scratch, 'target');
    mkdirSync(target);
    const link = join(scratch, 'link');
    const dangling = join(scratch, 'dangling');
    symlinkSync(target, link, 'dir'); symlinkSync(join(scratch, 'absent'), dangling, 'dir');
    for (const path of [link, join(link, 'pack'), dangling, join(dangling, 'pack')]) {
      expect(() => createPackOutput(path)).toThrow();
    }
    expect(existsSync(join(target, 'pack'))).toBe(false);
  });

  it('rejects aliases before normalization, including paths targeting fresh children', () => {
    for (const path of [`${scratch}/../aliased`, `${scratch}/./pack`, `${scratch}//pack`, `${scratch}/pack `, `${scratch}/back\\slash`]) {
      expect(() => createPackOutput(path)).toThrow();
    }
    expect(existsSync(join(scratch, 'pack'))).toBe(false);
  });

  it('claims a fresh nested directory once and refuses to reuse it', () => {
    const path = join(scratch, 'new-parent/pack');
    expect(createPackOutput(path)).toBe(join(realpathSync(scratch), 'new-parent/pack'));
    expect(() => createPackOutput(path)).toThrow();
  });

  it.each(['karachi.ts', 'demo.ts'])('the %s CLI rejects aliases before resolution', (script) => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', join(repo, 'scripts/sdk-pack', script), `${scratch}/./pack`],
      { encoding: 'utf8', timeout: 10_000 });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/path aliases/);
    expect(existsSync(join(scratch, 'pack'))).toBe(false);
  });
});
