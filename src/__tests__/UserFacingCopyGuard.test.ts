/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

/**
 * #333: implementation words must never reach a person standing in the Ijtema ground. This scans the strings the
 * app SHOWS or SPEAKS (JSX text, label/title/accessibility props, Alert text, screen-reader announcements and the
 * `message`-style fields view models hand to the UI), not identifiers, logs, tests or docs.
 */
const SRC = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['__tests__', 'data', 'poc']);
// Developer-only surfaces (shown behind developer mode, never to attendees).
const DEV_ONLY_FILES = new Set(['views/components/map/DebugOverlay.tsx']);

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bv[12]\b/i, 'v1/v2'],
  [/manual_place|startSource|navigationSessionId/, 'internal state name'],
  [/provider route|route object|invalid route|route capability|route planner|reroute service|internal route/i, 'internal route term'],
  [/\badapter\b|hydrat|\bendpoint join|\bconnector\b|\bpolyline\b|\bMapLibre\b|PMTiles|EXPO_PUBLIC|feature flag/i, 'implementation term'],
  [/\b(precise|stale|fresh) fix\b|\bGPS fix\b/i, 'location jargon'],
  [/\bGoogle\b|without internet|works? offline|offline route|offline navigation|offline walking/i, 'dependency / routine offline copy'],
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** Calls whose string arguments are for developers, never for people. */
const DEV_CALL = /^(console\.|devLog|assert|logger|log\b|require$|describe$|test$)/;

function isDeveloperContext(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isThrowStatement(n)) return true;
    if (ts.isNewExpression(n) && /Error$/.test(n.expression.getText())) return true;
    if (ts.isCallExpression(n) && DEV_CALL.test(n.expression.getText())) return true;
    if (ts.isTypeNode(n) || ts.isLiteralTypeNode(n)) return true;
    // `if (x === 'some value')` style comparisons and JSX keys/ids are not copy.
    if (ts.isBinaryExpression(n) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(n.operatorToken.kind)) return true;
    if (ts.isJsxAttribute(n) && ['testID', 'key', 'name', 'accessibilityRole'].includes(n.name.getText())) return true;
  }
  return false;
}

/** Every sentence-like string (it has a space) that is not clearly for developers, plus JSX text. */
export function collectUserFacingStrings(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2020, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const t = node.text.replace(/\s+/g, ' ').trim();
      if (t) found.push(t);
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (/\s/.test(node.text.trim()) && !isDeveloperContext(node)) found.push(node.text);
    } else if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((x) => x.literal.text)];
      // Ids such as `${a}:google:${b}` have no words; real sentences do.
      if (parts.some((part) => /\s/.test(part.trim())) && !isDeveloperContext(node)) found.push(parts.join(' … '));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

// The data team's wording for an unroutable place; every view shows it through unavailableReasonCopy (asserted below).
const DATA_REASON = /needs connector verification before (routing|navigation)/;

describe('user-facing copy carries no implementation jargon (#333)', () => {
  const files = walk(SRC).filter((f) => !DEV_ONLY_FILES.has(path.relative(SRC, f).split(path.sep).join('/')));

  test('the scan sees real copy (guards against the scanner silently matching nothing)', () => {
    const all = files.flatMap(collectUserFacingStrings);
    expect(all.length).toBeGreaterThan(400);
    expect(all).toContain('Start Navigation');
  });

  test('no shown or spoken string names a version, internal state or dependency', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const s of collectUserFacingStrings(file)) {
        if (DATA_REASON.test(s) && file.endsWith(`services${path.sep}V2PlaceAdapter.ts`)) continue;
        for (const [re, why] of FORBIDDEN) {
          if (re.test(s)) offenders.push(`${path.relative(SRC, file)}: [${why}] ${s.slice(0, 110)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test('views show a place reason or description only through unavailableReasonCopy', () => {
    const raw: string[] = [];
    for (const file of files.filter((f) => f.includes(`${path.sep}views${path.sep}`))) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\{\s*(?!unavailableReasonCopy)[\w.?]*\.(unavailableReason|description)\s*\}/g)) {
        if (!/styles\.description/.test(m[0])) raw.push(`${path.relative(SRC, file)}: ${m[0]}`);
      }
    }
    expect(raw).toEqual([]);
  });
});
