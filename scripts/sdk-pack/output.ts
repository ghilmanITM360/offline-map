/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const checkoutRoot = (): string => realpathSync(resolve(__dirname, '../..'));

/**
 * Claim a new output directory. Pack generation never replaces or deletes an existing directory. `repo` is the checkout the output must
 * stay out of; the standalone venue tool has none and passes null (the other guards still apply).
 */
export const createPackOutput = (input: string, repo: string | null = checkoutRoot()): string => {
  if (!input || input !== input.trim() || input.includes('\\') || input.includes('\0')
    || input.split('/').some((part) => part === '.' || part === '..') || input.includes('//')) {
    throw new Error('pack output must name a fresh directory without path aliases');
  }
  const out = resolve(input);
  let canonical: string | undefined;
  for (let part = out; ; part = dirname(part)) {
    try {
      const stat = lstatSync(part);
      if (part === out) throw new Error('pack output already exists; use a fresh directory');
      // macOS exposes these two OS-owned temporary-directory prefixes through standard aliases.
      const systemAlias = process.platform === 'darwin'
        && ((part === '/var' && realpathSync(part) === '/private/var')
          || (part === '/tmp' && realpathSync(part) === '/private/tmp'));
      if (stat.isSymbolicLink() && !systemAlias) throw new Error('pack output must not traverse a symlink');
      canonical ??= resolve(realpathSync(part), relative(part, out));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (dirname(part) === part) break;
  }
  if (!canonical) throw new Error('pack output has no accessible parent');
  if (repo !== null) {
    const fromRepo = relative(repo, canonical);
    if (fromRepo === '' || (!isAbsolute(fromRepo) && fromRepo !== '..' && !fromRepo.startsWith(`..${sep}`))) {
      throw new Error('pack output must be outside the repository');
    }
  }
  mkdirSync(dirname(canonical), { recursive: true });
  mkdirSync(canonical); // Exclusive creation also rejects a concurrent claim; no recursive deletion.
  return canonical;
};
