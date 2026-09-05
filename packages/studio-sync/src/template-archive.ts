import CRC32 from 'crc-32';
import { Unzip, UnzipInflate, zipSync } from 'fflate';

import { canonicalize } from './apply.ts';

export const TEMPLATE_ARTIFACT_LIMITS = Object.freeze({
  archiveBytes: 25 * 1024 * 1024,
  inflatedBytes: 32 * 1024 * 1024,
  assetBytes: 10 * 1024 * 1024,
  sectionBytes: 1024 * 1024,
  documentBytes: 128 * 1024,
  sections: 512,
  assets: 128,
  files: 1024,
});

export type TemplateArtifactErrorCode =
  | 'TEMPLATE_ARTIFACT_INVALID'
  | 'TEMPLATE_FORMAT_UNSUPPORTED'
  | 'TEMPLATE_SCHEMA_UNSUPPORTED'
  | 'TEMPLATE_CONTENT_MISMATCH'
  | 'TEMPLATE_SECTIONS_INVALID'
  | 'TEMPLATE_ASSET_DISALLOWED'
  | 'TEMPLATE_TOO_LARGE';

/** Stable, value-free errors are safe to project onto the public problem API. */
export class TemplateArtifactError extends Error {
  readonly code: TemplateArtifactErrorCode;
  readonly schemaVersion?: number;
  constructor(code: TemplateArtifactErrorCode, schemaVersion?: number) {
    super(code);
    this.name = 'TemplateArtifactError';
    this.code = code;
    this.schemaVersion = schemaVersion;
  }
}

const pathPattern =
  /^(?:manifest\.json|metadata\.json|license\.json|sections\/[a-f0-9]{64}\.json|assets\/[a-f0-9]{64})$/;

function entryLimit(path: string): number {
  if (path.startsWith('assets/')) return TEMPLATE_ARTIFACT_LIMITS.assetBytes;
  if (path.startsWith('sections/'))
    return TEMPLATE_ARTIFACT_LIMITS.sectionBytes;
  return TEMPLATE_ARTIFACT_LIMITS.documentBytes;
}

function fail(
  code: TemplateArtifactErrorCode = 'TEMPLATE_ARTIFACT_INVALID',
): never {
  throw new TemplateArtifactError(code);
}

type ZipEntry = {
  size: number;
  compression: number;
  compressedSize: number;
  offset: number;
  flags: number;
  checksum: number;
};

/**
 * fflate's streaming decoder and central-directory decoder follow different
 * offsets. Bind both interpretations to one set of nonoverlapping file ranges
 * before either can accept content. The v1 transport uses ZIP 2.0 features:
 * no encryption, ZIP64, multi-disk records, comments or extra fields. In
 * particular, Unicode-path extras cannot override these ASCII hash paths.
 * fflate still owns all DEFLATE processing; this only audits ZIP framing.
 */
