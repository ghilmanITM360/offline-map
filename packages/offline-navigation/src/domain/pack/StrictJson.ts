/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class StrictJsonError extends Error {}

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const MAX_DEPTH = 32;
/** A lone surrogate becomes U+FFFD when encoded, so two different texts could hash and sign identically. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/**
 * RFC 8259 JSON with the ambiguities a signed manifest must not have: duplicate keys, `__proto__`, trailing commas,
 * a BOM, non-finite numbers (`1e999`), lone surrogates and control characters in strings are all errors. `JSON.parse` accepts every one
 * of those silently, so two parsers could disagree about what a signed document says.
 */
export const parseStrictJson = (text: string): unknown => {
  let i = 0;
  const fail = (what: string): never => { throw new StrictJsonError(`${what} at offset ${i}`); };
  const ws = (): void => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  const expect = (c: string): void => { if (text[i] !== c) fail(`expected '${c}'`); i++; };

  const str = (): string => {
    expect('"');
    let out = '';
    for (;;) {
      const c = text[i];
      if (c === undefined) return fail('unterminated string');
      if (c === '"') {
        i++;
        if (LONE_SURROGATE.test(out)) fail('lone surrogate in string');
        return out;
      }
      if (c < ' ') return fail('control character in string');
      if (c !== '\\') { out += c; i++; continue; }
      const e = text[i + 1];
      const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
      if (e in simple) { out += simple[e]; i += 2; continue; }
      if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) { out += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16)); i += 6; continue; }
      return fail('bad escape');
    }
  };

  const value = (depth: number): unknown => {
    if (depth > MAX_DEPTH) fail('nesting too deep');
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      const obj: Record<string, unknown> = {};
      ws();
      if (text[i] === '}') { i++; return obj; }
      for (;;) {
        ws();
        const key = str();
        if (key === '__proto__') fail('forbidden key');
        if (Object.prototype.hasOwnProperty.call(obj, key)) fail(`duplicate key '${key}'`);
        ws(); expect(':');
        obj[key] = value(depth + 1);
        ws();
        if (text[i] === ',') { i++; continue; }
        expect('}');
        return obj;
      }
    }
    if (c === '[') {
      i++;
      const arr: unknown[] = [];
      ws();
      if (text[i] === ']') { i++; return arr; }
      for (;;) {
        arr.push(value(depth + 1));
        ws();
        if (text[i] === ',') { i++; continue; }
        expect(']');
        return arr;
      }
    }
    if (c === '"') return str();
    for (const [word, v] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.startsWith(word, i)) { i += word.length; return v; }
    }
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (!m) return fail('unexpected token');
    i += m[0].length;
    const n = Number(m[0]);
    if (!Number.isFinite(n)) fail('non-finite number');
    return n;
  };

  const result = value(0);
  ws();
  if (i !== text.length) fail('trailing content');
  return result;
};
