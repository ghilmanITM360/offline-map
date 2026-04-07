/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Simple Levenshtein distance for fuzzy matching.
 * Returns true if two strings are within `maxEdits` edits of each other,
 * considering only the first `maxLen` characters to keep it fast.
 */
export class FuzzySearchService {
  static readonly MAX_EDITS = 2;
  private static readonly MAX_LEN = 20;

  static levenshtein(a: string, b: string): number {
    const la = Math.min(a.length, this.MAX_LEN);
    const lb = Math.min(b.length, this.MAX_LEN);
    const dp: number[][] = Array.from({ length: la + 1 }, (_, i) =>
      Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= la; i++) {
      for (let j = 1; j <= lb; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }
    return dp[la][lb];
  }

  /** Returns true if `query` loosely matches `target`. */
  static matches(query: string, target: string): boolean {
    const q = query.toLowerCase();
    const t = target.toLowerCase();

    // Exact substring
    if (t.includes(q)) return true;

    // Fuzzy — only kick in for longer queries to reduce noise
    if (q.length >= 3) {
      // Check each word in target
      for (const word of t.split(/\s+/)) {
        if (word.length >= q.length - 1 && this.levenshtein(q, word.slice(0, q.length + 1)) <= this.MAX_EDITS) {
          return true;
        }
      }
    }

    return false;
  }
}