function inspectZip(input: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const end = input.byteLength - 22;
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50) fail();
  if (
    view.getUint16(end + 4, true) !== 0 ||
    view.getUint16(end + 6, true) !== 0 ||
    view.getUint16(end + 20, true) !== 0
  )
    fail();
  const count = view.getUint16(end + 10, true);
  if (count > TEMPLATE_ARTIFACT_LIMITS.files) fail('TEMPLATE_TOO_LARGE');
  if (count < 4 || view.getUint16(end + 8, true) !== count) fail();
  const directorySize = view.getUint32(end + 12, true);
  const directoryOffset = view.getUint32(end + 16, true);
  if (directoryOffset + directorySize !== end) fail();
  const entries = new Map<string, ZipEntry>();
  let cursor = directoryOffset;
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      fail();
    const nameLength = view.getUint16(cursor + 28, true);
    const flags = view.getUint16(cursor + 8, true);
    const compression = view.getUint16(cursor + 10, true);
    if (
      nameLength > 78 ||
      cursor + 46 + nameLength > end ||
      view.getUint16(cursor + 6, true) > 20 ||
      (flags & ~0x080e) !== 0 ||
      (compression !== 0 && compression !== 8) ||
      view.getUint16(cursor + 30, true) !== 0 ||
      view.getUint16(cursor + 32, true) !== 0 ||
      view.getUint16(cursor + 34, true) !== 0
    )
      fail();
    const nameBytes = input.subarray(cursor + 46, cursor + 46 + nameLength);
    // Transport paths are entirely ASCII. No decoder normalization or
    // alternate Unicode path representation participates in filename matching.
    if (nameBytes.some((byte) => byte > 0x7f)) fail();
    const name = String.fromCharCode(...nameBytes);
    if (!pathPattern.test(name) || entries.has(name)) fail();
    const size = view.getUint32(cursor + 24, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    total += size;
    if (
      size > entryLimit(name) ||
      total > TEMPLATE_ARTIFACT_LIMITS.inflatedBytes
    )
      fail('TEMPLATE_TOO_LARGE');
    if (compression === 0 && compressedSize !== size) fail();
    entries.set(name, {
      size,
      compression,
      compressedSize,
      flags,
      checksum: view.getUint32(cursor + 16, true),
      offset: view.getUint32(cursor + 42, true),
    });
    cursor += 46 + nameLength;
  }
  if (cursor !== end) fail();
  const ordered = [...entries.entries()].toSorted(
    ([, first], [, second]) => first.offset - second.offset,
  );
  if (ordered[0]?.[1].offset !== 0) fail();
  for (const [index, [name, entry]] of ordered.entries()) {
    const next = ordered[index + 1]?.[1].offset ?? directoryOffset;
    const offset = entry.offset;
    if (offset + 30 > next || view.getUint32(offset, true) !== 0x04034b50)
      fail();
    const nameLength = view.getUint16(offset + 26, true);
    const dataOffset = offset + 30 + nameLength;
    const dataEnd = dataOffset + entry.compressedSize;
    if (
      view.getUint16(offset + 4, true) > 20 ||
      view.getUint16(offset + 6, true) !== entry.flags ||
      view.getUint16(offset + 8, true) !== entry.compression ||
      view.getUint16(offset + 28, true) !== 0 ||
      nameLength !== name.length ||
      dataEnd > next ||
      input
        .subarray(offset + 30, dataOffset)
        .some((byte, character) => byte !== name.charCodeAt(character))
    )
      fail();
    const hasDescriptor = (entry.flags & 8) !== 0;
    const values = [entry.checksum, entry.compressedSize, entry.size];
    for (const [field, value] of values.entries()) {
      const localValue = view.getUint32(offset + 14 + 4 * field, true);
      if (localValue !== value && !(hasDescriptor && localValue === 0)) fail();
    }
    if (!hasDescriptor) {
      if (dataEnd !== next) fail();
      continue;
    }
    const descriptorSize = next - dataEnd;
    if (descriptorSize !== 16 || view.getUint32(dataEnd, true) !== 0x08074b50)
      fail();
    const descriptorOffset = dataEnd + 4;
    for (const [field, value] of values.entries()) {
      if (view.getUint32(descriptorOffset + 4 * field, true) !== value) fail();
    }
  }
  return entries;
}

/**
 * This owns the stricter template transport, not Classic's .netcanvas importer.
 * Classic permits arbitrary asset filenames/API-key assets. Here both ZIP
 * directories are checked before bounded streaming inflation, and nothing is
 * ever extracted onto a filesystem. The caller verifies every content hash.
 */
