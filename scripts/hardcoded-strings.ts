/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Finds user-visible English that still sits in source instead of the localization catalogs (src/i18n/messages):
 * JSX text, text/label/accessibility/placeholder props, Alert.alert arguments and message-style object fields.
 *
 *   node --import tsx scripts/hardcoded-strings.ts            per-file counts + total
 *   node --import tsx scripts/hardcoded-strings.ts --write    rewrite the baseline (only ever to LOWER it)
 *
 * The same scan backs src/__tests__/HardcodedStrings.test.ts, which fails if any file exceeds its baseline.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

export const SRC = path.join(__dirname, '..', 'src');
export const BASELINE_FILE = path.join(SRC, '__tests__', 'hardcodedStrings.baseline.json');

// Not user copy: tests, venue/dataset records, the POC harness and the catalogs themselves.
const SKIP_DIRS = new Set(['__tests__', 'data', 'poc', 'i18n']);
// Developer-only surfaces (behind developer mode, never shown to attendees) and the legacy v1 dataset.
const SKIP_FILES = new Set(['views/components/map/DebugOverlay.tsx', 'constants/data.ts']);

const TEXT_PROPS = new Set([
  'accessibilityLabel', 'accessibilityHint', 'accessibilityValue', 'aria-label', 'placeholder', 'title', 'label',
  'subtitle', 'description', 'hint', 'message', 'text', 'body', 'caption', 'heading', 'announcement',
]);
const DEV_CALL = /^(console\.|devLog|assert|logger|log\b|require$|describe$|test$)/;

/** Two or more words, starting with a letter: reads like a sentence, not an id, path, URL or style value. */
const SENTENCE = /^[A-Za-z\u2018\u2019'"][A-Za-z\u2018\u2019'",.!?:;()\u2014-]*(\s+[A-Za-z0-9\u2018\u2019'"(][^\s]*)+$/;
const hasWords = (s: string) => /[A-Za-z]{2,}/.test(s);

function isDeveloperContext(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isThrowStatement(n)) return true;
    if (ts.isNewExpression(n) && /Error$/.test(n.expression.getText())) return true;
    if (ts.isCallExpression(n) && DEV_CALL.test(n.expression.getText())) return true;
    if (ts.isTypeNode(n)) return true;
    if (ts.isBinaryExpression(n) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(n.operatorToken.kind)) return true;
    if (ts.isCaseClause(n)) return true;
    if (ts.isJsxAttribute(n) && ['testID', 'key', 'name', 'accessibilityRole', 'nativeID'].includes(n.name.getText())) return true;
  }
  return false;
}

function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((x) => x.literal.text)].join(' ');
  return null;
}

/** Strings a person would read, found in one source file. */
export function findHardcodedStrings(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2020, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const add = (s: string | null, node: ts.Node) => {
    if (s !== null && hasWords(s) && !isDeveloperContext(node)) found.push(s.replace(/\s+/g, ' ').trim());
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const t = node.text.replace(/\s+/g, ' ').trim();
      if (hasWords(t)) found.push(t);
    } else if (ts.isJsxAttribute(node) && TEXT_PROPS.has(node.name.getText()) && node.initializer) {
      const init = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (init) add(literalText(init), init);
    } else if (ts.isPropertyAssignment(node) && TEXT_PROPS.has(node.name.getText().replace(/['"]/g, ''))) {
      add(literalText(node.initializer), node.initializer);
    } else if (ts.isCallExpression(node) && node.expression.getText() === 'Alert.alert') {
      node.arguments.slice(0, 2).forEach((arg) => add(literalText(arg), arg));
    } else if (ts.isConditionalExpression(node) && ts.isJsxExpression(node.parent)) {
      // {cond ? 'On' : 'Off'} inside JSX renders as text.
      add(literalText(node.whenTrue), node.whenTrue);
      add(literalText(node.whenFalse), node.whenFalse);
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      // Anything else that reads like a sentence (two or more words) is copy wherever it sits, e.g. a returned message.
      const t = literalText(node);
      if (t !== null && SENTENCE.test(t.trim()) && !isDeveloperContext(node) && !found.includes(t.replace(/\s+/g, ' ').trim())) {
        found.push(t.replace(/\s+/g, ' ').trim());
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** file (relative to src) -> every hardcoded user-visible string in it. */
export function scanAll(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const file of walk(SRC).sort()) {
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    if (SKIP_FILES.has(rel)) continue;
    const found = findHardcodedStrings(file);
    if (found.length) result[rel] = found;
  }
  return result;
}

if (require.main === module) {
  const all = scanAll();
  const counts = Object.fromEntries(Object.entries(all).map(([f, s]) => [f, s.length]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (process.argv.includes('--write')) {
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(counts, null, 2) + '\n');
    console.log(`baseline written: ${total} strings in ${Object.keys(counts).length} files`);
  } else {
    for (const [f, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(4), f);
    if (process.argv.includes('--strings')) for (const [f, s] of Object.entries(all)) s.forEach((x) => console.log(`${f}: ${x}`));
    console.log(`TOTAL hardcoded user-visible strings: ${total}`);
  }
}
