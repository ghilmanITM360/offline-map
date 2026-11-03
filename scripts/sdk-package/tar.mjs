// A small, dependency-free TAR (ustar) writer and a strict raw reader, so the delivery archive does not depend on the host's `tar`.
// macOS bsdtar adds an AppleDouble `._name` entry for every file with extended attributes unless COPYFILE_DISABLE is set; writing the
// archive ourselves makes that impossible: the only entries are the ones we name, with fixed ownership, mode and time, in byte order.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const BLOCK = 512;
const FIXED_MTIME = 315532800; // 1980-01-01T00:00:00Z: a constant, so identical input is byte-identical output
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

const octal = (value, width) => {
  const s = value.toString(8);
  if (s.length > width - 1) throw new Error(`value ${value} does not fit a ${width}-byte tar field`);
  return s.padStart(width - 1, '0') + '\0';
};
const putString = (header, offset, text, width) => {
  const bytes = enc.encode(text);
  if (bytes.length > width) throw new Error(`tar field too long: ${text}`);
  header.set(bytes, offset);
};

/** Splits a path into the ustar name/prefix pair (100 + 155 bytes) at a '/' boundary. */
const splitName = (path) => {
  if (enc.encode(path).length <= 100) return { name: path, prefix: '' };
  for (let i = path.lastIndexOf('/'); i > 0; i = path.lastIndexOf('/', i - 1)) {
    const prefix = path.slice(0, i), name = path.slice(i + 1);
    if (enc.encode(prefix).length <= 155 && enc.encode(name).length <= 100) return { name, prefix };
  }
  throw new Error(`path too long for a ustar entry: ${path}`);
};

const checkEntryName = (path) => {
  if (path === '' || path.startsWith('/') || path.includes('\\') || path.includes('\0') || /^[A-Za-z]:/.test(path)) throw new Error(`unsafe archive path: ${path}`);
  for (const part of path.split('/')) {
    if (part === '' || part === '.' || part === '..') throw new Error(`unsafe archive path: ${path}`);
    if (part.startsWith('._') || part === '__MACOSX' || part === '.DS_Store') throw new Error(`filesystem metadata is not packed: ${path}`);
  }
};

/** @param {Array<{ path: string, data: Uint8Array }>} files Archive paths use '/', are relative and unique; order is decided here. */
export const buildTar = (files) => {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const seen = new Set();
  const chunks = [];
  for (const { path, data } of sorted) {
    checkEntryName(path);
    if (seen.has(path.toLowerCase())) throw new Error(`duplicate or case-colliding archive path: ${path}`);
    seen.add(path.toLowerCase());
    const { name, prefix } = splitName(path);
    const header = new Uint8Array(BLOCK);
    putString(header, 0, name, 100);
    putString(header, 100, octal(0o644, 8), 8);
    putString(header, 108, octal(0, 8), 8); // uid
    putString(header, 116, octal(0, 8), 8); // gid
    putString(header, 124, octal(data.length, 12), 12);
    putString(header, 136, octal(FIXED_MTIME, 12), 12);
    header.fill(0x20, 148, 156); // checksum counts itself as spaces
    header[156] = 0x30; // '0': regular file
    putString(header, 257, 'ustar\0', 6);
    putString(header, 263, '00', 2);
    putString(header, 345, prefix, 155);
    const sum = header.reduce((n, b) => n + b, 0);
    putString(header, 148, octal(sum, 7) + ' ', 8);
    chunks.push(header, data, new Uint8Array((BLOCK - (data.length % BLOCK)) % BLOCK));
  }
  chunks.push(new Uint8Array(BLOCK * 2)); // end-of-archive marker
  return Buffer.concat(chunks);
};

/** gzip with a constant header (no mtime, no name) so the same tar always compresses to the same bytes. */
export const gzipDeterministic = (tar) => {
  const out = gzipSync(tar, { level: 9 });
  out[4] = out[5] = out[6] = out[7] = 0; // MTIME
  out[9] = 3; // OS: Unix, whatever platform built it
  return out;
};