export function readTemplateArchive(
  input: Uint8Array,
): Map<string, Uint8Array> {
  if (input.byteLength > TEMPLATE_ARTIFACT_LIMITS.archiveBytes)
    fail('TEMPLATE_TOO_LARGE');
  try {
    const expected = inspectZip(input);
    const completed = new Map<string, Uint8Array>();
    const seen = new Set<string>();
    let actualTotal = 0;
    const unzip = new Unzip((file) => {
      const declared = expected.get(file.name);
      if (
        !declared ||
        seen.has(file.name) ||
        declared.compression !== file.compression
      )
        fail();
      seen.add(file.name);
      const chunks: Uint8Array[] = [];
      let size = 0;
      let checksum = 0;
      file.ondata = (error, chunk, final) => {
        if (error) {
          // fflate forwards exceptions raised by a synchronous data handler
          // back to that handler as errors. Preserve the bounded-output code.
          if (error instanceof TemplateArtifactError) throw error;
          fail();
        }
        size += chunk.byteLength;
        actualTotal += chunk.byteLength;
        if (
          size > entryLimit(file.name) ||
          actualTotal > TEMPLATE_ARTIFACT_LIMITS.inflatedBytes
        ) {
          file.terminate();
          fail('TEMPLATE_TOO_LARGE');
        }
        checksum = CRC32.buf(chunk, checksum);
        chunks.push(chunk);
        if (final) {
          if (size !== declared.size || checksum >>> 0 !== declared.checksum)
            fail();
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const part of chunks) {
            bytes.set(part, offset);
            offset += part.byteLength;
          }
          completed.set(file.name, bytes);
        }
      };
      file.start();
    });
    unzip.register(UnzipInflate);
    // A small compressed chunk bounds the work/allocation before the next
    // actual-output check, even for a high-ratio DEFLATE stream.
    for (let offset = 0; offset < input.byteLength; offset += 1024) {
      unzip.push(
        input.subarray(offset, offset + 1024),
        offset + 1024 >= input.byteLength,
      );
    }
    if (completed.size !== expected.size || seen.size !== expected.size) fail();
    return completed;
  } catch (error) {
    if (error instanceof TemplateArtifactError) throw error;
    return fail();
  }
}

export function encodeTemplateArchive(
  files: ReadonlyMap<string, Uint8Array>,
): Uint8Array {
  if (files.size > TEMPLATE_ARTIFACT_LIMITS.files) fail('TEMPLATE_TOO_LARGE');
  let total = 0;
  for (const [path, bytes] of files) {
    total += bytes.byteLength;
    if (
      bytes.byteLength > entryLimit(path) ||
      total > TEMPLATE_ARTIFACT_LIMITS.inflatedBytes
    )
      fail('TEMPLATE_TOO_LARGE');
  }
  const entries = Object.fromEntries(
    [...files.entries()].toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  const bytes = zipSync(entries, { level: 0, mtime: new Date(1980, 0, 1) });
  if (bytes.byteLength > TEMPLATE_ARTIFACT_LIMITS.archiveBytes)
    fail('TEMPLATE_TOO_LARGE');
  return bytes;
}

const encoder = new TextEncoder();
// Retain a BOM as a character so JSON.parse rejects it, rather than silently
// stripping bytes that the exact canonical serialization forbids.
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export function canonicalJsonBytes(value: unknown): Uint8Array<ArrayBuffer> {
  return encoder.encode(canonicalize(value));
}

/** Reject duplicate-key/non-canonical JSON and nesting that could exhaust validation. */
export function readCanonicalJson(bytes: Uint8Array): unknown {
  try {
    const text = decoder.decode(bytes);
    const value: unknown = JSON.parse(text);
    const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
    while (pending.length > 0) {
      const item = pending.pop()!;
      if (item.depth > 64) fail();
      if (
        typeof item.value === 'string' &&
        (item.value.includes('\0') || !item.value.isWellFormed())
      )
        fail();
      if (item.value !== null && typeof item.value === 'object') {
        for (const [key, child] of Object.entries(item.value)) {
          if (key.includes('\0') || !key.isWellFormed()) fail();
          pending.push({ value: child, depth: item.depth + 1 });
        }
      }
    }
    if (canonicalize(value) !== text) fail();
    return value;
  } catch (error) {
    if (error instanceof TemplateArtifactError) throw error;
    return fail();
  }
}