export const writeTarGz = (files, destination) => {
  const bytes = gzipDeterministic(buildTar(files));
  writeFileSync(destination, bytes);
  return createHash('sha256').update(bytes).digest('hex');
};

const readOctal = (field) => {
  const text = dec.decode(field).replace(/\0.*$/s, '').trim();
  if (text === '') return 0;
  if (!/^[0-7]+$/.test(text)) throw new Error(`corrupt numeric tar field: ${JSON.stringify(text)}`);
  return parseInt(text, 8);
};

/**
 * Parses a TAR byte-for-byte: every header, its checksum, its size and its type. Nothing is extracted or trusted: callers audit the result.
 * @returns {Array<{ path: string, type: string, size: number, linkname: string, mode: number, data: Uint8Array }>}
 */
export const readTar = (tar) => {
  const entries = [];
  let offset = 0;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((b) => b === 0)) return entries; // end marker
    const stored = readOctal(header.subarray(148, 156));
    const copy = Uint8Array.from(header);
    copy.fill(0x20, 148, 156);
    const actual = copy.reduce((n, b) => n + b, 0);
    if (stored !== actual) throw new Error(`tar header checksum mismatch at offset ${offset}`);
    const text = (from, to) => dec.decode(header.subarray(from, to)).replace(/\0.*$/s, '');
    const prefix = text(345, 500), name = text(0, 100);
    const size = readOctal(header.subarray(124, 136));
    const type = String.fromCharCode(header[156] === 0 ? 0x30 : header[156]);
    const start = offset + BLOCK;
    if (start + size > tar.length) throw new Error(`tar entry ${name} runs past the end of the archive`);
    entries.push({ path: prefix ? `${prefix}/${name}` : name, type, size, linkname: text(157, 257), mode: readOctal(header.subarray(100, 108)), data: tar.subarray(start, start + size) });
    offset = start + Math.ceil(size / BLOCK) * BLOCK;
  }
  throw new Error('tar archive has no end-of-archive marker');
};

export const readTarGz = (file) => readTar(gunzipSync(readFileSync(file)));

/**
 * The findings that make an archive unfit to ship, empty when it is clean. `allowed` is the exact set of file paths the archive may contain.
 */
export const auditEntries = (entries, allowed) => {
  const problems = [];
  const seen = new Set();
  for (const e of entries) {
    const path = e.path;
    if (e.type !== '0') problems.push(`${path}: entry type '${e.type}' (only regular files are allowed)`);
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) problems.push(`${path}: absolute path`);
    if (path.includes('\\')) problems.push(`${path}: backslash in path`);
    const parts = path.split('/');
    if (parts.some((p) => p === '..' || p === '.' || p === '')) problems.push(`${path}: path traversal or empty segment`);
    if (parts.some((p) => p.startsWith('._'))) problems.push(`${path}: AppleDouble metadata`);
    if (parts.includes('__MACOSX') || parts.includes('.DS_Store')) problems.push(`${path}: macOS metadata`);
    if (e.linkname !== '') problems.push(`${path}: link target '${e.linkname}'`);
    const key = path.toLowerCase();
    if (seen.has(key)) problems.push(`${path}: duplicate or case-colliding path`);
    seen.add(key);
    if (allowed && !allowed.has(path)) problems.push(`${path}: not a declared payload path`);
  }
  if (allowed) for (const p of allowed) if (!entries.some((e) => e.path === p)) problems.push(`${p}: declared but missing from the archive`);
  return problems;
};

/** Extracts an audited archive into a fresh directory using only Node: no host tar, no metadata, no path can leave `destination`. */
export const extractEntries = (entries, destination) => {
  const root = resolve(destination);
  for (const e of entries) {
    if (e.type !== '0') throw new Error(`refusing to extract ${e.path}: not a regular file`);
    const target = resolve(root, e.path);
    if (!target.startsWith(root + sep)) throw new Error(`refusing to extract ${e.path}: outside the destination`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, e.data, { flag: 'wx' });
  }
};

export const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');
